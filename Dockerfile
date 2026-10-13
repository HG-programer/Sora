FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt asyncpg

COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
EXPOSE 5050

# Run with multiple async Uvicorn workers for thousands of concurrent users
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5050", "--workers", "4"]
