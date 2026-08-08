from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SiteSetting(Base):
    """Глобальные настройки сайта (key-value).

    Сейчас используется для хранения «Трека дня» (ключ track_of_day).
    Таблица создастся автоматически через create_all при старте.
    """

    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
