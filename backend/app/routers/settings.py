from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentAdmin
from app.models.site_setting import SiteSetting

router = APIRouter(prefix="/api/settings", tags=["settings"])

TRACK_KEY = "track_of_day_url"


def parse_yandex_embed(url: str) -> str | None:
    """Превращает ссылку на трек Яндекс Музыки в embed-URL для iframe.

    Поддерживаемые форматы входной ссылки:
      - https://music.yandex.ru/album/<album_id>/track/<track_id>
      - https://music.yandex.ru/track/<track_id> (без альбома — не подходит для embed)
      - уже готовый embed: https://music.yandex.ru/iframe/#track/<album>/<track>
    Возвращает embed-URL или None, если ссылку не удалось разобрать.
    """
    if not url:
        return None
    url = url.strip()

    # Уже embed-ссылка
    m = re.search(r"iframe/#track/(\d+)/(\d+)", url)
    if m:
        return f"https://music.yandex.ru/iframe/#track/{m.group(1)}/{m.group(2)}"

    # Обычная ссылка трека: .../album/<album_id>/track/<track_id>
    m = re.search(r"/album/(\d+)/track/(\d+)", url)
    if m:
        return f"https://music.yandex.ru/iframe/#track/{m.group(1)}/{m.group(2)}"

    return None


class TrackOut(BaseModel):
    url: str
    embed_url: str | None = None


class TrackIn(BaseModel):
    url: str


@router.get("/track", response_model=TrackOut)
async def get_track(db: AsyncSession = Depends(get_db)):
    """Текущий «Трек дня» (публичный)."""
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == TRACK_KEY)
    )
    setting = result.scalars().first()
    url = setting.value if setting else ""
    return TrackOut(url=url, embed_url=parse_yandex_embed(url))


@router.put("/track", response_model=TrackOut)
async def set_track(
    data: TrackIn,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    """Сохранить «Трек дня» (только админ)."""
    url = (data.url or "").strip()
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == TRACK_KEY)
    )
    setting = result.scalars().first()
    if setting is None:
        setting = SiteSetting(key=TRACK_KEY, value=url)
        db.add(setting)
    else:
        setting.value = url
    await db.commit()
    return TrackOut(url=url, embed_url=parse_yandex_embed(url))
