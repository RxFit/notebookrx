import hashlib, hmac, os, uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated
import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from config import settings
from db.database import get_db
from db.models import User

_ITERATIONS = 600_000
_HASH_ALG   = "sha256"

def hash_password(plain: str) -> str:
    salt = os.urandom(32).hex()
    h = hashlib.pbkdf2_hmac(_HASH_ALG, plain.encode(), salt.encode(), _ITERATIONS)
    return f"{salt}${h.hex()}"

def verify_password(plain: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    h = hashlib.pbkdf2_hmac(_HASH_ALG, plain.encode(), salt.encode(), _ITERATIONS)
    return hmac.compare_digest(h.hex(), expected)

def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expire,
               "iat": datetime.now(timezone.utc), "jti": str(uuid.uuid4())}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired",
                            headers={"WWW-Authenticate": "Bearer"})
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}",
                            headers={"WWW-Authenticate": "Bearer"})

_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not authenticated - provide a Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials)
    user_id: str = payload.get("sub", "")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found",
                            headers={"WWW-Authenticate": "Bearer"})
    return user
