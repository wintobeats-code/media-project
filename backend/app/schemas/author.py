from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AuthorCreate(BaseModel):
    name: str
    slug: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class AuthorUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class AuthorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
