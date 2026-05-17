from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from db.database import Base
from config import settings


class User(Base):
    __tablename__ = "users"
    id                   = Column(String, primary_key=True)
    email                = Column(String, unique=True, nullable=False, index=True)
    display_name         = Column(String, nullable=False, default="")
    password_hash        = Column(String, nullable=False)
    output_language      = Column(String, nullable=False, default="en")  # P1 #15
    # Google OAuth fields (#24)
    google_id            = Column(String, nullable=True, unique=True, index=True)
    oauth_provider       = Column(String, nullable=True)   # "google" | None (password)
    avatar_url           = Column(String, nullable=True)
    # Google Drive refresh token (#25)
    google_refresh_token = Column(String, nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    notebooks            = relationship("Notebook", back_populates="user", cascade="all, delete-orphan")
    documents            = relationship("Document",  back_populates="user",  cascade="all, delete-orphan")


class Notebook(Base):
    __tablename__ = "notebooks"
    id           = Column(String, primary_key=True)
    user_id      = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title        = Column(String, nullable=False, default="Untitled notebook")
    emoji        = Column(String, nullable=False, default="📓")
    system_prompt= Column(Text, nullable=True)    # P1 #12 — per-notebook custom system prompt
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user         = relationship("User",     back_populates="notebooks")
    documents    = relationship("Document", back_populates="notebook", cascade="all, delete-orphan")
    notes        = relationship("Note",     back_populates="notebook", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"
    id          = Column(String, primary_key=True)
    filename    = Column(String, nullable=False)
    user_id     = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notebook_id = Column(String, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=True, index=True)
    status      = Column(String, nullable=False, default="ready")  # P1 #9 — processing | ready | failed
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    user        = relationship("User",     back_populates="documents")
    notebook    = relationship("Notebook", back_populates="documents")
    chunks      = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id          = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content     = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    embedding   = Column(Vector(settings.EMBEDDING_DIMENSIONS))
    document    = relationship("Document", back_populates="chunks")


class Note(Base):
    """User-created notes scoped to a notebook. Can be converted to a source."""
    __tablename__ = "notes"
    id          = Column(String, primary_key=True)
    notebook_id = Column(String, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id     = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title       = Column(String, nullable=False, default="Untitled Note")
    content     = Column(Text, nullable=False, default="")
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    notebook    = relationship("Notebook", back_populates="notes")
