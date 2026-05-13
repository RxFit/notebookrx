import urllib.request, urllib.error, json, sys

BASE = "http://127.0.0.1:8000"
PASS_LIST = []; FAIL_LIST = []

def req(method, path, body=None, headers={}):
    h = {"Content-Type": "application/json", "x-user-id": "test-user", **headers}
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="replace")}

def check(name, cond, info=""):
    if cond:
        PASS_LIST.append(name)
        print(f"  PASS  {name}" + (f" => {info}" if info else ""))
    else:
        FAIL_LIST.append(name)
        print(f"  FAIL  {name}" + (f" => {info}" if info else ""))

print("=" * 65)
print("NOTEBOOKLM CLONE -- END-TO-END VALIDATION SUITE")
print("=" * 65)

# 1. Health
s, b = req("GET", "/health")
check("Health endpoint", s == 200 and b.get("status") == "ok", b)

# 2. List documents (empty)
s, b = req("GET", "/api/ingest/documents")
check("List documents (empty)", s == 200 and isinstance(b, list), b)

# 3. SANDBOX GUARD: chat with zero docs => 400
s, b = req("POST", "/api/chat/", {"query": "test", "selected_document_ids": []})
check("Sandbox guard (no docs => 400)", s == 400, b.get("detail",""))

# 4. RLS GUARD: fake doc ID not owned by user => 403
s, b = req("POST", "/api/chat/", {"query": "Who is the president?", "selected_document_ids": ["fake-doc-id-999"]})
check("RLS guard (fake doc_id => 403)", s == 403, b.get("detail", b))

# 5. Diagram sandbox: no docs => 400
s, b = req("POST", "/api/media/diagram", {"selected_document_ids": [], "intent": "diagram", "prompt": ""})
check("Diagram sandbox (no docs => 400)", s == 400, b.get("detail",""))

# 6. Audio sandbox: no docs => 400
s, b = req("POST", "/api/media/audio", {"selected_document_ids": [], "intent": "audio"})
check("Audio sandbox (no docs => 400)", s == 400, b.get("detail",""))

# 7. Job store: unknown job => 404
s, b = req("GET", "/api/media/jobs/nonexistent-job")
check("Job store (unknown job => 404)", s == 404, b.get("detail",""))

print()
print("=" * 65)
print(f"RESULTS: {len(PASS_LIST)} PASSED  /  {len(FAIL_LIST)} FAILED")
for p in PASS_LIST: print(f"  [PASS] {p}")
if FAIL_LIST:
    for f in FAIL_LIST: print(f"  [FAIL] {f}")
print("=" * 65)
sys.exit(len(FAIL_LIST))
