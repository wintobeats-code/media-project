from typing import TYPE_CHECKING

from app.core.database import Base
from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.article import Article


class Footnote(Base):
    __tablename__ = "footnotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE")
    )
    number: Mapped[int] = mapped_column()
    text: Mapped[str] = mapped_column(Text)

    article: Mapped["Article"] = relationship(back_populates="footnotes")
