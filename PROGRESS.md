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
- [x] CORS hardening — restored explicit allow_origins + credentials=True (was wildcard hotfix)

## Phase 4 — Stretch Goals (P3) ✅ COMPLETE
- [x] #24 Google OAuth SSO — /auth/google redirect + /auth/callback frontend page + User model fields
- [x] #25 Google Drive integration — Drive list + ingest endpoints + file picker in AddSourcesModal
- [x] #26 Real-time collaboration — WS presence server + useCollabPresence hook + PresenceAvatars UI

## Phase 5 â€” Quality & UX (P2) [IN PROGRESS]
- [x] #27 React Query migration (DashboardPage)
- [x] #28 Sonner toast system integration
- [x] #29 Theme key mismatch fix (notebook_blue_theme)
- [x] #30 Object URL memory leak cleanup (Audio/Image tabs)
- [ ] #31 Global Error Boundary
- [ ] #32 React Query migration (LeftPane/RightPane)
- [ ] #33 Wire feedback form to backend

## Architecture
- **Frontend:** Next.js 16, Zustand, Tailwind CSS, Tiptap, DOMPurify
- **Backend:** FastAPI 0.115.12, SQLAlchemy async, pgvector, Redis, Gemini 2.5 Flash
- **Deploy:** Railway (backend) + Vercel (frontend)
- **Auth:** JWT with per-user RLS on all document/RAG endpoints + Google OAuth SSO

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/chat/ | RAG chat with intent classification |
| POST | /api/ingest/ | Upload PDF/TXT file |
| POST | /api/ingest/text | Paste text as source |
| POST | /api/ingest/url | Scrape website URL |
| POST | /api/ingest/youtube | YouTube transcript |
| GET  | /api/ingest/documents | List sources |
| GET  | /api/ingest/drive/list | List user's Google Drive files |
| POST | /api/ingest/drive | Ingest a Google Drive file |
| GET  | /api/notebooks/{id}/search | Search sources + notes |
| POST | /api/media/summarize | Executive summary |
| POST | /api/media/studyguide | Structured study guide |
| POST | /api/media/audio | Deep Dive audio job |
| POST | /api/media/diagram | Mermaid diagram |
| POST | /api/media/image | Imagen 3 image |
| GET  | /auth/google | Initiate Google OAuth flow |
| GET  | /auth/google/callback | Handle OAuth callback + issue JWT |
| WS   | /api/ws/{notebook_id} | Real-time presence + cursor relay |

## Post-Ship Action Items
- [ ] Add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to Railway environment variables
- [ ] Run `python migrate.py` in Railway console to add new DB columns
- [ ] Add `https://notebookrx-api-production.up.railway.app/auth/google/callback` as Authorized Redirect URI in Google Cloud Console
- [ ] Lock down CORS `notebook.blue` origin list once Vercel deploy URL is confirmed stable
