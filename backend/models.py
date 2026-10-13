# backend/models.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Text, Integer, Boolean, DateTime, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

def utcnow():
    return datetime.now(timezone.utc)

def gen_id():
    return uuid.uuid4().hex[:16]

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    bio: Mapped[str] = mapped_column(String(500), default="")
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    tier: Mapped[str] = mapped_column(String(32), default="free")
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    simulated_tier: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    personas: Mapped[list["UserPersona"]] = relationship(
        "UserPersona", back_populates="user", cascade="all, delete-orphan"
    )
    characters: Mapped[list["Character"]] = relationship(
        "Character", back_populates="creator"
    )
    sessions: Mapped[list["ChatSession"]] = relationship(
        "ChatSession", back_populates="user", cascade="all, delete-orphan"
    )


class UserPersona(Base):
    """
    User profile/persona context injected into conversations.
    """
    __tablename__ = "user_personas"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="personas")


class Character(Base):
    """
    Character definition indexed for discovery across thousands of concurrent users.
    """
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    creator_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    creator_name: Mapped[str] = mapped_column(String(100), default="system")

    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    gender: Mapped[str] = mapped_column(String(32), default="Female", index=True)
    tagline: Mapped[str] = mapped_column(String(240), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="Romance", index=True)
    tags: Mapped[str] = mapped_column(String(400), default="")  # comma-separated tags

    avatar_url: Mapped[str] = mapped_column(String(600), default="")
    banner_url: Mapped[str] = mapped_column(String(600), default="")
    accent_color: Mapped[str] = mapped_column(String(24), default="#a855f7")

    # Deep Persona Builder fields
    personality: Mapped[str] = mapped_column(Text, nullable=False)
    backstory: Mapped[str] = mapped_column(Text, default="")
    scenario: Mapped[str] = mapped_column(Text, default="")
    greeting: Mapped[str] = mapped_column(Text, nullable=False)
    example_dialogue: Mapped[str] = mapped_column(Text, default="")

    # Default Haru-Gpt LLM model for this character
    default_model: Mapped[str] = mapped_column(String(100), default="haru-rp-v1")
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    # Social & Discovery metrics
    chat_count: Mapped[int] = mapped_column(Integer, default=0, index=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    like_count: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    creator: Mapped["User | None"] = relationship("User", back_populates="characters")
    sessions: Mapped[list["ChatSession"]] = relationship(
        "ChatSession", back_populates="character", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_characters_public_cat_chats", "is_public", "category", "chat_count"),
    )


class CharacterLike(Base):
    __tablename__ = "character_likes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[str] = mapped_column(String(32), ForeignKey("characters.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "character_id", name="uq_user_character_like"),
    )


class ChatSession(Base):
    """
    Isolated per-user, per-character conversation session.
    Supports thousands of simultaneous users with independent state & memory.
    """
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[str] = mapped_column(String(32), ForeignKey("characters.id", ondelete="CASCADE"), index=True)
    persona_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("user_personas.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String(160), default="New Roleplay")
    selected_model: Mapped[str] = mapped_column(String(100), default="haru-rp-v1")
    memory_notes: Mapped[str] = mapped_column(Text, default="")  # Pinned plot/memory summary
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    character: Mapped["Character"] = relationship("Character", back_populates="sessions")
    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )

    __table_args__ = (
        Index("ix_sessions_user_updated", "user_id", "updated_at"),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # 'user' | 'assistant' | 'system'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")
