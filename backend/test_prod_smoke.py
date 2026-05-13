import urllib.request, urllib.error, json, sys, time

BASE = "https://notebookrx-api-production.up.railway.app"
PASS_LIST = []; FAIL_LIST = []

def check(name, cond, info=""):
    (PASS_LIST if cond else FAIL_LIST).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n        => {str(info)[:100]}" if info else ""))

def req(method, path, body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except: return e.code, {}

print("=" * 65)
print("PRODUCTION SMOKE TESTS — notebookrx-api-production.up.railway.app")
print("=" * 65)

# 1. Health
print("\n[1] Health check...")
s, b = req("GET", "/health")
check("Health => 200 + ok", s == 200 and b.get("status") == "ok", b)

# 2. OpenAPI docs available
print("\n[2] OpenAPI schema...")
s, b = req("GET", "/openapi.json")
paths = list(b.get("paths", {}).keys())
check("All 12 routes present", len(paths) >= 12, paths)

# 3. Auth — register new user on prod DB
print("\n[3] Register user on production...")
EMAIL = f"prodtest{int(time.time())}@notebookrx.app"
s, b = req("POST", "/auth/register", {"email": EMAIL, "password": "ProdTest1234!", "display_name": "Smoke Test"})
check("Register on prod => 201", s == 201, b.get("email",""))
TOKEN = b.get("access_token")

# 4. Auth me
print("\n[4] /auth/me on production...")
s, b = req("GET", "/auth/me", token=TOKEN)
check("/auth/me on prod => 200", s == 200 and "@" in b.get("email",""), b)

# 5. List documents (empty, authenticated)
print("\n[5] List documents (authenticated, empty)...")
s, b = req("GET", "/api/ingest/documents", token=TOKEN)
check("List docs => 200 empty list", s == 200 and b == [], b)

# 6. No token => 401
print("\n[6] No token => 401...")
s, b = req("GET", "/api/ingest/documents")
check("No token => 401", s == 401, b.get("detail",""))

# 7. Rate limit headers present
print("\n[7] Rate limit headers on production...")
import urllib.request as ur
rq = ur.Request(f"{BASE}/api/ingest/documents", headers={"Authorization": f"Bearer {TOKEN}"})
with ur.urlopen(rq, timeout=15) as r:
    hdrs = dict(r.headers)
rl_present = any("ratelimit" in k.lower() for k in hdrs)
check("X-RateLimit headers on prod", rl_present, {k:v for k,v in hdrs.items() if "ratelimit" in k.lower()})

print()
print("=" * 65)
print(f"RESULTS: {len(PASS_LIST)} PASSED  /  {len(FAIL_LIST)} FAILED")
for p in PASS_LIST: print(f"  [PASS] {p}")
if FAIL_LIST:
    for f in FAIL_LIST: print(f"  [FAIL] {f}")
print("=" * 65)
sys.exit(len(FAIL_LIST))
