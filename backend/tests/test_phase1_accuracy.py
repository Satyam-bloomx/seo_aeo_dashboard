"""Crawler accuracy fixes found by the known-answer user tests (crawler-test.com, books.toscrape.com)."""
import time

from app.services import prompt_engine
from app.services.crawler import CrawlerService
from app.services.extractor import (
    DESCRIPTION_FONT_PX,
    TITLE_FONT_PX,
    calculate_pixel_width,
    extract_page,
)


def _crawler(**kw):
    c = CrawlerService.__new__(CrawlerService)
    c.ignore_url_params = False
    c.visited_urls = set()
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def _metrics(body, head="", headers=None, url="https://example.com/page"):
    html = f"<html><head><title>T</title>{head}</head><body>{body}</body></html>"
    metrics, links, _images = extract_page(html, url, headers or {})
    return metrics, links


def test_heading_text_keeps_word_breaks():
    m, _ = _metrics("<h1>Digital Marketing <span>Services</span><br>for\n  Modern Brands</h1>")
    assert m["h1_1"] == "Digital Marketing Services for Modern Brands"


def test_inline_markup_inside_a_word_stays_joined():
    m, _ = _metrics("<h1>Bloom<b>X</b> Agency</h1>")
    assert m["h1_1"] == "BloomX Agency"


def test_title_whitespace_collapsed_and_svg_title_ignored():
    html = ("<html><head><title>Travel |\n      Books to Scrape</title></head>"
            "<body><svg><title>Back Button</title></svg></body></html>")
    m, _, _ = extract_page(html, "https://example.com/", {})
    assert m["title_1"] == "Travel | Books to Scrape"
    assert m["audit_data"]["Page_Titles"]["Multiple"] is False


def test_svg_title_is_not_the_page_title():
    html = "<html><head></head><body><svg><title>Back Button</title></svg></body></html>"
    m, _, _ = extract_page(html, "https://example.com/", {})
    assert m["title_1"] == ""
    assert m["audit_data"]["Page_Titles"]["Missing"] is True


def test_pixel_widths_agree_with_character_limits():
    title = "BloomX - Performance Marketing for D2C, EdTech, Coaching & Spiritual Brands"  # 75 chars
    desc = ("BloomX has generated 212 Cr in client revenue on 100 Cr+ ad spend (2.12x return) for D2C, "
            "EdTech, coaching, astrology & spiritual brands across India.")  # about 150 chars
    assert calculate_pixel_width(title, TITLE_FONT_PX) > 561
    assert calculate_pixel_width(desc, DESCRIPTION_FONT_PX) < 985


def test_page_size_and_text_ratio_are_recorded():
    m, _ = _metrics("<p>" + "word " * 50 + "</p>")
    assert m["size_bytes"] > 0
    assert 0 < m["text_to_html_ratio"] <= 100


def test_canonical_from_http_link_header():
    m, _ = _metrics("", headers={"Link": '<https://example.com/canonical>; rel="canonical"'})
    c = m["audit_data"]["Canonicals"]
    assert m["canonical_link_element_1"] == "https://example.com/canonical"
    assert c["Canonical In HTTP Header"] is True and c["Missing"] is False and c["Canonicalised"] is True


def test_relative_canonical_is_flagged():
    m, _ = _metrics("", head='<link rel="canonical" href="/page">')
    assert m["audit_data"]["Canonicals"]["Canonical Is Relative"] is True
    m, _ = _metrics("", head='<link rel="canonical" href="https://example.com/page">')
    assert m["audit_data"]["Canonicals"]["Canonical Is Relative"] is False


def test_conflicting_html_and_header_canonicals():
    m, _ = _metrics("", head='<link rel="canonical" href="https://example.com/a">',
                    headers={"Link": '<https://example.com/b>; rel="canonical"'})
    assert m["audit_data"]["Canonicals"]["Multiple Conflicting"] is True


def test_meta_refresh_redirect_detected_and_followed():
    m, _ = _metrics("", head='<meta http-equiv="refresh" content="0; url=/new-page">')
    rc = m["audit_data"]["Response_Codes"]
    assert rc["Redirection (Meta Refresh)"] is True
    assert rc["Redirect URL"] == "https://example.com/new-page"
    assert m["audit_data"]["Directives"]["Refresh"] is True
    assert m["indexability"] == "Non-Indexable"


def test_http_refresh_header_redirect_detected():
    m, _ = _metrics("", headers={"Refresh": "5; url=https://example.com/elsewhere"})
    assert m["audit_data"]["Response_Codes"]["Redirect Type"] == "HTTP Refresh"


def test_plain_page_has_no_refresh_redirect():
    m, _ = _metrics("<p>hello</p>")
    assert m["audit_data"]["Response_Codes"] == {}
    assert m["audit_data"]["Directives"]["Refresh"] is False


def test_mixed_content_upgraded_by_csp_is_not_flagged():
    body = '<script src="http://cdn.example.org/jquery.js"></script>'
    m, _ = _metrics(body, headers={"Content-Security-Policy": "upgrade-insecure-requests"})
    sec = m["audit_data"]["Security"]
    assert sec["Mixed Content"] is False and sec["Insecure References Upgraded by CSP"] is True
    m, _ = _metrics(body, headers={})
    assert m["audit_data"]["Security"]["Mixed Content"] is True


def test_unicode_and_percent_encoded_urls_are_one_url():
    c = _crawler()
    raw = c._clean_crawl_url("https://crawler-test.com/encoding/x/בלה")
    encoded = c._clean_crawl_url("https://crawler-test.com/encoding/x/%D7%91%D7%9C%D7%94")
    lower = c._clean_crawl_url("https://crawler-test.com/encoding/x/%d7%91%d7%9c%d7%94")
    assert raw == encoded == lower
    assert c._clean_crawl_url("https://example.com/blog/post-1/") == "https://example.com/blog/post-1/"


def test_many_links_on_one_page_are_all_kept():
    body = "".join(f'<a href="/p{i}">p{i}</a>' for i in range(450))
    _m, links = _metrics(body)
    assert len([l for l in links if l["is_internal"]]) == 450


def test_coverage_counts_only_urls_never_crawled():
    c = _crawler(admitted_count=10, max_pages=10, max_depth=2,
                 skipped_page_limit={"https://e.com/a", "https://e.com/b"},
                 skipped_depth={"https://e.com/c"}, skipped_excluded=set(), link_capped_pages=0)
    c.visited_urls = {"https://e.com/b"}  # reached later through another link
    report = c.coverage_report()
    assert report["not_crawled_page_limit"] == 1
    assert report["not_crawled_depth_limit"] == 1


def test_no_gemini_request_while_every_model_is_cooling_down():
    saved = dict(prompt_engine._MODEL_COOLDOWN)
    try:
        until = time.time() + 30
        for m in ("gemini-x", prompt_engine.DEFAULT_GEMINI_MODEL, prompt_engine.FALLBACK_GEMINI_MODEL):
            prompt_engine._MODEL_COOLDOWN[m] = until
        prompt_engine._AI_FAILURE.set(None)
        assert prompt_engine._gemini_models("gemini-x") == []
        assert prompt_engine._AI_FAILURE.get().startswith("rate_limited:")
    finally:
        prompt_engine._MODEL_COOLDOWN.clear()
        prompt_engine._MODEL_COOLDOWN.update(saved)
