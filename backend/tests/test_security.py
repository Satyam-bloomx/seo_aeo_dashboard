"""Regression tests for the security fixes from the October 2026 audit."""
import asyncio
import base64
import json

import pytest

from conftest import auth, make_token


# ---------------------------------------------------------------- authentication

def test_unauthenticated_requests_are_rejected(client):
    for method, path in [
        ("get", "/api/crawls"),
        ("get", "/api/crawls/latest"),
        ("delete", "/api/crawls"),
        ("get", "/api/crawls/1/pages"),
        ("get", "/api/pages/1"),
        ("get", "/api/integrations/status/1"),
        ("get", "/api/integrations/synergy/1"),
        ("delete", "/api/integrations/disconnect/1/openai"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path


def test_demo_token_backdoor_is_gone(client):
    assert client.get("/api/crawls", headers={"Authorization": "Bearer demo-token"}).status_code == 401


def test_forged_signature_is_rejected(client):
    forged = make_token("victim-user", secret="attacker-chosen-secret-0123456789abcdef")
    assert client.get("/api/crawls", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_unsigned_alg_none_token_is_rejected(client):
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps({"sub": "victim", "aud": "authenticated", "exp": 9999999999}).encode()).rstrip(b"=").decode()
    assert client.get("/api/crawls", headers={"Authorization": f"Bearer {header}.{body}."}).status_code == 401


def test_expired_and_overage_sessions_are_rejected(client):
    expired = make_token("u1", exp=1)
    assert client.get("/api/crawls", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    too_old = make_token("u1", auth_time=1)
    assert client.get("/api/crawls", headers={"Authorization": f"Bearer {too_old}"}).status_code == 401


def test_valid_token_is_accepted(client):
    assert client.get("/api/crawls", headers=auth("alice")).status_code == 200


# ---------------------------------------------------------------- tenant isolation

def _seed_crawl_for(user_id: str) -> tuple:
    from app.core.database import AsyncSessionLocal
    from app.core.auth import get_or_create_user_project
    from app.models.domain import Crawl, Page

    async def go():
        async with AsyncSessionLocal() as db:
            project_id = await get_or_create_user_project(db, user_id)
            crawl = Crawl(project_id=project_id, seed_url="https://example.com/", status="completed")
            db.add(crawl)
            await db.flush()
            page = Page(crawl_id=crawl.id, url="https://example.com/", status_code=200)
            db.add(page)
            await db.commit()
            return crawl.id, page.id

    return asyncio.run(go())


def test_users_cannot_read_each_others_crawls(client):
    crawl_id, page_id = _seed_crawl_for("owner-user")
    owner, other = auth("owner-user"), auth("other-user")

    assert client.get(f"/api/crawls/{crawl_id}/status", headers=owner).status_code == 200
    for path in (f"/api/crawls/{crawl_id}/status", f"/api/crawls/{crawl_id}/pages",
                 f"/api/pages/{page_id}", f"/api/pages/{page_id}/inlinks", f"/api/pages/{page_id}/outlinks",
                 f"/api/integrations/synergy/{crawl_id}"):
        assert client.get(path, headers=other).status_code == 404, path


def test_client_supplied_project_id_is_ignored(client):
    from app.core.database import AsyncSessionLocal
    from app.core.auth import get_or_create_user_project
    from app.models.domain import Integration

    async def victim_integration():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "victim-user")
            db.add(Integration(project_id=pid, integration_type="openai", connected=True, api_key="sk-victim-secret-key-123456"))
            await db.commit()
            return pid

    victim_pid = asyncio.run(victim_integration())
    attacker = auth("attacker-user")
    victim_view = [s for s in client.get(f"/api/integrations/status/{victim_pid}", headers=auth("victim-user")).json() if s.get("id") == "openai"]
    attacker_view = [s for s in client.get(f"/api/integrations/status/{victim_pid}", headers=attacker).json() if s.get("id") == "openai"]
    assert victim_view and victim_view[0]["connected"] is True
    assert attacker_view and attacker_view[0]["connected"] is False

    client.delete(f"/api/integrations/disconnect/{victim_pid}/openai", headers=attacker)

    async def still_there():
        from sqlalchemy import select
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(Integration).where(Integration.project_id == victim_pid))).scalars().all()
            return len(rows)

    assert asyncio.run(still_there()) == 1


# ---------------------------------------------------------------- SSRF

@pytest.mark.parametrize("url", [
    "http://127.0.0.1/", "http://localhost:6379/", "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.0.1/", "http://[::1]/",
    "http://0.0.0.0/", "http://100.64.0.1/", "http://[::ffff:127.0.0.1]/",
    "file:///etc/passwd", "ftp://example.com/", "http://user:pass@8.8.8.8/",
])
def test_ssrf_guard_blocks_internal_and_non_http_targets(url):
    from app.core.url_safety import UnsafeURLError, assert_public_url
    with pytest.raises(UnsafeURLError):
        asyncio.run(assert_public_url(url))


def test_ssrf_guard_allows_public_ip():
    from app.core.url_safety import assert_public_url
    asyncio.run(assert_public_url("https://8.8.8.8/"))


def test_crawl_of_internal_address_is_refused(client):
    res = client.post("/api/crawls", json={"seed_url": "http://127.0.0.1:8000/"}, headers=auth("alice"))
    assert res.status_code == 400


def test_crawl_limits_are_bounded(client):
    res = client.post("/api/crawls", json={"seed_url": "https://example.com", "max_pages": 10**9}, headers=auth("alice"))
    assert res.status_code == 422


def test_service_account_token_uri_is_pinned():
    from app.core.google_credentials import InvalidServiceAccountError, safe_service_account_credentials
    with pytest.raises(InvalidServiceAccountError):
        safe_service_account_credentials({
            "type": "service_account", "client_email": "a@b.iam.gserviceaccount.com",
            "private_key": "x", "token_uri": "http://169.254.169.254/latest/meta-data/",
        })


def test_retry_after_is_capped():
    from app.core.url_safety import clamp_delay
    assert clamp_delay("999999999", default=3) == 30
    assert clamp_delay("garbage", default=3) == 3


# ---------------------------------------------------------------- OAuth

def test_oauth_state_is_bound_to_the_issuing_user():
    from fastapi import HTTPException
    from app.api.integrations import _consume_oauth_state, _issue_oauth_state

    state, challenge = _issue_oauth_state("alice", 7, "search_console", "http://localhost:3000/integrations/callback")
    assert state.startswith("search_console.") and challenge
    assert _consume_oauth_state(state, "alice")["p"] == 7
    with pytest.raises(HTTPException):
        _consume_oauth_state(state, "mallory")
    with pytest.raises(HTTPException):
        _consume_oauth_state("search_console.tampered", "alice")
    with pytest.raises(HTTPException):
        _consume_oauth_state("1:search_console", "alice")  # legacy predictable format


# ---------------------------------------------------------------- secrets & data integrity

def test_undecryptable_secret_is_not_returned_as_credential():
    from app.core.security import decrypt_secret, encrypt_secret, mask_key
    assert decrypt_secret("enc::not-a-valid-token") is None
    token = encrypt_secret("sk-live-abcdefghijklmnop")
    assert token.startswith("enc::") and decrypt_secret(token) == "sk-live-abcdefghijklmnop"
    assert mask_key(token) == "••••••••mnop"


def test_readability_uses_real_syllables():
    from app.services.extractor import flesch_reading_ease
    simple = flesch_reading_ease("The cat sat on the mat. It was a good day.")
    dense = flesch_reading_ease("Interdepartmental communication methodologies necessitate comprehensive organizational reevaluation.")
    assert simple > dense


def test_pagespeed_returns_nothing_without_a_key():
    from app.services.enrichment_service import EnrichmentService
    vitals = asyncio.run(EnrichmentService(crawl_id=0, db=None)._fetch_pagespeed_vitals("https://example.com/", None))
    assert vitals is None


def test_security_headers_present(client):
    res = client.get("/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"


def test_cors_rejects_unknown_origins(client):
    res = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in {k.lower() for k in res.headers}


# ---------------------------------------------------------------- rate limits & erasure

def test_expensive_endpoints_are_rate_limited(client, monkeypatch):
    from app.core.rate_limit import reset_rate_limits
    reset_rate_limits()
    monkeypatch.setenv("RATE_LIMIT_AI", "2/3600")
    h = auth("rate-user")
    body = {"url": "http://127.0.0.1/private"}  # refused by the SSRF guard, so no network call
    codes = [client.post("/api/audits/ai-page-deepdive", json=body, headers=h).status_code for _ in range(3)]
    assert codes[-1] == 429 and 429 not in codes[:2]
    other = client.post("/api/audits/ai-page-deepdive", json=body, headers=auth("someone-else-rl")).status_code
    assert other != 429  # limits are per user
    reset_rate_limits()


def test_user_can_delete_all_their_data(client):
    crawl_id, _ = _seed_crawl_for("erase-me")
    _seed_crawl_for("keep-me")
    res = client.delete("/api/me/data", headers=auth("erase-me"))
    assert res.status_code == 200 and res.json()["deleted"] is True
    assert client.get(f"/api/crawls/{crawl_id}/status", headers=auth("erase-me")).status_code == 404
    assert client.get("/api/crawls/latest", headers=auth("keep-me")).status_code == 200
