from sqlalchemy import Column, String, Integer, Text, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import relationship, DeclarativeBase
from pgvector.sqlalchemy import Vector
from config import settings


class Base(DeclarativeBase):
    pass


class User(Base):
    """Application users — credentials stored as PBKDF2-SHA256 hashes (stdlib, no Rust)."""
    __tablename__ = "users"
    id           = Column(String, primary_key=True)
    email        = Column(String, nullable=False, index=True)
    display_name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)
    documents    = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    notebooks    = relationship("Notebook", back_populates="user", cascade="all, delete-orphan")


class Notebook(Base):
    """Named container grouping sources and notes for a user."""
    __tablename__ = "notebooks"
    id         = Column(String, primary_key=True)
    user_id    = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title      = Column(String, nullable=False, default="Untitled notebook")
    emoji      = Column(String, nullable=False, default="📓")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user       = relationship("User", back_populates="notebooks")
    documents  = relationship("Document", back_populates="notebook", cascade="all, delete-orphan")
    notes      = relationship("Note", back_populates="notebook", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"
    id          = Column(String, primary_key=True)
    filename    = Column(String, nullable=False)
    user_id     = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notebook_id = Column(String, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    user        = relationship("User", back_populates="documents")
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
