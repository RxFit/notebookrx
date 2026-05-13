import urllib.request, urllib.error, json, sys, time

BASE = "http://127.0.0.1:8000"
PASS_LIST = []; FAIL_LIST = []

def check(name, cond, info=""):
    (PASS_LIST if cond else FAIL_LIST).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n        => {str(info)[:120]}" if info else ""))

def req(method, path, body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except: return e.code, {}

EMAIL = f"test{int(time.time())}@notebookrx.test"
PASSWORD = "Secure1234!"
TOKEN = None

print("=" * 65)
print("JWT AUTH — VALIDATION SUITE")
print("=" * 65)

# 1. Register
print("\n[1] POST /auth/register")
s, b = req("POST", "/auth/register", {"email": EMAIL, "password": PASSWORD, "display_name": "Test User"})
check("Register returns 201 + token", s == 201 and "access_token" in b, b.get("email",""))
TOKEN = b.get("access_token")
USER_ID = b.get("user_id")

# 2. Duplicate email => 409
print("\n[2] Duplicate email => 409")
s, b = req("POST", "/auth/register", {"email": EMAIL, "password": PASSWORD})
check("Duplicate email => 409", s == 409, b.get("detail",""))

# 3. Weak password => 422
print("\n[3] Weak password => 422")
s, b = req("POST", "/auth/register", {"email": "other@test.com", "password": "short"})
check("Weak password => 422", s == 422, b)

# 4. Login with correct credentials
print("\n[4] POST /auth/login")
s, b = req("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
check("Login returns token", s == 200 and "access_token" in b, b.get("user_id",""))
LOGIN_TOKEN = b.get("access_token")

# 5. Wrong password => 401
print("\n[5] Wrong password => 401")
s, b = req("POST", "/auth/login", {"email": EMAIL, "password": "wrongpassword"})
check("Wrong password => 401", s == 401, b.get("detail",""))

# 6. GET /auth/me with valid token
print("\n[6] GET /auth/me")
s, b = req("GET", "/auth/me", token=TOKEN)
check("/auth/me returns user info", s == 200 and b.get("user_id") == USER_ID, b)

# 7. Protected route without token => 403
print("\n[7] No token => 403 on protected route")
s, b = req("GET", "/api/ingest/documents")
check("No token => 401", s == 401, b.get("detail",""))

# 8. Invalid token => 401/403
print("\n[8] Invalid Bearer token => 401/403")
s, b = req("GET", "/api/ingest/documents", token="garbage.token.here")
check("Invalid token => 401/403", s in (401, 403), b.get("detail",""))

# 9. Protected route WITH valid token => 200
print("\n[9] Valid token => 200 on GET /api/ingest/documents")
s, b = req("GET", "/api/ingest/documents", token=TOKEN)
check("Valid token => 200, empty list", s == 200 and isinstance(b, list), b)

# 10. Upload doc with token => success
print("\n[10] Upload doc with JWT token")
boundary = b"----AuthTestBoundary"
content = b"This document tests JWT-authenticated ingestion."
body = (b"--" + boundary + b"\r\n"
        b'Content-Disposition: form-data; name="file"; filename="auth_test.txt"\r\n'
        b"Content-Type: text/plain\r\n\r\n" + content + b"\r\n"
        b"--" + boundary + b"--\r\n")
upload_req = urllib.request.Request(
    f"{BASE}/api/ingest/",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary.decode()}", "Authorization": f"Bearer {TOKEN}"},
    method="POST",
)
with urllib.request.urlopen(upload_req, timeout=60) as r:
    doc = json.loads(r.read())
DOC_ID = doc.get("document_id")
check("Upload with JWT => 200", bool(DOC_ID), doc)

# 11. Second user cannot see first user's doc
print("\n[11] User isolation — second user cannot see first user's docs")
EMAIL2 = f"user2_{int(time.time())}@notebookrx.test"
s2, b2 = req("POST", "/auth/register", {"email": EMAIL2, "password": PASSWORD})
TOKEN2 = b2.get("access_token")
s, docs = req("GET", "/api/ingest/documents", token=TOKEN2)
check("Second user sees empty list", s == 200 and len(docs) == 0, docs)

# 12. Chat with another user's doc => 403
print("\n[12] Cross-user chat RLS => 403")
s, b = req("POST", "/api/chat/", {"query": "test", "selected_document_ids": [DOC_ID]}, token=TOKEN2)
check("Cross-user chat => 403", s == 403, b.get("detail",""))

# Cleanup
req("DELETE", f"/api/ingest/{DOC_ID}", token=TOKEN)

print()
print("=" * 65)
print(f"RESULTS: {len(PASS_LIST)} PASSED  /  {len(FAIL_LIST)} FAILED")
for p in PASS_LIST: print(f"  [PASS] {p}")
if FAIL_LIST:
    for f in FAIL_LIST: print(f"  [FAIL] {f}")
print("=" * 65)
sys.exit(len(FAIL_LIST))

