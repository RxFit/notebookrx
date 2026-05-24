"""
Security headers middleware.

Adds hardening headers to every response:
  - X-Frame-Options: DENY              — clickjacking protection
  - X-Content-Type-Options: nosniff   — MIME-type sniffing protection
  - Strict-Transport-Security          — force HTTPS for 1 year
  - Referrer-Policy                    — minimal referrer leakage
  - Content-Security-Policy            — permissive but structured baseline
  - Permissions-Policy                 — disable unused browser features
"""
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        # CSP: permissive baseline — tighten in a future sprint
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "connect-src 'self' https://notebookrx-api-production.up.railway.app; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data: https://fonts.gstatic.com"
        )

        return response
