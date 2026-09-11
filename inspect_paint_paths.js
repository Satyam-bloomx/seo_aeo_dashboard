const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('d:/antigravity/website audit full/brushes/vecteezy_brushed-paint-vector-design_15533955.svg', 'utf8');

// Find all path d attributes and their bounding boxes
const pathMatches = content.match(/<path[^>]+>/g) || [];
console.log('Total paths in brushed-paint:', pathMatches.length);

// Let's compute bounding box of paths
const pathsWithBounds = [];
pathMatches.forEach((p, idx) => {
  const dMatch = p.match(/d="([^"]+)"/);
  if (!dMatch) return;
  const d = dMatch[1];
  const nums = d.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!nums || nums.length < 4) return;
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    const x = parseFloat(nums[i]);
    const y = parseFloat(nums[i+1]);
    if (!isNaN(x) && !isNaN(y)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w > 100 && h > 20) {
    pathsWithBounds.push({ idx, minX, minY, maxX, maxY, w, h, d, pathTag: p });
  }
});

console.log('Large paths (w > 100, h > 20):', pathsWithBounds.length);
pathsWithBounds.sort((a, b) => b.w - a.w);
pathsWithBounds.slice(0, 20).forEach(p => {
  console.log(`Path ${p.idx}: bbox [${Math.round(p.minX)}, ${Math.round(p.minY)}, ${Math.round(p.w)}, ${Math.round(p.h)}] aspect: ${(p.w / p.h).toFixed(2)}`);
});
