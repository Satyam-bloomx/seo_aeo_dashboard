import { permissionPatterns } from "../src/lib/origins.js";

const $ = (id) => document.getElementById(id);
let defaults = [];

function say(text, error = false) {
  $("msg").textContent = text;
  $("msg").className = error ? "msg error" : "msg";
}

async function load() {
  const st = await chrome.runtime.sendMessage({ type: "status_get" });
  $("ver").textContent = "v" + st.version;
  $("origins").textContent = st.app_origins.join(", ");
  const s = await chrome.runtime.sendMessage({ type: "settings_get" });
  defaults = s.defaultAllowlist;
  $("allowlist").value = s.cookieAllowlist.join("\n");
  const tbody = $("sites");
  tbody.textContent = "";
  $("nosites").hidden = s.sites.length > 0;
  for (const site of s.sites) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.className = "mono";
    name.textContent = site.site + (site.granted ? "" : " (access removed)");
    const ver = document.createElement("td");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!site.verification;
    box.addEventListener("change", async () => {
      await chrome.runtime.sendMessage({ type: "site_set_verification", site: site.site, verification: box.checked });
      say(`Verification ${box.checked ? "on" : "off"} for ${site.site}.`);
    });
    ver.appendChild(box);
    const act = document.createElement("td");
    const rm = document.createElement("button");
    rm.textContent = "Remove";
    rm.addEventListener("click", async () => {
      await chrome.permissions.remove({ origins: permissionPatterns(site.site) }).catch(() => {});
      await chrome.runtime.sendMessage({ type: "site_forget", site: site.site });
      say(`Removed ${site.site}.`);
      load();
    });
    act.appendChild(rm);
    tr.append(name, ver, act);
    tbody.appendChild(tr);
  }
}

$("save").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "allowlist_set", list: $("allowlist").value });
  if (res.error) return say(res.error, true);
  $("allowlist").value = res.list.join("\n");
  say("Saved.");
});

$("reset").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "allowlist_set", list: defaults });
  if (!res.error) $("allowlist").value = res.list.join("\n");
  say("Defaults restored.");
});

load();
