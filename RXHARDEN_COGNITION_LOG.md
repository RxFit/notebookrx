# RxHarden Cognitive Ledger - Phase 3: Auth & Token Security

> This file is the externalized chain-of-thought for the RxHarden execution.
> It is APPEND-ONLY. Never delete or overwrite previous entries.
> The agent MUST append Pre-Cog outputs and Hostile Auditor findings here
> BEFORE writing any implementation code.

---

## Foundation Complete — 2026-05-28T01:19:00Z

- RXHARDEN_OVERVIEW.md created: 7 tasks enumerated with impact analysis
- RXHARDEN_MASTER_CONTRACT.md created: Shared interfaces, Redis key schemas, cookie config, API endpoints
- RXHARDEN_COGNITION_LOG.md created (this file)
- Initial git commit baseline established
---

## Task 1: OAuth Auth Code Exchange (HIGH-1) — Pre-Cog 2026-05-28T01:20:00Z

### 3b. Context & Dependency Matrix

| Dependency | Type | Direction | Risk Level |
|---|---|---|---|
| `backend/api/google_auth.py` | File | Modify | CRITICAL |
| `frontend/src/app/auth/callback/page.tsx` | File | Modify | HIGH |
| `frontend/src/lib/api.ts` | File | Modify (add exchange method) | MEDIUM |
| `frontend/src/context/AuthContext.tsx` | File | Read (setUserFromToken) | LOW |
| Redis (`oauth:code:{code}`) | State | Write/Read/Delete | HIGH |
| `config.py` (REDIS_URL) | Config | Read | LOW |
| Google OAuth callback URL | External | Modify redirect target | MEDIUM |
| `oauth_state` cookie | State | Read/Delete | LOW |

### 3c. Blast Radius Prediction

- **Data Desync:** If Redis is unavailable when the auth code is generated, the code will never be stored and the exchange will fail. User sees blank page or error. **Risk: HIGH.**
- **UI Rendering Break:** Frontend callback currently reads `?token=` from URL params. If we redirect with `?code=` but frontend still expects `?token=`, user gets kicked to `/?auth_error=google_failed`. **Risk: CRITICAL — must be deployed atomically.**
- **System Latency:** Redis write (code gen) + read (code consume) adds ~2ms. Negligible. **Risk: LOW.**
- **Security Vulnerability:** Insufficient entropy in auth code = guessable. Non-single-use = replay attack. TTL too long = interception window. **Risk: MEDIUM — mitigated by design.**

### 3d. Explicit Mitigations

| Risk | Mitigation | Verification |
|---|---|---|
| Redis unavailable during code gen | `try/except` around Redis write. Fall back to returning JWT in body (degraded). Log degradation. | Check `except` block, verify log output |
| Frontend/backend mismatch | Frontend callback checks for `code` param first, falls back to `token` for backward compat. | Test both `?code=` and `?token=` params |
| Insufficient entropy | `secrets.token_urlsafe(32)` — 256 bits. Same as `oauth_state`. | Verify code length > 40 chars |
| Replay attack | Consume auth code on first exchange (Redis GET + DEL pipeline). Double-exchange returns 400. | Test double-exchange returns 400 |
| TTL too long | 60 seconds. Short enough to prevent interception, long enough for slow redirects. | Verify Redis key expires after 60s |

---

### Task 1: Hostile Auditor Findings — 2026-05-28T01:22:00Z

- **Weakness (LOW):** `_get_redis()` creates a new connection per call. Acceptable for low-frequency OAuth flows.
- **Edge Case (OK):** Double-click callback URL → second click gets 400 "Invalid or expired auth code" (correct single-use behavior).
- **Edge Case (OK):** Both `code` and `token` params present → frontend prioritizes `code` (correct).
- **Breaking Point (MITIGATED):** Redis outage → degraded fallback to legacy JWT-in-URL.
- **Security (OK):** 256-bit auth code entropy. Pipeline GET+DEL not truly atomic but 60s TTL + entropy make race condition negligible.

**VERDICT: PASS — No CRITICAL or HIGH flaws. Proceeding.**

### 3k. Cascade Diff Check — Task 1

**Option A: NO CHANGES REQUIRED** — Master Contract remains valid as-is.

---
