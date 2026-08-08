from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentAdmin
from app.schemas.article import (
    ArticleCreate,
    ArticleListItem,
    ArticleRead,
    ArticleUpdate,
    article_to_list_item,
)
from app.services.article import ArticleService

router = APIRouter(prefix="/api/admin/articles", tags=["admin-articles"])


@router.get("", response_model=List[ArticleListItem])
async def list_articles(
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    articles = await service.list_all_admin(page=page, per_page=per_page)
    return [article_to_list_item(a) for a in articles]


@router.post("", response_model=ArticleRead, status_code=201)
async def create_article(
    data: ArticleCreate,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    try:
        return await service.create_article(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{article_id}", response_model=ArticleRead)
async def get_article(
    article_id: int,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    article = await service.get_by_id(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.put("/{article_id}", response_model=ArticleRead)
async def update_article(
    article_id: int,
    data: ArticleUpdate,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    article = await service.update_article(article_id, data)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.delete("/{article_id}", status_code=204)
async def delete_article(
    article_id: int,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    deleted = await service.delete_article(article_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Article not found")
