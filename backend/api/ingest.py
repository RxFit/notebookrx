from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from db.database import get_db
from db.models import Document, DocumentChunk, User
from config import settings
from auth.jwt_handler import get_current_user
import google.genai as genai
import pypdf
import io, uuid

router = APIRouter()
client = genai.Client(api_key=settings.GEMINI_API_KEY)
MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024

def chunk_text(raw: str, max_chars=2000, overlap=200) -> list[str]:
    chunks, i = [], 0
    while i < len(raw):
        chunks.append(raw[i:i + max_chars])
        i += max_chars - overlap
    return [c.strip() for c in chunks if c.strip()]

async def embed_texts(texts: list[str]) -> list[list[float]]:
    result = client.models.embed_content(model=settings.EMBEDDING_MODEL, contents=texts)
    return [e.values for e in result.embeddings]

@router.post("/")
async def ingest_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(400, f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit")
    if file.filename.endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(content))
        raw_text = " ".join(page.extract_text() or "" for page in reader.pages)
    else:
        raw_text = content.decode("utf-8", errors="ignore")
    if not raw_text.strip():
        raise HTTPException(400, "Could not extract text from document")
    chunks = chunk_text(raw_text)
    if len(chunks) > settings.MAX_CHUNKS_PER_DOC:
        chunks = chunks[:settings.MAX_CHUNKS_PER_DOC]
    all_embeddings = []
    for i in range(0, len(chunks), 20):
        all_embeddings.extend(await embed_texts(chunks[i:i+20]))
    doc = Document(id=str(uuid.uuid4()), filename=file.filename, user_id=current_user.id)
    db.add(doc)
    await db.flush()
    for idx, (chunk_val, emb) in enumerate(zip(chunks, all_embeddings)):
        db.add(DocumentChunk(
            id=str(uuid.uuid4()), document_id=doc.id,
            content=chunk_val, chunk_index=idx, embedding=emb,
        ))
    await db.commit()
    return {"document_id": doc.id, "filename": file.filename, "chunks": len(chunks)}

@router.get("/documents")
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    await db.execute(text("DELETE FROM document_chunks WHERE document_id = :id"), {"id": document_id})
    await db.execute(text("DELETE FROM documents WHERE id = :id"), {"id": document_id})
    await db.commit()
    return {"deleted": document_id}
