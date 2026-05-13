from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from pydantic import BaseModel
from db.database import get_db
from db.models import Document, User
from config import settings
from auth.jwt_handler import get_current_user
import google.genai as genai
from google.genai import types
import asyncio, json, uuid, re
from workers.audio_worker import generate_audio_job
from workers.job_store import job_store

router = APIRouter()
client = genai.Client(api_key=settings.GEMINI_API_KEY)

class MediaRequest(BaseModel):
    selected_document_ids: list[str]
    intent: str
    prompt: str = ""

async def fetch_context(doc_ids: list[str], user_id: str, db: AsyncSession, limit: int = 25) -> str:
    verified = await db.execute(
        select(func.count()).select_from(Document).where(
            Document.id.in_(doc_ids), Document.user_id == user_id,
        )
    )
    if verified.scalar() != len(doc_ids):
        raise HTTPException(403, "One or more selected documents do not belong to this user.")
    placeholders = ", ".join(f":id_{i}" for i in range(len(doc_ids)))
    params = {f"id_{i}": did for i, did in enumerate(doc_ids)}
    params["limit"] = limit
    rows = await db.execute(
        text(f"SELECT content FROM document_chunks WHERE document_id IN ({placeholders}) LIMIT :limit"),
        params,
    )
    chunks = rows.fetchall()
    if not chunks:
        raise HTTPException(404, "No content found for the selected documents.")
    return "\n\n".join(c[0] for c in chunks)

@router.post("/diagram")
async def generate_diagram(
    req: MediaRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not req.selected_document_ids:
        raise HTTPException(400, "No documents selected")
    context = await fetch_context(req.selected_document_ids, current_user.id, db, limit=20)
    resp = client.models.generate_content(
        model=settings.CHAT_MODEL,
        contents=(
            "Based ONLY on this content, generate a valid Mermaid.js diagram "
            "(flowchart LR or sequence). Return ONLY raw Mermaid syntax — no fences.\n\n"
            f"Content:\n{context}\n\nUser request: {req.prompt or 'summarise key concepts'}"
        ),
        config=types.GenerateContentConfig(temperature=0.2),
    )
    raw = re.sub(r"```(?:mermaid)?\n?", "", resp.text)
    raw = re.sub(r"```", "", raw).strip()
    return {"mermaid": raw}

@router.post("/audio")
async def generate_audio(
    req: MediaRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not req.selected_document_ids:
        raise HTTPException(400, "No documents selected")
    context = await fetch_context(req.selected_document_ids, current_user.id, db, limit=30)
    job_id = str(uuid.uuid4())
    await job_store.create(job_id, {"status": "queued", "progress": 0, "url": None, "error": None, "script": None})
    background_tasks.add_task(generate_audio_job, job_id, context, settings)
    return {"job_id": job_id, "status": "queued"}

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, current_user: User = Depends(get_current_user)):
    job = await job_store.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job

@router.get("/jobs/{job_id}/stream")
async def stream_job_status(job_id: str, current_user: User = Depends(get_current_user)):
    async def event_generator():
        misses = 0
        while True:
            job = await job_store.get(job_id)
            if job is None:
                misses += 1
                if misses >= 3:
                    yield f"data: {json.dumps({'error': 'job not found'})}\n\n"
                    break
                await asyncio.sleep(1)
                continue
            misses = 0
            yield f"data: {json.dumps(job)}\n\n"
            if job.get("status") in ("done", "error"):
                break
            await asyncio.sleep(1)
    return StreamingResponse(
        event_generator(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@router.get("/audio/{job_id}.mp3")
async def serve_audio(job_id: str, current_user: User = Depends(get_current_user)):
    """Stream the generated MP3 from Redis (base64-encoded)."""
    import base64
    from fastapi.responses import Response
    job = await job_store.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "Audio not ready or job not found")
    audio_b64 = job.get("audio_b64")
    if not audio_b64:
        raise HTTPException(404, "Audio data not available")
    audio_bytes = base64.b64decode(audio_b64)
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'attachment; filename="podcast-{job_id}.mp3"'},
    )
