FROM python:3.12-slim

WORKDIR /app

# Install deps first so this layer caches unless requirements change.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code only; the ~2 GB COPC is bind-mounted at runtime, never baked in.
COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 8000

# 0.0.0.0 so the published port is reachable; uvicorn[standard] handles WS keepalive.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
