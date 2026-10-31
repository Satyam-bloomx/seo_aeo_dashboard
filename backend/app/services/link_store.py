"""Compact per-page link records, stored as JSON on the page instead of one database row per link.

Outlink record keys (defaults omitted): u = destination URL, a = anchor text, n = 1 when nofollow,
t = link type when not a plain "A" link, x = 1 when external.
Inlink sample record keys: p = source page id, a = anchor text, n = 1 when nofollow.
"""
from typing import Optional

MAX_ANCHOR_LENGTH = 150
INLINK_SAMPLE_CAP = 100


def compact_outlink(destination_url: str, anchor_text: Optional[str], is_follow: bool,
                    link_type: str, is_internal: bool) -> dict:
    rec = {"u": destination_url}
    if anchor_text:
        rec["a"] = anchor_text[:MAX_ANCHOR_LENGTH]
    if not is_follow:
        rec["n"] = 1
    if link_type and link_type != "A":
        rec["t"] = link_type
    if not is_internal:
        rec["x"] = 1
    return rec


def compact_inlink(source_page_id: int, anchor_text: Optional[str], is_follow: bool, link_type: str = "A") -> dict:
    rec = {"p": source_page_id}
    if anchor_text:
        rec["a"] = anchor_text[:MAX_ANCHOR_LENGTH]
    if not is_follow:
        rec["n"] = 1
    if link_type and link_type != "A":
        rec["t"] = link_type
    return rec
