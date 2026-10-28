"""Database tables. Images are not stored here, only their paths in storage."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, scoped_session, sessionmaker


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(20), default="teacher")        # teacher | admin
    status: Mapped[str] = mapped_column(String(20), default="pending")      # pending | approved | disabled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    approved_by: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)

    def to_dict(self) -> dict:
        return {"id": self.id, "email": self.email, "name": self.name, "role": self.role,
                "status": self.status, "created_at": self.created_at.isoformat() if self.created_at else None,
                "approved_by": self.approved_by}


class Test(Base):
    __tablename__ = "tests"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    question_count: Mapped[int] = mapped_column(Integer, default=50)
    options: Mapped[str] = mapped_column(String(26), default="ABCDE")
    marks_correct: Mapped[float] = mapped_column(Float, default=1.0)
    marks_incorrect: Mapped[float] = mapped_column(Float, default=0.0)
    marks_unmarked: Mapped[float] = mapped_column(Float, default=0.0)
    answer_key_json: Mapped[str] = mapped_column(Text, default="{}")
    created_by: Mapped[str] = mapped_column(String(320))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    batches: Mapped[list["Batch"]] = relationship(back_populates="test")

    @property
    def answer_key(self) -> Dict[str, str]:
        return json.loads(self.answer_key_json or "{}")

    @answer_key.setter
    def answer_key(self, value: Dict[str, str]) -> None:
        self.answer_key_json = json.dumps(value)

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "question_count": self.question_count, "options": self.options,
                "marks_correct": self.marks_correct, "marks_incorrect": self.marks_incorrect,
                "marks_unmarked": self.marks_unmarked, "answer_key": self.answer_key,
                "created_by": self.created_by, "created_at": self.created_at.isoformat() if self.created_at else None,
                "archived": self.archived}


class Batch(Base):
    __tablename__ = "batches"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    test_id: Mapped[str] = mapped_column(ForeignKey("tests.id"), index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[str] = mapped_column(String(320))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")         # open | finished
    test: Mapped[Test] = relationship(back_populates="batches")
    sheets: Mapped[list["Sheet"]] = relationship(back_populates="batch", cascade="all, delete-orphan")

    def to_dict(self, with_counts: bool = True) -> dict:
        d = {"id": self.id, "test_id": self.test_id, "test_name": self.test.name if self.test else None,
             "name": self.name, "created_by": self.created_by,
             "created_at": self.created_at.isoformat() if self.created_at else None,
             "finished_at": self.finished_at.isoformat() if self.finished_at else None, "status": self.status}
        if with_counts:
            d["sheet_count"] = len(self.sheets)
            d["read_count"] = sum(1 for s in self.sheets if s.status == "ok")
            d["review_count"] = sum(1 for s in self.sheets if s.status == "ok" and s.needs_review)
            d["error_count"] = sum(1 for s in self.sheets if s.status == "error")
        return d


class Sheet(Base):
    __tablename__ = "sheets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    batch_id: Mapped[str] = mapped_column(ForeignKey("batches.id"), index=True)
    source_name: Mapped[str] = mapped_column(String(300), default="")
    page_no: Mapped[int] = mapped_column(Integer, default=1)
    input_path: Mapped[str] = mapped_column(String(300), default="")
    checked_path: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(20), default="ok")           # ok | error
    error_reason: Mapped[str] = mapped_column(Text, default="")
    fields_json: Mapped[str] = mapped_column(Text, default="{}")
    answers_json: Mapped[str] = mapped_column(Text, default="{}")
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    review_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    batch: Mapped[Batch] = relationship(back_populates="sheets")

    @property
    def fields(self) -> Dict[str, str]:
        return json.loads(self.fields_json or "{}")

    @property
    def answers(self) -> Dict[str, str]:
        return json.loads(self.answers_json or "{}")

    def to_dict(self) -> dict:
        return {"id": self.id, "batch_id": self.batch_id, "source_name": self.source_name, "page_no": self.page_no,
                "status": self.status, "error_reason": self.error_reason, "fields": self.fields,
                "answers": self.answers, "score": self.score, "needs_review": self.needs_review,
                "review_reason": self.review_reason, "has_checked_image": bool(self.checked_path),
                "created_at": self.created_at.isoformat() if self.created_at else None}


def make_session_factory(database_url: str):
    """Engine plus a scoped session. Azure SQL via pyodbc gets the retry settings serverless needs."""
    kwargs = {"pool_pre_ping": True, "future": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    elif database_url.startswith("mssql"):
        kwargs["pool_recycle"] = 300
        kwargs["connect_args"] = {"timeout": 60}   # a paused serverless database takes ~1 minute to wake
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
    create_tables(engine)
    return engine, scoped_session(sessionmaker(bind=engine, expire_on_commit=False))


def create_tables(engine, attempts: int = 5) -> None:
    """Create missing tables. Several Gunicorn workers start at once on a fresh database, so two of
    them can race between 'does the table exist?' and 'create it'; the loser just retries."""
    import time
    from sqlalchemy.exc import OperationalError, ProgrammingError

    for attempt in range(attempts):
        try:
            Base.metadata.create_all(engine)
            return
        except (OperationalError, ProgrammingError) as exc:
            if "already exists" not in str(exc).lower() or attempt == attempts - 1:
                raise
            time.sleep(0.3 * (attempt + 1))
