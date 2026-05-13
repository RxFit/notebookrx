"""
RedisJobStore — async Redis-backed replacement for the in-memory job_store dict.

Job payloads are stored as Redis hashes under the key  job:<job_id>
with a configurable TTL (default 24h).  Every field is a JSON-serialisable
scalar so the hash can be read back atomically with HGETALL.

Thread/process-safe across multiple uvicorn workers — unlike a plain dict.
"""
import json
import redis.asyncio as aioredis
from config import settings

JOB_TTL_SECONDS = 60 * 60 * 24   # 24 hours


class RedisJobStore:
    """Async Redis-backed job store using hashes."""

    def __init__(self):
        self._redis: aioredis.Redis | None = None

    async def _r(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
            )
        return self._redis

    def _key(self, job_id: str) -> str:
        return f"job:{job_id}"

    # ── Write operations ───────────────────────────────────────────────────────

    async def create(self, job_id: str, initial: dict) -> None:
        """Create a new job with an initial payload dict."""
        r = await self._r()
        pipe = r.pipeline()
        # Store every value as JSON string so hashes stay flat
        serialised = {k: json.dumps(v) for k, v in initial.items()}
        pipe.hset(self._key(job_id), mapping=serialised)
        pipe.expire(self._key(job_id), JOB_TTL_SECONDS)
        await pipe.execute()

    async def update(self, job_id: str, fields: dict) -> None:
        """Update one or more fields on an existing job."""
        r = await self._r()
        serialised = {k: json.dumps(v) for k, v in fields.items()}
        await r.hset(self._key(job_id), mapping=serialised)
        # Refresh TTL on every update so active jobs don't expire mid-run
        await r.expire(self._key(job_id), JOB_TTL_SECONDS)

    # ── Read operations ────────────────────────────────────────────────────────

    async def get(self, job_id: str) -> dict | None:
        """Return the full job dict, or None if not found."""
        r = await self._r()
        raw = await r.hgetall(self._key(job_id))
        if not raw:
            return None
        return {k: json.loads(v) for k, v in raw.items()}

    async def exists(self, job_id: str) -> bool:
        r = await self._r()
        return bool(await r.exists(self._key(job_id)))

    # ── Cleanup ────────────────────────────────────────────────────────────────

    async def delete(self, job_id: str) -> None:
        r = await self._r()
        await r.delete(self._key(job_id))

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None


# Module-level singleton — shared across the whole FastAPI process
job_store = RedisJobStore()
