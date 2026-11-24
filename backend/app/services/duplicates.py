"""Duplicate content, classified so e-commerce sites are judged fairly.

Inputs are indexable 200 pages that do not canonicalise elsewhere: the same product reachable at several URLs
(/collections/x/products/y, ?variant=) points its canonical at one URL, so it never reaches this step.

Each page's content area (menus and footers excluded) carries an MD5 hash and a 64-function MinHash signature over
word 5-shingles (the method Screaming Frog uses, which flags near duplicates at 90% similarity; Semrush uses 85%).
Pairs are found with locality-sensitive hashing so thousands of templated pages do not need millions of
comparisons. Every match is then classified:

  * Exact Duplicates      identical content area on different URLs: a real copy (Screaming Frog: Issue, High).
  * Product Variants      near-identical pages whose product names differ only by numbers or units ("Ruby 8.29 Carats"
                          vs "Ruby 12.36 Carats"), or that share a ProductGroup ID. Different purchasable items, so
                          informational: the fix is ProductGroup / hasVariant markup, not a canonical.
  * Thin Templated Pages  10+ pages of one URL pattern that are near-identical and have under 100 words of their own
                          once the shared template is set aside (Google may fold them together). Warning.
  * Near Duplicates       any other match at 85%+ similarity (Screaming Frog: Warning, Medium).
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

NEAR_THRESHOLD = 0.85
BANDS, ROWS = 16, 4            # 16 bands x 4 rows of a 64-value signature: pairs at 85% collide with ~99% probability
MAX_CANDIDATES = 40            # neighbours compared per page: keeps huge template clusters linear in page count
TEMPLATE_MIN_PAGES = 10
TEMPLATE_MAX_UNIQUE_WORDS = 100


def _similarity(a: List[int], b: List[int]) -> float:
    return sum(1 for x, y in zip(a, b) if x == y) / len(a)


def _pattern(url: str) -> str:
    """The first path segment ("products", "collections", "blogs"): pages of one template share it."""
    parts = [p for p in urlparse(url or "").path.split("/") if p]
    return parts[0].lower() if parts else ""


def _is_product(p: dict) -> bool:
    s = p["structured"]
    return p.get("page_type") == "Product" or bool(s.get("Product_SKU") or s.get("Product_Price") or s.get("Product_Group_ID"))


def _is_variant(a: dict, b: dict) -> bool:
    """Only products have variants: two blog posts titled "Top 5 tips" and "Top 10 tips" are not variants."""
    if not (_is_product(a) and _is_product(b)):
        return False
    ga, gb = a["structured"].get("Product_Group_ID"), b["structured"].get("Product_Group_ID")
    if ga and ga == gb:
        return True
    na, nb = a["content"].get("Name_Key"), b["content"].get("Name_Key")
    if not na or na != nb:
        return False
    sa, sb = a["structured"].get("Product_SKU"), b["structured"].get("Product_SKU")
    return not (sa and sa == sb)  # the same name and the same SKU is one product listed twice, not a variant


class _UnionFind:
    def __init__(self):
        self.parent: Dict[Any, Any] = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        self.parent[self.find(a)] = self.find(b)


def classify_duplicates(pages: List[dict]) -> Dict[Any, Dict[str, Any]]:
    """pages: [{id, url, content_hash, content: {Main_Text_Hash, MinHash, Name_Key, Main Content Words},
    structured: {Product_SKU, Product_Price, Product_Group_ID}}]. Returns {id: {"Exact Duplicates": [urls],
    "Near Duplicates": [...], "Thin Templated Pages": [...], "Product Variants": [...], "unique_words_estimate": n}}."""
    by_id = {p["id"]: p for p in pages}
    out: Dict[Any, Dict[str, Any]] = {pid: {"Exact Duplicates": [], "Near Duplicates": [], "Thin Templated Pages": [],
                                            "Product Variants": [], "unique_words_estimate": None} for pid in by_id}

    # Exact: identical content area (older crawls without it fall back to the whole-page hash).
    exact_groups: Dict[str, List[Any]] = defaultdict(list)
    for p in pages:
        key = p["content"].get("Main_Text_Hash") or (f"page:{p['content_hash']}" if p.get("content_hash") else None)
        if key:
            exact_groups[key].append(p["id"])
    exact_of: Dict[Any, set] = defaultdict(set)
    for ids in exact_groups.values():
        if len(ids) > 1:
            for pid in ids:
                exact_of[pid] = set(ids) - {pid}
                out[pid]["Exact Duplicates"] = [by_id[q]["url"] for q in ids if q != pid]

    # Near: LSH candidates, then the signature similarity.
    sigs = {p["id"]: p["content"]["MinHash"] for p in pages
            if isinstance(p["content"].get("MinHash"), list) and len(p["content"]["MinHash"]) == BANDS * ROWS}
    buckets: Dict[tuple, List[Any]] = defaultdict(list)
    for pid, sig in sigs.items():
        for band in range(BANDS):
            buckets[(band, tuple(sig[band * ROWS:(band + 1) * ROWS]))].append(pid)
    candidates: Dict[Any, set] = defaultdict(set)
    for members in buckets.values():
        if len(members) < 2:
            continue
        members = sorted(members, key=str)
        for i, pid in enumerate(members):
            if len(candidates[pid]) >= MAX_CANDIDATES:
                continue
            for q in members[max(0, i - MAX_CANDIDATES // 2): i + MAX_CANDIDATES // 2 + 1]:
                if q != pid:
                    candidates[pid].add(q)
    near: Dict[Any, Dict[Any, float]] = defaultdict(dict)
    uf = _UnionFind()
    for pid, cands in candidates.items():
        for q in cands:
            if q in exact_of[pid] or q in near[pid]:
                continue
            sim = _similarity(sigs[pid], sigs[q])
            if sim >= NEAR_THRESHOLD:
                near[pid][q] = near[q][pid] = sim
                uf.union(pid, q)

    component_pattern_size: Dict[tuple, int] = defaultdict(int)
    for pid in near:
        component_pattern_size[(uf.find(pid), _pattern(by_id[pid]["url"]))] += 1

    for pid, matches in near.items():
        p = by_id[pid]
        variants = [q for q in matches if _is_variant(p, by_id[q])]
        others = [q for q in matches if q not in variants]
        out[pid]["Product Variants"] = [by_id[q]["url"] for q in variants]
        if not others:
            continue
        mean_sim = sum(matches[q] for q in others) / len(others)
        words = p["content"].get("Main Content Words") or 0
        unique = round((1 - mean_sim) * words)
        out[pid]["unique_words_estimate"] = unique
        size = component_pattern_size[(uf.find(pid), _pattern(p["url"]))]
        key = ("Thin Templated Pages" if size >= TEMPLATE_MIN_PAGES and unique < TEMPLATE_MAX_UNIQUE_WORDS
               else "Near Duplicates")
        out[pid][key] = [by_id[q]["url"] for q in others]
    return out
