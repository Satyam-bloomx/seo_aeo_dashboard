"""Central runtime configuration flags shared across the backend."""
import os
from typing import List

APP_ENV = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()
IS_PRODUCTION = APP_ENV in ("production", "prod")

# Gemini model used unless the workspace selects another one in Integrations.
DEFAULT_GEMINI_MODEL = (os.getenv("DEFAULT_GEMINI_MODEL") or "gemini-3.5-flash").strip()
# Used only if the default/selected model is unavailable (rate-limited or down).
FALLBACK_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_AI_MODELS = {"gemini": DEFAULT_GEMINI_MODEL, "openai": "gpt-4o-mini", "claude": "claude-sonnet-5-5"}


def chosen_ai_model(integration, provider: str) -> str:
    """Model to call for an AI provider integration.

    For Gemini only an explicit choice in Integrations (select-model) overrides the default; a model
    auto-picked when the key was saved does not. OpenAI/Claude use their stored model, else a default.
    """
    cfg = getattr(integration, "config_json", None) or {}
    if not isinstance(cfg, dict):
        cfg = {}
    picked = str(cfg.get("selected_model") or "").strip()
    if provider == "gemini":
        return picked if picked and cfg.get("model_selected_by_user") else DEFAULT_GEMINI_MODEL
    return picked or DEFAULT_AI_MODELS.get(provider, "")

_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def cors_origins() -> List[str]:
    """Explicit CORS allow-list. A wildcard is never combined with credentials."""
    raw = (os.getenv("CORS_ORIGINS") or "").strip().strip('"\'')
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip() and o.strip() != "*"]
    if not origins:
        if IS_PRODUCTION:
            raise RuntimeError("CORS_ORIGINS must list the allowed frontend origins in production.")
        return list(_DEV_ORIGINS)
    return origins


def require_secret(name: str) -> str:
    """Return a required secret, failing fast in production when it is missing."""
    value = (os.getenv(name) or "").strip()
    if not value and IS_PRODUCTION:
        raise RuntimeError(f"{name} must be set in production.")
    return value
