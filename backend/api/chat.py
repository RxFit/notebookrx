from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from pydantic import BaseModel
from db.database import get_db
from db.models import Document, User, Notebook
from config import settings
from auth.jwt_handler import get_current_user
import google.genai as genai
from google.genai import types
import json, re

router = APIRouter()
client = genai.Client(api_key=settings.GEMINI_API_KEY)

# 🔒 Retrieval prompt: strict, citation-required 🔒
RETRIEVAL_SYSTEM_PROMPT = (
    "=== SYSTEM INSTRUCTIONS ===\n"
    "You are a strict retrieval assistant. Answer ONLY using the provided Source Chunks.\n"
    "Do NOT use external knowledge. If the answer is not in the chunks, respond:\n"
    "\"I cannot find this in the sources.\"\n"
    "Return valid JSON: {\"answer\": \"...\", \"citations\": [{\"chunk_id\": \"...\", \"excerpt\": \"...\"}]}\n"
    "Only cite chunk_ids explicitly provided to you.\n"
    "=== END SYSTEM INSTRUCTIONS ==="
)

# 🎨 Creative/synthesis prompt: uses sources as inspiration, not verbatim 🎨
CREATIVE_SYSTEM_PROMPT = (
    "=== SYSTEM INSTRUCTIONS ===\n"
    "You are a creative writing assistant. The user has provided Source Chunks from their documents.\n"
    "Use the source material as the basis and inspiration for your response - draw on the characters,\n"
    "events, themes, and world-building present in the chunks, but synthesize and compose freely.\n"
    "Do NOT copy sentences verbatim. Write originally, in your own voice.\n"
    "Return valid JSON: {\"answer\": \"...\", \"citations\": [{\"chunk_id\": \"...\", \"excerpt\": \"...\"}]}\n"
    "Cite the chunk_ids you drew upon as inspiration.\n"
    "=== END SYSTEM INSTRUCTIONS ==="
)

# 🔬 Analysis/summary prompt: synthesis from sources, no strict Q&A 🔬
SYNTHESIS_SYSTEM_PROMPT = (
    "=== SYSTEM INSTRUCTIONS ===\n"
    "You are an analytical assistant. The user has provided Source Chunks from their documents.\n"
    "Synthesize, summarize, compare, or analyze the source material to answer the user's request.\n"
    "Ground your answer in the source chunks but express it in your own words - do not copy verbatim.\n"
    "Return valid JSON: {\"answer\": \"...\", \"citations\": [{\"chunk_id\": \"...\", \"excerpt\": \"...\"}]}\n"
    "Only cite chunk_ids explicitly provided to you.\n"
    "=== END SYSTEM INSTRUCTIONS ==="
)

# 🎯 Intent detection 🎯
_CREATIVE_PATTERNS = re.compile(
    r"\b(write|tell|create|compose|draft|generate|imagine|narrate|describe|"
    r"story|poem|essay|script|dialogue|scene|chapter|paragraph|letter|"
    r"fiction|fantasy|creative|story in \d+|words? about|in \d+ words?)\b",
    re.IGNORECASE,
)
_SYNTHESIS_PATTERNS = re.compile(
    r"\b(summarize|summary|compare|contrast|analyze|analyse|explain|overview|"
    r"list|outline|what are|what is|how does|pros and cons|themes|key points|"
    r"differences|similarities|relationship between)\b",
    re.IGNORECASE,
)

def classify_intent(query: str) -> tuple[str, float]:
    """Returns (prompt_type, temperature)."""
    if _CREATIVE_PATTERNS.search(query):
        return "creative", 0.9
    if _SYNTHESIS_PATTERNS.search(query):
        return "synthesis", 0.3
    return "retrieval", 0.0


# Prompt injection shield
_INJECTION_PATTERNS = [
    "=== SYSTEM", "=== END SYSTEM", "IGNORE PREVIOUS", "DISREGARD",
    "YOU ARE NOW", "DAN", "ACT AS", "PRETEND YOU ARE",
]

# Max query length
MAX_QUERY_LENGTH = 1000

# Safety settings
SAFETY_SETTINGS = [
    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT",        threshold="BLOCK_MEDIUM_AND_ABOVE"),
    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH",       threshold="BLOCK_MEDIUM_AND_ABOVE"),
    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_MEDIUM_AND_ABOVE"),
    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_MEDIUM_AND_ABOVE"),
]


class ChatRequest(BaseModel):
    query: str
    selected_document_ids: list[str]
    notebook_id: str | None = None   # P1 #12 — used to load custom system prompt
    top_k: int = 8
    temperature: float | None = None  # None = auto-detect via intent classifier


class Citation(BaseModel):
    chunk_id: str
    excerpt: str
    document_id: str = ""   # ← NEW: which source document this chunk belongs to


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    intent: str = "retrieval"


@router.post("/", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not req.selected_document_ids:
        raise HTTPException(400, "No documents selected. Please select at least one source.")

    # Query length guard
    if len(req.query) > MAX_QUERY_LENGTH:
        raise HTTPException(400, f"Query exceeds maximum length of {MAX_QUERY_LENGTH} characters.")

    # Prompt injection shield
    query_upper = req.query.upper()
    if any(pat in query_upper for pat in _INJECTION_PATTERNS):
        raise HTTPException(400, "Query contains disallowed patterns.")

    # RLS: verify all selected docs belong to this user
    verified = await db.execute(
        select(func.count()).select_from(Document).where(
            Document.id.in_(req.selected_document_ids),
            Document.user_id == current_user.id,
        )
    )
    if verified.scalar() != len(req.selected_document_ids):
        raise HTTPException(403, "One or more selected documents do not belong to this user.")

    # P1 #12 — Load custom system prompt from notebook (if set)
    custom_system_prompt: str | None = None
    if req.notebook_id:
        nb_res = await db.execute(
            select(Notebook).where(Notebook.id == req.notebook_id, Notebook.user_id == current_user.id)
        )
        nb = nb_res.scalar_one_or_none()
        if nb and nb.system_prompt:
            custom_system_prompt = nb.system_prompt

    # P1 #15 — Output language from user profile
    lang_suffix = ""
    if current_user.output_language and current_user.output_language != "en":
        lang_names = {"es": "Spanish", "fr": "French", "de": "German", "pt": "Portuguese",
                      "ja": "Japanese", "ko": "Korean", "zh": "Chinese"}
        lang_name = lang_names.get(current_user.output_language, current_user.output_language)
        lang_suffix = f"\n\nIMPORTANT: Respond in {lang_name}."

    # Classify intent - user-supplied temperature overrides the classified value
    intent, auto_temp = classify_intent(req.query)
    temperature = req.temperature if req.temperature is not None else auto_temp
    temperature = max(0.0, min(1.0, temperature))  # clamp to [0, 1]

    # Embed query and retrieve top-k semantically similar chunks
    embed_result = client.models.embed_content(model=settings.EMBEDDING_MODEL, contents=[req.query])
    query_vec = embed_result.embeddings[0].values
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    placeholders = ", ".join(f":id_{i}" for i in range(len(req.selected_document_ids)))
    params = {f"id_{i}": did for i, did in enumerate(req.selected_document_ids)}
    params["qvec"] = vec_str

    # For creative/synthesis tasks, pull more chunks for richer context
    top_k = req.top_k if intent == "retrieval" else min(req.top_k * 2, 20)
    params["top_k"] = top_k

    # ← UPDATED: join document_chunks → documents to get document_id per chunk
    sim_sql = (
        "SELECT dc.id, dc.content, dc.document_id FROM document_chunks dc "
        "WHERE dc.document_id IN (" + placeholders + ") "
        "ORDER BY dc.embedding <=> CAST(:qvec AS vector) "
        "LIMIT :top_k"
    )
    sim_result = await db.execute(text(sim_sql), params)
    chunks = sim_result.fetchall()
    if not chunks:
        return ChatResponse(answer="I cannot find this in the sources.", citations=[], intent=intent)

    valid_chunk_ids = {c[0] for c in chunks}
    # Build chunk_id → document_id lookup for citation enrichment
    chunk_doc_map = {c[0]: c[2] for c in chunks}
    context_str = "\n\n".join(f"[Chunk {c[0]}]\n{c[1]}" for c in chunks)

    # Select the right system prompt
    system_prompt = {
        "creative":  CREATIVE_SYSTEM_PROMPT,
        "synthesis": SYNTHESIS_SYSTEM_PROMPT,
        "retrieval": RETRIEVAL_SYSTEM_PROMPT,
    }[intent]

    effective_prompt = custom_system_prompt if custom_system_prompt else system_prompt
    prompt = f"{effective_prompt}\n\nSOURCE CHUNKS:\n{context_str}\n\nUSER REQUEST: {req.query}{lang_suffix}"

    response = client.models.generate_content(
        model=settings.CHAT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=temperature,
            response_mime_type="application/json",
            safety_settings=SAFETY_SETTINGS,
        ),
    )
    try:
        parsed = json.loads(response.text)
    except json.JSONDecodeError:
        raise HTTPException(500, "Model returned malformed JSON")

    safe_citations = [
        Citation(
            chunk_id=c["chunk_id"],
            excerpt=c.get("excerpt", ""),
            document_id=chunk_doc_map.get(c["chunk_id"], ""),  # ← NEW: enrich with document_id
        )
        for c in parsed.get("citations", [])
        if c.get("chunk_id") in valid_chunk_ids
    ]
    return ChatResponse(
        answer=parsed.get("answer", ""),
        citations=safe_citations,
        intent=intent,
    )