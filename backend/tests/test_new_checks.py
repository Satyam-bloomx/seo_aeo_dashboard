"""Checks added so scores rest on the data that matters: robots.txt validity, content-area word count, empty pages,
placeholder descriptions, page weight and DOM size."""
from app.services.extractor import extract_page
from app.services.robots_validation import validate_robots_txt
from app.services.scoring import compute_scores

MENU = "<header><nav>" + "".join(f"<a href='/c/{i}'>Category number {i} link</a>" for i in range(120)) + "</nav></header>"
FOOTER = "<footer>" + "About us contact shipping returns privacy terms " * 20 + "</footer>"


def _ad(html, url="https://e.com/pages/faqs", title="FAQs"):
    m, _l, _i = extract_page(f"<html><head><title>{title}</title>{html[0]}</head><body>{html[1]}</body></html>", url, {})
    return m["audit_data"]


# ---------------------------------------------------------------- robots.txt

def test_doubled_user_agent_is_an_error_and_counts_the_ignored_rules():
    """Regression (lifechangingastro.com): every group began 'User-agent: User-agent: *', so 86 rules were ignored."""
    text = "User-agent: User-agent: *\nDisallow: /cart\nDisallow: /admin\n\nUser-agent: GPTBot\nAllow: /\n"
    issues = validate_robots_txt(text)
    bad = next(i for i in issues if i["id"] == "robots_malformed_user_agent")
    assert (bad["type"], bad["priority"]) == ("Issue", "High")
    assert "2 Allow/Disallow rules" in bad["detail"]  # the GPTBot group is fine


def test_a_good_agent_line_in_the_same_group_keeps_its_rules():
    text = "User-agent: User-agent: *\nUser-agent: Googlebot\nDisallow: /x\n"
    bad = next(i for i in validate_robots_txt(text) if i["id"] == "robots_malformed_user_agent")
    assert "0 Allow/Disallow rules" in bad["detail"]


def test_rules_before_any_group_and_unknown_fields():
    issues = {i["id"]: i for i in validate_robots_txt("Disallow: /tmp\nUser-agent: *\nNoindex: /a\nFoo: bar\nbroken line\n")}
    assert issues["robots_rules_outside_group"]["type"] == "Issue"
    assert issues["robots_unsupported_fields"]["type"] == "Warning" and "foo" in issues["robots_unsupported_fields"]["detail"]
    assert issues["robots_unparseable_lines"]["type"] == "Warning"


def test_valid_missing_and_unreachable_robots():
    assert validate_robots_txt("User-agent: *\nDisallow: /cart\nSitemap: https://e.com/sitemap.xml") == []
    assert validate_robots_txt("", 404) == []  # no robots.txt: everything may be crawled, a valid choice
    down = validate_robots_txt(None, 503)
    assert down[0]["id"] == "robots_unreachable" and down[0]["priority"] == "High"


def test_robots_error_caps_site_health_and_shows_in_a_page_check():
    issue = validate_robots_txt("User-agent: User-agent: *\nDisallow: /cart\n")[0]
    pages = [{"id": i, "url": f"https://e.com/{i}", "status_code": 200, "content_type": "text/html",
              "audit_data": {"Page_Titles": {"Missing": False}}} for i in range(12)]
    site = compute_scores(pages, site_facts={"site_issues": [issue]})
    assert site["site_health"]["score"] == 70 and site["issues"]["errors"]["checks"] == 1
    single = compute_scores(pages[:1], mode="page", site_facts={"site_issues": [issue]})
    assert single["page_check"]["passed"] is False and single["page_check"]["site_issues"][0]["id"] == issue["id"]


# ---------------------------------------------------------------- content area

def test_word_count_ignores_menus_and_footers():
    """Regression (FAQ / Contact pages): ~500 words of menu passed the low-content check on a heading-only page."""
    ad = _ad(("", MENU + "<main><h1>FAQs</h1></main>" + FOOTER))
    assert ad["Content"]["Main Content Words"] <= 2
    assert ad["Content"]["Empty Main Content"] is True and ad["Content"]["Low Content Pages"] is True


def test_real_page_with_a_big_menu_is_not_thin():
    body = MENU + "<main><h1>Guide</h1><p>" + "Useful explanation of the topic. " * 60 + "</p></main>" + FOOTER
    ad = _ad(("", body))
    assert ad["Content"]["Main Content Words"] >= 240
    assert ad["Content"]["Empty Main Content"] is False and ad["Content"]["Low Content Pages"] is False


def test_empty_main_content_is_a_warning_not_an_error():
    ad = _ad(("", MENU + "<main><h1>FAQs</h1></main>"))
    page = {"id": 1, "url": "https://e.com/pages/faqs", "status_code": 200, "content_type": "text/html", "audit_data": ad}
    r = compute_scores([page], mode="page")
    empty = next(x for x in r["rules"] if x["id"] == "Content: Empty Main Content")
    assert empty["status"] == "fail" and empty["type"] == "Warning" and empty["is_error"] is False


# ---------------------------------------------------------------- descriptions, weight, DOM

def test_placeholder_and_title_copy_descriptions():
    """Regression (Shopify collections): '- Life Changing Astro' and a copy of the title."""
    dash = _ad(("<meta name='description' content='- Life Changing Astro'>", "<h1>x</h1>"), title="Moolank 1 - Life Changing Astro")
    copy = _ad(("<meta name='description' content='Natural Alexandrite - Life Changing Astro'>", "<h1>x</h1>"),
               title="Natural Alexandrite - Life Changing Astro")
    real = _ad(("<meta name='description' content='Certified natural alexandrite gemstones, graded and priced by carat.'>",
                "<h1>x</h1>"), title="Natural Alexandrite - Life Changing Astro")
    assert dash["Meta_Description"]["Placeholder or Copy of Title"] is True
    assert copy["Meta_Description"]["Placeholder or Copy of Title"] is True
    assert real["Meta_Description"]["Placeholder or Copy of Title"] is False


def test_heavy_html_and_large_dom_are_flagged():
    heavy = _ad(("", "<main>" + "<div><span>x</span></div>" * 1500 + "<!--" + "p" * 520_000 + "--></main>"))
    assert heavy["Validation"]["HTML Over 500KB"] is True and heavy["Validation"]["HTML Document Over 2MB"] is False
    assert heavy["Validation"]["DOM Over 1,400 Elements"] is True and heavy["Validation"]["DOM Elements"] > 1400
    light = _ad(("", "<main><p>small page</p></main>"))
    assert light["Validation"]["HTML Over 500KB"] is False and light["Validation"]["DOM Over 1,400 Elements"] is False


# ---------------------------------------------------------------- general websites, not one Shopify store

def test_wrapper_class_with_sidebar_does_not_hide_the_content():
    """A theme wrapper such as <div class="layout-sidebar"> around the whole page is content, not navigation."""
    body = ("<div class='site layout-sidebar-left'><div class='nav-menu'>Home About Blog Contact</div>"
            "<h1>Guide</h1><p>" + "Real article text about the topic. " * 40 + "</p></div>")
    ad = _ad(("", body))
    assert ad["Content"]["Main Content Words"] >= 200 and ad["Content"]["Empty Main Content"] is False


def test_robots_with_byte_order_mark_html_page_and_network_failure():
    assert validate_robots_txt("\ufeffUser-agent: *\nDisallow: /private\n") == []
    html = validate_robots_txt("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width'>")
    assert [i["id"] for i in html] == ["robots_is_html"] and html[0]["type"] == "Warning"
    ours = validate_robots_txt(None, None)  # our request failed: reported, never an error
    assert ours[0]["type"] == "Warning"


def test_promotions_are_not_statistics():
    from app.services.extractor import count_statistics
    assert count_statistics("Save 20% today. Flat 30% on beads. Up to 50% off. Get 10% cashback.") == 0
    assert count_statistics("Trusted by 50,000+ clients; studies show 30% fewer cases.") == 2


def test_urls_missing_from_a_partial_sitemap_are_a_warning_not_an_error():
    from app.services.scoring import RULES
    rule = next(r for r in RULES if r.id == "Sitemaps: URLs Not In Sitemap")
    assert rule.type == "Warning" and rule.ours is True


def test_short_identical_pages_are_not_exact_duplicates():
    a = _ad(("", "<main><h1>Login</h1><p>Sign in to your account</p></main>"), url="https://e.com/account/login")
    assert a["Content"]["Main_Text_Hash"] is None  # under 30 words: not compared as content
