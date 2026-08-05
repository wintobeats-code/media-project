from typing import TYPE_CHECKING, Optional

from app.core.database import Base
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.article import Article


class ArticleImage(Base):
    __tablename__ = "article_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE")
    )
    url: Mapped[str] = mapped_column(String(500))
    caption: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    position: Mapped[int] = mapped_column(default=0)

    article: Mapped["Article"] = relationship(back_populates="images")
