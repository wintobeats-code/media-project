from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_token

security_scheme = HTTPBearer(auto_error=False)


def _resolve_token(
    credentials: Optional[HTTPAuthorizationCredentials],
    request: Request,
) -> Optional[str]:
    """Извлекает JWT из заголовка Authorization или, как запасной вариант,
    из куки access_token. Админка — это same-origin vanilla-JS приложение,
    поэтому браузер отправляет куку автоматически; путь через заголовок
    оставлен для небраузерных клиентов и явного использования токена.
    """
    if credentials is not None and credentials.credentials:
        return credentials.credentials
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        # значение куки хранится в виде "Bearer <token>"
        if cookie_token.startswith("Bearer "):
            return cookie_token[7:]
        return cookie_token
    return None


async def get_current_admin(
    request: Request,
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(security_scheme)
    ],
) -> str:
    """Проверяет JWT-токен (заголовок или кука) и возвращает имя администратора."""
    token = _resolve_token(credentials, request)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    username = payload.get("sub")
    if username != settings.ADMIN_USERNAME:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )
    return username


def get_admin_from_cookie(request: Request) -> Optional[str]:
    """Извлекает и проверяет администратора из куки (для UI админки)."""
    token = request.cookies.get("access_token")
    if not token:
        return None
    if token.startswith("Bearer "):
        token = token[7:]
    payload = verify_token(token)
    if payload is None:
        return None
    username = payload.get("sub")
    if username != settings.ADMIN_USERNAME:
        return None
    return username


DBSession = Annotated[AsyncSession, Depends(get_db)]
CurrentAdmin = Annotated[str, Depends(get_current_admin)]
