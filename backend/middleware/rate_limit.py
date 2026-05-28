"""
Rate-limiting middleware using Redis sliding window algorithm.

Limits:
  /auth/login          -> 10 requests per IP per minute  (brute-force protection)
  /auth/register       -> 10 requests per IP per minute  (brute-force protection)
  /api/ingest/         -> 50 uploads per user per hour
  /api/chat/           -> 120 requests per user per minute
  /api/media/audio     -> 50 jobs per user per hour
  /api/media/image     -> 50 jobs per user per hour
  /api/media/diagram   -> 50 jobs per user per hour
  /api/media/jobs/     -> EXEMPT (lightweight polling, no limit)
  All other            -> 200 requests per IP per minute
"""
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import redis.asyncio as aioredis
import time, logging, jwt, os

logger = logging.getLogger(__name__)


# RxHarden T6: In-memory fallback rate limiter when Redis is unavailable
class _InMemoryRateLimiter:
    """Simple in-memory sliding window counter. NOT for production scale — degraded fallback only."""

    def __init__(self):
        self._counts: dict[str, list[float]] = {}
        self._degraded_logged = False

    def check(self, key: str, limit: int, window: int) -> tuple[bool, int, int]:
        now = time.time()
        # Evict expired entries
        timestamps = [t for t in self._counts.get(key, []) if t > now - window]
        timestamps.append(now)
        self._counts[key] = timestamps
        count = len(timestamps)
        allowed = count <= limit
        remaining = max(0, limit - count)
        retry_after = window if not allowed else 0
        return allowed, remaining, retry_after

    def log_degraded(self):
        if not self._degraded_logged:
            logger.warning("Rate limiter: DEGRADED MODE — using in-memory fallback (Redis unavailable)")
            self._degraded_logged = True

    def clear_degraded(self):
        self._degraded_logged = False


_fallback = _InMemoryRateLimiter()

# (path_prefix, limit, window_seconds, key_type)
# Auth endpoints use IP-based limiting to block brute-force before JWT is issued
RATE_RULES = [
    ("/auth/login",        10,    60, "ip"),   # P0: brute-force protection
    ("/auth/register",     10,    60, "ip"),   # P0: registration spam protection
    ("/api/ingest/",       50,  3600, "user"),
    ("/api/chat/",        120,    60, "user"),
    ("/api/media/audio",   50,  3600, "user"),
    ("/api/media/image",   50,  3600, "user"),
    ("/api/media/diagram", 50,  3600, "user"),
    # /api/media/jobs/ is intentionally NOT listed — falls through to global
]
GLOBAL_LIMIT, GLOBAL_WINDOW = 200, 60

# Paths completely exempt from rate limiting
EXEMPT_PREFIXES = (
    "/health", "/docs", "/redoc", "/openapi.json",
    "/api/media/jobs/",   # job status polling — lightweight, must not be throttled
    # NOTE: /auth/ is intentionally NOT exempt — login/register are rate-limited per IP
)


def _extract_user_id(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        secret = os.environ.get("SECRET_KEY", "")
        payload = jwt.decode(auth[7:], secret, algorithms=["HS256"])
        return payload.get("sub") or payload.get("user_id")
    except Exception:
        return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, redis_url: str):
        super().__init__(app)
        self._redis_url = redis_url
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis | None:
        if self._redis is None:
            try:
                self._redis = aioredis.from_url(
                    self._redis_url, encoding="utf-8",
                    decode_responses=True, socket_connect_timeout=2,
                )
                await self._redis.ping()
            except Exception as exc:
                logger.warning("Rate limiter: Redis unavailable, failing open. %s", exc)
                self._redis = None
        return self._redis

    async def _sliding_window(self, r, key, limit, window):
        now = time.time()
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window)
        results = await pipe.execute()
        count = results[2]
        allowed = count <= limit
        remaining = max(0, limit - count)
        return allowed, remaining, window if not allowed else 0

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Fast-path exemptions
        if any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        r = await self._get_redis()
        if r is None:
            # RxHarden T6: Use in-memory fallback instead of failing open
            _fallback.log_degraded()
            # Still apply rate limiting, just in-memory
            pass  # Will be handled below
        else:
            _fallback.clear_degraded()

        limit, window, key_source = GLOBAL_LIMIT, GLOBAL_WINDOW, "ip"
        for prefix, rl, rw, rs in RATE_RULES:
            if path.startswith(prefix):
                limit, window, key_source = rl, rw, rs
                break

        if key_source == "user":
            user_id  = _extract_user_id(request)
            identity = user_id if user_id else (request.client.host if request.client else "anonymous")
            segment  = path.strip("/").split("/")[1] if "/" in path.strip("/") else "api"
            key      = f"rl:{segment}:{identity}"
        else:
            identity = request.client.host if request.client else "unknown"
            key      = f"rl:global:{identity}"

        try:
            if r is not None:
                allowed, remaining, retry_after = await self._sliding_window(r, key, limit, window)
            else:
                # In-memory fallback
                allowed, remaining, retry_after = _fallback.check(key, limit, window)
        except Exception as exc:
            logger.warning("Rate limiter: error, failing open. %s", exc)
            return await call_next(request)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Retry in {retry_after}s.", "retry_after": retry_after},
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Window": str(window),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"]     = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Window"]    = str(window)
        return response
