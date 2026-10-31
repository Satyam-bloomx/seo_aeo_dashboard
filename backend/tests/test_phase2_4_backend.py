"""Phase 2-4 backend: page types, pagination, duplicate-exclusion counts, scoring rules and honest headline,
Core Web Vitals verdict, crawl settings and crawl robustness."""
import asyncio

from sqlalchemy import select

from app.services.crawler import CrawlerService, is_connection_error
from app.services.extractor import extract_page, pagination_base, pagination_number
from app.services.scoring import RULES, compute_scores, cwv_verdict, evaluate_rule


def _audit(url, body="", head="", headers=None, title="T"):
    html = f"<html><head><title>{title}</title>{head}</head><body>{body}</body></html>"
    metrics, _links, _images = extract_page(html, url, headers or {})
    return metrics


def _type(url, body="", head=""):
    return _audit(url, body, head)["audit_data"]["Page_Type"]["Type"]


PRICE = "<p class='price_color'>£51.77</p>"
BOOK_TABLE = "<table><tr><th>UPC</th><td>a897fe39b1053632</td></tr><tr><th>Availability</th><td>In stock</td></tr></table>"


# ---------------------------------------------------------------- page type

def test_books_toscrape_page_types():
    assert _type("https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html", PRICE + BOOK_TABLE) == "Product"
    assert _type("https://books.toscrape.com/catalogue/category/books/travel_2/index.html", PRICE * 12) == "Category"
    assert _type("https://books.toscrape.com/catalogue/page-2.html", PRICE * 20) == "Pagination"
    assert _type("https://books.toscrape.com/catalogue/category/books/mystery_3/page-2.html", PRICE * 20) == "Pagination"
    assert _type("https://books.toscrape.com/index.html", PRICE * 20) == "Home"


def test_product_schema_and_url_patterns():
    ld = '<script type="application/ld+json">{"@type":"Product","name":"Shoe"}</script>'
    pt = _audit("https://shop.example/anything/shoe", head=ld)["audit_data"]["Page_Type"]
    assert pt["Type"] == "Product" and "Product/Offer structured data" in pt["Signals"]
    assert _type("https://shop.example/products/blue-shoe") == "Product"
    assert _type("https://shop.example/collections/shoes/products/blue-shoe") == "Product"
    assert _type("https://shop.example/p/123") == "Product"
    assert _type("https://shop.example/item/blue-shoe") == "Product"
    cart = "<span class='amount'>$19.99</span><span class='price'>$19.99</span><button>Add to cart</button>"
    assert _type("https://shop.example/blue-shoe", cart) == "Product"


def test_category_patterns_and_listing_schema():
    assert _type("https://shop.example/collections/shoes") == "Category"
    assert _type("https://shop.example/category/shoes/") == "Category"
    assert _type("https://shop.example/shop/") == "Category"
    ld = '<script type="application/ld+json">{"@type":"CollectionPage"}</script>'
    assert _type("https://shop.example/men/shoes", head=ld) == "Category"
    assert _type("https://shop.example/sale", "<span class='price'>$1</span>" * 6) == "Category"


def test_blog_pages_and_archives():
    assert _type("https://bloomxsolutions.com/") == "Home"
    assert _type("https://bloomxsolutions.com/blogs/") == "Blog Index"
    assert _type("https://bloomxsolutions.com/blogs/2/") == "Pagination"
    assert _type("https://bloomxsolutions.com/blog/seo-guide") == "Blog Post"
    ld = '<script type="application/ld+json">{"@type":"BlogPosting","headline":"x"}</script>'
    assert _type("https://bloomxsolutions.com/learn/what-is-seo", head=ld) == "Blog Post"
    assert _type("https://example.com/author/jane/") == "Author/Archive"
    assert _type("https://example.com/tag/seo/") == "Author/Archive"
    assert _type("https://example.com/2024/05/") == "Author/Archive"
    assert _type("https://example.com/about") == "Page"
    assert _type("https://example.com/whatever") == "Other"


def test_page_type_has_signals():
    pt = _audit("https://shop.example/products/x")["audit_data"]["Page_Type"]
    assert set(pt) == {"Type", "Signals"} and pt["Signals"]


# ---------------------------------------------------------------- pagination

def test_pagination_number_patterns():
    assert pagination_number("https://e.com/blog/page/3/") == 3
    assert pagination_number("https://e.com/catalogue/page-2.html") == 2
    assert pagination_number("https://e.com/shop?page=4") == 4
    assert pagination_number("https://e.com/list?p=2") == 2
    assert pagination_number("https://e.com/blogs/2/") == 2
    assert pagination_number("https://e.com/category/shoes/3/") == 3
    assert pagination_number("https://e.com/2024/") is None          # a year archive, not page 2024
    assert pagination_number("https://e.com/products/123") is None   # a product id
    assert pagination_base("https://e.com/blog/page/3/") == pagination_base("https://e.com/blog/")
    assert pagination_base("https://e.com/c/mystery_3/page-2.html") == pagination_base("https://e.com/c/mystery_3/index.html")


def test_pagination_block_and_canonical_to_first_page():
    canon = '<link rel="canonical" href="https://e.com/blog/">'
    pg = _audit("https://e.com/blog/page/2/", head=canon)["audit_data"]["Pagination"]
    assert pg["Paginated"] and pg["Page Number"] == 2
    assert pg["Canonicalised To First Page"] is True and pg["Duplicate Title From Pagination"] is False
    own = '<link rel="canonical" href="https://e.com/blog/page/2/">'
    assert _audit("https://e.com/blog/page/2/", head=own)["audit_data"]["Pagination"]["Canonicalised To First Page"] is False
    plain = _audit("https://e.com/about")["audit_data"]["Pagination"]
    assert plain["Paginated"] is False and plain["Page Number"] is None and plain["Canonicalised To First Page"] is False


def test_rel_prev_marks_a_paginated_page():
    m = _audit("https://e.com/news?x=1", head='<link rel="prev" href="https://e.com/news">')
    assert m["audit_data"]["Pagination"]["Paginated"] is True
    assert m["audit_data"]["Page_Type"]["Type"] == "Pagination"


# ---------------------------------------------------------------- post-processor reporting

def test_duplicates_excluded_and_pagination_duplicate_titles(client, monkeypatch):
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl, Page
    from app.services import ai_crawlers
    from app.services.post_processor import PostProcessor

    async def no_net(_seed):
        return {"status": "skipped", "agents": []}
    monkeypatch.setattr(ai_crawlers, "check_ai_crawler_access", no_net)

    def make(crawl_id, url, status=200, title="Shop", head="", body="<h1>Shop</h1>" + "word " * 60):
        m = _audit(url, body, head, title=title)
        cols = {k: v for k, v in m.items() if hasattr(Page, k)}
        return Page(crawl_id=crawl_id, url=url, status_code=status, content_type="text/html", **{**cols, "title_1": title})

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "phase24-user")
            crawl = Crawl(project_id=pid, seed_url="https://shop.test/", status="running", summary={"settings": {"max_pages": 5}})
            db.add(crawl)
            await db.commit()
            cid = crawl.id
            noindex = '<meta name="robots" content="noindex">'
            canon = '<link rel="canonical" href="https://shop.test/other">'
            db.add_all([
                make(cid, "https://shop.test/blog/", title="Blog"),
                make(cid, "https://shop.test/blog/page/2/", title="Blog"),                      # same title, series
                make(cid, "https://shop.test/blog/page/3/", title="Blog", head='<link rel="canonical" href="https://shop.test/blog/">'),
                make(cid, "https://shop.test/hidden", title="Hidden", head=noindex),
                make(cid, "https://shop.test/dupe", title="Dupe", head=canon),
                make(cid, "https://shop.test/gone", status=404, title="Gone"),
            ])
            await db.commit()
            await PostProcessor(cid, db, mode="page").run()
            await db.refresh(crawl)
            pages = {p.url.replace("https://shop.test", ""): p for p in
                     (await db.execute(select(Page).where(Page.crawl_id == cid))).scalars().all()}
            return crawl, pages

    crawl, pages = asyncio.run(go())
    assert crawl.summary["duplicates_excluded"] == {"canonicalised": 2, "noindex": 1, "non_200": 1}
    assert crawl.summary["settings"] == {"max_pages": 5}  # the merge keeps what was already recorded
    page_1, page_2 = pages["/blog/"], pages["/blog/page/2/"]
    assert page_2.audit_data["Pagination"]["Duplicate Title From Pagination"] is True
    assert page_1.audit_data["Page_Titles"]["Duplicate"] is True
    assert pages["/blog/page/3/"].audit_data["Pagination"]["Canonicalised To First Page"] is True
    assert pages["/blog/page/3/"].audit_data["Page_Titles"]["Duplicate"] is False  # canonicalised: left out of duplicate checks


# ---------------------------------------------------------------- scoring rules

def _scored_page(pid, status=200, **audit):
    base = {"Page_Titles": {"Missing": False}, "Security": {"HTTP URLs": False}}
    base.update(audit)
    return {"id": pid, "url": f"https://e.com/{pid}", "status_code": status, "content_type": "text/html",
            "indexability": "Indexable", "indexability_status": "Indexable", "audit_data": base}


def _rule(rule_id):
    return next(r for r in RULES if r.id == rule_id)


def _result(scores, rule_id):
    return next(r for r in scores["rules"] if r["id"] == rule_id)


def test_product_pages_missing_product_schema():
    rid = "Structured Data: Product Pages Missing Product Schema"
    no_schema = _scored_page(1, Page_Type={"Type": "Product"}, Structured_Data={"Schema_Types": ["Organization"]})
    with_schema = _scored_page(2, Page_Type={"Type": "Product"}, Structured_Data={"Schema_Types": ["Product"]})
    other = _scored_page(3, Page_Type={"Type": "Blog Post"}, Structured_Data={"Schema_Types": []})
    assert evaluate_rule(_rule(rid), no_schema) is True
    assert evaluate_rule(_rule(rid), with_schema) is False
    assert evaluate_rule(_rule(rid), other) is None  # only product pages are judged
    assert _rule(rid).severity == "warning"


def test_missing_canonical_escalates_with_duplicates():
    rid = "Canonicals: Missing"
    clean = [_scored_page(i, Canonicals={"Missing": True}) for i in (1, 2)]
    assert _result(compute_scores(clean), rid)["severity"] == "notice"
    dup = [_scored_page(1, Canonicals={"Missing": True}, Page_Titles={"Missing": False, "Duplicate": True}),
           _scored_page(2, Canonicals={"Missing": True}, Page_Titles={"Missing": False, "Duplicate": True})]
    escalated = _result(compute_scores(dup), rid)
    assert escalated["severity"] == "warning" and escalated["escalated"] is True
    exact = [_scored_page(1, Canonicals={"Missing": True}, Content={"Exact Duplicates": True})]
    assert _result(compute_scores(exact), rid)["severity"] == "warning"
    # single-page audits have no site-level duplicates, so the severity stays a notice
    assert _result(compute_scores(dup, mode="page"), rid)["severity"] == "notice"


def test_noindex_notice_rule_barely_moves_the_score():
    rid = "Directives: Noindex"
    noindexed = _scored_page(1, Directives={"NoIndex": True})
    assert evaluate_rule(_rule(rid), noindexed) is True and _rule(rid).severity == "notice"
    pages = [_scored_page(i, Directives={"NoIndex": False}) for i in range(10)]
    pages[0] = noindexed
    sh = compute_scores(pages)["site_health"]
    assert _result(compute_scores(pages), rid)["failing_count"] == 1
    assert sh["score"] >= 98


def test_pagination_rules_and_no_double_penalty():
    canon_rule = "Pagination: Paginated Page Canonicalised To First Page"
    p = _scored_page(1, Pagination={"Canonicalised To First Page": True, "Duplicate Title From Pagination": False})
    assert evaluate_rule(_rule(canon_rule), p) is True and _rule(canon_rule).severity == "warning"
    # a title duplicate explained by pagination is a notice on its own rule, not a second warning
    dup = _scored_page(2, Page_Titles={"Missing": False, "Duplicate": True},
                       Pagination={"Canonicalised To First Page": False, "Duplicate Title From Pagination": True})
    assert evaluate_rule(_rule("Page Titles: Duplicate"), dup) is False
    assert evaluate_rule(_rule("Pagination: Duplicate Title From Pagination"), dup) is True
    real = _scored_page(3, Page_Titles={"Missing": False, "Duplicate": True},
                        Pagination={"Canonicalised To First Page": False, "Duplicate Title From Pagination": False})
    assert evaluate_rule(_rule("Page Titles: Duplicate"), real) is True


# ---------------------------------------------------------------- Core Web Vitals verdict

def test_cwv_verdict_uses_measured_metrics_only():
    v = cwv_verdict({"lcp_p75_ms": 2200, "cls_p75": 0.01, "inp_p75_ms": None})
    assert v == {"lcp_good": True, "inp_good": None, "cls_good": True, "passed": True}
    assert cwv_verdict({"lcp_p75_ms": 2200, "cls_p75": 0.3})["passed"] is False
    assert cwv_verdict({"lcp_p75_ms": 3000, "inp_p75_ms": 100, "cls_p75": 0.01})["lcp_good"] is False
    assert cwv_verdict({"inp_p75_ms": 500, "cls_p75": 0.3})["passed"] is None  # no LCP: no verdict


def _ps_page(pid, field=None, lab=None, status=200):
    mobile = {"performance_score": lab, "metrics": {}, "field_data": field or {"available": False}}
    return _scored_page(pid, status=status, PageSpeed={"mobile": mobile, "desktop": None})


def test_integration_scores_expose_null_for_missing_metrics():
    field = {"available": True, "lcp_p75_ms": 2200, "cls_p75": 0.01}
    cwv = compute_scores([_ps_page(1, field, 80)])["integrations"]["pagespeed"]["core_web_vitals"]
    assert cwv["passed"] is True and cwv["inp_good"] is None and cwv["lcp_good"] is True


# ---------------------------------------------------------------- one honest headline

def _impacts(scores):
    return sum(i["impact"] for i in scores["score_explanation"])


def test_score_explanation_sums_to_the_gap_from_100():
    pages = [_scored_page(1, Page_Titles={"Missing": True}), _scored_page(2, Page_Titles={"Missing": False, "Duplicate": True}),
             _scored_page(3), _scored_page(4, status=404), _scored_page(5)]
    s = compute_scores(pages)
    assert s["site_health"]["score"] == 100 + _impacts(s)
    assert all(set(i) == {"label", "impact", "detail"} and isinstance(i["impact"], int) for i in s["score_explanation"])
    assert [i["impact"] for i in s["score_explanation"]] == sorted(i["impact"] for i in s["score_explanation"])
    assert compute_scores([_scored_page(1), _scored_page(2)])["score_explanation"] == []  # nothing lost: empty


def test_failing_core_web_vitals_lowers_the_headline():
    clean = [_scored_page(i) for i in range(1, 7)]
    base = compute_scores(clean)["site_health"]["score"]
    failing = [_ps_page(1, {"available": True, "lcp_p75_ms": 32000, "inp_p75_ms": 900, "cls_p75": 0.4})] + clean[1:]
    s = compute_scores(failing)
    assert base == 100 and s["site_health"]["score"] == 90  # 4 + 2 x 3 failing metrics, capped at 10
    assert s["site_health"]["base_score"] == 100
    item = next(i for i in s["score_explanation"] if i["label"].startswith("Core Web Vitals"))
    assert item["impact"] == -10 and "LCP" in item["detail"]
    passing = [_ps_page(1, {"available": True, "lcp_p75_ms": 2000, "cls_p75": 0.02})] + clean[1:]
    assert compute_scores(passing)["site_health"]["score"] == 100


def test_poor_lab_score_without_field_data_lowers_the_headline():
    clean = [_scored_page(i) for i in range(2, 7)]
    s = compute_scores([_ps_page(1, None, 30)] + clean)
    assert s["site_health"]["score"] == 90  # (90 - 30) / 6 = 10 points, the cap
    assert compute_scores([_ps_page(1, None, 95)] + clean)["site_health"]["score"] == 100


def test_error_pages_weigh_in_proportionally():
    few = [_scored_page(i) for i in range(1, 100)] + [_scored_page(100, status=404)]
    many = [_scored_page(i) for i in range(1, 51)] + [_scored_page(i, status=500) for i in range(51, 101)]
    a, b = compute_scores(few), compute_scores(many)
    err_a = next(i for i in a["score_explanation"] if i["label"] == "Pages returning errors")
    err_b = next(i for i in b["score_explanation"] if i["label"] == "Pages returning errors")
    assert err_a["impact"] == -2 and err_b["impact"] == -20  # 1% -> 2 points; 50% -> capped at 20
    assert a["site_health"]["score"] == 100 + _impacts(a) and b["site_health"]["score"] == 100 + _impacts(b)
    assert b["site_health"]["score"] >= 0


def test_penalties_never_push_the_score_below_zero():
    pages = [_ps_page(i, {"available": True, "lcp_p75_ms": 9000, "cls_p75": 0.9}, status=404) for i in range(1, 6)]
    s = compute_scores(pages)
    assert s["site_health"]["score"] >= 0
    assert s["site_health"]["score"] == 100 + _impacts(s)


# ---------------------------------------------------------------- crawl settings and robustness

def test_crawl_settings_used_records_effective_values():
    from app.api.endpoints import crawl_settings_used
    from app.models.schemas import CrawlRequest
    req = CrawlRequest(seed_url="https://e.com", max_pages=120, max_depth=3, exclude_paths="/cart\n\n/tag/*",
                       ignore_robots=True, user_agent="MyBot/1.0")
    s = crawl_settings_used(req)
    assert s["max_pages"] == 120 and s["max_depth"] == 3 and s["exclude_paths"] == ["/cart", "/tag/*"]
    assert s["ignore_robots"] is True and s["user_agent"] == "MyBot/1.0" and s["mode"] == "site"
    page = crawl_settings_used(CrawlRequest(seed_url="https://e.com", mode="page", max_pages=500))
    assert page["max_pages"] == 2 and page["max_depth"] == 0 and "user_agent" not in page


def test_connection_error_detection():
    import socket
    assert is_connection_error(socket.gaierror("getaddrinfo failed"))
    assert is_connection_error(OSError("Connection reset by peer"))
    assert not is_connection_error(ValueError("bad value for column"))


class _FakeDb:
    """Commit fails once with a dropped connection, then works; rolled-back rows can be re-added."""
    def __init__(self, fail_times):
        self.fail_times, self.commits, self.added, self.new = fail_times, 0, [], ["row-1", "row-2"]

    async def commit(self):
        if self.fail_times:
            self.fail_times -= 1
            raise OSError("getaddrinfo failed")
        self.commits += 1

    async def rollback(self):
        self.new = []

    def add_all(self, rows):
        self.added.extend(rows)


def _flush_crawler(db):
    c = CrawlerService.__new__(CrawlerService)
    c.db, c.crawl_id, c.batch_count, c.last_flush_time = db, 1, 3, 0.0
    c.BATCH_SIZE, c.FLUSH_INTERVAL, c._uncommitted = 15, 0.0, []
    return c


def test_flush_retries_once_on_connection_error(monkeypatch):
    monkeypatch.setattr("app.services.crawler.DB_RETRY_PAUSE_SECONDS", 0)
    db = _FakeDb(fail_times=1)
    asyncio.run(_flush_crawler(db)._flush_db_batch(force=True))
    assert db.commits == 1 and db.added == ["row-1", "row-2"]  # the batch was replayed, not dropped


def test_flush_drops_batch_after_second_failure(monkeypatch):
    monkeypatch.setattr("app.services.crawler.DB_RETRY_PAUSE_SECONDS", 0)
    db = _FakeDb(fail_times=2)
    c = _flush_crawler(db)
    asyncio.run(c._flush_db_batch(force=True))
    assert db.commits == 0 and c.batch_count == 0  # logged and dropped, the crawl continues


def test_final_status_is_retried_and_stale_crawls_are_swept(client, monkeypatch):
    from datetime import datetime, timedelta
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl
    from app.services import crawler as crawler_mod
    from app.services.ttl_cleanup_service import fail_stale_running_crawls

    monkeypatch.setattr(crawler_mod, "STATUS_RETRY_DELAYS", (0, 0, 0))

    class Flaky:
        """First get() raises a connection error; afterwards it delegates to a real session."""
        def __init__(self, real):
            self.real, self.calls = real, 0

        async def get(self, *a, **k):
            self.calls += 1
            if self.calls == 1:
                raise OSError("connection reset")
            return await self.real.get(*a, **k)

        async def commit(self):
            await self.real.commit()

        async def rollback(self):
            await self.real.rollback()

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "phase24-sweep")
            fresh = Crawl(project_id=pid, seed_url="https://a.test/", status="running")
            stale = Crawl(project_id=pid, seed_url="https://b.test/", status="running",
                          started_at=datetime.utcnow() - timedelta(hours=3))
            db.add_all([fresh, stale])
            await db.commit()
            flaky = Flaky(db)
            ok = await crawler_mod.mark_crawl_status(flaky, fresh.id, "completed")
            closed = await fail_stale_running_crawls(max_running_hours=2)
            await db.refresh(fresh)
            await db.refresh(stale)
            return ok, flaky.calls, closed, fresh.status, stale.status

    ok, calls, closed, fresh_status, stale_status = asyncio.run(go())
    assert ok and calls == 2 and fresh_status == "completed"
    assert closed >= 1 and stale_status == "failed"


def test_product_page_with_price_table_is_not_a_category():
    # Product pages often repeat the price (excl./incl. tax, tax) in a details table.
    html = ("<html><head><title>Soumission</title></head><body><h1>Soumission</h1>"
            '<p class="price_color">£50.10</p>'
            "<table><tr><th>UPC</th><td>6957f44c3847a760</td></tr>"
            '<tr><th>Price (excl. tax)</th><td class="price">£50.10</td></tr>'
            '<tr><th>Price (incl. tax)</th><td class="price">£50.10</td></tr>'
            '<tr><th>Tax</th><td class="price">£0.00</td></tr></table>'
            '<p class="price_color">£50.10</p></body></html>')
    m, _, _ = extract_page(html, "https://books.toscrape.com/catalogue/soumission_998/index.html", {})
    assert m["audit_data"]["Page_Type"]["Type"] == "Product"
