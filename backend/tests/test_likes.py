"""Тесты лайков статей."""
from __future__ import annotations


async def test_like_first_time(client, sample_articles):
    """Первый лайк: счётчик = 1, кука voter_id выставляется."""
    response = await client.post("/api/articles/statya-0/like")
    assert response.status_code == 200
    data = response.json()
    assert data["likes_count"] == 1
    assert data["liked"] is True
    assert data["new_voter"] is True
    assert "voter_id" in response.cookies


async def test_like_idempotent_same_voter(client, sample_articles):
    """Повторный лайк с той же кукой — счётчик не растёт."""
    r1 = await client.post("/api/articles/statya-0/like")
    voter_id = r1.cookies["voter_id"]

    r2 = await client.post(
        "/api/articles/statya-0/like",
        cookies={"voter_id": voter_id},
    )
    assert r2.status_code == 200
    assert r2.json()["likes_count"] == 1  # не стало 2


async def test_like_persisted_in_db(client, sample_articles, db_session):
    """После двух лайков от разных voter_id — в БД две записи ArticleLike."""
    from sqlalchemy import select

    from app.models import ArticleLike

    # Первый лайк (кука voter_id сохранится в клиенте)
    await client.post("/api/articles/statya-0/like")
    # Второй лайк от другого «пользователя» — чистим куку
    client.cookies.clear()
    await client.post("/api/articles/statya-0/like")

    result = await db_session.execute(
        select(ArticleLike).where(ArticleLike.article_id == sample_articles[0].id)
    )
    likes = result.scalars().all()
    assert len(likes) == 2  # два разных voter_id


async def test_like_unknown_article(client):
    """Лайк несуществующей статьи → 404."""
    response = await client.post("/api/articles/net-takoj/like")
    assert response.status_code == 404


async def test_like_count_via_api(client, sample_articles):
    """POST /like возвращает актуальный likes_count (через явный COUNT)."""
    r1 = await client.post("/api/articles/statya-0/like")
    assert r1.json()["likes_count"] == 1

    # Второй лайк от другого voter_id — чистим куку клиента
    client.cookies.clear()
    r2 = await client.post("/api/articles/statya-0/like")
    assert r2.json()["likes_count"] == 2
