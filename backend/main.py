from fastapi import FastAPI
import os
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api import ingest, chat, media, notebooks, notes, google_auth, ws, drive
from auth import router as auth_router
from db.database import init_db
from middleware.rate_limit import RateLimitMiddleware
from middleware.security_headers import SecurityHeadersMiddleware
from config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

_is_prod = os.environ.get('RAILWAY_ENVIRONMENT') or not os.environ.get('DATABASE_URL', '').startswith('postgresql://localhost')
_docs_url = None if _is_prod else '/docs'

app = FastAPI(
    title="NotebookRx API", version="1.0.0", lifespan=lifespan,
    docs_url=_docs_url, redoc_url=None,
    openapi_url='/openapi.json' if _docs_url else None,
)

# Explicit allowed origins — do NOT use wildcard in production
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3003",
    "http://127.0.0.1:3000",
    "https://notebookrx-api-production.up.railway.app",
    "https://notebookrx-production.vercel.app",
    "https://notebook.blue",
    "https://www.notebook.blue",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Window", "Retry-After"],
)

# Security headers on every response (P1 — audit RXF-24/RXF-36)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(RateLimitMiddleware, redis_url=settings.REDIS_URL)

app.include_router(auth_router.router)
app.include_router(google_auth.router)
app.include_router(ws.router)
app.include_router(ingest.router,     prefix="/api/ingest",     tags=["ingest"])
app.include_router(drive.router,      prefix="/api/ingest",     tags=["ingest"])  # /api/ingest/drive
app.include_router(chat.router,       prefix="/api/chat",       tags=["chat"])
app.include_router(media.router,      prefix="/api/media",      tags=["media"])
app.include_router(notebooks.router,  prefix="/api/notebooks",  tags=["notebooks"])
app.include_router(notes.router,      prefix="/api/notes",      tags=["notes"])

@app.get("/health", tags=["system"])
async def health():
    status = {"status": "ok"}
    # Check DB connectivity
    try:
        from db.database import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception:
        status["status"] = "degraded"
        status["db"] = "unreachable"
    # Check Redis connectivity
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.close()
    except Exception:
        if status["status"] == "ok":
            status["status"] = "degraded"
        status["redis"] = "unreachable"
    return status
