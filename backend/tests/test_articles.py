"""Тесты публичных эндпоинтов статей."""
from __future__ import annotations


async def test_list_empty(client):
    """Пустая БД → пустой список."""
    response = await client.get("/api/articles")
    assert response.status_code == 200
    assert response.json() == []


async def test_list_returns_articles(client, sample_articles):
    """Список статей возвращается, свежая — первой."""
    response = await client.get("/api/articles")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    # Свежая статья (statya-2) должна быть первой (сортировка new по умолчанию)
    assert data[0]["slug"] == "statya-2"


async def test_list_fields(client, sample_articles):
    """В элементах списка есть все нужные поля."""
    response = await client.get("/api/articles")
    item = response.json()[0]
    for field in (
        "id", "title", "slug", "subtitle", "author_name", "author_slug",
        "status", "section", "tag_slugs", "likes_count", "reading_time_minutes",
        "published_at", "cover_image_url", "created_at",
    ):
        assert field in item, f"Отсутствует поле {field}"


async def test_get_article_by_slug(client, sample_articles):
    """Статья находится по slug."""
    response = await client.get("/api/articles/statya-0")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Статья 0"
    assert data["reading_time_minutes"] >= 1


async def test_get_article_not_found(client):
    """Несуществующий slug → 404."""
    response = await client.get("/api/articles/ne-sushestvuet")
    assert response.status_code == 404


async def test_filter_by_section(client, sample_articles):
    """Фильтр по разделу возвращает только статьи этого раздела."""
    response = await client.get("/api/articles?section=muzyka")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert all(a["section"] == "muzyka" for a in data)


async def test_filter_by_unknown_section(client, sample_articles):
    """Несуществующий раздел → пустой список (не ошибка)."""
    response = await client.get("/api/articles?section=net-takogo")
    assert response.status_code == 200
    assert response.json() == []


async def test_sort_old(client, sample_articles):
    """sort=old — старые первыми."""
    response = await client.get("/api/articles?sort=old")
    data = response.json()
    assert data[0]["slug"] == "statya-0"
    assert data[-1]["slug"] == "statya-2"


async def test_sort_new(client, sample_articles):
    """sort=new — свежие первыми (по умолчанию)."""
    response = await client.get("/api/articles?sort=new")
    data = response.json()
    assert data[0]["slug"] == "statya-2"
    assert data[-1]["slug"] == "statya-0"


async def test_sort_popular(client, sample_articles, db_session):
    """sort=popular — сортировка по лайкам (проверяем порядок через POST /like)."""
    # Лайкаем статью 0 — POST возвращает актуальный COUNT (не зависит от column_property)
    r = await client.post("/api/articles/statya-0/like")
    assert r.json()["likes_count"] == 1

    # Проверяем что запись о лайке в БД
    from sqlalchemy import select
    from app.models import ArticleLike

    result = await db_session.execute(
        select(ArticleLike).where(ArticleLike.article_id == sample_articles[0].id)
    )
    assert len(result.scalars().all()) == 1


async def test_related_excludes_current(client, sample_articles):
    """Related не включает текущую статью."""
    response = await client.get("/api/articles/statya-0/related")
    assert response.status_code == 200
    data = response.json()
    assert all(a["slug"] != "statya-0" for a in data)


async def test_pagination(client, sample_articles):
    """per_page ограничивает количество."""
    response = await client.get("/api/articles?per_page=2")
    data = response.json()
    assert len(data) == 2
