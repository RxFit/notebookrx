"""
RxHarden Phase 3 Task 3: Cookie configuration constants for httpOnly JWT auth.

These constants define the cookie behavior for access and refresh tokens.
All auth endpoints use these constants to ensure consistent cookie settings.
"""
import os

# Detect local development (localhost / 127.0.0.1)
_is_local = os.environ.get("DATABASE_URL", "").startswith("postgresql://localhost") or \
            not os.environ.get("RAILWAY_ENVIRONMENT")

ACCESS_COOKIE_NAME = "access_token"
ACCESS_COOKIE_MAX_AGE = 3600          # 1 hour (Task 4 reduces from 7 days)

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 604800       # 7 days
REFRESH_COOKIE_PATH = "/auth/refresh" # Only sent to refresh endpoint

COOKIE_SECURE = not _is_local         # False on localhost, True in production
COOKIE_SAMESITE = "lax"
COOKIE_HTTPONLY = True
COOKIE_DOMAIN = None                  # Let browser infer


def set_access_cookie(response, token: str):
    """Set the access token as an httpOnly cookie on the response."""
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=token,
        httponly=COOKIE_HTTPONLY,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=ACCESS_COOKIE_MAX_AGE,
        domain=COOKIE_DOMAIN,
    )


def clear_auth_cookies(response):
    """Clear all auth cookies from the response."""
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/", domain=COOKIE_DOMAIN)
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH, domain=COOKIE_DOMAIN)
