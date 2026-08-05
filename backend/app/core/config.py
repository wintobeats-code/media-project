from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    DATABASE_URL: str = (
        "postgresql+asyncpg://media:media_secret@localhost:5432/media_db"
    )
    SECRET_KEY: str = "change-me-in-production-abc123"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    UPLOAD_DIR: str = "uploads"
    # Путь к каталогу статики фронтенда. В docker задаётся как /app/frontend
    # через переменную окружения FRONTEND_DIR; локально разрешается в ../frontend.
    FRONTEND_DIR: str = str(Path(__file__).resolve().parents[3] / "frontend")

    @property
    def upload_path(self) -> Path:
        return Path(self.UPLOAD_DIR)

    @property
    def frontend_path(self) -> Path:
        return Path(self.FRONTEND_DIR)


settings = Settings()
