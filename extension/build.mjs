#!/usr/bin/env node
// Build the AuditPro Helper zip. Node 18+, no npm installs.
//
//   node build.mjs                  -> dist/auditpro-helper-<version>.zip
//   node build.mjs --no-localhost   -> production-only zip (drops the dev origins)
//   node build.mjs --check          -> validate only, write nothing
//
// The app origins allowed to talk to the extension (externally_connectable) come from helper.config.json:
//   { "dev_origins": ["http://localhost:3000"], "production_origins": ["https://audit.example.com"] }
// Production origins must be https. The source manifest.json is never modified.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createZip, readZip } from "./tools/ziplib.mjs";
import { extensionIdFromKey } from "./tools/extid.mjs";
import { validateAppOrigin } from "./src/lib/origins.js";

const root = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const INCLUDE_DIRS = ["src", "popup", "options", "permission", "icons"];
const INCLUDE_FILES = ["README.md", "PROTOCOL.md"];
const EXCLUDE = [/\.test\./, /(^|\/)\./, /\.map$/];

function die(msg) {
  console.error("build failed: " + msg);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const config = JSON.parse(readFileSync(join(root, "helper.config.json"), "utf8"));
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) die(`manifest version "${manifest.version}" is not a Chrome version`);

let origins = [];
try {
  const dev = args.has("--no-localhost") ? [] : config.dev_origins || [];
  for (const o of dev) {
    const v = validateAppOrigin(o);
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v) && !v.startsWith("https://")) die(`dev origin ${o} is not localhost`);
    origins.push(v);
  }
  for (const o of config.production_origins || []) {
    const v = validateAppOrigin(o);
    if (!v.startsWith("https://")) die(`production origin ${o} must be https`);
    origins.push(v);
  }
} catch (e) {
  die(e.message);
}
origins = [...new Set(origins)];
if (!origins.length) die("no app origins: fill production_origins in helper.config.json");
if (!(config.production_origins || []).length) console.warn("warning: production_origins is empty; only the dev app can connect");

const out = { ...manifest, externally_connectable: { matches: origins.map((o) => `${o}/*`) } };

function walk(dir) {
  const res = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) res.push(...walk(p));
    else res.push(p);
  }
  return res;
}

const files = [];
for (const d of INCLUDE_DIRS) {
  if (!existsSync(join(root, d))) die(`missing folder ${d}/`);
  for (const p of walk(join(root, d))) {
    const rel = relative(root, p).split(sep).join("/");
    if (EXCLUDE.some((re) => re.test(rel))) continue;
    files.push(rel);
  }
}
for (const f of INCLUDE_FILES) if (existsSync(join(root, f))) files.push(f);
files.sort();

// Every file the manifest points at must be in the zip.
const referenced = [
  out.background.service_worker,
  out.action.default_popup,
  out.options_ui.page,
  ...Object.values(out.icons),
  ...Object.values(out.action.default_icon),
];
for (const r of referenced) if (!files.includes(r)) die(`manifest refers to ${r}, which is not in the build`);
// Every relative ES import in the service worker graph must exist.
for (const f of files.filter((x) => x.endsWith(".js"))) {
  const src = readFileSync(join(root, f), "utf8");
  for (const m of src.matchAll(/(?:import|from)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = join(dirname(join(root, f)), m[1]);
    const rel = relative(root, target).split(sep).join("/");
    if (!files.includes(rel)) die(`${f} imports ${m[1]}, which is not in the build`);
  }
}

const version = manifest.version;
const id = manifest.key ? extensionIdFromKey(manifest.key) : null;
console.log(`AuditPro Helper ${version}`);
console.log(`  extension ID : ${id || "(no key: ID depends on the install folder)"}`);
console.log(`  app origins  : ${origins.join(", ")}`);
console.log(`  files        : ${files.length + 1}`);
if (args.has("--check")) process.exit(0);

const entries = [{ name: "manifest.json", data: Buffer.from(JSON.stringify(out, null, 2) + "\n") }];
for (const f of files) entries.push({ name: f, data: readFileSync(join(root, f)) });
const zip = createZip(entries);

// Self-check: read it back and compare every file.
const back = await readZip(zip);
for (const e of entries) if (!back[e.name] || !back[e.name].equals(e.data)) die(`zip self-check failed for ${e.name}`);

mkdirSync(join(root, "dist"), { recursive: true });
const target = join(root, "dist", `auditpro-helper-${version}.zip`);
writeFileSync(target, zip);
console.log(`  wrote        : ${relative(process.cwd(), target)} (${(zip.length / 1024).toFixed(1)} KB)`);
