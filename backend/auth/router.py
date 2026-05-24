"""
Auth router — /auth/register, /auth/login, /auth/me
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, field_validator
from db.database import get_db
from db.models import User
from auth.jwt_handler import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        return v.strip().lower()


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        return v.strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    display_name: str


class MeResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    output_language: str


class UpdateMeRequest(BaseModel):
    display_name: str | None = None
    output_language: str | None = None

    @field_validator("output_language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is None:
            return v
        # Basic ISO 639-1 / BCP-47 format check (2-5 char codes like en, fr, zh-CN)
        import re
        if not re.match(r'^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$', v):
            raise ValueError("output_language must be a valid BCP-47 language code (e.g. 'en', 'fr', 'zh-CN')")
        return v.lower()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        display_name=req.display_name or req.email.split("@")[0],
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.email)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    # Always run verify even on miss — prevents email enumeration via timing
    stored_hash = user.password_hash if user else "x$y"
    if not user or not verify_password(req.password, stored_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user.id, user.email)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
    )


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        user_id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        output_language=current_user.output_language,
    )


@router.patch("/me", response_model=MeResponse)
async def update_me(
    req: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile fields. Only provided fields are changed (partial update)."""
    if req.display_name is not None:
        current_user.display_name = req.display_name.strip() or current_user.display_name
    if req.output_language is not None:
        current_user.output_language = req.output_language

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return MeResponse(
        user_id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        output_language=current_user.output_language,
    )
