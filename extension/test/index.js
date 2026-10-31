// Entry point so `node --test extension/test` works (Node resolves the directory to this file).
// Loads every *.test.mjs file next to it.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(here).filter((n) => n.endsWith(".test.mjs")).sort()) {
  await import(pathToFileURL(join(here, f)).href);
}
