"""
RxHarden Phase 3 Task 4: Refresh token management with Redis-backed single-use rotation.

Refresh tokens are opaque UUIDs stored in Redis with 7-day TTL.
Each refresh is single-use: the old token is consumed and a new one is issued.
This prevents replay attacks and limits the blast radius of token theft.
"""
import json
import logging
import uuid
from datetime import timedelta
import redis.asyncio as aioredis
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from auth.jwt_handler import create_access_token, decode_token
from auth.cookies import (
    set_access_cookie, REFRESH_COOKIE_NAME, REFRESH_COOKIE_MAX_AGE,
    REFRESH_COOKIE_PATH, COOKIE_SECURE, COOKIE_SAMESITE, COOKIE_HTTPONLY,
    COOKIE_DOMAIN, clear_auth_cookies,
)
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


async def _get_redis() -> aioredis.Redis | None:
    try:
        r = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True, socket_connect_timeout=2)
        await r.ping()
        return r
    except Exception as exc:
        logger.warning("Refresh token: Redis unavailable. %s", exc)
        return None


def _refresh_ttl_seconds() -> int:
    return settings.REFRESH_EXPIRE_DAYS * 86400


async def create_refresh_token(user_id: str, email: str) -> str | None:
    """Create a new refresh token in Redis. Returns the token ID or None if Redis is down."""
    r = await _get_redis()
    if not r:
        return None

    token_id = str(uuid.uuid4())
    payload = json.dumps({"user_id": user_id, "email": email})
    await r.set(f"refresh:{token_id}", payload, ex=_refresh_ttl_seconds())
    await r.aclose()
    return token_id


async def rotate_refresh_token(old_token_id: str) -> tuple[str, dict] | None:
    """
    Consume the old refresh token and issue a new one.
    Returns (new_token_id, user_payload) or None if invalid/expired.
    """
    r = await _get_redis()
    if not r:
        return None

    key = f"refresh:{old_token_id}"
    pipe = r.pipeline()
    pipe.get(key)
    pipe.delete(key)  # Single-use: consume immediately
    results = await pipe.execute()

    payload_str = results[0]
    if not payload_str:
        await r.aclose()
        return None  # Token not found or expired

    payload = json.loads(payload_str)

    # Issue new refresh token
    new_token_id = str(uuid.uuid4())
    await r.set(f"refresh:{new_token_id}", json.dumps(payload), ex=_refresh_ttl_seconds())
    await r.aclose()

    return new_token_id, payload


def set_refresh_cookie(response, token_id: str):
    """Set the refresh token as an httpOnly cookie."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token_id,
        httponly=COOKIE_HTTPONLY,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_COOKIE_MAX_AGE,
        domain=COOKIE_DOMAIN,
    )


@router.post("/refresh")
async def refresh_endpoint(request: Request):
    """
    RxHarden T4: Rotate refresh token and issue new access + refresh pair.
    The refresh token is read from the httpOnly cookie.
    """
    old_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if not old_refresh:
        raise HTTPException(status_code=401, detail="No refresh token provided.")

    result = await rotate_refresh_token(old_refresh)
    if result is None:
        # Token was invalid or expired — force re-login
        response = JSONResponse(
            status_code=401,
            content={"detail": "Refresh token expired or invalid. Please log in again."},
        )
        clear_auth_cookies(response)
        return response

    new_token_id, payload = result

    # Issue new access token
    access_token = create_access_token(payload["user_id"], payload["email"])

    response = JSONResponse(content={
        "user_id": payload["user_id"],
        "email": payload["email"],
    })
    set_access_cookie(response, access_token)
    set_refresh_cookie(response, new_token_id)
    return response
