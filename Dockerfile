FROM python:3.12-slim

# Install system deps (ffmpeg for audio stitching, gcc for some wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# Install Python deps first (better layer caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Drop to non-root user
USER appuser

# Run DB migration then start server
CMD ["sh", "-c", "python migrate.py && uvicorn main:app --host 0.0.0.0 --port $PORT"]
