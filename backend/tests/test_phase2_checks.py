"""Security and edge-case tests for Phase 1 & Phase 2 improvements (no live external site calls)."""
import asyncio
import httpx

from app.services.ai_crawlers import probe_bot_parity
from app.services.extractor import extract_seo_metrics, has_premature_head_closure
from app.services.scoring import compute_scores


def test_premature_head_closure_edge_cases():
    clean = "<html><head><title>OK</title><meta name='description' content='desc'><link rel='canonical' href='https://e.com/'></head><body><div>Hi</div></body></html>"
    assert has_premature_head_closure(clean) is False

    # Illegal <div> inside <head> closes <head> early in browsers/Googlebot
    broken = "<html><head><title>OK</title><div class='banner'>oops</div><link rel='canonical' href='https://e.com/'></head><body></body></html>"
    assert has_premature_head_closure(broken) is True

    # Literal '<div>' inside a <script> string or HTML comment must NOT false-positive
    safe_script = "<html><head><script>var s = '<div>not a real tag</div>';</script><!-- <p>comment</p> --><title>OK</title></head><body></body></html>"
    assert has_premature_head_closure(safe_script) is False

    # Empty / missing head edge cases
    assert has_premature_head_closure("") is False
    assert has_premature_head_closure("<html><body><div>no head</div></body></html>") is False

    # Verify extractor + scoring wire it up as a High Issue in Technical
    metrics = extract_seo_metrics(broken, "https://e.com/")
    assert metrics["audit_data"]["Validation"]["Premature <head> Closure"] is True
    p = {
        "id": 1, "url": "https://e.com/", "status_code": 200, "content_type": "text/html",
        "indexability": "Indexable", "indexability_status": "Indexable", "audit_data": metrics["audit_data"],
    }
    res = compute_scores([p], mode="page")
    assert res["categories"]["Technical"]["score"] <= 60


def test_bot_parity_ssrf_security_blocks_private_and_metadata_ips():
    """SSRF protection: probe_bot_parity must refuse loopback and cloud metadata URLs."""
    for bad_url in ("http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"):
        out = asyncio.run(probe_bot_parity(bad_url))
        assert out["status"] in ("blocked_ssrf", "error")
        assert out["blocked_bots"] == []


def test_bot_parity_detects_bot_blocks_and_truncated_html():
    """Mocked HTTP transport: detects 403/429 bot blocking and severe HTML size drop without live requests."""
    big_html = "<html><body>" + ("astrology content " * 300) + "</body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        ua = request.headers.get("user-agent", "")
        if "OAI-SearchBot" in ua:
            return httpx.Response(403, text="Forbidden")
        if "PerplexityBot" in ua:
            return httpx.Response(200, text="<html><body>Enable JS</body></html>")
        return httpx.Response(200, text=big_html)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await probe_bot_parity("https://example.com/", client=client)

    out = asyncio.run(go())
    assert out["status"] == "ok"
    assert "OAI-SearchBot" in out["blocked_bots"]
    assert any("PerplexityBot" in issue for issue in out["parity_issues"])
