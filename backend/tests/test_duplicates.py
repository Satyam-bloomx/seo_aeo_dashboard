"""Duplicate classification: real copies vs product variants vs thin templated pages vs near duplicates."""
import hashlib

from app.services.duplicates import classify_duplicates
from app.services.extractor import minhash_signature, product_name_key

# A realistic product template: ~400 distinct words shared by every listing (real pages carry 600+).
_TOPICS = ["certification", "lab report", "authenticity card", "wearing day", "ring finger", "metal choice", "prayer",
           "energising", "cleaning", "storage", "shipping", "returns", "payment", "packaging", "consultation",
           "astrologer advice", "planet", "ruling sign", "weight guide", "ratti conversion"]
TEMPLATE = " ".join(f"Section {n} on {topic}: our {topic} guidance explains step {n} for every buyer, covering "
                    f"{topic} questions that customers ask most often about item {n}."
                    for n, topic in enumerate(_TOPICS * 2))


def _page(pid, url, text, name, sku=None, price=None, group=None):
    return {"id": pid, "url": url, "content_hash": None,
            "content": {"Main_Text_Hash": hashlib.md5(text.lower().encode()).hexdigest(), "MinHash": minhash_signature(text),
                        "Name_Key": product_name_key(name), "Main Content Words": len(text.split())},
            "structured": {"Product_SKU": sku, "Product_Price": price, "Product_Group_ID": group}}


def _gem(pid, stone, carats, sku):
    text = f"Natural {stone} {carats} Carats. " + TEMPLATE + f" Price for this {carats} carat {stone} only."
    return _page(pid, f"https://shop.test/products/natural-{stone.lower()}-{carats}-carats", text,
                 f"Natural {stone} {carats} Carats", sku=sku, price=str(1000 + pid))


def test_name_key_drops_numbers_and_units():
    assert product_name_key("Natural African Ruby (Manik) 8.29 Carats") == "natural african ruby manik"
    assert product_name_key("Natural African Ruby (Manik) 12.36 Carats") == "natural african ruby manik"
    assert product_name_key("Moolank 7 Oil 30 ml") == product_name_key("Moolank 3 Oil 10 ml")


def test_same_product_in_different_weights_is_a_variant_not_a_duplicate():
    v = classify_duplicates([_gem(1, "Ruby", "8.29", "RU1"), _gem(2, "Ruby", "12.36", "RU2")])
    assert v[1]["Product Variants"] and not v[1]["Near Duplicates"] and not v[1]["Exact Duplicates"]


def test_identical_content_on_two_urls_is_a_real_copy():
    """Regression (Shopify '-1' handles): one listing published twice."""
    a = _gem(1, "Ruby", "8.29", "RU1")
    b = {**a, "id": 2, "url": a["url"] + "-1"}
    v = classify_duplicates([a, b])
    assert v[1]["Exact Duplicates"] == [b["url"]] and v[2]["Exact Duplicates"] == [a["url"]]


def test_many_different_products_on_one_template_are_thin_templated():
    stones = ["Ruby", "Emerald", "Sapphire", "Garnet", "Opal", "Topaz", "Pearl", "Coral", "Hessonite", "Zircon", "Peridot", "Agate"]
    pages = [_gem(i, s, "5.10", f"S{i}") for i, s in enumerate(stones)]
    v = classify_duplicates(pages)
    flagged = [pid for pid, r in v.items() if r["Thin Templated Pages"]]
    assert len(flagged) == len(stones)
    assert all(v[pid]["unique_words_estimate"] < 100 for pid in flagged)


def test_a_few_near_identical_pages_are_near_duplicates_not_templated():
    pages = [_gem(1, "Ruby", "5.10", "A"), _gem(2, "Emerald", "5.10", "B")]
    v = classify_duplicates(pages)
    assert v[1]["Near Duplicates"] and not v[1]["Thin Templated Pages"]


def test_different_articles_are_not_duplicates():
    a = _page(1, "https://shop.test/blogs/a", "How to cleanse a rudraksha with water, milk and sandalwood paste before "
              "wearing it for the first time, and why the day of the week matters in tradition. " * 8, "Cleanse a rudraksha")
    b = _page(2, "https://shop.test/blogs/b", "Dev Uthani Ekadashi falls in November this year; here is the parana time, "
              "the Tulsi Vivah ritual and the wedding season that opens after Chaturmas ends. " * 8, "Dev Uthani Ekadashi")
    v = classify_duplicates([a, b])
    assert not any(v[1][k] for k in ("Exact Duplicates", "Near Duplicates", "Thin Templated Pages", "Product Variants"))


def test_shared_product_group_marks_variants_even_with_different_names():
    a = _page(1, "https://shop.test/products/tee-red", "Cotton tee in red. " + TEMPLATE, "Classic tee red", group="TEE1")
    b = _page(2, "https://shop.test/products/tee-blue", "Cotton tee in blue. " + TEMPLATE, "Classic tee blue", group="TEE1")
    v = classify_duplicates([a, b])
    assert v[1]["Product Variants"] == [b["url"]]


def test_large_template_clusters_stay_fast():
    import time
    pages = [_gem(i, f"Stone{i % 50}", f"{i}.{i % 9}", f"S{i}") for i in range(1500)]
    start = time.time()
    classify_duplicates(pages)
    assert time.time() - start < 20
