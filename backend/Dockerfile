FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Etc/UTC \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    APP_ENV=production

WORKDIR /app

COPY requirements.txt .

# Build tools are only needed while compiling wheels; they are purged in the same layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ libxml2-dev libxslt-dev curl ca-certificates \
    && pip install -r requirements.txt \
    && python -m playwright install --with-deps chromium \
    && apt-get purge -y --auto-remove gcc g++ libxml2-dev libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/data \
    && chown -R app:app /app /ms-playwright

COPY --chown=app:app . .

# Strip Windows line endings (a CRLF checkout breaks the shebang) and make the entrypoint executable.
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod 0755 /app/docker-entrypoint.sh

USER app

EXPOSE 8000

# API healthcheck. The worker service overrides it in docker-compose.yml (the worker serves no HTTP).
# start-period covers the migration that runs before uvicorn when RUN_MIGRATIONS=true.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# RUN_MIGRATIONS=true runs `alembic upgrade head` (advisory-locked) before the command; see docker-entrypoint.sh.
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# API by default; the worker service runs `python -m app.worker` from this same image.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
