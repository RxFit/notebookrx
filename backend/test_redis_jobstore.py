import urllib.request, urllib.error, json, asyncio, sys, time

BASE = "http://127.0.0.1:8000"
PASS_LIST = []; FAIL_LIST = []

def check(name, cond, info=""):
    (PASS_LIST if cond else FAIL_LIST).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n        => {str(info)[:120]}" if info else ""))

def req(method, path, body=None, user="job-test-user"):
    h = {"Content-Type": "application/json", "x-user-id": user}
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except: return e.code, {}

print("=" * 65)
print("REDIS JOB STORE — VALIDATION SUITE")
print("=" * 65)

# ── 1. Direct RedisJobStore unit test ─────────────────────────────────────────
print("\n[1] Unit testing RedisJobStore directly...")
import sys; sys.path.insert(0, ".")

async def unit_test():
    from workers.job_store import RedisJobStore
    store = RedisJobStore()
    test_id = f"test-{int(time.time())}"
    await store.create(test_id, {"status": "queued", "progress": 0, "url": None, "error": None})
    job = await store.get(test_id)
    assert job is not None, "get() returned None after create"
    assert job["status"] == "queued", f"Expected queued, got {job['status']}"
    assert job["progress"] == 0, f"Expected 0, got {job['progress']}"

    await store.update(test_id, {"status": "scripting", "progress": 25})
    job2 = await store.get(test_id)
    assert job2["status"] == "scripting"
    assert job2["progress"] == 25

    assert await store.exists(test_id) is True
    await store.delete(test_id)
    assert await store.get(test_id) is None, "Job should be deleted"
    assert await store.exists(test_id) is False
    await store.close()
    return True

result = asyncio.run(unit_test())
check("RedisJobStore create/get/update/delete/exists", result)

# ── 2. POST /api/media/audio => sandbox guard ──────────────────────────────────
print("\n[2] Audio sandbox guard (no docs => 400)...")
s, b = req("POST", "/api/media/audio", {"selected_document_ids": [], "intent": "audio"})
check("Audio sandbox (no docs => 400)", s == 400, b.get("detail", ""))

# ── 3. POST /api/media/audio with fake doc (RLS) => 403 ───────────────────────
print("\n[3] Audio RLS guard (fake doc => 403)...")
s, b = req("POST", "/api/media/audio", {"selected_document_ids": ["fake-doc-id"], "intent": "audio"})
check("Audio RLS guard (fake doc => 403)", s == 403, b.get("detail", ""))

# ── 4. Full job lifecycle via API: queue -> poll -> done ───────────────────────
print("\n[4] Full job lifecycle test (upload doc, start audio job, poll Redis)...")

# 4a. Upload a real doc
content = "NotebookRx is a RAG platform. It uses pgvector and Gemini. The key topics are vector search and citation grounding."
blob = content.encode()
boundary = b"----TestBoundaryXYZ"
body = (b"--" + boundary + b"\r\n"
        b'Content-Disposition: form-data; name="file"; filename="jobtest.txt"\r\n'
        b"Content-Type: text/plain\r\n\r\n" + blob + b"\r\n"
        b"--" + boundary + b"--\r\n")
ingest_req = urllib.request.Request(
    f"{BASE}/api/ingest/",
    data=body,
    headers={
        "Content-Type": f"multipart/form-data; boundary={boundary.decode()}",
        "x-user-id": "job-test-user",
    },
    method="POST",
)
with urllib.request.urlopen(ingest_req, timeout=60) as r:
    doc = json.loads(r.read())
doc_id = doc.get("document_id")
check("Ingest doc for audio test", bool(doc_id), doc)

# 4b. Start audio job
s, b = req("POST", "/api/media/audio", {"selected_document_ids": [doc_id], "intent": "audio"})
job_id = b.get("job_id")
check("Audio job queued", s == 200 and bool(job_id), b)

# 4c. Poll job status — wait up to 20s for completion
print(f"        Polling job {job_id} ...")
final_status = None
for _ in range(20):
    s2, job = req("GET", f"/api/media/jobs/{job_id}")
    status = job.get("status", "")
    progress = job.get("progress", 0)
    print(f"        [{status}] {progress}%")
    if status in ("done", "error"):
        final_status = status
        break
    time.sleep(1)

check("Job found in Redis (GET /jobs/{id})", s2 == 200, job)
check("Job completes successfully", final_status == "done", job)
check("Script stored in Redis", bool(job.get("script")), f"{len(job.get('script', []))} lines")

# 4d. Unknown job => 404
s3, b3 = req("GET", "/api/media/jobs/nonexistent-job-xyz")
check("Unknown job => 404 from Redis", s3 == 404, b3.get("detail", ""))

# 4e. Cleanup
req("DELETE", f"/api/ingest/{doc_id}")

print()
print("=" * 65)
print(f"RESULTS: {len(PASS_LIST)} PASSED  /  {len(FAIL_LIST)} FAILED")
for p in PASS_LIST: print(f"  [PASS] {p}")
if FAIL_LIST:
    for f in FAIL_LIST: print(f"  [FAIL] {f}")
print("=" * 65)
sys.exit(len(FAIL_LIST))
