from datetime import datetime, timezone
from typing import List, Optional
import re
import unicodedata

from app.models.article import Article
from app.models.article_image import ArticleImage
from app.models.footnote import Footnote
from app.models.tag import Tag
from app.repositories.article import ArticleRepository
from app.schemas.article import ArticleCreate, ArticleUpdate
from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def _slugify(value: str) -> str:
    """Транслитерирует и преобразует имя тега в URL-безопасный slug."""
    value = unicodedata.normalize("NFKD", value)
    # Соответствие кириллица -> латиница для читаемых slug'ов
    cyr = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    lat = "abvgdeezziyklmnoprstufhccss_y_euya"
    table = {ord(a): b for a, b in zip(cyr, lat)}
    value = value.lower().translate(table)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "tag"


class ArticleService:
    def __init__(self, session: AsyncSession):
        self.repo = ArticleRepository(session)
        self.session = session

    async def list_published(
        self,
        page: int = 1,
        per_page: int = 20,
        section: Optional[str] = None,
        tag: Optional[str] = None,
        sort: str = "new",
    ) -> List[Article]:
        offset = (page - 1) * per_page
        return await self.repo.get_published(
            offset=offset, limit=per_page, section=section, tag=tag, sort=sort
        )

    async def get_by_slug(self, slug: str) -> Optional[Article]:
        return await self.repo.get_by_slug_published(slug)

    async def list_related(self, slug: str, limit: int = 3) -> List[Article]:
        """Свежие опубликованные статьи, кроме текущей (для блока «Читайте по теме»)."""
        return await self.repo.get_related(exclude_slug=slug, limit=limit)

    async def get_by_id(self, article_id: int) -> Optional[Article]:
        return await self.repo.get(article_id)

    async def list_all_admin(self, page: int = 1, per_page: int = 20) -> List[Article]:
        offset = (page - 1) * per_page
        return await self.repo.get_all_admin(offset=offset, limit=per_page)

    async def count_all(self) -> int:
        return await self.repo.count_all()

    async def _resolve_tags(self, names: list[str]) -> list[Tag]:
        """Находит или создаёт теги по имени. Возвращает список без дублей.

        Устойчив к гонке: если параллельный запрос уже вставил тег с тем же slug
        (UniqueViolation), повторно выбираем его из БД вместо падения с 500."""
        names = [n.strip() for n in names if n and n.strip()]
        if not names:
            return []
        slugs = {_slugify(n): n for n in names}

        # выбираем уже существующие теги по slug
        result = await self.session.execute(
            select(Tag).where(Tag.slug.in_(list(slugs.keys())))
        )
        existing = {t.slug: t for t in result.scalars().all()}

        tags = []
        for slug, name in slugs.items():
            tag = existing.get(slug)
            if tag is None:
                tag = await self._create_tag_safely(name, slug)
            tags.append(tag)
        return tags

    async def _create_tag_safely(self, name: str, slug: str) -> Tag:
        """Создаёт тег в отдельном savepoint; при конфликте slug — перевыбор.

        Использует begin_nested() — это SAVEPOINT в БД, который откатывает
        только INSERT тега, не трогая остальную транзакцию (например, саму
        статью, созданную до вызова этого метода).
        """
        from sqlalchemy.exc import IntegrityError

        try:
            async with self.session.begin_nested():
                tag = Tag(name=name, slug=slug)
                self.session.add(tag)
                await self.session.flush()
                return tag
        except IntegrityError:
            pass

        # Конфликт slug — перевыбираем существующий тег
        result = await self.session.execute(
            select(Tag).where(Tag.slug == slug)
        )
        tag = result.scalars().first()
        if tag is None:
            raise RuntimeError(f"Тег со slug={slug} не найден после конфликта")
        return tag

    async def create_article(self, data: ArticleCreate) -> Article:
        article_data = {
            "title": data.title,
            "slug": data.slug,
            "subtitle": data.subtitle,
            "body": data.body,
            "author_id": data.author_id,
            "status": data.status,
            "section": data.section or None,
            "cover_image_url": data.cover_image_url,
        }
        if data.status == "published":
            article_data["published_at"] = datetime.now(timezone.utc)

        article = await self.repo.create(article_data)

        # Создаём сноски
        for fn in data.footnotes:
            footnote = Footnote(article_id=article.id, number=fn.number, text=fn.text)
            self.session.add(footnote)

        # Создаём изображения
        for img in data.images:
            image = ArticleImage(
                article_id=article.id,
                url=img.url,
                caption=img.caption,
                position=img.position,
            )
            self.session.add(image)

        # Теги (многие-ко-многим, найти или создать)
        if data.tags:
            tag_names = [t.name for t in data.tags]
            article.tags = await self._resolve_tags(tag_names)

        await self.session.commit()
        await self.session.refresh(article)
        return article

    async def update_article(
        self, article_id: int, data: ArticleUpdate
    ) -> Optional[Article]:
        update_data = data.model_dump(exclude_unset=True)

        # Обрабатываем вложенные коллекции отдельно
        footnotes_data = update_data.pop("footnotes", None)
        images_data = update_data.pop("images", None)
        tags_data = update_data.pop("tags", None)

        # Если статус сменился на published, выставляем published_at
        if update_data.get("status") == "published":
            article = await self.repo.get(article_id)
            if article and article.published_at is None:
                update_data["published_at"] = datetime.now(timezone.utc)

        article = await self.repo.update(article_id, update_data)
        if article is None:
            return None

        # Заменяем сноски, если они переданы
        if footnotes_data is not None:
            await self.session.execute(
                sql_delete(Footnote).where(Footnote.article_id == article_id)
            )
            for fn in footnotes_data:
                footnote = Footnote(
                    article_id=article_id, number=fn["number"], text=fn["text"]
                )
                self.session.add(footnote)

        # Заменяем изображения, если они переданы
        if images_data is not None:
            await self.session.execute(
                sql_delete(ArticleImage).where(ArticleImage.article_id == article_id)
            )
            for img in images_data:
                image = ArticleImage(
                    article_id=article_id,
                    url=img["url"],
                    caption=img.get("caption"),
                    position=img.get("position", 0),
                )
                self.session.add(image)

        # Заменяем теги, если они переданы
        if tags_data is not None:
            tag_names = [t["name"] for t in tags_data]
            article.tags = await self._resolve_tags(tag_names)

        await self.session.commit()
        await self.session.refresh(article)
        return article

    async def delete_article(self, article_id: int) -> bool:
        deleted = await self.repo.delete(article_id)
        if deleted:
            await self.session.commit()
        return deleted
