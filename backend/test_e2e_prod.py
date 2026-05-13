import urllib.request, urllib.error, json, time

FRONTEND = "https://frontend-ten-gamma-72.vercel.app"
BACKEND  = "https://notebookrx-api-production.up.railway.app"
P = "PASS"; F = "FAIL"

print("=" * 60)
print("FULL STACK PRODUCTION SMOKE TEST")
print("=" * 60)

# 1. Frontend loads
with urllib.request.urlopen(f"{FRONTEND}/", timeout=20) as r:
    body = r.read().decode()
    has_content = "NotebookLM" in body or "auth" in body.lower()
    status = P if r.status == 200 and has_content else F
    print(f"  {status}  Frontend loads (HTTP {r.status})")

# 2. Backend health
with urllib.request.urlopen(f"{BACKEND}/health", timeout=15) as r:
    health = json.loads(r.read())
    status = P if health.get("status") == "ok" else F
    print(f"  {status}  Backend health: {health}")

# 3. Auth register on prod
def post(url, body, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, {}

email = f"e2e{int(time.time())}@notebookrx.app"
s, b = post(f"{BACKEND}/auth/register", {"email": email, "password": "E2ETest1234!", "display_name": "E2E"})
token = b.get("access_token", "")
status = P if s == 201 and token else F
print(f"  {status}  Production register: {b.get('email', 'N/A')}")

# 4. Authenticated API call
req = urllib.request.Request(f"{BACKEND}/api/ingest/documents", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req, timeout=15) as r:
    docs = json.loads(r.read())
    status = P if r.status == 200 else F
    print(f"  {status}  Authenticated docs list: {len(docs)} docs")

print()
print(f"  FRONTEND: {FRONTEND}")
print(f"  BACKEND:  {BACKEND}")
print("=" * 60)
