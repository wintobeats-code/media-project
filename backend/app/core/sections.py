"""Фиксированный список разделов статей (категорий).

Каждый раздел — пара (slug, заголовок). Slug хранится в Article.section
и используется в URL/фильтрах; заголовок показывается в интерфейсе.
"""

SECTIONS = [
    ("moda", "Мода"),
    ("muzyka", "Музыка"),
]

SECTION_SLUGS = {slug for slug, _ in SECTIONS}


def section_title(slug: str) -> str:
    """Возвращает человекочитаемый заголовок для slug раздела, либо сам slug."""
    for s, title in SECTIONS:
        if s == slug:
            return title
    return slug
