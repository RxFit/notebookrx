"""
Google OAuth 2.0 SSO  — /auth/google  &  /auth/google/callback
Flow: redirect user to Google → handle token exchange → upsert user → issue JWT
"""
import uuid
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db
from db.models import User
from auth.jwt_handler import create_access_token, hash_password
from config import settings
from fastapi import Depends

router = APIRouter(prefix="/auth", tags=["auth-google"])

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"


def _google_enabled() -> bool:
    return bool(getattr(settings, "GOOGLE_CLIENT_ID", None) and
                getattr(settings, "GOOGLE_CLIENT_SECRET", None))


@router.get("/google")
async def google_login(request: Request):
    """Redirect user to Google OAuth consent screen."""
    if not _google_enabled():
        raise HTTPException(status_code=501, detail="Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.")

    redirect_uri = str(request.base_url).rstrip("/") + "/auth/google/callback"
    params = {
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "prompt":        "select_account",
    }
    import urllib.parse
    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback, upsert user, return JWT."""
    if error or not code:
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {error or 'missing code'}")

    redirect_uri = str(request.base_url).rstrip("/") + "/auth/google/callback"
    frontend_url = getattr(settings, "FRONTEND_URL", "https://notebook.blue")

    # Exchange code for access token
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

        # Fetch user info
        user_resp = await client.get(GOOGLE_USER_URL, headers={"Authorization": f"Bearer {tokens['access_token']}"})
        if user_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Google user info.")
        guser = user_resp.json()

    email        = guser.get("email", "").lower()
    display_name = guser.get("name", email.split("@")[0])
    google_id    = guser.get("sub", "")

    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email address.")

    # Upsert user — find by email, create if missing
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()

    if not user:
        user = User(
            id           = str(uuid.uuid4()),
            email        = email,
            display_name = display_name,
            hashed_password = hash_password(f"google-oauth-{google_id}-{uuid.uuid4()}"),  # unusable password
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    jwt = create_access_token({"sub": user.id, "email": user.email, "display_name": user.display_name})

    # Redirect to frontend with token in query param (frontend reads + stores it)
    return RedirectResponse(f"{frontend_url}/auth/callback?token={jwt}&display_name={display_name}&email={email}&user_id={user.id}")