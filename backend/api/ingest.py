from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, field_validator
from db.database import get_db
from db.models import Document, DocumentChunk, User
from config import settings
from auth.jwt_handler import get_current_user
import google.genai as genai
import httpx
import pypdf
import asyncio, io, uuid, re
import ipaddress, socket
from urllib.parse import urlparse
from typing import Optional

router = APIRouter()
client = genai.Client(api_key=settings.GEMINI_API_KEY)
MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


# ── Pydantic request bodies (JSON, not Form) ───────────────────────────────

class UrlRequest(BaseModel):
    url: str
    notebook_id: str   # P1: required — prevents orphan documents

class YoutubeRequest(BaseModel):
    url: str
    notebook_id: str   # P1: required — prevents orphan documents

class TextRequest(BaseModel):
    content: str
    title: Optional[str] = "Pasted Text"
    notebook_id: str   # P1: required — prevents orphan documents

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Content cannot be empty")
        return v


# ── Core helpers ───────────────────────────────────────────────────────────

def chunk_text(raw: str, max_chars: int = 2000, overlap: int = 200) -> list[str]:
    chunks, i = [], 0
    while i < len(raw):
        chunks.append(raw[i : i + max_chars])
        i += max_chars - overlap
    return [c.strip() for c in chunks if c.strip()]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    result = await asyncio.to_thread(client.models.embed_content, model=settings.EMBEDDING_MODEL, contents=texts)
    return [e.values for e in result.embeddings]


async def _ingest_raw(
    filename: str,
    raw_text: str,
    user_id: str,
    notebook_id: Optional[str],
    db: AsyncSession,
) -> dict:
    """Chunk, embed, and persist pre-extracted text."""
    if not raw_text.strip():
        raise HTTPException(400, "Could not extract text from document")

    chunks = chunk_text(raw_text)
    if len(chunks) > settings.MAX_CHUNKS_PER_DOC:
        chunks = chunks[: settings.MAX_CHUNKS_PER_DOC]

    all_embeddings: list[list[float]] = []
    for i in range(0, len(chunks), 20):
        all_embeddings.extend(await embed_texts(chunks[i : i + 20]))

    doc = Document(
        id=str(uuid.uuid4()),
        filename=filename,
        user_id=user_id,
        notebook_id=notebook_id,
    )
    db.add(doc)
    await db.flush()

    for idx, (chunk_val, emb) in enumerate(zip(chunks, all_embeddings)):
        db.add(
            DocumentChunk(
                id=str(uuid.uuid4()),
                document_id=doc.id,
                content=chunk_val,
                chunk_index=idx,
                embedding=emb,
            )
        )
    await db.commit()
    return {"document_id": doc.id, "filename": filename, "chunks": len(chunks)}


async def _process_file_bytes(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    document_id: str,
    user_id: str,
    db: AsyncSession,
    notebook_id: Optional[str] = None,
) -> dict:
    """
    Dispatch file bytes to the appropriate extractor, then ingest.
    Used by both the upload route and drive.py.
    """
    raw_text = ""
    lower_name = filename.lower()

    # PDF
    if mime_type == "application/pdf" or lower_name.endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        raw_text = " ".join(page.extract_text() or "" for page in reader.pages)

    # DOCX
    elif mime_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ) or lower_name.endswith(".docx"):
        try:
            from docx import Document as DocxDocument
            doc_obj = DocxDocument(io.BytesIO(file_bytes))
            raw_text = "\n".join(p.text for p in doc_obj.paragraphs if p.text.strip())
        except ImportError:
            raise HTTPException(501, "DOCX support not installed (python-docx missing)")

    # PPTX
    elif mime_type in (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
    ) or lower_name.endswith(".pptx"):
        try:
            from pptx import Presentation
            prs = Presentation(io.BytesIO(file_bytes))
            lines = []
            for slide in prs.slides:
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        lines.append(shape.text.strip())
            raw_text = "\n".join(lines)
        except ImportError:
            raise HTTPException(501, "PPTX support not installed (python-pptx missing)")

    # Images — GCP Vision OCR
    elif mime_type.startswith("image/") or any(
        lower_name.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".tiff", ".bmp")
    ):
        try:
            from google.cloud import vision
            vision_client = vision.ImageAnnotatorClient()
            image = vision.Image(content=file_bytes)
            response = vision_client.document_text_detection(image=image)
            if response.error.message:
                raise HTTPException(500, f"GCP Vision error: {response.error.message}")
            raw_text = response.full_text_annotation.text or ""
            if not raw_text.strip():
                raise HTTPException(422, "No text detected in image")
        except ImportError:
            raise HTTPException(501, "Image OCR not installed (google-cloud-vision missing)")

    # Audio — GCP Speech-to-Text
    elif mime_type.startswith("audio/") or any(
        lower_name.endswith(ext) for ext in (".mp3", ".m4a", ".wav", ".ogg", ".flac", ".opus")
    ):
        try:
            from google.cloud import speech
            speech_client = speech.SpeechClient()

            # Determine encoding
            if lower_name.endswith(".mp3"):
                encoding = speech.RecognitionConfig.AudioEncoding.MP3
            elif lower_name.endswith((".m4a", ".aac")):
                encoding = speech.RecognitionConfig.AudioEncoding.MP3  # GCS handles m4a as MP3
            elif lower_name.endswith(".flac"):
                encoding = speech.RecognitionConfig.AudioEncoding.FLAC
            elif lower_name.endswith(".ogg"):
                encoding = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
            else:
                encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16

            audio = speech.RecognitionAudio(content=file_bytes)
            config = speech.RecognitionConfig(
                encoding=encoding,
                language_code="en-US",
                enable_automatic_punctuation=True,
                model="latest_long",
            )
            response = speech_client.recognize(config=config, audio=audio)
            raw_text = " ".join(
                result.alternatives[0].transcript
                for result in response.results
                if result.alternatives
            )
            if not raw_text.strip():
                raise HTTPException(422, "No speech detected in audio file")
        except ImportError:
            raise HTTPException(501, "Audio transcription not installed (google-cloud-speech missing)")

    # Plain text / Markdown / JSON / other
    else:
        raw_text = file_bytes.decode("utf-8", errors="ignore")

    # Reuse _ingest_raw for chunking + embedding + persistence
    # If a document_id was pre-created (by drive.py), we need to handle that separately
    return await _ingest_raw(filename, raw_text, user_id, notebook_id, db)


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/upload")
async def ingest_upload(
    file: UploadFile = File(...),
    notebook_id: Optional[str] = Form(None),   # Form(None) required for multipart binding
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file and ingest it into a notebook. notebook_id sent as a form field."""
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(400, f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit")

    mime = file.content_type or "application/octet-stream"
    return await _process_file_bytes(
        file_bytes=content,
        filename=file.filename or "upload",
        mime_type=mime,
        document_id=str(uuid.uuid4()),
        user_id=current_user.id,
        db=db,
        notebook_id=notebook_id,
    )


@router.post("/text")
async def ingest_text(
    req: TextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ingest pasted plain text. Accepts JSON body."""
    title = (req.title or "Pasted Text").strip()
    filename = title if title.endswith(".txt") else f"{title}.txt"
    return await _ingest_raw(filename, req.content, current_user.id, req.notebook_id, db)


def _validate_url_not_internal(url: str):
    """Block SSRF: reject URLs pointing to internal/private networks."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(400, "Invalid URL")
    blocked_hosts = {"localhost", "127.0.0.1", "[::1]", "0.0.0.0", "metadata.google.internal"}
    if hostname in blocked_hosts:
        raise HTTPException(400, "Internal URLs are not allowed")
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise HTTPException(400, "Internal URLs are not allowed")
    except (socket.gaierror, ValueError):
        pass  # DNS resolution failed — allow Jina to handle it
    if hostname == "169.254.169.254":
        raise HTTPException(400, "Metadata endpoint access is not allowed")


@router.post("/url")
async def ingest_url(
    req: UrlRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Scrape a public URL via Jina Reader API and ingest its text. Accepts JSON body."""
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL must start with http:// or https://")

    _validate_url_not_internal(url)

    # Jina Reader: converts any page (including JS-rendered) to clean markdown
    jina_url = f"https://r.jina.ai/{url}"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as http:
            resp = await http.get(
                jina_url,
                headers={
                    "Accept": "text/markdown",
                    "User-Agent": "NotebookRx/1.0",
                    "X-No-Cache": "true",
                },
            )
        resp.raise_for_status()
        raw_text = resp.text
    except httpx.TimeoutException:
        raise HTTPException(408, "Timed out fetching URL — the page may be slow or blocked")
    except httpx.HTTPStatusError as e:
        raise HTTPException(400, f"Failed to fetch URL: HTTP {e.response.status_code}")
    except Exception as e:
        raise HTTPException(400, f"Failed to fetch URL: {str(e)}")

    if not raw_text.strip():
        raise HTTPException(422, "Page returned no readable content")

    # Reject pages that returned suspiciously little content (likely 404 error pages)
    if len(raw_text.strip()) < 200:
        raise HTTPException(
            422,
            "The page returned very little content — it may be a 404 error page, "
            "a login wall, or a redirect. Please verify the URL is publicly accessible."
        )

    safe_name = re.sub(r"[^\w\-.]", "_", url.split("//")[-1])[:80]
    filename = f"web:{safe_name}"
    return await _ingest_raw(filename, raw_text, current_user.id, req.notebook_id, db)


@router.post("/youtube")
async def ingest_youtube(
    req: YoutubeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    YouTube transcript ingestion.

    STATUS: Temporarily unavailable in production.
    Railway cloud IPs are blocked by YouTube's anti-bot layer.
    Option A (proxy vendor) is under evaluation for a future sprint.
    Option C (honest disable) is active until a reliable solution is in place.
    """
    raise HTTPException(
        503,
        "YouTube import is temporarily unavailable. "
        "Our servers are currently blocked by YouTube's access controls. "
        "We're working on a fix. In the meantime, you can paste the transcript "
        "manually using the 'Paste Text' option."
    )



@router.get("/documents")
async def list_documents(
    notebook_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if notebook_id:
        result = await db.execute(
            text("SELECT id, filename FROM documents WHERE user_id = :uid AND notebook_id = :nid"),
            {"uid": current_user.id, "nid": notebook_id},
        )
    else:
        result = await db.execute(
            text("SELECT id, filename FROM documents WHERE user_id = :uid"),
            {"uid": current_user.id},
        )
    return [{"id": r[0], "filename": r[1]} for r in result.fetchall()]


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT id FROM documents WHERE id = :id AND user_id = :uid"),
        {"id": document_id, "uid": current_user.id},
    )
    if not result.fetchone():
        raise HTTPException(404, "Document not found")
    await db.execute(
        text("DELETE FROM document_chunks WHERE document_id = :id"), {"id": document_id}
    )
    await db.execute(
        text("DELETE FROM documents WHERE id = :id"), {"id": document_id}
    )
    await db.commit()
    return {"deleted": document_id}