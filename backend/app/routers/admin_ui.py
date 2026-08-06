from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_admin_from_cookie
from app.core.sections import SECTIONS
from app.services.article import ArticleService
from app.services.author import AuthorService

router = APIRouter(tags=["admin-ui"])
templates = Jinja2Templates(directory="app/templates")


def _require_admin(request: Request) -> str:
    admin = get_admin_from_cookie(request)
    if not admin:
        raise HTTPException(status_code=303, headers={"Location": "/admin/login"})
    return admin


@router.get("/admin/login", response_class=HTMLResponse)
async def admin_login_page(request: Request):
    admin = get_admin_from_cookie(request)
    if admin:
        return RedirectResponse("/admin", status_code=303)
    return templates.TemplateResponse("admin/login.html", {"request": request})


@router.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    article_service = ArticleService(db)
    author_service = AuthorService(db)
    articles_count = await article_service.count_all()
    authors = await author_service.list_authors(limit=1000)
    # Текущий «Трек дня» для формы
    from sqlalchemy import select

    from app.models.site_setting import SiteSetting

    track_row = await db.execute(
        select(SiteSetting).where(SiteSetting.key == "track_of_day_url")
    )
    track_setting = track_row.scalars().first()
    return templates.TemplateResponse(
        "admin/dashboard.html",
        {
            "request": request,
            "articles_count": articles_count,
            "authors_count": len(authors),
            "track_url": track_setting.value if track_setting else "",
        },
    )


@router.get("/admin/articles", response_class=HTMLResponse)
async def admin_articles_list(request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    service = ArticleService(db)
    articles = await service.list_all_admin(page=1, per_page=100)
    return templates.TemplateResponse(
        "admin/articles.html",
        {
            "request": request,
            "articles": articles,
        },
    )


@router.get("/admin/articles/new", response_class=HTMLResponse)
async def admin_article_new(request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    author_service = AuthorService(db)
    authors = await author_service.list_authors(limit=100)
    return templates.TemplateResponse(
        "admin/article_form.html",
        {
            "request": request,
            "article": None,
            "authors": authors,
            "sections": SECTIONS,
            "is_edit": False,
        },
    )


@router.get("/admin/articles/{article_id}/edit", response_class=HTMLResponse)
async def admin_article_edit(
    request: Request,
    article_id: int,
    db: AsyncSession = Depends(get_db),
):
    _require_admin(request)
    service = ArticleService(db)
    article = await service.get_by_id(article_id)
    if article is None:
        raise HTTPException(status_code=404)
    author_service = AuthorService(db)
    authors = await author_service.list_authors(limit=100)
    return templates.TemplateResponse(
        "admin/article_form.html",
        {
            "request": request,
            "article": article,
            "authors": authors,
            "sections": SECTIONS,
            "is_edit": True,
        },
    )


@router.post("/admin/articles/{article_id}/delete")
async def admin_article_delete(
    request: Request,
    article_id: int,
    db: AsyncSession = Depends(get_db),
):
    _require_admin(request)
    service = ArticleService(db)
    await service.delete_article(article_id)
    return RedirectResponse("/admin/articles", status_code=303)


@router.get("/admin/authors", response_class=HTMLResponse)
async def admin_authors_list(request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    service = AuthorService(db)
    authors = await service.list_authors(limit=100)
    return templates.TemplateResponse(
        "admin/authors.html",
        {
            "request": request,
            "authors": authors,
        },
    )


@router.get("/admin/authors/new", response_class=HTMLResponse)
async def admin_author_new(request: Request):
    _require_admin(request)
    return templates.TemplateResponse(
        "admin/author_form.html",
        {
            "request": request,
            "author": None,
            "is_edit": False,
        },
    )


@router.get("/admin/authors/{author_id}/edit", response_class=HTMLResponse)
async def admin_author_edit(
    request: Request,
    author_id: int,
    db: AsyncSession = Depends(get_db),
):
    _require_admin(request)
    service = AuthorService(db)
    author = await service.get_author(author_id)
    if author is None:
        raise HTTPException(status_code=404)
    return templates.TemplateResponse(
        "admin/author_form.html",
        {
            "request": request,
            "author": author,
            "is_edit": True,
        },
    )


@router.post("/admin/authors/{author_id}/delete")
async def admin_author_delete(
    request: Request,
    author_id: int,
    db: AsyncSession = Depends(get_db),
):
    _require_admin(request)
    service = AuthorService(db)
    await service.delete_author(author_id)
    return RedirectResponse("/admin/authors", status_code=303)
