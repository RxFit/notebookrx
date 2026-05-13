from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api import ingest, chat, media, notebooks, notes
from auth import router as auth_router
from db.database import init_db
from middleware.rate_limit import RateLimitMiddleware
from config import settings
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="NotebookLM Clone API", version="1.0.0", lifespan=lifespan)

# Build allowed origins — include Railway + Vercel + local dev
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3003",
    "https://notebookrx-api-production.up.railway.app",
]
# Allow any *.vercel.app subdomain pattern via regex
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Window", "Retry-After"],
)

app.add_middleware(RateLimitMiddleware, redis_url=settings.REDIS_URL)

app.include_router(auth_router.router)
app.include_router(ingest.router,     prefix="/api/ingest",     tags=["ingest"])
app.include_router(chat.router,       prefix="/api/chat",       tags=["chat"])
app.include_router(media.router,      prefix="/api/media",      tags=["media"])
app.include_router(notebooks.router,  prefix="/api/notebooks",  tags=["notebooks"])
app.include_router(notes.router,      prefix="/api/notes",      tags=["notes"])

@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "notebooklm-clone-api"}
