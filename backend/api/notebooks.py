from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from db.database import get_db
from db.models import Notebook, Document, Note
from auth.jwt_handler import get_current_user

router = APIRouter()


class NotebookCreate(BaseModel):
    title: str = "Untitled notebook"
    emoji: str = "📓"


class NotebookUpdate(BaseModel):
    title: Optional[str] = None
    emoji: Optional[str] = None
    system_prompt: Optional[str] = None  # P1 #12


class NotebookOut(BaseModel):
    id: str
    title: str
    emoji: str
    source_count: int
    system_prompt: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SearchResult(BaseModel):
    type: str        # "source" | "note"
    id: str
    label: str
    subtitle: str


@router.get("/", response_model=list[NotebookOut])
async def list_notebooks(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Notebook).where(Notebook.user_id == user.id).order_by(Notebook.updated_at.desc())
    )
    notebooks = result.scalars().all()
    out = []
    for nb in notebooks:
        count_res = await db.execute(
            select(func.count(Document.id)).where(Document.notebook_id == nb.id)
        )
        source_count = count_res.scalar() or 0
        out.append(NotebookOut(
            id=nb.id, title=nb.title, emoji=nb.emoji,
            source_count=source_count,
            system_prompt=nb.system_prompt,
            created_at=nb.created_at, updated_at=nb.updated_at,
        ))
    return out


@router.post("/", response_model=NotebookOut, status_code=201)
async def create_notebook(
    body: NotebookCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    nb = Notebook(id=str(uuid.uuid4()), user_id=user.id, title=body.title, emoji=body.emoji)
    db.add(nb)
    await db.commit()
    await db.refresh(nb)
    return NotebookOut(id=nb.id, title=nb.title, emoji=nb.emoji,
                       source_count=0, created_at=nb.created_at, updated_at=nb.updated_at)


@router.patch("/{notebook_id}", response_model=NotebookOut)
async def update_notebook(
    notebook_id: str,
    body: NotebookUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user.id)
    )
    nb = result.scalar_one_or_none()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    if body.title is not None:
        nb.title = body.title
    if body.emoji is not None:
        nb.emoji = body.emoji
    if body.system_prompt is not None:
        nb.system_prompt = body.system_prompt if body.system_prompt.strip() else None
    await db.commit()
    await db.refresh(nb)
    count_res = await db.execute(
        select(func.count(Document.id)).where(Document.notebook_id == nb.id)
    )
    source_count = count_res.scalar() or 0
    return NotebookOut(id=nb.id, title=nb.title, emoji=nb.emoji,
                       source_count=source_count, system_prompt=nb.system_prompt,
                       created_at=nb.created_at, updated_at=nb.updated_at)


@router.delete("/{notebook_id}", status_code=204)
async def delete_notebook(
    notebook_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user.id)
    )
    nb = result.scalar_one_or_none()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    await db.delete(nb)
    await db.commit()


# P1 #11 — Contextual in-notebook search
@router.get("/{notebook_id}/search", response_model=list[SearchResult])
async def search_notebook(
    notebook_id: str,
    q: str = "",
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Search source filenames and note titles/content within a notebook."""
    if not q.strip():
        return []

    # Verify notebook belongs to user
    nb_res = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user.id)
    )
    if not nb_res.scalar_one_or_none():
        raise HTTPException(404, "Notebook not found")

    term = f"%{q.lower()}%"
    results: list[SearchResult] = []

    # Search sources by filename
    doc_res = await db.execute(
        select(Document).where(
            Document.notebook_id == notebook_id,
            Document.user_id == user.id,
            func.lower(Document.filename).like(term),
        ).limit(5)
    )
    for doc in doc_res.scalars().all():
        results.append(SearchResult(type="source", id=doc.id, label=doc.filename, subtitle="Source document"))

    # Search notes by title + content
    note_res = await db.execute(
        select(Note).where(
            Note.notebook_id == notebook_id,
            Note.user_id == user.id,
            or_(
                func.lower(Note.title).like(term),
                func.lower(Note.content).like(term),
            ),
        ).limit(5)
    )
    for note in note_res.scalars().all():
        results.append(SearchResult(type="note", id=note.id, label=note.title, subtitle="Note"))

    return results