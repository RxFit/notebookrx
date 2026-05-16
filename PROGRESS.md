# NotebookRx — Development Progress

## Phase 1 — Clone Fidelity (P0) ✅ COMPLETE
- [x] #2 Collapsible Left/Right sidebars with CSS transition
- [x] #3 Rich-text note editor (Tiptap) with full formatting toolbar
- [x] #4 Citation → Source jump (document_id in Citation, highlight + scroll)
- [x] #5 Website URL ingestion (BeautifulSoup scraper)
- [x] #6 YouTube transcript ingestion (youtube-transcript-api)
- [x] #7 Light/Dark/Device theme toggle (CSS variables + localStorage)

## Phase 2 — UX Completeness (P1) ✅ COMPLETE
- [x] #8  Drag-and-drop file upload (already in AddSourcesModal)
- [x] #9  Source ingestion status badges (status field on Document model)
- [x] #10 Editable notebook title (inline input in header)
- [x] #11 Contextual in-notebook search (SearchBar + /notebooks/{id}/search)
- [x] #12 Customize Notebook (CustomizeModal + system_prompt per notebook)
- [x] #13 Study Guide Generator (StudyGuideTab + /media/studyguide)
- [x] #14 Summarization Tool (SummarizeTab + /media/summarize)
- [x] #15 Output language selector (SettingsMenu select → PATCH /auth/me)
- [x] #16 Help overlay + Send Feedback modal (SettingsMenu)

## Phase 3 — Polish & Production (P2) ✅ COMPLETE
- [x] #17 Railway deploy — Dockerfile already uses 0.0.0.0 + $PORT ✅
- [x] #18 Google Fonts — Inter (body) + Roboto Mono (code) via next/font
- [x] #19 Material Symbols Rounded stylesheet loaded in layout.tsx
- [x] #20 EmojiPicker component (Dashboard create modal)
- [x] #21 ShareModal — copy notebook link to clipboard
- [x] #22 Prompt injection hardening — DAN/jailbreak patterns + 1000 char limit
- [x] #23 E2E test suite expansion (see backend/test_e2e.py)

## Phase 4 — Stretch Goals (P3) 🔜 PLANNED
- [ ] #24 Google OAuth SSO
- [ ] #25 Google Drive integration
- [ ] #26 Real-time collaboration

## Architecture
- **Frontend:** Next.js 16, Zustand, Tailwind CSS, Tiptap, DOMPurify
- **Backend:** FastAPI 0.115.12, SQLAlchemy async, pgvector, Redis, Gemini 2.5 Flash
- **Deploy:** Railway (backend) + Vercel (frontend)
- **Auth:** JWT with per-user RLS on all document/RAG endpoints

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/chat/ | RAG chat with intent classification |
| POST | /api/ingest/ | Upload PDF/TXT file |
| POST | /api/ingest/text | Paste text as source |
| POST | /api/ingest/url | Scrape website URL |
| POST | /api/ingest/youtube | YouTube transcript |
| GET  | /api/ingest/documents | List sources |
| GET  | /api/notebooks/{id}/search | Search sources + notes |
| POST | /api/media/summarize | Executive summary |
| POST | /api/media/studyguide | Structured study guide |
| POST | /api/media/audio | Deep Dive audio job |
| POST | /api/media/diagram | Mermaid diagram |
| POST | /api/media/image | Imagen 3 image |