from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func, select
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.article_image import ArticleImage
    from app.models.author import Author
    from app.models.footnote import Footnote
    from app.models.tag import Tag


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    subtitle: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, published
    # Slug раздела (например "moda", "muzyka"). См. app.core.sections.SECTIONS.
    section: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cover_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author: Mapped["Author"] = relationship(back_populates="articles", lazy="selectin")
    footnotes: Mapped[List["Footnote"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    images: Mapped[List["ArticleImage"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    tags: Mapped[List["Tag"]] = relationship(
        secondary="article_tags",
        back_populates="articles",
        lazy="selectin",
    )
    likes: Mapped[List["ArticleLike"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


# column_property нужно определить после объявления класса, т.к. он ссылается
# на таблицу article_likes. Импортируем модель здесь (реальный импорт, не
# TYPE_CHECKING), чтобы свойство вычислилось во время выполнения.
from app.models.article_like import ArticleLike  # noqa: E402

# Количество лайков статьи — вычисляемый subquery, доступен везде как article.likes_count.
Article.likes_count = column_property(
    select(func.count(ArticleLike.id))
    .where(ArticleLike.article_id == Article.id)
    .correlate(Article)
    .scalar_subquery()
)
