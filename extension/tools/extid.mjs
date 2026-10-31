// Chrome extension ID from the manifest "key": first 128 bits of SHA-256(DER public key), hex digits 0-f mapped to a-p.
import { createHash } from "node:crypto";

export function extensionIdFromKey(base64Key) {
  const hex = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join("");
}
