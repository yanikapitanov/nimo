from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Highlight(Base):
    __tablename__ = "highlights"
    __table_args__ = (UniqueConstraint("hash", name="uq_highlights_hash"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    book_name: Mapped[str] = mapped_column(String(500), index=True)
    author: Mapped[str] = mapped_column(String(255), index=True)
    highlight: Mapped[str] = mapped_column(Text)
    hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
