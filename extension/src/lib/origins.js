// Sites, host-permission patterns and app-origin checks. Pure module.

/** Normalise a site ("example.com", "https://example.com/path") to its origin, or throw. */
export function siteOrigin(site) {
  let s = String(site || "").trim();
  if (!s) throw new Error("empty site");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) throw new Error("site must be http or https");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = new URL(s);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("site must be http or https");
  if (u.username || u.password) throw new Error("site must not contain credentials");
  return u.origin;
}

export function siteHost(site) {
  return new URL(siteOrigin(site)).hostname.toLowerCase();
}

function isIpOrLocal(h) {
  return /^[\d.]+$/.test(h) || h.includes(":") || h === "localhost" || !h.includes(".");
}

/** The host and its www/apex twin (sites commonly redirect between them). */
export function siteHosts(site) {
  const h = siteHost(site);
  if (isIpOrLocal(h)) return [h];
  return h.startsWith("www.") ? [h, h.slice(4)] : [h, "www." + h];
}

/** optional_host_permissions patterns requested for a site: exact hosts only, never a wildcard. */
export function permissionPatterns(site) {
  return siteHosts(site).flatMap((h) => [`https://${h}/*`, `http://${h}/*`]);
}

export function urlInSite(url, site) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return siteHosts(site).includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Is `origin` one of the externally_connectable match patterns ("https://app.example.com/*")? Exact origin compare. */
export function originAllowed(origin, matches) {
  if (!origin || !Array.isArray(matches)) return false;
  let o;
  try {
    o = new URL(origin).origin;
  } catch {
    return false;
  }
  return matches.some((m) => {
    try {
      return new URL(String(m).replace(/\/\*$/, "/")).origin === o;
    } catch {
      return false;
    }
  });
}

/** Validate an app origin for the manifest (build script). https only, except http://localhost. */
export function validateAppOrigin(o) {
  const u = new URL(o);
  if (u.pathname !== "/" || u.search || u.hash) throw new Error(`${o}: give an origin only, without a path`);
  if (u.protocol === "https:") return u.origin;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.origin;
  throw new Error(`${o}: production origins must use https`);
}
