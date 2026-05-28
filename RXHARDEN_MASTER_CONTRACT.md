# RxHarden Master Contract — Phase 3: Auth & Token Security

> **MASTER CONTRACT IMMUTABILITY RULE:** No following task may deviate from this Master Contract without explicit reconciliation via the Cascade Diff Check (Step 3k). Any deviation without reconciliation is a CRITICAL VIOLATION requiring immediate halt.

---

## 2a. Shared Interfaces & Types

### Backend (Python / Pydantic)

```python
# --- Auth Code Exchange ---
class AuthCodeExchangeRequest(BaseModel):
    code: str  # Single-use auth code from Redis

class AuthCodeExchangeResponse(BaseModel):
    # No token in body after cookie migration — just confirmation
    user_id: str
    email: str
    display_name: str

# --- Refresh Token ---
class RefreshResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    # Access token set via httpOnly cookie, not in body

# --- WebSocket Ticket ---
class WsTicketResponse(BaseModel):
    ticket: str
    expires_in: int  # seconds

# --- Token Response (modified for cookie migration) ---
class TokenResponse(BaseModel):
    # access_token REMOVED from body after Task 3
    # token_type REMOVED from body after Task 3
    user_id: str
    email: str
    display_name: str

# --- Login Lockout ---
class LoginLockoutResponse(BaseModel):
    detail: str
    retry_after: int  # seconds until lockout expires
```

### Frontend (TypeScript)

```typescript
// --- Auth types (modified for cookie migration) ---
interface TokenResponse {
  user_id: string;
  email: string;
  display_name: string;
  // access_token removed — delivered via httpOnly cookie
}

interface AuthUser {
  user_id: string;
  email: string;
  display_name: string;
  output_language?: string;
}

// --- WebSocket ticket ---
interface WsTicket {
  ticket: string;
  expires_in: number;
}
```

---

## 2b. Global State Shapes

### Redis Key Schemas

```
# Auth code exchange (Task 1)
oauth:code:{code}           → JSON { user_id, email, display_name }   TTL: 60s

# Refresh tokens (Task 4)
refresh:{token_id}          → JSON { user_id, email, jti }           TTL: 7d (604800s)

# WebSocket tickets (Task 5)
ws:ticket:{ticket}          → JSON { user_id, notebook_id }          TTL: 30s

# Login lockout (Task 7)
lockout:{email}             → int (failure count)                    TTL: 900s (15min)

# Rate limiter fallback (Task 6)
# In-memory dict, NOT Redis:
_fallback_counts: dict[str, list[float]]  # key → list of timestamps
```

### Cookie Schema

```
# After Task 3 + Task 4:
Set-Cookie: access_token=<JWT>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
Set-Cookie: refresh_token=<opaque_id>; HttpOnly; Secure; SameSite=Lax; Path=/auth/refresh; Max-Age=604800
```

### Frontend State (AuthContext)

```typescript
// Post-migration state shape:
interface AuthContextState {
  user: AuthUser | null;      // derived from GET /auth/me, not from token decode
  isLoading: boolean;         // true during initial /auth/me probe
  // token: REMOVED — no longer accessible to JS
}
```

---

## 2c. Database Schemas & API Payloads

### DB Schema Changes

**No new tables.** Only column-level changes:

```sql
-- Task 2: Refresh token encryption
-- The existing `google_refresh_token` column (VARCHAR) will store encrypted ciphertext
-- instead of plaintext. No schema DDL change needed — the column type remains String.
-- The data format changes from:
--   "ya29.a0AfH6SM..." (plaintext Google refresh token)
-- to:
--   "gAAAAA..." (Fernet-encrypted ciphertext)
```

### API Endpoint Changes

| Endpoint | Method | Change | Task |
|---|---|---|---|
| `POST /auth/google/exchange` | NEW | Consumes auth code, sets cookie | T1 |
| `GET /auth/google/callback` | MODIFY | Redirects with `?code=` instead of `?token=` | T1 |
| `POST /auth/login` | MODIFY | Sets cookie instead of returning token in body | T3 |
| `POST /auth/register` | MODIFY | Sets cookie instead of returning token in body | T3 |
| `POST /auth/logout` | NEW | Clears auth cookies | T3 |
| `POST /auth/refresh` | NEW | Rotates refresh token, sets new cookies | T4 |
| `POST /auth/ws-ticket` | NEW | Issues single-use WS ticket | T5 |

### Cookie Configuration Constants

```python
COOKIE_CONFIG = {
    "httponly": True,
    "secure": True,         # False only on localhost
    "samesite": "lax",
    "path": "/",
    "domain": None,         # Let browser infer; override for cross-domain if needed
}

ACCESS_COOKIE_NAME = "access_token"
ACCESS_COOKIE_MAX_AGE = 3600          # 1 hour

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 604800       # 7 days
REFRESH_COOKIE_PATH = "/auth/refresh" # Only sent to refresh endpoint
```

---

## 2d. Immutability Rule

> **MASTER CONTRACT IMMUTABILITY RULE:** No following task may deviate from this Master Contract without explicit reconciliation via the Cascade Diff Check (Step 3k). Any deviation without reconciliation is a CRITICAL VIOLATION requiring immediate halt.
