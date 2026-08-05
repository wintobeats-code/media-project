from typing import List, Optional

from app.models.author import Author
from app.repositories.author import AuthorRepository
from app.schemas.author import AuthorCreate, AuthorUpdate
from sqlalchemy.ext.asyncio import AsyncSession


class AuthorService:
    def __init__(self, session: AsyncSession):
        self.repo = AuthorRepository(session)
        self.session = session

    async def list_authors(self, offset: int = 0, limit: int = 50) -> List[Author]:
        return await self.repo.get_multi(offset=offset, limit=limit)

    async def get_author(self, author_id: int) -> Optional[Author]:
        return await self.repo.get(author_id)

    async def get_by_slug(self, slug: str) -> Optional[Author]:
        return await self.repo.get_by_slug(slug)

    async def create_author(self, data: AuthorCreate) -> Author:
        author = await self.repo.create(data.model_dump())
        await self.session.commit()
        return author

    async def update_author(
        self, author_id: int, data: AuthorUpdate
    ) -> Optional[Author]:
        update_data = data.model_dump(exclude_unset=True)
        author = await self.repo.update(author_id, update_data)
        if author:
            await self.session.commit()
        return author

    async def delete_author(self, author_id: int) -> bool:
        deleted = await self.repo.delete(author_id)
        if deleted:
            await self.session.commit()
        return deleted
