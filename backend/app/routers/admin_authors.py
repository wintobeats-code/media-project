from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentAdmin
from app.schemas.author import AuthorCreate, AuthorRead, AuthorUpdate
from app.services.author import AuthorService

router = APIRouter(prefix="/api/admin/authors", tags=["admin-authors"])


@router.get("", response_model=List[AuthorRead])
async def list_authors(
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = AuthorService(db)
    return await service.list_authors()


@router.post("", response_model=AuthorRead, status_code=201)
async def create_author(
    data: AuthorCreate,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = AuthorService(db)
    try:
        return await service.create_author(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{author_id}", response_model=AuthorRead)
async def get_author(
    author_id: int,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = AuthorService(db)
    author = await service.get_author(author_id)
    if author is None:
        raise HTTPException(status_code=404, detail="Author not found")
    return author


@router.put("/{author_id}", response_model=AuthorRead)
async def update_author(
    author_id: int,
    data: AuthorUpdate,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = AuthorService(db)
    author = await service.update_author(author_id, data)
    if author is None:
        raise HTTPException(status_code=404, detail="Author not found")
    return author


@router.delete("/{author_id}", status_code=204)
async def delete_author(
    author_id: int,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    service = AuthorService(db)
    deleted = await service.delete_author(author_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Author not found")
