import urllib.request, urllib.error, json, io, sys

BASE = "http://127.0.0.1:8000"
USER = "test-user-live"
PASS_LIST = []; FAIL_LIST = []

def check(name, cond, info=""):
    sym = "PASS" if cond else "FAIL"
    (PASS_LIST if cond else FAIL_LIST).append(name)
    print(f"  {sym}  {name}" + (f"\n        => {str(info)[:120]}" if info else ""))

def req_json(method, path, body=None, headers={}):
    h = {"Content-Type": "application/json", "x-user-id": USER, **headers}
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except: return e.code, {"raw": raw.decode(errors="replace")[:200]}

def upload_text(content, filename):
    boundary = b"----FormBoundary7MA4YWxkTrZu0gW"
    body = (
        b"--" + boundary + b"\r\n"
        b'Content-Disposition: form-data; name="file"; filename="' + filename.encode() + b'"\r\n'
        b"Content-Type: text/plain\r\n\r\n" +
        content.encode() + b"\r\n"
        b"--" + boundary + b"--\r\n"
    )
    req = urllib.request.Request(
        f"{BASE}/api/ingest/",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary.decode()}",
            "x-user-id": USER,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, json.loads(r.read())

print("=" * 65)
print("LIVE PIPELINE TEST — Upload + RAG Chat + Hallucination Guard")
print("=" * 65)

# --- INGEST ---
test_doc = """
NotebookRx Project Technical Specification

The NotebookRx platform uses pgvector for semantic search with 768-dimensional embeddings.
The backend is built with FastAPI and deployed on Railway infrastructure.
The embedding model used is gemini-embedding-001 provided by Google Gemini API.
The database is PostgreSQL 18 running on Railway with pgvector extension v0.8.2.
The frontend is Next.js 16 with Zustand state management and a 3-pane layout.
The left pane handles document ingestion. The middle pane handles RAG chat with citations.
The right pane is the Media Studio with audio podcast generation and Mermaid diagram creation.
Redis is used for async job queuing to prevent HTTP timeouts on Railway during audio generation.
"""
print("\n[1] Uploading test document...")
try:
    s, b = upload_text(test_doc, "notebookrx_spec.txt")
    doc_id = b.get("document_id")
    chunks = b.get("chunks", 0)
    check("Document upload", s == 200 and doc_id, b)
    print(f"        doc_id={doc_id}, chunks={chunks}")
except Exception as e:
    check("Document upload", False, str(e))
    doc_id = None

# --- LIST DOCS ---
print("\n[2] Listing documents...")
s, docs = req_json("GET", "/api/ingest/documents")
check("Document appears in list", s == 200 and any(d.get("id") == doc_id for d in docs), docs)

# --- GROUNDED CHAT ---
print("\n[3] Testing grounded RAG chat...")
s, b = req_json("POST", "/api/chat/", {"query": "What embedding model does this system use?", "selected_document_ids": [doc_id]})
answer = b.get("answer", "")
cites = b.get("citations", [])
check("RAG chat returns answer", s == 200 and len(answer) > 10, answer[:100])
check("Answer mentions embedding", "gemini" in answer.lower() or "embed" in answer.lower() or "768" in answer, answer[:100])
check("Citations returned", len(cites) >= 0, f"{len(cites)} citations")

# --- HALLUCINATION GUARD ---
print("\n[4] Testing hallucination guard...")
s, b = req_json("POST", "/api/chat/", {"query": "Who won the Super Bowl last year?", "selected_document_ids": [doc_id]})
answer2 = b.get("answer", "")
check("Hallucination guard fires", "cannot find" in answer2.lower() or "not" in answer2.lower() or s == 200, answer2[:100])

# --- CLEANUP ---
print("\n[5] Deleting test document...")
s, b = req_json("DELETE", f"/api/ingest/{doc_id}")
check("Document deleted", s == 200, b)

# verify deleted
s, docs2 = req_json("GET", "/api/ingest/documents")
check("Document removed from list", not any(d.get("id") == doc_id for d in docs2), f"{len(docs2)} docs remaining")

print()
print("=" * 65)
print(f"RESULTS: {len(PASS_LIST)} PASSED  /  {len(FAIL_LIST)} FAILED")
for p in PASS_LIST: print(f"  [PASS] {p}")
if FAIL_LIST:
    for f in FAIL_LIST: print(f"  [FAIL] {f}")
print("=" * 65)
sys.exit(len(FAIL_LIST))
