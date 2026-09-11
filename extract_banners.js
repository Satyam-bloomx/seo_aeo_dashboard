const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('d:/antigravity/website audit full/brushes/vecteezy_brushed-paint-vector-design_15533955.svg', 'utf8');

// The 5 y-bands are roughly:
// Band 0: y in [50, 400]
// Band 1: y in [450, 800]
// Band 2: y in [850, 1200]
// Band 3: y in [1250, 1600]
// Band 4: y in [1650, 2050]

const pathMatches = content.match(/<path[^>]+>/g) || [];
console.log('Total paths:', pathMatches.length);

const bands = [
  { name: 'stroke_banner_0', yMin: 50, yMax: 400, paths: [] },
  { name: 'stroke_banner_1', yMin: 450, yMax: 800, paths: [] },
  { name: 'stroke_banner_2', yMin: 850, yMax: 1200, paths: [] },
  { name: 'stroke_banner_3', yMin: 1250, yMax: 1600, paths: [] },
  { name: 'stroke_banner_4', yMin: 1650, yMax: 2050, paths: [] }
];

pathMatches.forEach((p, idx) => {
  const dMatch = p.match(/d="([^"]+)"/);
  if (!dMatch) return;
  const d = dMatch[1];
  const nums = d.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!nums || nums.length < 2) return;
  
  // check first coordinate Y
  const y0 = parseFloat(nums[1]);
  for (const b of bands) {
    if (y0 >= b.yMin && y0 <= b.yMax) {
      b.paths.push(p);
      break;
    }
  }
});

const outDir = 'd:/antigravity/website audit full/frontend/public/brushes/banners';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

bands.forEach((b, i) => {
  console.log(`Band ${i} (${b.name}): has ${b.paths.length} paths`);
  
  // Compute total bbox of this band's paths
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  b.paths.forEach(p => {
    const dMatch = p.match(/d="([^"]+)"/);
    if (!dMatch) return;
    const nums = dMatch[1].match(/[-+]?[0-9]*\.?[0-9]+/g);
    for (let j = 0; j < nums.length; j += 2) {
      const x = parseFloat(nums[j]);
      const y = parseFloat(nums[j+1]);
      if (!isNaN(x) && !isNaN(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  });
  
  const pad = 10;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + 2*pad} ${maxY - minY + 2*pad}`;
  console.log(`  BBox: [${minX}, ${minY}, ${maxX - minX}, ${maxY - minY}] vb: ${vb}`);
  
  // Make stroke colored with currentColor so we can tint it dynamically in CSS / React!
  const cleanedPaths = b.paths.map(p => {
    return p.replace(/fill="rgb\([^"]+\)"/g, 'fill="currentColor"').replace(/fill-opacity="[^"]*"/g, '');
  }).join('\n');
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="none">\n${cleanedPaths}\n</svg>`;
  fs.writeFileSync(path.join(outDir, `${b.name}.svg`), svg);
  console.log(`  Saved ${b.name}.svg (${svg.length} bytes)`);
});
