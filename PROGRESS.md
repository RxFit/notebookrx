# NotebookLM Clone — Living Progress Document

> Last Updated: 2026-05-12 19:22 CST | Status: 🟢 Backend Live & Verified

---

## Project Overview
A deterministic, state-machine-driven NotebookLM clone.
Stack: Next.js 16 + FastAPI monorepo | pgvector | Redis | Gemini | Railway
Railway Project: reasonable-light (production)

---

## Architecture Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-12 | Next.js 16 frontend + FastAPI backend monorepo | Optimal for Python orchestration + React 3-pane UI |
| 2026-05-12 | SQLAlchemy async + pgvector for DB layer | asyncpg driver, Vector(768) column type |
| 2026-05-12 | text-embedding-004 (768d) | Google native, best-in-class for RAG |
| 2026-05-12 | Redis + FastAPI BackgroundTasks for audio | Prevent Railway HTTP timeout on ffmpeg stitching |
| 2026-05-12 | Gemini Flash structured output (temp=0.0) | Enforce citation schema, prevent phantom citations |
| 2026-05-12 | Zustand for global state | Lightweight, perfect for selectedDocumentIds |
| 2026-05-12 | PowerShell Set-Content for all file writes | WORKAROUND: prevents agent freeze on OneDrive paths |
| 2026-05-12 | react-mermaid2 with custom .d.ts declaration | No official @types package; manual declaration needed |
| 2026-05-12 | Character-based chunker (not tiktoken) | tiktoken requires Rust, no Python 3.14 wheel available |
| 2026-05-12 | Pinned FastAPI 0.115.12 + Starlette 0.41.3 | FastAPI 0.136 has router routing bug with Starlette 1.0 |
| 2026-05-12 | Uvicorn on 127.0.0.1 (not 0.0.0.0) | Windows Python 3.14: 0.0.0.0 silently drops routes |
| 2026-05-12 | --only-binary :all: for pip installs | Python 3.14 has no Rust compiler; avoids source builds |

---

## Phase Tracker

### Phase 0: Infrastructure & Scaffolding
**Status:** ✅ Complete

- [x] Project plan saved to knowledge base
- [x] Environment verified (Node v24, Python 3.14, npm 11)
- [x] Scaffold Next.js 16 frontend — Turbopack, TypeScript, Tailwind
- [x] Scaffold FastAPI backend — modular api/ agents/ workers/ db/
- [x] Zustand store, shared types, Axios API client
- [x] Root config: .env.example, nixpacks.toml, railway.toml, .gitignore
- [x] Railway: PostgreSQL provisioned (yamabiko.proxy.rlwy.net:20231)
- [x] Railway: pgvector v0.8.2 ACTIVE (verified via SELECT pg_extension)
- [x] Railway: Redis provisioned (yamabiko.proxy.rlwy.net:14716)
- [x] .env: DATABASE_URL, REDIS_URL, GEMINI_API_KEY all configured

---

### Phase 1: Left Pane — Sources & Ground Truth
**Status:** ✅ Code Complete + Backend Live

- [x] SQLAlchemy models: documents + document_chunks (Vector(768))
- [x] init_db() tested — creates tables against live Railway Postgres
- [x] FastAPI /api/ingest/ — PDF/TXT/JSON parsing, chunking, embedding
- [x] GET /api/ingest/documents — returns [] (empty, live DB confirmed)
- [x] DELETE /api/ingest/{id} — with ownership RLS check
- [x] Hard limits enforced (MAX_FILE_SIZE_MB, MAX_CHUNKS_PER_DOC)
- [x] LeftPane.tsx — file upload, checkboxes, select-all, delete
- [x] Zustand: selectedDocumentIds (Set<string>)
- [x] Live sandbox validation test (upload doc, uncheck, query => 400)

---

### Phase 2: Middle Pane — RAG Chat Engine
**Status:** ✅ Code Complete

- [x] FastAPI /api/chat/ — embed query, cosine similarity, context build
- [x] RLS: verify selected_document_ids belong to requesting user
- [x] Sandbox guard: 400 if no documents selected
- [x] Gemini Flash structured output (temp=0.0): { answer, citations }
- [x] Phantom citation guard: strip chunk_ids not in context payload
- [x] MiddlePane.tsx — chat thread, typing indicator, citation badges
- [x] Live hallucination test (off-topic query must be refused CONFIRMED: returns "I cannot find this in the sources.")

---

### Phase 3: Right Pane — Agentic Media Studio
**Status:** ✅ Code Complete (TTS is stub)

- [x] FastAPI /api/media/diagram — Gemini Flash + Mermaid sanitization
- [x] FastAPI /api/media/audio — async job queue via BackgroundTasks
- [x] FastAPI /api/media/jobs/{id} — poll + SSE stream
- [x] audio_worker.py — Gemini Pro script gen + TTS stub
- [x] RightPane.tsx — Audio tab (progress bar, SSE poll, script preview)
- [x] RightPane.tsx — Diagram tab (Mermaid renderer, sanitized input)
- [ ] Wire real Google Cloud TTS calls in audio_worker.py
- [x] Replace in-memory job_store with Redis — DONE, 9/9 tests passing

---

### Phase 4: Hardening & Deployment
**Status:** 🟡 Partial

- [x] nixpacks.toml (ffmpeg, python312)
- [x] railway.toml (health check, restart policy)
- [x] .gitignore
- [x] Rate limiting middleware (FastAPI + Redis) — DONE, 6/6 tests passing
- [ ] Prompt injection shields final review
- [ ] End-to-end integration test (upload -> chat -> cite -> diagram)
- [ ] Deploy to Railway production

---

## Validated API Endpoints (Live Test Results)

| Endpoint | Method | Status | Result |
|---|---|---|---|
| /health | GET | 200 | {"status":"ok","service":"notebooklm-clone-api"} |
| /openapi.json | GET | 200 | Full OpenAPI 3.1 schema |
| /api/ingest/documents | GET | 200 | [] (empty, correct) |
| /api/ingest/ | POST | 200 | Upload + embed (3072d) + pgvector insert |
| /api/chat/ | POST | 200 | RAG answer with citations (gemini-2.5-flash) |
| /api/chat/ (hallucination) | POST | 200 | Returns 'I cannot find this in the sources.' |
| /api/ingest/{id} | DELETE | 200 | Cascades chunks, user-owned |

---

## Next Steps

1. [DONE] Frontend verified — 3-pane UI live at localhost:3000
2. [DONE] Document upload tested via browser console — document appears in left pane
3. [DONE] Sandbox guard verified — "Select at least one source document" banner
4. [DONE] Hallucination guard verified — "I cannot find this in the sources."
5. [DONE] Rate limiting middleware live — sliding window Redis, 6/6 tests pass
6. [DONE] Full E2E test — 8/8 pipeline tests passing

Next Steps:
- Deploy to Railway production
- Wire real Google Cloud TTS (audio_worker.py stub)
- Replace in-memory job_store with Redis client calls
- Add auth (replace x-user-id mock header with real JWT)

---

## Known Issues / Workarounds

| Issue | Fix Applied |
|---|---|
| Python 3.14 — Rust packages fail to build | --only-binary :all: + removed tiktoken |
| FastAPI 0.136 routing bug with Starlette 1.0 | Pinned fastapi==0.115.12 + starlette==0.41.3 |
| Uvicorn 0.0.0.0 silently drops routes on Win/Py3.14 | Use 127.0.0.1 for local dev |
| Agent freezes writing files (OneDrive sync) | PowerShell Set-Content workaround |
| react-mermaid2 has no @types package | Custom .d.ts declaration file |
| tiktoken needs Rust (no py3.14 wheel) | Replaced with character-based chunker |





## Phase 5 — Complete ✅ (2026-05-13)

### Frontend Auth
- [x] JWT auth wired into frontend — AuthContext, LoginPage, api.ts interceptor
- [x] Login/register UI with glassmorphism design
- [x] Per-user session isolation via localStorage token
- [x] Auto-logout on 401 via axios interceptor

### Real TTS
- [x] Gemini 2.5 Flash Preview TTS — no GCP credentials needed
- [x] Host A: Charon voice (deep male), Host B: Aoede voice (warm female)
- [x] pydub audio stitching with 350ms silence between lines
- [x] MP3 served via /api/media/audio/{job_id}.mp3 endpoint

### Vercel Deploy
- [x] Frontend deployed to https://frontend-ten-gamma-72.vercel.app
- [x] CORS wildcard for *.vercel.app on backend
- [x] 4/4 full-stack E2E smoke tests passing
