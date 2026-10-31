"""Test configuration: isolated SQLite DB and a test-only JWT secret, set before the app is imported."""
import os
import sys
import tempfile
import time

import jwt
import pytest

_TMP_DIR = tempfile.mkdtemp(prefix="seo_audit_tests_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(_TMP_DIR, 'test.db').replace(os.sep, '/')}"
os.environ["SUPABASE_JWT_SECRET"] = "test-only-jwt-secret-with-enough-length-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["ENCRYPTION_KEY"] = "test-only-encryption-key"
os.environ["APP_ENV"] = "test"
os.environ["PARSE_WORKERS"] = "0"  # parse in threads: no worker processes during tests
os.environ.pop("ALLOW_PRIVATE_NETWORK_FETCH", None)
# app.main calls load_dotenv(), which never overrides variables that already exist. Blank every
# third-party key so tests can never spend real API quota from backend/.env.
for _key in ("GEMINI_API_KEY", "PAGESPEED_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
             "PERPLEXITY_API_KEY", "SERPAPI_API_KEY", "GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY",
             "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SEARCH_CONSOLE_KEY", "SEARCH_CONSOLE_TOKEN"):
    os.environ[_key] = ""

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TEST_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def make_token(sub: str, secret: str = TEST_SECRET, alg: str = "HS256", **claims) -> str:
    now = int(time.time())
    payload = {"sub": sub, "aud": "authenticated", "role": "authenticated", "iat": now, "exp": now + 3600, **claims}
    return jwt.encode(payload, secret, algorithm=alg)


def auth(sub: str) -> dict:
    return {"Authorization": f"Bearer {make_token(sub)}"}


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        yield c


def wait_for_crawl(client, crawl_id: int, headers: dict, timeout: float = 60.0) -> dict:
    """Crawls start queued and run in the background: poll the status endpoint until the crawl has finished."""
    deadline = time.time() + timeout
    while True:
        status = client.get(f"/api/crawls/{crawl_id}/status", headers=headers)
        if status.status_code == 404:
            return {"status": "gone"}
        body = status.json()
        if body["status"] in ("completed", "failed"):
            return body
        if time.time() > deadline:
            raise AssertionError(f"crawl {crawl_id} did not finish: {body}")
        time.sleep(0.1)
