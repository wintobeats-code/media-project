from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from app.routers import (
    admin_articles,
    admin_auth,
    admin_authors,
    admin_images,
    admin_ui,
    articles,
    rss,
    settings as settings_router,
)

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
FRONTEND_DIR = settings.frontend_path


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаём таблицы при старте (для dev; в проде — Alembic).
    # create_all создаёт только НЕ существующие таблицы и не меняет
    # существующие. Поэтому новые таблицы (tags, article_tags) создаются
    # здесь автоматически, а колонка `section` на существующей таблице
    # `articles` добавляется явно идемпотентным ALTER (см. ниже).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Идемпотентное добавление колонки (PostgreSQL поддерживает
        # ADD COLUMN IF NOT EXISTS).
        await conn.execute(
            text("ALTER TABLE articles ADD COLUMN IF NOT EXISTS section VARCHAR(50)")
        )

    # Гарантируем существование папки для загруженных файлов
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Защита: в продакшене слабый SECRET_KEY блокирует запуск.
    # В dev — предупреждение в логах.
    import os
    if settings.SECRET_KEY.startswith("change-me"):
        if os.environ.get("ENV") == "production":
            raise RuntimeError(
                "SECRET_KEY содержит значение по умолчанию. "
                "Задайте надёжный ключ в переменной окружения SECRET_KEY."
            )
        import logging
        logging.getLogger("app.main").warning(
            "ВНИМАНИЕ: SECRET_KEY содержит значение по умолчанию. "
            "Задайте надёжный ключ перед публикацией."
        )

    yield


app = FastAPI(
    title="БОГЕМА CMS",
    description="Backend для интернет-СМИ «БОГЕМА»",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def no_cache_assets(request, call_next):
    """Отключает кеширование браузером /assets/ при разработке, чтобы
    изменения JS/CSS всегда применялись без ручного сброса кеша."""
    response = await call_next(request)
    if request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

# Гарантируем существование папки загрузок перед монтированием статики
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Раздаём загруженные файлы
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Публичное API
app.include_router(articles.router)
app.include_router(articles.meta_router)
app.include_router(settings_router.router)
app.include_router(rss.router)

# API админки
app.include_router(admin_auth.router)
app.include_router(admin_authors.router)
app.include_router(admin_articles.router)
app.include_router(admin_images.router)

# UI админки (серверный рендеринг)
app.include_router(admin_ui.router)

# Раздаём публичный фронтенд как корневую статику. Монтируем ПОСЛЕДНИМ,
# чтобы не перехватывать /uploads, /api/* и /admin/*. `html=True` отдаёт
# index.html для корневого пути и запросов каталогов.
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    import logging

    logging.getLogger("app.main").warning(
        "Каталог фронтенда не найден в %s; монтирование статики пропущено.", FRONTEND_DIR
    )
