from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.article import ArticleService

router = APIRouter(tags=["rss"])


def _xml_escape(s: str) -> str:
    """Экранирование XML-спецсимволов."""
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _rfc822(dt: datetime | None) -> str:
    """Дата в формате RFC 822 (требование RSS 2.0)."""
    if not dt:
        return ""
    return dt.strftime("%a, %d %b %Y %H:%M:%S +0000")


@router.get("/rss.xml")
async def rss_feed(request: Request, db: AsyncSession = Depends(get_db)):
    """RSS-фид последних опубликованных статей."""
    service = ArticleService(db)
    articles = await service.list_published(page=1, per_page=20)

    # Базовый URL сайта (для абсолютных ссылок)
    base_url = str(request.base_url).rstrip("/")

    items_xml = []
    for a in articles:
        link = f"{base_url}/article.html?slug={a.slug}"
        description = a.subtitle or ""
        cover = ""
        if a.cover_image_url:
            cover_url = a.cover_image_url if a.cover_image_url.startswith("http") else f"{base_url}{a.cover_image_url}"
            description = f'<img src="{_xml_escape(cover_url)}" alt=""/><br/>{_xml_escape(description)}'
        items_xml.append(f"""
    <item>
      <title>{_xml_escape(a.title)}</title>
      <link>{_xml_escape(link)}</link>
      <guid isPermaLink="true">{_xml_escape(link)}</guid>
      <description>{_xml_escape(description)}</description>
      <pubDate>{_rfc822(a.published_at or a.created_at)}</pubDate>
    </item>""")

    last_build = articles[0].published_at or articles[0].created_at if articles else datetime.now(timezone.utc)

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>БОГЕМА</title>
    <link>{_xml_escape(base_url)}</link>
    <description>Свежие материалы журнала БОГЕМА</description>
    <language>ru</language>
    <lastBuildDate>{_rfc822(last_build)}</lastBuildDate>
    {''.join(items_xml)}
  </channel>
</rss>"""

    return Response(content=xml, media_type="application/rss+xml; charset=utf-8")
