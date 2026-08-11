"""Тесты мета-эндпоинтов: разделы, теги, RSS."""
from __future__ import annotations


async def test_sections_list(client):
    """Список разделов содержит Мода и Музыка."""
    response = await client.get("/api/sections")
    assert response.status_code == 200
    data = response.json()
    slugs = [s["slug"] for s in data]
    assert "moda" in slugs
    assert "muzyka" in slugs
    for s in data:
        assert "title" in s
        assert "count" in s


async def test_sections_counts(client, sample_articles):
    """Счётчики статей по разделам корректны."""
    response = await client.get("/api/sections")
    data = {s["slug"]: s["count"] for s in response.json()}
    # 2 статьи в muzyka (index 0 и 2), 1 в moda (index 1)
    assert data["muzyka"] == 2
    assert data["moda"] == 1


async def test_tags_empty(client):
    """Без тегов — пустой список."""
    response = await client.get("/api/tags")
    assert response.status_code == 200
    assert response.json() == []


async def test_tags_with_data(client, sample_articles, db_session):
    """Теги показываются с количеством статей."""
    from app.models import Tag

    tag = Tag(name="рок", slug="rok")
    db_session.add(tag)
    await db_session.flush()
    # Привязываем тег к статье через связь many-to-many
    sample_articles[0].tags.append(tag)
    await db_session.commit()

    response = await client.get("/api/tags")
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "рок"
    assert data[0]["slug"] == "rok"
    assert data[0]["count"] == 1


async def test_rss_xml(client, sample_articles):
    """RSS-фид — валидный XML с статьями."""
    response = await client.get("/rss.xml")
    assert response.status_code == 200
    assert "xml" in response.headers.get("content-type", "")
    body = response.text
    assert "<?xml" in body
    assert "<rss" in body
    assert "Статья 0" in body
    assert "Статья 2" in body
    assert "<item>" in body


async def test_rss_empty(client):
    """RSS без статей — валидный пустой фид."""
    response = await client.get("/rss.xml")
    assert response.status_code == 200
    assert "<rss" in response.text
    assert "<item>" not in response.text


async def test_track_empty(client):
    """Трек дня без настройки — пустой url."""
    response = await client.get("/api/settings/track")
    assert response.status_code == 200
    data = response.json()
    assert data["value"] == ""
    assert data["embed_url"] is None
