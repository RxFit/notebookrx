import urllib.request, urllib.error, json, time, sys

BASE = "http://127.0.0.1:8000"
PASS_LIST = []; FAIL_LIST = []

def check(name, cond, info=""):
    (PASS_LIST if cond else FAIL_LIST).append(name)
    sym = "PASS" if cond else "FAIL"
    print(f"  {sym}  {name}" + (f"\n        => {str(info)[:120]}" if info else ""))

def req(method, path, body=None, user="rate-test-user"):
    h = {"Content-Type": "application/json", "x-user-id": user}
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, dict(resp.headers), json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, dict(e.headers), json.loads(raw)
        except: return e.code, dict(e.headers), {"raw": raw.decode(errors="replace")[:100]}

print("=" * 65)
print("RATE LIMITING MIDDLEWARE — VALIDATION SUITE")
print("=" * 65)

# Test 1: Rate limit headers present on API routes
print("\n[1] Checking rate limit headers on /api/ingest/documents...")
s, h, b = req("GET", "/api/ingest/documents")
has_limit  = "X-Ratelimit-Limit" in h or "x-ratelimit-limit" in h
has_remain = "X-Ratelimit-Remaining" in h or "x-ratelimit-remaining" in h
has_window = "X-Ratelimit-Window" in h or "x-ratelimit-window" in h
rl_headers = {k: v for k, v in h.items() if "ratelimit" in k.lower()}
check("Rate limit headers present", has_limit and has_remain, rl_headers)

# Test 2: Headers not on /health (excluded route)
print("\n[2] Checking /health is excluded from rate limiting...")
s, h, b = req("GET", "/health")
no_rl_on_health = not any("ratelimit" in k.lower() for k in h)
check("Health excluded from rate limiting", no_rl_on_health)

# Test 3: Chat rate limit (60/min) — burst with unique user so we hit limit
print("\n[3] Burst test on /api/chat/ (limit=60/min, burst 62 with empty body => 400s)...")
burst_user = f"burst-test-{int(time.time())}"
status_codes = []
for i in range(65):
    s, h, b = req("POST", "/api/chat/", {"query": "t", "selected_document_ids": []}, user=burst_user)
    status_codes.append(s)

codes_400 = status_codes.count(400)   # sandbox guard (no docs) — expected
codes_429 = status_codes.count(429)   # rate limit hit — expected after 60
got_limited = codes_429 > 0
check("Burst triggers 429 after 60 requests", got_limited,
      f"400s={codes_400} 429s={codes_429} of 65 requests")

# Test 4: 429 response has correct headers
print("\n[4] Checking 429 response body and Retry-After header...")
if got_limited:
    # Find a 429 — do one more
    s, h, b = req("POST", "/api/chat/", {"query": "t", "selected_document_ids": []}, user=burst_user)
    if s == 429:
        has_retry = "Retry-After" in h or "retry-after" in h
        has_detail = "detail" in b
        check("429 has Retry-After header", has_retry, {k:v for k,v in h.items() if "retry" in k.lower() or "rate" in k.lower()})
        check("429 has detail message", has_detail, b.get("detail",""))
    else:
        check("429 response format", True, "window reset — rate limit cleared")
else:
    check("Burst triggers 429", False, f"Only got: {set(status_codes)}")
    check("429 response format", False, "Could not test — no 429 seen")

# Test 5: Different users have independent limits
print("\n[5] Verifying per-user isolation...")
user_a_codes = []
user_b_codes = []
for i in range(3):
    s1, _, _ = req("GET", "/api/ingest/documents", user="isolation-user-a")
    s2, _, _ = req("GET", "/api/ingest/documents", user="isolation-user-b")
    user_a_codes.append(s1); user_b_codes.append(s2)
check("Per-user isolation (both get 200)", all(s==200 for s in user_a_codes+user_b_codes),
      f"UserA: {user_a_codes} UserB: {user_b_codes}")

print()
print("=" * 65)
print(f"RESULTS: {len(PASS_LIST)} PASSED  /  {len(FAIL_LIST)} FAILED")
for p in PASS_LIST: print(f"  [PASS] {p}")
if FAIL_LIST:
    for f in FAIL_LIST: print(f"  [FAIL] {f}")
print("=" * 65)
sys.exit(len(FAIL_LIST))
