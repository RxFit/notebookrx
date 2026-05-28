# RxHarden Overview — Phase 3: Auth & Token Security

## 1a. Project Overview & Core Objective

**Project:** NotebookRx (notebook.blue) — An AI-powered research notebook application with RAG-based document ingestion, chat, and media generation.

**Core Objective of Phase 3:** Eliminate all token leakage vectors and protect stored credentials at rest. The current auth implementation has several HIGH and CRITICAL severity vulnerabilities:
- JWTs exposed in URL parameters during Google OAuth callback
- JWTs stored in localStorage (XSS-exfiltrable)
- Google refresh tokens stored in plaintext in PostgreSQL
- 7-day JWT expiry with no refresh rotation
- WebSocket auth via query params
- No account lockout mechanism

This phase hardens the authentication layer to production-grade security before the application reaches its 500 MAU PMF trigger.

---

## 1b. Exhaustive Task List

### Task 1: OAuth Auth Code Exchange (HIGH-1)
- Create Redis-backed single-use auth code generation (60s TTL)
- Modify `google_auth.py` callback to redirect with auth code instead of JWT
- Create `POST /auth/google/exchange` endpoint to consume auth code and return JWT
- Update frontend `/auth/callback` page to POST the code instead of reading URL params
- Delete the oauth_state cookie after successful exchange

### Task 2: Encrypt Google Refresh Tokens at Rest (HIGH-2)
- Add `cryptography` to `requirements.txt`
- Derive Fernet encryption key from `SECRET_KEY` via HKDF
- Create `backend/auth/token_encryption.py` with `encrypt_token()` and `decrypt_token()`
- Modify `google_auth.py` to encrypt refresh token before DB write
- Modify `drive.py` to decrypt refresh token before Google API calls
- Write one-time migration script to encrypt existing plaintext tokens

### Task 3: JWT → httpOnly Cookies (MED-1)
- Modify `auth/router.py` login and register to set httpOnly cookie instead of returning token in body
- Modify `jwt_handler.py` `get_current_user` to read JWT from cookie first, `Authorization` header second
- Add `POST /auth/logout` endpoint that clears the auth cookie
- Modify frontend `api.ts` to use `withCredentials: true` and remove explicit header injection
- Modify frontend `AuthContext.tsx` to derive session state from `/auth/me` instead of localStorage
- Modify `AddSourcesModal.tsx` raw fetch calls to include `credentials: 'include'`
- Update CORS middleware to handle credentials properly

### Task 4: JWT Expiry Reduction + Refresh Rotation (LOW-1, LOW-2)
- Reduce `JWT_EXPIRE_MINUTES` from 10080 (7 days) to 60 (1 hour)
- Add `REFRESH_EXPIRE_DAYS = 7` to config
- Create `create_refresh_token()` in `jwt_handler.py` — stores in Redis with 7d TTL
- Create `rotate_refresh_token()` — consume old token, issue new one (single-use)
- Create `POST /auth/refresh` endpoint — validates refresh cookie, issues new access+refresh pair
- Set refresh token as separate httpOnly cookie with 7d max-age
- Add frontend silent refresh interceptor — on 401, attempt refresh before logging out

### Task 5: WebSocket Ticket Auth (MED-3)
- Create `POST /auth/ws-ticket` endpoint — returns short-lived ticket (30s TTL, Redis)
- Modify `ws.py` WebSocket handler to validate ticket on connection
- Consume ticket after first use (single-use)
- Modify frontend `useCollabPresence.ts` to fetch ticket before WS connect

### Task 6: Rate Limiter Hardening (MED-4) + Email Enumeration Fix (LOW-4)
- Add in-memory fallback counter (dict with TTL eviction) to `rate_limit.py`
- Activate fallback when Redis is unreachable
- Log degraded-mode transitions
- Audit login endpoint for timing-based email enumeration (already has dummy hash — verify)

### Task 7: Password Complexity + Account Lockout (LOW-9, LOW-10)
- Enhance `RegisterRequest.password_strength` validator: 8+ chars, 1 upper, 1 lower, 1 digit
- Add Redis-based `failed_login_count` tracking per email (15min sliding window)
- Return 429 + lockout message after 10 consecutive failures
- Reset counter on successful login

---

## 1c. Task Impact Analysis

| Task | Files Modified | DB Impact | Frontend Impact | Risk |
|---|---|---|---|---|
| T1: OAuth Code Exchange | google_auth.py, frontend callback | None | Auth callback flow changes | MEDIUM |
| T2: Refresh Token Encryption | config.py, google_auth.py, drive.py, NEW token_encryption.py | Data migration (encrypt column) | None | HIGH |
| T3: httpOnly Cookies | router.py, jwt_handler.py, api.ts, AuthContext.tsx, AddSourcesModal.tsx | None | **Breaking** — all auth flow changes | CRITICAL |
| T4: Refresh Rotation | config.py, jwt_handler.py, NEW refresh.py, api.ts | None (Redis only) | Silent refresh interceptor | HIGH |
| T5: WS Ticket Auth | ws.py, auth router, useCollabPresence.ts | None (Redis only) | WS connect flow changes | MEDIUM |
| T6: Rate Limiter Hardening | rate_limit.py, router.py | None | None | LOW |
| T7: Password + Lockout | router.py | None (Redis only) | Registration validation tighter | LOW |

---

## 1d. Necessity Justification

| Task | Why Strictly Necessary |
|---|---|
| T1 | JWT in URL params is an OWASP Top 10 violation. Browser history, Referer headers, and server logs all leak the token. Must be eliminated before production. |
| T2 | Plaintext refresh tokens in the DB mean a single SQL injection or DB backup leak grants full Google Drive access to every user. Encryption at rest is a compliance baseline. |
| T3 | localStorage JWTs are exfiltrable by any XSS vector. httpOnly cookies are the industry standard for browser-based auth. This is the single highest-impact security change. |
| T4 | A 7-day JWT window means a stolen token is valid for a full week with no revocation. Short-lived access + rotated refresh tokens limit the blast radius of token theft. |
| T5 | WebSocket query param tokens have the same leakage vector as OAuth redirects. Ticket-based auth is the standard pattern for WS connections. |
| T6 | Fail-open rate limiting under Redis outage means the brute-force protections disappear exactly when infrastructure is most stressed. In-memory fallback ensures degraded but present protection. |
| T7 | No lockout = unlimited brute-force attempts. 10-attempt lockout with 15min cooldown makes credential stuffing impractical. |
