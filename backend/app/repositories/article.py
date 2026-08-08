from typing import List, Optional

from app.models.article import Article
from app.models.tag import Tag
from app.repositories.base import BaseRepository
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


class ArticleRepository(BaseRepository[Article]):
    def __init__(self, session: AsyncSession):
        super().__init__(Article, session)

    async def get_published(
        self,
        *,
        offset: int = 0,
        limit: int = 20,
        section: Optional[str] = None,
        tag: Optional[str] = None,
        sort: str = "new",
    ) -> List[Article]:
        query = select(Article).where(Article.status == "published")
        if section:
            query = query.where(Article.section == section)
        if tag:
            query = query.join(Article.tags).where(Tag.slug == tag)

        # Сортировка: popular — по количеству лайков, old — старые, new — новые.
        if sort == "popular":
            query = query.order_by(Article.likes_count.desc().nullslast(), Article.published_at.desc())
        elif sort == "old":
            query = query.order_by(Article.published_at.asc())
        else:  # "new" (по умолчанию)
            query = query.order_by(Article.published_at.desc())

        query = query.offset(offset).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def get_by_slug_published(self, slug: str) -> Optional[Article]:
        query = select(Article).where(
            Article.slug == slug, Article.status == "published"
        )
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_related(
        self, *, exclude_slug: str, limit: int = 3
    ) -> List[Article]:
        """Свежие опубликованные статьи, кроме exclude_slug (для «Читайте по теме»)."""
        query = (
            select(Article)
            .where(Article.status == "published", Article.slug != exclude_slug)
            .order_by(Article.published_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def get_all_admin(self, *, offset: int = 0, limit: int = 20) -> List[Article]:
        query = (
            select(Article)
            .order_by(Article.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_all(self) -> int:
        return await self.count()

