from datetime import datetime
from typing import List, Literal, Optional

from app.core.sections import SECTION_SLUGS
from app.schemas.author import AuthorRead
from pydantic import BaseModel, ConfigDict, computed_field, field_validator


def _reading_time(body: str) -> int:
    """Примерное время чтения в минутах (~200 слов/мин, минимум 1)."""
    if not body:
        return 1
    words = len(body.split())
    return max(1, round(words / 200))


# Допустимые значения статуса статьи
ArticleStatus = Literal["draft", "published"]


class FootnoteInput(BaseModel):
    number: int
    text: str


class FootnoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: int
    text: str


class ArticleImageInput(BaseModel):
    url: str
    caption: Optional[str] = None
    position: int = 0


class ArticleImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    caption: Optional[str] = None
    position: int


class TagInput(BaseModel):
    """Тег, заданный по имени; сервис сопоставляет его со slug и строкой Tag."""
    name: str


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class ArticleCreate(BaseModel):
    title: str
    slug: str
    subtitle: Optional[str] = None
    body: str
    author_id: int
    status: ArticleStatus = "draft"
    section: Optional[str] = None
    cover_image_url: Optional[str] = None
    footnotes: List[FootnoteInput] = []
    images: List[ArticleImageInput] = []
    tags: List[TagInput] = []

    @field_validator("section")
    @classmethod
    def _validate_section(cls, v):
        """Проверяет, что section — это известный slug (или None/пусто)."""
        if v in (None, ""):
            return None
        if v not in SECTION_SLUGS:
            raise ValueError(f"Неизвестный раздел: {v}")
        return v


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    subtitle: Optional[str] = None
    body: Optional[str] = None
    author_id: Optional[int] = None
    status: Optional[ArticleStatus] = None
    section: Optional[str] = None
    cover_image_url: Optional[str] = None
    footnotes: Optional[List[FootnoteInput]] = None
    images: Optional[List[ArticleImageInput]] = None
    tags: Optional[List[TagInput]] = None

    @field_validator("section")
    @classmethod
    def _validate_section(cls, v):
        """Проверяет, что section — это известный slug (или None/пусто)."""
        if v in (None, ""):
            return None
        if v not in SECTION_SLUGS:
            raise ValueError(f"Неизвестный раздел: {v}")
        return v


class ArticleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    subtitle: Optional[str] = None
    body: str
    author: AuthorRead
    status: str
    section: Optional[str] = None
    published_at: Optional[datetime] = None
    cover_image_url: Optional[str] = None
    footnotes: List[FootnoteRead] = []
    images: List[ArticleImageRead] = []
    tags: List[TagRead] = []
    likes_count: int = 0
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def reading_time_minutes(self) -> int:
        return _reading_time(self.body)


class ArticleListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    subtitle: Optional[str] = None
    author_name: str = ""
    author_slug: str = ""
    status: str
    section: Optional[str] = None
    tag_slugs: List[str] = []
    likes_count: int = 0
    reading_time_minutes: int = 0
    published_at: Optional[datetime] = None
    cover_image_url: Optional[str] = None
    created_at: datetime
