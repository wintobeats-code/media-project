from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.article import Article


class ArticleLike(Base):
    """Лайк статьи анонимным пользователем (без аккаунтов).

    Защита от накруток: уникальное ограничение (article_id, voter_id).
    voter_id — случайный uuid, хранящийся в куке браузера.
    """

    __tablename__ = "article_likes"
    __table_args__ = (
        UniqueConstraint("article_id", "voter_id", name="uq_article_likes_article_voter"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE")
    )
    voter_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    article: Mapped["Article"] = relationship(back_populates="likes")
