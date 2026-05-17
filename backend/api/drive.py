"""
Google Drive ingestion — /api/ingest/drive
Requires user to have authenticated with Google OAuth (drive.readonly scope).
The user's refresh token must be stored in users.google_refresh_token.
"""
import uuid
import io
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.database import get_db
from db.models import User, Document, DocumentChunk, Notebook
from auth.jwt_handler import get_current_user
from config import settings

router = APIRouter(prefix="/drive", tags=["drive"])

# ── Lazy import of Google libs (not installed in all envs) ───────────────────

def _get_drive_service(refresh_token: str):
    """Build an authenticated Drive service from a user's refresh token."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Google API client not installed. Add google-api-python-client to requirements.",
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


# ── Schemas ──────────────────────────────────────────────────────────────────

class DriveFile(BaseModel):
    id:        str
    name:      str
    mimeType:  str
    modifiedTime: str | None = None
    size:      str | None = None


class IngestDriveRequest(BaseModel):
    file_id:     str
    notebook_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/list", response_model=list[DriveFile])
async def list_drive_files(
    folder_id: str | None = Query(None, description="Drive folder ID; omit for root"),
    current_user: User = Depends(get_current_user),
):
    """List the user's Drive files (PDFs, Docs, plain text) available for ingestion."""
    if not current_user.google_refresh_token:
        raise HTTPException(
            status_code=403,
            detail="Drive access not authorised. Please sign in with Google to enable Drive import.",
        )

    service = _get_drive_service(current_user.google_refresh_token)

    query_parts = [
        "mimeType='application/pdf'",
        "mimeType='application/vnd.google-apps.document'",
        "mimeType='text/plain'",
    ]
    q = f"({' or '.join(query_parts)}) and trashed=false"
    if folder_id:
        q += f" and '{folder_id}' in parents"

    results = service.files().list(
        q=q,
        fields="files(id,name,mimeType,modifiedTime,size)",
        pageSize=50,
        orderBy="modifiedTime desc",
    ).execute()

    return [DriveFile(**f) for f in results.get("files", [])]


@router.post("", status_code=202)
async def ingest_drive_file(
    req: IngestDriveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a Drive file and ingest it into the specified notebook."""
    if not current_user.google_refresh_token:
        raise HTTPException(
            status_code=403,
            detail="Drive access not authorised. Please sign in with Google to enable Drive import.",
        )

    # Verify notebook belongs to user
    result = await db.execute(
        select(Notebook).where(
            Notebook.id == req.notebook_id,
            Notebook.user_id == current_user.id,
        )
    )
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found.")

    service = _get_drive_service(current_user.google_refresh_token)

    # Get file metadata
    try:
        meta = service.files().get(fileId=req.file_id, fields="id,name,mimeType").execute()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not access Drive file: {e}")

    filename = meta["name"]
    mime     = meta["mimeType"]

    # Download file bytes — export Google Docs as PDF
    try:
        if mime == "application/vnd.google-apps.document":
            req_obj = service.files().export_media(
                fileId=req.file_id, mimeType="application/pdf"
            )
            filename = filename + ".pdf"
            mime     = "application/pdf"
        else:
            req_obj = service.files().get_media(fileId=req.file_id)

        from googleapiclient.http import MediaIoBaseDownload
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, req_obj)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        file_bytes = buf.getvalue()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download Drive file: {e}")

    # Create Document record with "processing" status
    doc_id = str(uuid.uuid4())
    document = Document(
        id          = doc_id,
        filename    = filename,
        user_id     = current_user.id,
        notebook_id = req.notebook_id,
        status      = "processing",
    )
    db.add(document)
    await db.commit()

    # Reuse the existing ingestion pipeline (chunking + embedding)
    # Import here to avoid circular dependency
    from api.ingest import _process_file_bytes
    try:
        await _process_file_bytes(
            file_bytes=file_bytes,
            filename=filename,
            mime_type=mime,
            document_id=doc_id,
            user_id=current_user.id,
            db=db,
        )
    except Exception as e:
        # Mark failed so the UI shows the error badge
        document.status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")

    return {"document_id": doc_id, "filename": filename, "status": "processing"}
