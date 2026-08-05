from __future__ import annotations

from typing import Optional

from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.schemas.auth import Token


class AuthService:
    @staticmethod
    def authenticate(username: str, password: str) -> Optional[Token]:
        if username != settings.ADMIN_USERNAME or password != settings.ADMIN_PASSWORD:
            return None
        token = create_access_token(data={"sub": username})
        return Token(access_token=token, token_type="bearer")
