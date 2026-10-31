// Generate icons/icon{16,32,48,128}.png: a blue rounded square with a white magnifier and check mark.
// Run: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./ziplib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLUE = [37, 99, 235];
const WHITE = [255, 255, 255];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size) {
  const ss = 4; // supersampling
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size, v = (y + (sy + 0.5) / ss) / size;
          // rounded square, radius 0.22
          const r = 0.22, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
          if (Math.hypot(u - cx, v - cy) > r) continue;
          bg++;
          const w = size <= 16 ? 0.085 : 0.065;
          const ring = Math.abs(Math.hypot(u - 0.43, v - 0.43) - 0.22) < w; // magnifier lens
          const handle = segDist(u, v, 0.6, 0.6, 0.8, 0.8) < w * 1.2;
          const check = segDist(u, v, 0.32, 0.44, 0.41, 0.53) < w * 0.8 || segDist(u, v, 0.41, 0.53, 0.56, 0.35) < w * 0.8;
          if (ring || handle || (size >= 32 && check)) fg++;
        }
      const n = ss * ss, i = (y * size + x) * 4;
      const f = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BLUE[c] * (1 - f) + WHITE[c] * f);
      px[i + 3] = Math.round((255 * bg) / n);
    }
  return encodePng(size, size, px);
}

mkdirSync(join(root, "icons"), { recursive: true });
for (const s of [16, 32, 48, 128]) {
  const file = join(root, "icons", `icon${s}.png`);
  writeFileSync(file, render(s));
  console.log("wrote", file);
}
