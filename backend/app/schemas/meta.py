from pydantic import BaseModel


class SectionCount(BaseModel):
    slug: str
    title: str
    count: int


class TagCount(BaseModel):
    id: int
    name: str
    slug: str
    count: int
