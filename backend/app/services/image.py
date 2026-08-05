import uuid
from pathlib import Path

import aiofiles
from app.core.config import settings
from fastapi import UploadFile


class ImageService:
    # Разрешённые расширения файлов
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    # Соответствие расширение -> MIME-типы, которые считаем допустимыми
    ALLOWED_CONTENT_TYPES = {
        ".jpg": {"image/jpeg"},
        ".jpeg": {"image/jpeg"},
        ".png": {"image/png"},
        ".gif": {"image/gif"},
        ".webp": {"image/webp"},
    }
    # Максимальный размер загружаемого файла: 10 МБ
    MAX_UPLOAD_SIZE = 10 * 1024 * 1024

    @staticmethod
    async def save_upload(file: UploadFile) -> str:
        """Сохраняет загруженный файл и возвращает его URL-путь."""
        if not file.filename:
            raise ValueError("Не указано имя файла")

        ext = Path(file.filename).suffix.lower()
        if ext not in ImageService.ALLOWED_EXTENSIONS:
            raise ValueError(f"Расширение {ext} не разрешено")

        # Проверяем content-type (защита от маскировки скриптов под картинки)
        allowed_ct = ImageService.ALLOWED_CONTENT_TYPES.get(ext, set())
        if file.content_type and file.content_type not in allowed_ct:
            raise ValueError(
                f"Тип содержимого {file.content_type} не соответствует расширению {ext}"
            )

        # Читаем файл порциями с проверкой размера (защита от слишком больших файлов)
        content = bytearray()
        while True:
            chunk = await file.read(1024 * 1024)  # по 1 МБ
            if not chunk:
                break
            content.extend(chunk)
            if len(content) > ImageService.MAX_UPLOAD_SIZE:
                raise ValueError(
                    f"Файл превышает максимальный размер "
                    f"({ImageService.MAX_UPLOAD_SIZE // (1024 * 1024)} МБ)"
                )

        # Генерируем уникальное имя файла
        filename = f"{uuid.uuid4().hex}{ext}"
        upload_path = settings.upload_path / filename

        # Гарантируем существование папки загрузок
        upload_path.parent.mkdir(parents=True, exist_ok=True)

        # Сохраняем файл
        async with aiofiles.open(upload_path, "wb") as f:
            await f.write(content)

        # Возвращаем URL-путь (раздаётся middleware статики)
        return f"/uploads/{filename}"
