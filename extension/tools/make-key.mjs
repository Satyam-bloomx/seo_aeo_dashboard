// Generate the key pair that fixes the extension ID for every unpacked install.
// Run once: node tools/make-key.mjs   (never overwrites an existing private key; re-running re-derives the public key)
//   - keys/auditpro-helper.pem   private key: NOT committed (keys/ is gitignored). Back it up in the team's
//                                password manager; only needed to pack a self-hosted .crx later.
//   - manifest.json "key"       public key (safe to commit): same extension ID on every machine
// Prints the resulting extension ID (the app needs it for chrome.runtime.connect).
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extensionIdFromKey } from "./extid.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pemPath = join(root, "keys", "auditpro-helper.pem");
const manifestPath = join(root, "manifest.json");

let pub;
if (existsSync(pemPath)) {
  console.log("Key exists, reusing", pemPath);
  pub = createPublicKey(readFileSync(pemPath)).export({ type: "spki", format: "der" });
} else {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  mkdirSync(dirname(pemPath), { recursive: true });
  writeFileSync(pemPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  pub = publicKey.export({ type: "spki", format: "der" });
  console.log("Wrote private key", pemPath);
}
const key = Buffer.from(pub).toString("base64");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.key = key;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Extension ID:", extensionIdFromKey(key));
