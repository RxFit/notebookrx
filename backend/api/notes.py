from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from db.database import get_db
from db.models import Note, Notebook
from auth.jwt_handler import get_current_user

router = APIRouter()


class NoteCreate(BaseModel):
    notebook_id: str
    title: str = "Untitled Note"
    content: str = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class NoteOut(BaseModel):
    id: str
    notebook_id: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


async def _assert_notebook_owned(notebook_id: str, user_id: str, db: AsyncSession):
    res = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(404, "Notebook not found")


@router.get("/", response_model=list[NoteOut])
async def list_notes(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await _assert_notebook_owned(notebook_id, user.id, db)
    result = await db.execute(
        select(Note).where(Note.notebook_id == notebook_id, Note.user_id == user.id)
                    .order_by(Note.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=NoteOut, status_code=201)
async def create_note(
    body: NoteCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await _assert_notebook_owned(body.notebook_id, user.id, db)
    note = Note(
        id=str(uuid.uuid4()),
        notebook_id=body.notebook_id,
        user_id=user.id,
        title=body.title,
        content=body.content,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: str,
    body: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = body.content
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    await db.delete(note)
    await db.commit()
