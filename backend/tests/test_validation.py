"""Тесты валидации схем: status и section (Literal)."""
from __future__ import annotations


async def _create_article(client, token, **overrides):
    """Вспомогательная функция: создаёт статью с заданными полями."""
    payload = {
        "title": "Тест валидации",
        "slug": "test-valid",
        "body": "Текст для проверки.",
        "author_id": 1,
        "status": "draft",
    }
    payload.update(overrides)
    return await client.post(
        "/api/admin/articles",
        json=payload,
        cookies={"access_token": f"Bearer {token}"},
    )


async def test_invalid_status_rejected(client, admin_token, sample_author):
    """Недопустимый status → 422."""
    response = await _create_article(
        client, admin_token, author_id=sample_author.id, status="archived"
    )
    assert response.status_code == 422


async def test_invalid_section_rejected(client, admin_token, sample_author):
    """Несуществующий раздел → 422."""
    response = await _create_article(
        client, admin_token, author_id=sample_author.id, section="hacked"
    )
    assert response.status_code == 422


async def test_valid_section_accepted(client, admin_token, sample_author):
    """Корректный раздел проходит валидацию → 201."""
    response = await _create_article(
        client, admin_token,
        author_id=sample_author.id,
        slug="test-valid-section",
        section="moda",
    )
    assert response.status_code == 201
    assert response.json()["section"] == "moda"


async def test_empty_section_accepted(client, admin_token, sample_author):
    """Пустой раздел (без раздела) проходит валидацию → 201."""
    response = await _create_article(
        client, admin_token,
        author_id=sample_author.id,
        slug="test-no-section",
        section="",
    )
    assert response.status_code == 201
    assert response.json()["section"] is None


async def test_missing_required_fields(client, admin_token):
    """Отсутствие обязательных полей → 422."""
    response = await client.post(
        "/api/admin/articles",
        json={"title": "Без slug и body"},
        cookies={"access_token": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422
