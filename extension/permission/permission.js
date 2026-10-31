// Opened by the service worker when the app asks for access to a site. chrome.permissions.request needs a
// click inside the extension, so the user grants access here.
const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get("req");
let info = null;

function fail(text) {
  $("loading").hidden = true;
  $("form").hidden = true;
  $("error").hidden = false;
  $("error").textContent = text;
}

async function init() {
  info = await chrome.runtime.sendMessage({ type: "perm_get", req: token });
  if (!info || info.error) return fail((info && info.error) || "This request has expired.");
  $("site").textContent = info.site;
  $("hosts").textContent = [...new Set(info.patterns.map((p) => new URL(p.replace("/*", "/")).host))].join(", ");
  $("allowlist").textContent = info.allowlist.join(", ");
  $("verification").checked = !!(info.verification || info.status.verification);
  $("owner").checked = !!info.status.owner_confirmed;
  $("grant").disabled = !$("owner").checked;
  $("loading").hidden = true;
  $("form").hidden = false;
}

$("owner").addEventListener("change", () => ($("grant").disabled = !$("owner").checked));

$("grant").addEventListener("click", () => {
  if (!$("owner").checked) return;
  // Called straight from the click so Chrome sees the user gesture.
  chrome.permissions.request({ origins: info.patterns }, async (granted) => {
    if (chrome.runtime.lastError || !granted) {
      $("msg").textContent = "Access was not granted. You can try again or close this window.";
      return;
    }
    await chrome.runtime.sendMessage({ type: "perm_done", req: token, owner_confirmed: true, verification: $("verification").checked });
    $("msg").textContent = "Done. You can return to AuditPro.";
    setTimeout(() => window.close(), 600);
  });
});

$("cancel").addEventListener("click", () => window.close());

init().catch((e) => fail(String(e && e.message)));
