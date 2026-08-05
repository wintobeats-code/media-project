from app.models.author import Author
from app.repositories.base import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession


class AuthorRepository(BaseRepository[Author]):
    def __init__(self, session: AsyncSession):
        super().__init__(Author, session)
