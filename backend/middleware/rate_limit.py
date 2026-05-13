"""
Rate-limiting middleware using Redis sliding window algorithm.

Limits:
  /api/ingest/  -> 10 uploads per user per hour
  /api/chat/    -> 60 requests per user per minute
  /api/media/   -> 20 requests per user per hour
  All other     -> 120 requests per IP per minute (global fallback)
"""
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import redis.asyncio as aioredis
import time, logging, jwt, os

logger = logging.getLogger(__name__)

RATE_RULES = [
    ("/api/ingest/", 10,  3600, "user"),
    ("/api/chat/",   60,  60,   "user"),
    ("/api/media/",  20,  3600, "user"),
]
GLOBAL_LIMIT, GLOBAL_WINDOW = 120, 60


def _extract_user_id(request: Request) -> str | None:
    """Parse JWT from Authorization header and return user_id, or None."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        secret = os.environ.get("SECRET_KEY", "")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload.get("user_id") or payload.get("sub")
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
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=2,
                )
                await self._redis.ping()
            except Exception as exc:
                logger.warning("Rate limiter: Redis unavailable, failing open. %s", exc)
                self._redis = None
        return self._redis

    async def _sliding_window(
        self, r: aioredis.Redis, key: str, limit: int, window: int
    ) -> tuple[bool, int, int]:
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
        retry_after = window if not allowed else 0
        return allowed, remaining, retry_after

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in ("/health", "/docs", "/redoc", "/openapi.json") or path.startswith("/auth/"):
            return await call_next(request)

        r = await self._get_redis()
        if r is None:
            return await call_next(request)

        limit, window, key_source = GLOBAL_LIMIT, GLOBAL_WINDOW, "ip"
        for prefix, rl, rw, rs in RATE_RULES:
            if path.startswith(prefix):
                limit, window, key_source = rl, rw, rs
                break

        if key_source == "user":
            # Use JWT user_id — each user has their own independent bucket
            user_id = _extract_user_id(request)
            identity = user_id if user_id else (request.client.host if request.client else "anonymous")
            segment = path.strip("/").split("/")[1] if "/" in path.strip("/") else "api"
            key = f"rl:{segment}:{identity}"
        else:
            identity = request.client.host if request.client else "unknown"
            key = f"rl:global:{identity}"

        try:
            allowed, remaining, retry_after = await self._sliding_window(r, key, limit, window)
        except Exception as exc:
            logger.warning("Rate limiter: error, failing open. %s", exc)
            return await call_next(request)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Retry in {retry_after}s.",
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Window": str(window),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Window"] = str(window)
        return response
