from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.sections import SECTIONS
from app.models.article import Article
from app.models.tag import Tag
from app.schemas.article import ArticleListItem, ArticleRead
from app.schemas.meta import SectionCount, TagCount
from app.services.article import ArticleService

router = APIRouter(prefix="/api/articles", tags=["articles"])


def _to_list_item(a: Article) -> ArticleListItem:
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
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    articles = await service.list_published(
        page=page, per_page=per_page, section=section, tag=tag
    )
    return [_to_list_item(a) for a in articles]


@router.get("/{slug}", response_model=ArticleRead)
async def get_article(slug: str, db: AsyncSession = Depends(get_db)):
    service = ArticleService(db)
    article = await service.get_by_slug(slug)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


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
