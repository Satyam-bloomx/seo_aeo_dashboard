"""Phase 3: pagination parameters survive URL clean-up; site-wide template problems lower the headline score."""
from app.services.crawler import CrawlerService
from app.services.scoring import compute_scores


def _cleaner(ignore_params=True):
    c = CrawlerService.__new__(CrawlerService)
    c.ignore_url_params = ignore_params
    return c


def test_pagination_parameter_is_kept_when_ignoring_parameters():
    c = _cleaner()
    assert c._clean_crawl_url("https://shop.com/c/shoes?sort=price&page=3&utm_source=x") == "https://shop.com/c/shoes?page=3"
    assert c._clean_crawl_url("https://sandbox.oxylabs.io/products?page=2") == "https://sandbox.oxylabs.io/products?page=2"


def test_other_parameters_are_still_dropped():
    c = _cleaner()
    assert c._clean_crawl_url("https://shop.com/c/shoes?color=red") == "https://shop.com/c/shoes"
    assert c._clean_crawl_url("https://shop.com/?page=abc") == "https://shop.com/"


def _page(i, h1_missing):
    return {
        "id": i, "url": f"https://shop.com/product/{i}", "status_code": 200, "content_type": "text/html",
        "indexability": "Indexable", "indexability_status": "Indexable",
        "audit_data": {"H1": {"Missing": h1_missing}, "Page_Titles": {"Missing": False}},
    }


def test_check_failing_on_almost_every_page_lowers_the_headline():
    everywhere = compute_scores([_page(i, True) for i in range(10)], "site")
    nowhere = compute_scores([_page(i, False) for i in range(10)], "site")
    labels = [r["label"] for r in everywhere["score_explanation"]]
    assert "Problems on almost every page" in labels
    assert "Problems on almost every page" not in [r["label"] for r in nowhere["score_explanation"]]
    assert sum(r["impact"] for r in everywhere["score_explanation"]) == everywhere["site_health"]["score"] - 100


def test_a_few_pages_failing_is_not_site_wide():
    pages = [_page(i, i < 3) for i in range(10)]  # 30%
    labels = [r["label"] for r in compute_scores(pages, "site")["score_explanation"]]
    assert "Problems on almost every page" not in labels


def _type(url, head="", body=""):
    from app.services.extractor import extract_page
    m, _, _ = extract_page(f"<html><head><title>t</title>{head}</head><body>{body}</body></html>", url, {})
    return m["audit_data"]["Page_Type"]["Type"]


def test_wordpress_pages_marked_og_article_are_not_blog_posts():
    og = '<meta property="og:type" content="article">'
    assert _type("https://wordpress.org/about/", head=og) == "Page"
    assert _type("https://wordpress.org/education/", head=og) == "Page"
    dated = og + '<meta property="article:published_time" content="2026-10-01">'
    assert _type("https://wordpress.org/news/2026/10/a-post/", head=dated) == "Blog Post"


def test_free_software_offer_is_not_a_shop_product():
    ld = '<script type="application/ld+json">{"@type":"SoftwareApplication","offers":{"@type":"Offer","price":"0"}}</script>'
    assert _type("https://wordpress.org/download/", body=ld) == "Page"


def test_documentation_pages_are_docs():
    assert _type("https://react.dev/learn/thinking-in-react") == "Docs"
    ld = '<script type="application/ld+json">{"@type":"TechArticle","headline":"x"}</script>'
    assert _type("https://example.com/how-it-works", head=ld) == "Docs"
