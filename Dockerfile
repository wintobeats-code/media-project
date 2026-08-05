# Production-образ: backend + встроенный frontend (без volume).
# Для dev-разработки используйте docker compose up (с volume ./frontend).
#
# Сборка:  docker build -t bogema .
# Запуск:  docker run -p 8000:8000 -e DATABASE_URL=... bogema

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Сначала зависимости (кешируется отдельным слоем)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY backend/app ./app
COPY backend/alembic.ini ./alembic.ini
COPY backend/migrations ./migrations

# Копируем frontend (статика раздаётся FastAPI из FRONTEND_DIR)
COPY frontend ./frontend

RUN mkdir -p /app/uploads

# FRONTEND_DIR указывает на встроенную папку фронтенда
ENV FRONTEND_DIR=/app/frontend \
    PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
