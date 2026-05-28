"""
Google OAuth 2.0 SSO  — /auth/google  &  /auth/google/callback
Flow: redirect user to Google → handle token exchange → upsert user → issue JWT

Scopes requested:
  openid email profile                — for SSO login (#24)
  https://www.googleapis.com/auth/drive.readonly  — for Drive ingestion (#25)

RxHarden Phase 3 Task 1: Auth code exchange replaces JWT-in-URL redirect.
"""
import json
import logging
import secrets
import uuid
import httpx
import urllib.parse
import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db
from db.models import User
from auth.jwt_handler import create_access_token, hash_password
from config import settings

logger = logging.getLogger(__name__)


# --- Auth Code Exchange Schema (Master Contract 2a) ---
class AuthCodeExchangeRequest(BaseModel):
    code: str  # Single-use auth code from Redis


async def _get_redis() -> aioredis.Redis | None:
    """Get a Redis connection for auth code storage. Returns None if unavailable."""
    try:
        r = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True, socket_connect_timeout=2)
        await r.ping()
        return r
    except Exception as exc:
        logger.warning("Auth code exchange: Redis unavailable, falling back to direct token. %s", exc)
        return None

router = APIRouter(prefix="/auth", tags=["auth-google"])

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"

SCOPES = " ".join([
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.readonly",
])


def _google_enabled() -> bool:
    return bool(getattr(settings, "GOOGLE_CLIENT_ID", None) and
                getattr(settings, "GOOGLE_CLIENT_SECRET", None))


def _build_redirect_uri(request: Request) -> str:
    """
    Build the callback URI, forcing https:// in production.
    Railway terminates TLS at the proxy level, so request.base_url
    may arrive as http:// even though the public URL is https://.
    """
    base = str(request.base_url).rstrip("/")
    # Force https for any Railway or custom domain (not localhost)
    if not base.startswith("http://localhost") and not base.startswith("http://127."):
        base = base.replace("http://", "https://", 1)
    return base + "/auth/google/callback"


@router.get("/google")
async def google_login(request: Request):
    """Redirect user to Google OAuth consent screen."""
    if not _google_enabled():
        raise HTTPException(
            status_code=501,
            detail="Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    redirect_uri = _build_redirect_uri(request)
    state = secrets.token_urlsafe(32)
    params = {
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         SCOPES,
        "access_type":   "offline",   # request refresh_token for Drive
        "prompt":        "consent",   # force consent so we always get refresh_token
        "state":         state,
    }
    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)
    response = RedirectResponse(url)
    response.set_cookie(
        "oauth_state", state,
        httponly=True, secure=True, samesite="lax", max_age=300,
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback, upsert user, store refresh token, return JWT."""
    if error or not code:
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {error or 'missing code'}")

    # CSRF validation
    expected_state = request.cookies.get("oauth_state")
    if not state or state != expected_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state — possible CSRF attack.")

    redirect_uri = _build_redirect_uri(request)
    frontend_url = getattr(settings, "FRONTEND_URL", "https://notebook.blue")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri":  redirect_uri,
            "grant_type":    "authorization_code",
        })
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange Google code for token.")
        tokens = token_resp.json()

        # Fetch Google user info
        user_resp = await client.get(
            GOOGLE_USER_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Google user info.")
        guser = user_resp.json()

    email         = guser.get("email", "").lower()
    display_name  = guser.get("name", email.split("@")[0])
    google_id     = guser.get("sub", "")
    avatar_url    = guser.get("picture", None)
    refresh_token = tokens.get("refresh_token")  # may be None on repeat logins

    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email address.")

    # Look up by google_id first, then fall back to email to prevent duplicates
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalars().first()

    if not user:
        # Fall back: email match for users who registered with password first
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()

    if not user:
        # New user — create account
        user = User(
            id            = str(uuid.uuid4()),
            email         = email,
            display_name  = display_name,
            password_hash = hash_password(f"google-oauth-{google_id}-{uuid.uuid4()}"),  # unusable password
            google_id     = google_id,
            oauth_provider= "google",
            avatar_url    = avatar_url,
        )
        db.add(user)
    else:
        # Existing user — update Google fields
        user.google_id      = google_id
        user.oauth_provider = "google"
        if avatar_url:
            user.avatar_url = avatar_url

    # Store refresh token if provided (needed for Drive API calls)
    # RxHarden T2: Encrypt at rest before DB write
    if refresh_token:
        from auth.token_encryption import encrypt_token
        user.google_refresh_token = encrypt_token(refresh_token)

    await db.commit()
    await db.refresh(user)

    # Issue our JWT
    jwt_token = create_access_token(user.id, user.email)

    # RxHarden T1: Generate single-use auth code instead of putting JWT in URL
    r = await _get_redis()
    if r:
        try:
            auth_code = secrets.token_urlsafe(32)
            code_payload = json.dumps({
                "token": jwt_token,
                "user_id": user.id,
                "email": user.email,
                "display_name": display_name,
            })
            await r.set(f"oauth:code:{auth_code}", code_payload, ex=60)  # 60s TTL
            await r.aclose()
            # Redirect with auth code only — no JWT in URL
            redirect_params = urllib.parse.urlencode({"code": auth_code})
            response = RedirectResponse(f"{frontend_url}/auth/callback?{redirect_params}")
            response.delete_cookie("oauth_state")
            return response
        except Exception as exc:
            logger.warning("Auth code exchange: Redis write failed, falling back to direct token. %s", exc)
            await r.aclose()

    # Degraded fallback: JWT in URL (legacy behavior when Redis is down)
    logger.warning("Auth code exchange: Using degraded JWT-in-URL fallback")
    params = urllib.parse.urlencode({
        "token":        jwt_token,
        "user_id":      user.id,
        "email":        user.email,
        "display_name": display_name,
    })
    return RedirectResponse(f"{frontend_url}/auth/callback?{params}")


@router.post("/google/exchange")
async def google_exchange(req: AuthCodeExchangeRequest):
    """
    RxHarden T1: Exchange a single-use auth code for user session data.
    The auth code was generated during the OAuth callback and stored in Redis with 60s TTL.
    This endpoint consumes the code (single-use) and returns user info.
    The JWT is currently returned in the body; Task 3 will migrate this to an httpOnly cookie.
    """
    r = await _get_redis()
    if not r:
        raise HTTPException(status_code=503, detail="Auth service temporarily unavailable — Redis unreachable.")

    try:
        key = f"oauth:code:{req.code}"
        # Atomic GET + DEL to ensure single-use
        pipe = r.pipeline()
        pipe.get(key)
        pipe.delete(key)
        results = await pipe.execute()
        await r.aclose()

        payload_str = results[0]
        if not payload_str:
            raise HTTPException(status_code=400, detail="Invalid or expired auth code.")

        payload = json.loads(payload_str)
        return {
            "access_token": payload["token"],
            "token_type": "bearer",
            "user_id": payload["user_id"],
            "email": payload["email"],
            "display_name": payload["display_name"],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Auth code exchange failed: %s", exc)
        raise HTTPException(status_code=500, detail="Auth code exchange failed.")
