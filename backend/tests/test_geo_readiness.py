"""GEO readiness: extractor facts and the 100-point rubric (app/services/geo_readiness.py)."""
from datetime import datetime, timezone

from app.services.extractor import extract_page, main_text_words
from app.services.geo_readiness import compute_geo_readiness
from app.services.scoring import compute_scores

NOW = datetime(2026, 11, 23, tzinfo=timezone.utc)

RICH = """<html><head><title>How long does a heat pump last? A complete guide</title>
<meta name="author" content="Asha Rao">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"Article","datePublished":"2026-06-01","dateModified":"2026-10-02","author":{"@type":"Person","name":"Asha Rao"}},
 {"@type":"Organization","name":"Acme","sameAs":["https://www.linkedin.com/company/acme","https://en.wikipedia.org/wiki/Acme"]}]}
</script></head><body><nav><a href="https://facebook.com/acme">Share</a></nav><main>
<h1>How long does a heat pump last?</h1>
<p>A well-maintained heat pump lasts 15 to 20 years, and annual servicing extends that by roughly 25% on average.</p>
<h2>What shortens a heat pump's life?</h2>
<p>Installers report that 40% of early failures come from poor sizing, according to the
<a href="https://www.energy.gov/heat-pumps">US Department of Energy</a>. """ + "Detailed guidance follows here. " * 40 + """</p>
<blockquote>"Sizing is the single biggest factor in heat pump longevity," says one engineer.</blockquote>
<ul><li>Clean filters</li><li>Annual service</li><li>Clear outdoor unit</li></ul>
</main></body></html>"""

SHELL = """<html><head><title>App</title><script src="/static/app.js"></script></head>
<body><div id="root"></div><noscript>You need to enable JavaScript to run this app.</noscript></body></html>"""


def _geo(html, url="https://acme.com/guides/heat-pump-life"):
    metrics, _l, _i = extract_page(html, url, {})
    return metrics


def _page(pid, html, url):
    m = _geo(html, url)
    return {"id": pid, "url": url, "status_code": 200, "content_type": "text/html",
            "indexability": m.get("indexability"), "indexability_status": m.get("indexability_status"),
            "audit_data": m["audit_data"]}


def test_extractor_collects_geo_facts():
    g = _geo(RICH)["audit_data"]["GEO"]
    assert g["Statistics"] >= 2 and g["Quotations"] >= 1
    assert g["Cited_Domains"] == 1  # energy.gov counts; the facebook share link in <nav> does not
    assert g["Question_Headings"] == 1 and g["Answer_First"] is True and g["Lists"] == 1
    assert g["Date_Modified"] == "2026-10-02" and g["Author"] is True and g["Org_SameAs_Count"] == 2
    assert g["JS_Dependent"] is False and g["NoSnippet"] is False


def test_empty_javascript_shell_is_flagged():
    g = _geo(SHELL)["audit_data"]["GEO"]
    assert g["JS_Dependent"] is True and g["JS_Check"] == "heuristic"
    assert main_text_words(SHELL) == 0


def test_page_built_by_an_inline_script_is_flagged():
    """Regression (quotes.toscrape.com/js/): no app root, but 14 words of HTML and a large script building the page."""
    html = ("<html><head><title>Quotes</title></head><body><div class='container'><h1>Quotes to Scrape</h1>"
            "<script>var data = [" + "{\"text\": \"a quote\", \"author\": \"someone\"}," * 80 + "];</script>"
            "</div><footer>Made with love</footer></body></html>")
    assert _geo(html)["audit_data"]["GEO"]["JS_Dependent"] is True


def test_listing_page_with_many_article_tiles_reads_the_whole_page():
    """Regression (books.toscrape.com): many <article> product tiles; the first tile is not the page's content."""
    tiles = "".join(f"<article><h3>Book {i}</h3><p>Loved by {i}0% of readers, {i} million copies sold</p></article>"
                    for i in range(1, 6))
    g = _geo(f"<html><head><title>Books</title></head><body>{tiles}</body></html>")["audit_data"]["GEO"]
    assert g["Statistics"] == 10  # two figures from every tile, not just the first


def test_prices_discounts_and_app_badges_are_not_evidence():
    """Regression (lifechangingastro.com): 176 prices and 56 "15% off" labels counted as statistics, and app-store
    badges as cited sources, gave a product grid full marks for quotable evidence."""
    html = ("<html><head><title>Shop</title></head><body><main>"
            + "<div><p>Rudraksha bracelet ₹1,299 <s>₹1,599</s> 15% off</p></div>" * 20
            + "<a href='https://apps.apple.com/app/x'><img src='badge.png' alt='App Store'></a>"
            + "<a href='https://play.google.com/store/apps/x'>Get it on Google Play</a>"
            + "<p>Trusted by 50,000+ clients. Research from <a href='https://www.nih.gov/x'>the NIH</a> shows 30% fewer "
            + "cases.</p></main></body></html>")
    g = _geo(html)["audit_data"]["GEO"]
    assert g["Statistics"] == 2  # "50,000+" and "30%", not the prices or the discounts
    assert g["Cited_Domains"] == 1  # nih.gov in a sentence; the app-store badge and button do not count


def test_missing_alt_text_is_a_low_priority_issue_not_an_error():
    """Screaming Frog lists missing alt text as an Issue of Low priority: listed, never an error on the page."""
    p = _page(1, RICH, "https://acme.com/guides/heat-pump-life")
    p["audit_data"]["Images"] = {"Total Images": 87, "Missing Alt Attribute": True, "Missing Alt Attribute Count": 2}
    r = compute_scores([p], mode="page")
    alt = next(x for x in r["rules"] if x["id"] == "Images: Missing Alt Attribute")
    assert alt["status"] == "fail" and alt["type"] == "Issue" and alt["priority"] == "Low" and alt["is_error"] is False
    assert r["page_check"]["errors"] == 0


def test_nosnippet_and_max_snippet_zero_block_quoting():
    head = '<meta name="robots" content="max-snippet:0">'
    g = _geo(RICH.replace("<head>", "<head>" + head))["audit_data"]["GEO"]
    assert g["NoSnippet"] is True


ROBOTS_OK = {"status": "ok", "agents": [{"agent": b, "allowed": True} for b in
                                         ("Googlebot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "GPTBot")],
             "training_bots_blocked": [], "llms_txt": {"present": False}}


def test_rich_page_scores_high_and_blocking_search_bots_costs_points():
    pages = [_page(1, RICH, "https://acme.com/guides/heat-pump-life"),
             _page(2, RICH.replace("heat pump", "boiler"), "https://acme.com/about"),
             _page(3, RICH.replace("heat pump", "furnace"), "https://acme.com/contact")]
    good = compute_geo_readiness(pages, True, ROBOTS_OK, now=NOW)
    assert good["status"] == "ok" and good["score"] == 100, good
    blocked = {**ROBOTS_OK, "agents": [{**a, "allowed": a["agent"] not in ("OAI-SearchBot", "PerplexityBot")}
                                       for a in ROBOTS_OK["agents"]]}
    worse = compute_geo_readiness(pages, True, blocked, now=NOW)
    bots = next(c for c in worse["components"] if c["key"] == "search_bots")
    assert bots["multiplier"] == 0.5 and "OAI-SearchBot" in bots["detail"]
    assert worse["score"] == 50  # invisible to half the AI search engines: half the readiness
    assert sum(r["impact"] for r in worse["explanation"]) == worse["score"] - 100


def test_being_reachable_earns_nothing_without_quotable_content():
    """Regression (lifechangingastro.com homepage: a product grid): passing the access checks alone used to be
    worth 50 of 88 points, so a page with no evidence, dates or question headings scored 76-90."""
    grid = ("<html><head><title>Shop astrology products</title></head><body><main><h1>Shop</h1>"
            + "".join(f"<div><h3>Rudraksha bracelet {i}</h3><p>Natural beads, handmade in India, ₹1,299, 15% off today</p></div>"
                      for i in range(40)) + "</main></body></html>")
    r = compute_geo_readiness([_page(1, grid, "https://shop.example/")], False, ROBOTS_OK, now=NOW)
    assert r["access_multiplier"] == 1.0
    assert r["score"] < 35, r  # reachable, but nothing quotable


def test_blocking_training_bots_is_not_penalised():
    pages = [_page(1, RICH, "https://acme.com/guides/heat-pump-life")]
    training_blocked = {**ROBOTS_OK, "agents": [{**a, "allowed": a["agent"] != "GPTBot"} for a in ROBOTS_OK["agents"]],
                        "training_bots_blocked": ["GPTBot"]}
    a = compute_geo_readiness(pages, True, ROBOTS_OK, now=NOW)
    b = compute_geo_readiness(pages, True, training_blocked, now=NOW)
    assert a["score"] == b["score"] and b["info"]["training_bots_blocked"] == ["GPTBot"]


def test_javascript_shell_site_loses_the_raw_html_points():
    shell = compute_geo_readiness([_page(1, SHELL, "https://app.acme.com/")], True, ROBOTS_OK, now=NOW)
    raw = next(c for c in shell["components"] if c["key"] == "raw_html")
    assert raw["multiplier"] == 0.25 and shell["score"] < 10


def test_old_crawls_without_geo_facts_report_no_data():
    old = {"id": 1, "url": "https://e.com/", "status_code": 200, "content_type": "text/html", "audit_data": {}}
    r = compute_scores([old], site_facts={"ai_crawlers": ROBOTS_OK})["geo_readiness"]
    assert r["status"] == "no_data" and "Re-run" in r["reason"]


def test_geo_readiness_is_returned_with_the_scores_and_never_moves_seo_scores():
    pages = [_page(1, RICH, "https://acme.com/guides/heat-pump-life")]
    with_bots = compute_scores(pages, site_facts={"ai_crawlers": ROBOTS_OK})
    without = compute_scores(pages)
    assert with_bots["geo_readiness"]["status"] == "ok"
    assert "search_bots" not in [c["key"] for c in without["geo_readiness"]["components"]]  # rescaled, not zeroed
    assert with_bots["site_health"] == without["site_health"] and with_bots["page_check"] == without["page_check"]


def test_blocked_ai_search_bots_reduce_the_aeo_score_too():
    """An AI provider may rate content 80/100, but engines that robots.txt blocks cannot fetch it to answer with it."""
    page = _page(1, RICH, "https://acme.com/guides/heat-pump-life")
    page["audit_data"]["AEO_Audit"] = {"AEO_Criteria": {"a": True, "b": True, "c": True, "d": True, "e": False}}
    allowed = compute_scores([page], site_facts={"ai_crawlers": ROBOTS_OK})["integrations"]["answer_readiness"]
    assert allowed["score"] == 80 and allowed["access_multiplier"] == 1.0
    blocked_robots = {**ROBOTS_OK, "agents": [{**a, "allowed": a["agent"] not in ("OAI-SearchBot", "PerplexityBot")}
                                              for a in ROBOTS_OK["agents"]]}
    blocked = compute_scores([page], site_facts={"ai_crawlers": blocked_robots})["integrations"]["answer_readiness"]
    assert blocked["ai_review_score"] == 80 and blocked["score"] == 40
    assert "OAI-SearchBot" in blocked["access_note"]
