"""Тесты аутентификации и защиты админ-эндпоинтов."""
from __future__ import annotations


async def test_admin_articles_require_auth(client):
    """Админ-эндпоинт без токена → 401."""
    response = await client.get("/api/admin/articles")
    assert response.status_code == 401


async def test_admin_create_requires_auth(client, sample_author):
    """Создание статьи без токена → 401."""
    response = await client.post(
        "/api/admin/articles",
        json={
            "title": "Без auth",
            "slug": "bez-auth",
            "body": "текст",
            "author_id": sample_author.id,
        },
    )
    assert response.status_code == 401


async def test_login_success(client):
    """Правильный логин → 200 + access_token."""
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client):
    """Неверный пароль → 401."""
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401


async def test_login_wrong_username(client):
    """Несуществующий пользователь → 401."""
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": "hacker", "password": "admin123"},
    )
    assert response.status_code == 401


async def test_admin_endpoints_with_token(client, admin_token, sample_articles):
    """С токеном админ-эндпоинт доступен."""
    response = await client.get(
        "/api/admin/articles",
        cookies={"access_token": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()) >= 3


async def test_token_from_cookie_works(client, admin_token, sample_articles):
    """Токен из куки access_token авторизует запрос (cookie-fallback)."""
    response = await client.get(
        "/api/admin/articles",
        cookies={"access_token": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
