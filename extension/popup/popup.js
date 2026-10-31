import { gzipBase64 } from "../src/lib/gzip.js";

const $ = (id) => document.getElementById(id);

function render(res) {
  $("ver").textContent = "v" + res.version;
  const s = res.status || {};
  $("dot").classList.toggle("on", s.connected > 0);
  $("conn").textContent = s.connected > 0 ? "Connected to AuditPro" : "Not connected (open AuditPro to use the helper)";
  const box = $("batches");
  box.textContent = "";
  for (const b of s.batches || []) {
    const div = document.createElement("div");
    div.className = "card small";
    const host = new URL(b.site).host;
    div.textContent = b.paused
      ? `${host}: paused. Complete the check in a normal tab, then click Continue in AuditPro.`
      : `${host}: ${b.done} of ${b.total} pages (${b.inflight} loading${b.parked ? `, ${b.parked} waiting to retry` : ""})`;
    if (b.paused) div.classList.add("warn");
    box.appendChild(div);
  }
  $("last").textContent = s.capture ? `Last capture: ${s.capture.title || s.capture.url}` : "";
}

async function refresh() {
  render(await chrome.runtime.sendMessage({ type: "status_get" }));
}

$("capture").addEventListener("click", async () => {
  const btn = $("capture");
  btn.disabled = true;
  $("capmsg").className = "msg";
  $("capmsg").textContent = "Capturing…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/i.test(tab.url || "")) throw new Error("Only normal web pages (http or https) can be captured.");
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const dt = document.doctype ? new XMLSerializer().serializeToString(document.doctype) + "\n" : "";
        return { html: dt + document.documentElement.outerHTML, final_url: location.href, title: document.title, content_type: document.contentType };
      },
    });
    const page = inj && inj.result;
    if (!page || !page.html) throw new Error("The page returned no HTML.");
    const capture = {
      url: tab.url,
      final_url: page.final_url,
      title: page.title,
      content_type: page.content_type,
      html_gzip_b64: await gzipBase64(page.html),
      html_length: page.html.length,
    };
    const res = await chrome.runtime.sendMessage({ type: "capture_store", capture });
    if (res.error) throw new Error(res.error);
    $("capmsg").textContent = res.delivered ? "Sent to AuditPro." : "Captured. Open AuditPro and choose “Use captured page”.";
  } catch (e) {
    $("capmsg").className = "msg error";
    $("capmsg").textContent = String((e && e.message) || e);
  } finally {
    btn.disabled = false;
    refresh();
  }
});

$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.status) refresh();
});
refresh();
