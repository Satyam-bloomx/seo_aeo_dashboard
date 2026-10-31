"""AI provider/model selection, deep-dive copy rewrites and crawler URL rules."""
import types

from app.core.config import DEFAULT_GEMINI_MODEL, chosen_ai_model
from app.services.prompt_engine import ai_provider_order
from app.api.endpoints import _content_elements, _merge_rewrites
from app.services.crawler import CrawlerService


def _item(cfg=None, **kw):
    return types.SimpleNamespace(api_key="k", config_json=cfg or {}, **kw)


def test_gemini_default_unless_user_picked_a_model():
    assert DEFAULT_GEMINI_MODEL == "gemini-3.5-flash"
    assert chosen_ai_model(None, "gemini") == DEFAULT_GEMINI_MODEL
    # Auto-picked when the key was saved: not a user choice.
    assert chosen_ai_model(_item({"selected_model": "gemini-2.5-flash"}), "gemini") == DEFAULT_GEMINI_MODEL
    picked = _item({"selected_model": "gemini-3.7-flash", "model_selected_by_user": True})
    assert chosen_ai_model(picked, "gemini") == "gemini-3.7-flash"
    assert chosen_ai_model(_item({"selected_model": "gpt-x"}), "openai") == "gpt-x"


def test_workspace_provider_beats_server_env_key():
    integrations = {
        "gemini": _item(from_env=True),
        "openai": _item({"connected_at": 100}, id=3),
    }
    assert ai_provider_order(integrations) == ["openai", "gemini"]


def test_most_recently_connected_workspace_provider_first():
    integrations = {
        "gemini": _item({"connected_at": 200}, id=1),
        "claude": _item({"connected_at": 300}, id=2),
        "openai": _item({"connected_at": 100}, id=3),
    }
    assert ai_provider_order(integrations) == ["claude", "gemini", "openai"]


def test_content_elements_use_crawler_flags_and_lengths():
    t1 = {"page_title": "Home", "meta_description": None, "h1_primary": "Welcome to our site"}
    ad = {"Page_Titles": {"Below 30 Characters": True}}
    el = _content_elements(t1, ad)
    assert el["title"]["issues"] == ["Below 30 Characters"]
    assert el["meta_description"]["issues"] == ["Missing"]
    assert el["h1"]["issues"] == []

    rows = _merge_rewrites(el, {"meta_description": {"proposed": "x" * 150, "reason": "was missing"}})
    meta = next(r for r in rows if r["element"] == "meta_description")
    assert meta["status"] == "fix" and meta["proposed_length"] == 150 and meta["proposed_in_range"]
    h1 = next(r for r in rows if r["element"] == "h1")
    assert h1["status"] == "ok" and h1["proposed"] is None

    same = _merge_rewrites(el, {"h1": {"proposed": "welcome to our site", "reason": "fine"}})
    h1 = next(r for r in same if r["element"] == "h1")
    assert h1["keep_current"] and h1["proposed"] is None


def test_exclude_paths_match_whole_segments_and_wildcards():
    c = CrawlerService.__new__(CrawlerService)
    c.exclude_paths_list = ["/cart", "/search/", "/tag/*/feed", "https://example.com/private"]
    assert c._is_excluded("https://example.com/cart")
    assert c._is_excluded("https://example.com/cart/item-1")
    assert not c._is_excluded("https://example.com/cartoons")
    assert c._is_excluded("https://example.com/search")
    assert not c._is_excluded("https://example.com/research-blog")
    assert c._is_excluded("https://example.com/tag/seo/feed")
    assert c._is_excluded("https://example.com/private/x")
    assert not c._is_excluded("https://example.com/about")
