"""Detect CMS, page builder and SEO plugin from unambiguous HTML markers (never from loose words)."""
import re
from typing import Dict, List, Optional

_GENERATOR = re.compile(r'<meta[^>]+name=["\']generator["\'][^>]*content=["\']([^"\']+)', re.I)

# (name, [markers]) checked in order; markers are specific asset paths / globals, not product names in copy.
CMS_SIGNATURES = [
    ("Shopify", ["cdn.shopify.com", "shopify.theme", ".myshopify.com", "shopify-section"]),
    ("WordPress", ["/wp-content/", "/wp-includes/", "wp-json", "wp-emoji-release"]),
    ("Webflow", ["data-wf-page", "data-wf-site", "website-files.com"]),
    ("Wix", ["static.wixstatic.com", "wix-bolt", "_wixcssimports"]),
    ("Squarespace", ["static1.squarespace.com", "squarespace-cdn.com"]),
    ("Drupal", ["/sites/default/files/", "drupal-settings-json", "data-drupal-"]),
    ("Joomla", ["/media/jui/", "joomla-script-options"]),
    ("Ghost", ["ghost-portal", "content=\"ghost "]),
    ("HubSpot CMS", ["hs-scripts.com", "hubspot.net/hub/", "hs_cos_wrapper"]),
    ("Magento", ["mage/cookies", "magento_", "/static/frontend/"]),
    ("BigCommerce", ["cdn11.bigcommerce.com", "bigcommerce.com/s-"]),
]
FRAMEWORK_SIGNATURES = [
    ("Next.js", ["__next_data__", "/_next/static/"]),
    ("Nuxt", ["__nuxt__", "/_nuxt/"]),
    ("Gatsby", ["___gatsby", "/page-data/"]),
    ("Astro", ["astro-island", "data-astro-cid"]),
    ("Angular", ["ng-version="]),
]
BUILDER_SIGNATURES = [
    ("Elementor", ["elementor-element", "/elementor/", "elementor-kit-"]),
    ("Divi", ["et_pb_section", "et-db"]),
    ("Beaver Builder", ["fl-builder-content"]),
    ("WPBakery", ["vc_row", "js_composer"]),
    ("Gutenberg", ["wp-block-"]),
]
SEO_PLUGIN_SIGNATURES = [
    ("Yoast SEO", ["yoast seo plugin", "yoast-schema-graph", "optimized with the yoast"]),
    ("Rank Math", ["rank math", "rank-math-schema"]),
    ("All in One SEO", ["aioseo", "all in one seo"]),
    ("SEOPress", ["seopress"]),
]


def _first(sigs, html: str) -> Optional[str]:
    for name, markers in sigs:
        if any(m in html for m in markers):
            return name
    return None


def detect_technology(html: str) -> Dict[str, Optional[str]]:
    h = (html or "").lower()
    gen = _GENERATOR.search(html or "")
    generator = gen.group(1).strip()[:80] if gen else None
    cms = _first(CMS_SIGNATURES, h)
    if not cms and generator:
        cms = next((name for name, _ in CMS_SIGNATURES if name.lower().split()[0] in generator.lower()), None)
    if cms == "WordPress" and ("woocommerce" in h and "/plugins/woocommerce/" in h):
        cms = "WordPress + WooCommerce"
    builder = _first(BUILDER_SIGNATURES, h) if (cms or "").startswith("WordPress") else None
    return {
        "cms": cms,
        "framework": _first(FRAMEWORK_SIGNATURES, h),
        "page_builder": builder,
        "seo_plugin": _first(SEO_PLUGIN_SIGNATURES, h),
        "generator": generator,
    }


def fix_location_hint(tech: Dict[str, Optional[str]]) -> str:
    """Where a site owner should make SEO fixes, preferring the CMS / plugin UI over code edits."""
    cms, builder, plugin, fw = tech.get("cms"), tech.get("page_builder"), tech.get("seo_plugin"), tech.get("framework")
    parts: List[str] = []
    if plugin:
        parts.append(f"{plugin} settings / per-page {plugin} box (titles, meta descriptions, canonicals, schema)")
    if builder:
        parts.append(f"{builder} editor for headings and on-page content (e.g. the heading widget's HTML tag setting)")
    if (cms or "").startswith("WordPress") and not plugin:
        parts.append("WordPress editor or the active theme's templates")
    if cms == "Shopify":
        parts.append("Shopify admin (Online Store > Preferences / product SEO fields) or Liquid theme templates")
    if cms in ("Webflow", "Wix", "Squarespace", "HubSpot CMS"):
        parts.append(f"{cms} page settings (SEO tab) and custom code injection")
    if fw == "Next.js":
        parts.append("Next.js metadata API (generateMetadata / metadata export) and page components")
    return "; ".join(parts) if parts else "unknown - verify which CMS or framework renders this page"
