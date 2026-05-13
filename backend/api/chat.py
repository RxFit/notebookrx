from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from pydantic import BaseModel
from db.database import get_db
from db.models import Document, User
from config import settings
from auth.jwt_handler import get_current_user
import google.genai as genai
from google.genai import types
import json

router = APIRouter()
client = genai.Client(api_key=settings.GEMINI_API_KEY)

SYSTEM_PROMPT = (
    "=== SYSTEM INSTRUCTIONS ===\n"
    "You are a strict retrieval assistant. Answer ONLY using the provided Source Chunks.\n"
    "Do NOT use external knowledge. If the answer is not in the chunks, respond:\n"
    "\"I cannot find this in the sources.\"\n"
    "Return valid JSON: {\"answer\": \"...\", \"citations\": [{\"chunk_id\": \"...\", \"excerpt\": \"...\"}]}\n"
    "Only cite chunk_ids explicitly provided to you.\n"
    "=== END SYSTEM INSTRUCTIONS ==="
)

# Prompt injection shield: block delimiter injection attempts
_INJECTION_PATTERNS = ["=== SYSTEM", "=== END SYSTEM", "IGNORE PREVIOUS", "DISREGARD", "YOU ARE NOW"]

# Gemini safety settings — block harmful content at medium threshold
SAFETY_SETTINGS = [
    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT",        threshold="BLOCK_MEDIUM_AND_ABOVE"),
    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH",       threshold="BLOCK_MEDIUM_AND_ABOVE"),
    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_MEDIUM_AND_ABOVE"),
    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_MEDIUM_AND_ABOVE"),
]

class ChatRequest(BaseModel):
    query: str
    selected_document_ids: list[str]
    top_k: int = 8

class Citation(BaseModel):
    chunk_id: str
    excerpt: str

class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]

@router.post("/", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not req.selected_document_ids:
        raise HTTPException(400, "No documents selected. Please select at least one source.")

    # ── Prompt injection shield ────────────────────────────────────────────
    query_upper = req.query.upper()
    if any(pat in query_upper for pat in _INJECTION_PATTERNS):
        raise HTTPException(400, "Query contains disallowed patterns.")

    verified = await db.execute(
        select(func.count()).select_from(Document).where(
            Document.id.in_(req.selected_document_ids),
            Document.user_id == current_user.id,
        )
    )
    if verified.scalar() != len(req.selected_document_ids):
        raise HTTPException(403, "One or more selected documents do not belong to this user.")

    embed_result = client.models.embed_content(model=settings.EMBEDDING_MODEL, contents=[req.query])
    query_vec = embed_result.embeddings[0].values
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    placeholders = ", ".join(f":id_{i}" for i in range(len(req.selected_document_ids)))
    params = {f"id_{i}": did for i, did in enumerate(req.selected_document_ids)}
    params["qvec"] = vec_str
    params["top_k"] = req.top_k

    sim_sql = (
        "SELECT id, content FROM document_chunks "
        "WHERE document_id IN (" + placeholders + ") "
        "ORDER BY embedding <=> CAST(:qvec AS vector) "
        "LIMIT :top_k"
    )
    sim_result = await db.execute(text(sim_sql), params)
    chunks = sim_result.fetchall()
    if not chunks:
        return ChatResponse(answer="I cannot find this in the sources.", citations=[])

    valid_chunk_ids = {c[0] for c in chunks}
    context_str = "\n\n".join(f"[Chunk {c[0]}]\n{c[1]}" for c in chunks)
    prompt = f"{SYSTEM_PROMPT}\n\nSOURCE CHUNKS:\n{context_str}\n\nUSER QUERY: {req.query}"

    response = client.models.generate_content(
        model=settings.CHAT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="application/json",
            safety_settings=SAFETY_SETTINGS,
        ),
    )
    try:
        parsed = json.loads(response.text)
    except json.JSONDecodeError:
        raise HTTPException(500, "Model returned malformed JSON")

    safe_citations = [
        Citation(chunk_id=c["chunk_id"], excerpt=c.get("excerpt", ""))
        for c in parsed.get("citations", [])
        if c.get("chunk_id") in valid_chunk_ids
    ]
    return ChatResponse(answer=parsed.get("answer", ""), citations=safe_citations)
