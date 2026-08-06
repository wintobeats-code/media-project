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

TRACK_KEY = "track_of_day"


def extract_embed_url(raw: str) -> str | None:
    """Извлекает embed-URL Яндекс Музыки из произвольного ввода редактора.

    Поддерживаемые форматы:
      1. Готовый HTML-код вставки (из «Поделиться» Яндекса) — берём src из iframe:
         <iframe ... src="https://music.yandex.ru/iframe/#track/..."></iframe>
      2. Готовая embed-ссылка: https://music.yandex.ru/iframe/#track/<album>/<track>
      3. Обычная ссылка трека: https://music.yandex.ru/album/<album>/track/<track>

    Возвращает embed-URL или None.
    """
    if not raw:
        return None
    raw = raw.strip()

    # 1) HTML-код: ищем src iframe, который ведёт на music.yandex.ru/iframe
    m = re.search(
        r'src=["\'](https?://music\.yandex\.ru/iframe/#track/[^"\']+)["\']',
        raw,
    )
    if m:
        return m.group(1)

    # 2) Уже embed-ссылка
    m = re.search(r"music\.yandex\.ru/iframe/#track/(\d+)/(\d+)", raw)
    if m:
        return f"https://music.yandex.ru/iframe/#track/{m.group(1)}/{m.group(2)}"

    # 3) Обычная ссылка трека: .../album/<album>/track/<track>
    m = re.search(r"/album/(\d+)/track/(\d+)", raw)
    if m:
        return f"https://music.yandex.ru/iframe/#track/{m.group(1)}/{m.group(2)}"

    return None


class TrackOut(BaseModel):
    # Что ввёл редактор (HTML-код или ссылка) и извлечённый embed-URL.
    value: str
    embed_url: str | None = None


class TrackIn(BaseModel):
    # HTML-код вставки (из «Поделиться» Яндекса) или прямая ссылка.
    value: str


@router.get("/track", response_model=TrackOut)
async def get_track(db: AsyncSession = Depends(get_db)):
    """Текущий «Трек дня» (публичный)."""
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == TRACK_KEY)
    )
    setting = result.scalars().first()
    value = setting.value if setting else ""
    return TrackOut(value=value, embed_url=extract_embed_url(value))


@router.put("/track", response_model=TrackOut)
async def set_track(
    data: TrackIn,
    admin: CurrentAdmin,
    db: AsyncSession = Depends(get_db),
):
    """Сохранить «Трек дня» (только админ).

    Принимает HTML-код вставки Яндекса или прямую ссылку на трек.
    """
    value = (data.value or "").strip()
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == TRACK_KEY)
    )
    setting = result.scalars().first()
    if setting is None:
        setting = SiteSetting(key=TRACK_KEY, value=value)
        db.add(setting)
    else:
        setting.value = value
    await db.commit()
    return TrackOut(value=value, embed_url=extract_embed_url(value))
