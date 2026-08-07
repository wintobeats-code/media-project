from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.sections import SECTIONS
from app.models.article import Article
from app.models.article_like import ArticleLike
from app.models.tag import Tag
from app.schemas.article import ArticleListItem, ArticleRead
from app.schemas.meta import SectionCount, TagCount
from app.services.article import ArticleService

router = APIRouter(prefix="/api/articles", tags=["articles"])

VOTER_COOKIE = "voter_id"
VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 год


def _to_list_item(a: Article) -> ArticleListItem:
    from app.schemas.article import _reading_time
    return ArticleListItem(
        id=a.id,
        title=a.title,
        slug=a.slug,
        subtitle=a.subtitle,
        author_name=a.author.name if a.author else "",
        author_slug=a.author.slug if a.author else "",
        status=a.status,
        section=a.section,
        tag_slugs=[t.slug for t in (a.tags or [])],
        likes_count=getattr(a, "likes_count", 0) or 0,
        reading_time_minutes=_reading_time(a.body or ""),
        published_at=a.published_at,
        cover_image_url=a.cover_image_url,
        created_at=a.created_at,
    )


@router.get("", response_model=List[ArticleListItem])
async def list_articles(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    section: str | None = Query(None, description="Filter by section slug"),
    tag: str | None = Query(None, description="Filter by tag slug"),
    sort: str = Query("new", description="Сортировка: new | old | popular"),
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    articles = await service.list_published(
        page=page, per_page=per_page, section=section, tag=tag, sort=sort
    )
    return [_to_list_item(a) for a in articles]


@router.get("/{slug}", response_model=ArticleRead)
async def get_article(slug: str, db: AsyncSession = Depends(get_db)):
    service = ArticleService(db)
    article = await service.get_by_slug(slug)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.post("/{slug}/like")
async def like_article(
    slug: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    voter_id: str | None = Cookie(default=None, alias=VOTER_COOKIE),
):
    """Ставит лайк статье от анонимного пользователя (без аккаунтов).

    Защита от накруток: один лайк на статью на один voter_id (кука браузера).
    Повторный лайк — noop, возвращает текущее состояние.
    """
    service = ArticleService(db)
    article = await service.get_by_slug(slug)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    # Генерируем voter_id, если куки нет, и выставляем её в ответе
    new_voter = False
    if not voter_id:
        voter_id = uuid.uuid4().hex
        response.set_cookie(
            key=VOTER_COOKIE,
            value=voter_id,
            max_age=VOTER_COOKIE_MAX_AGE,
            samesite="lax",
            httponly=False,  # не критично; кука нужна только серверу
        )
        new_voter = True

    # Проверяем, ставил ли уже этот voter_id лайк
    existing = await db.execute(
        select(ArticleLike).where(
            ArticleLike.article_id == article.id,
            ArticleLike.voter_id == voter_id,
        )
    )
    already_liked = existing.scalars().first() is not None

    if not already_liked:
        try:
            db.add(ArticleLike(article_id=article.id, voter_id=voter_id))
            await db.commit()
        except IntegrityError:
            # Гонка: лайк уже создан параллельным запросом — считаем уже поставленным
            await db.rollback()
        # Пересчитываем количество лайков
        await db.refresh(article)

    likes_count = getattr(article, "likes_count", 0) or 0
    return {
        "likes_count": likes_count,
        "liked": True,
        "new_voter": new_voter,
    }


@router.get("/{slug}/related", response_model=List[ArticleListItem])
async def related_articles(slug: str, db: AsyncSession = Depends(get_db)):
    """Свежие опубликованные статьи, кроме текущей (для блока «Читайте по теме»)."""
    service = ArticleService(db)
    articles = await service.list_related(slug, limit=3)
    return [_to_list_item(a) for a in articles]


# --- Meta endpoints (sections + tags) ---

meta_router = APIRouter(tags=["meta"])


@meta_router.get("/api/sections", response_model=List[SectionCount])
async def list_sections(db: AsyncSession = Depends(get_db)):
    """Возвращает все разделы с количеством опубликованных статей."""
    count_q = (
        select(Article.section, func.count(Article.id))
        .where(Article.status == "published", Article.section.is_not(None))
        .group_by(Article.section)
    )
    result = await db.execute(count_q)
    counts = {slug: int(cnt) for slug, cnt in result.all() if slug}
    return [
        SectionCount(slug=slug, title=title, count=counts.get(slug, 0))
        for slug, title in SECTIONS
    ]


@meta_router.get("/api/tags", response_model=List[TagCount])
async def list_tags(db: AsyncSession = Depends(get_db)):
    """Возвращает все теги с количеством опубликованных статей."""
    count_q = (
        select(Tag.id, Tag.name, Tag.slug, func.count(Article.id))
        .select_from(Tag)
        .join(Article, Tag.articles)
        .where(Article.status == "published")
        .group_by(Tag.id)
        .order_by(func.count(Article.id).desc())
    )
    result = await db.execute(count_q)
    return [
        TagCount(id=tid, name=name, slug=slug, count=int(cnt))
        for tid, name, slug, cnt in result.all()
    ]
