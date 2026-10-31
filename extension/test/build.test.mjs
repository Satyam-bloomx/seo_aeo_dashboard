import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createZip, readZip, crc32, encodePng } from "../tools/ziplib.mjs";
import { extensionIdFromKey } from "../tools/extid.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("crc32 known value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("zip round trip: stored and deflated entries, UTF-8 names", async () => {
  const entries = [
    { name: "a.txt", data: Buffer.from("x".repeat(1000)) },
    { name: "dir/ü.bin", data: Buffer.from([1, 2, 3]) },
    { name: "empty", data: Buffer.alloc(0) },
  ];
  const back = await readZip(createZip(entries));
  for (const e of entries) assert.ok(back[e.name].equals(e.data), e.name);
});

test("png has a valid signature and IHDR", () => {
  const png = encodePng(2, 2, new Uint8Array(16).fill(255));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 2);
});

test("manifest: MV3 module worker, optional per-site hosts only, no broad host_permissions", () => {
  const m = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.background.type, "module");
  assert.equal(m.host_permissions, undefined);
  assert.deepEqual(m.optional_host_permissions.sort(), ["http://*/*", "https://*/*"]);
  assert.ok(!m.permissions.includes("<all_urls>"));
  assert.ok(!m.permissions.includes("tabs"));
  assert.ok(!m.content_scripts);
  assert.match(extensionIdFromKey(m.key), /^[a-p]{32}$/);
});

test("build --check passes", () => {
  const out = execFileSync(process.execPath, [join(root, "build.mjs"), "--check"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(out, /app origins\s*: http:\/\/localhost:3000/);
});
