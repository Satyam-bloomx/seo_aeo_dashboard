// Bot-protection challenge detection. Pure module.
//
// On 403/429/503 vendor markers are enough. On any other status (a normal 200) only markers that belong to
// the structure of a challenge page count, so an ordinary article that mentions "Cloudflare" or "DataDome"
// is still audited. Returns {provider, evidence} or null.

export const CHALLENGE_STATUSES = [403, 429, 503];
const SCAN_CHARS = 60000;
const STRUCTURAL_MAX_CHARS = 50000; // a 200 page bigger than this is real content, not an interstitial

const VENDOR_MARKERS = [
  ["cloudflare", ["<title>just a moment...", "cf-chl", "_cf_chl_opt", "cf-browser-verification",
    "attention required! | cloudflare", "challenges.cloudflare.com", "/cdn-cgi/challenge-platform/h/"]],
  ["datadome", ["captcha-delivery.com"]],
  ["perimeterx", ["px-captcha", "press & hold to confirm", "/px/captcha"]],
  ["akamai", ["errors.edgesuite.net", "akamai reference"]],
  ["imperva", ["_incapsula_resource", "incapsula incident id", "request unsuccessful. incapsula"]],
];

const STRUCTURAL_MARKERS = [
  ["cloudflare", ["<title>just a moment...</title>", "window._cf_chl_opt"]],
  ["perimeterx", ['id="px-captcha"']],
  ["datadome", ["geo.captcha-delivery.com/captcha", "ct.captcha-delivery.com/c.js"]],
  ["imperva", ["/_incapsula_resource?"]],
];

function lowerHeaders(headers) {
  const h = {};
  if (!headers) return h;
  if (typeof headers.forEach === "function" && typeof headers.get === "function") {
    headers.forEach((v, k) => (h[String(k).toLowerCase()] = String(v)));
  } else for (const k of Object.keys(headers)) h[k.toLowerCase()] = String(headers[k]);
  return h;
}

export function detectChallenge({ status = 200, headers = {}, html = "" } = {}) {
  const h = lowerHeaders(headers);
  if ((h["cf-mitigated"] || "").toLowerCase().includes("challenge")) return hit("cloudflare", "cf-mitigated header");
  const errorish = CHALLENGE_STATUSES.includes(status);
  const server = (h["server"] || "").toLowerCase();
  if (errorish && (server.includes("datadome") || "x-datadome" in h || "x-dd-b" in h)) return hit("datadome", "DataDome header");

  const full = String(html || "");
  const text = full.slice(0, SCAN_CHARS).toLowerCase().replace(/<title>\s+/g, "<title>").replace(/\s+<\/title>/g, "</title>");
  if (!text) return null;

  if (errorish) {
    for (const [provider, needles] of VENDOR_MARKERS) {
      const n = needles.find((x) => text.includes(x));
      if (n) return hit(provider, n);
    }
    // Akamai "Access Denied ... Reference #18.xxxx.yyyy"
    if (text.includes("access denied") && /reference\s*#\s*\d+\.[0-9a-f]+/i.test(text)) return hit("akamai", "Access Denied + Reference #");
    if (server.includes("akamaighost") && text.includes("access denied")) return hit("akamai", "AkamaiGHost access denied");
    if ("x-iinfo" in h && full.length < 4000) return hit("imperva", "x-iinfo header");
    return null;
  }
  if (full.length > STRUCTURAL_MAX_CHARS) return null;
  for (const [provider, needles] of STRUCTURAL_MARKERS) {
    const n = needles.find((x) => text.includes(x));
    if (n) return hit(provider, n);
  }
  return null;
}

function hit(provider, evidence) {
  return { provider, evidence };
}
