"""Фикстуры для тестов.

Каждый тест получает чистую in-memory SQLite БД и HTTP-клиент,
который ходит в FastAPI-приложение напрямую (без запуска сервера).
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403 — регистрирует все модели в Base.metadata

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_engine():
    """Движок тестовой БД (SQLite in-memory). Все таблицы создаются перед тестом."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    """Изолированная сессия к тестовой БД."""
    session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    """HTTP-клиент с переопределённой зависимостью get_db.

    Все эндпоинты будут использовать тестовую SQLite вместо боевой PostgreSQL.
    """
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------- Тестовые данные ----------


@pytest_asyncio.fixture
async def sample_author(db_session):
    """Создаёт одного автора."""
    from app.models import Author

    author = Author(name="Тест Автор", slug="test-avtor", bio="Биография")
    db_session.add(author)
    await db_session.commit()
    await db_session.refresh(author)
    return author


@pytest_asyncio.fixture
async def sample_articles(db_session, sample_author):
    """Создаёт 3 опубликованные статьи (index 0 — самая старая, 2 — самая свежая)."""
    from app.models import Article

    articles = []
    for i in range(3):
        a = Article(
            title=f"Статья {i}",
            slug=f"statya-{i}",
            subtitle=f"Подзаголовок {i}",
            body=f"Текст статьи номер {i}. " * 50,
            author_id=sample_author.id,
            status="published",
            section="muzyka" if i % 2 == 0 else "moda",
            published_at=datetime(2026, 1, i + 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        db_session.add(a)
        articles.append(a)
    await db_session.commit()
    for a in articles:
        await db_session.refresh(a)
    return articles


@pytest_asyncio.fixture
async def admin_token(client):
    """Логинится админом и возвращает токен для авторизованных запросов."""
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    return response.json()["access_token"]
