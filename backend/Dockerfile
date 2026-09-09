FROM python:3.11-slim

WORKDIR /app

# Install system dependencies and compiler tools for C-extensions & Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    g++ \
    git \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium & OS browser dependencies
RUN playwright install --with-deps chromium

COPY . .

# Ensure data directory exists for SQLite persistent volume
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
