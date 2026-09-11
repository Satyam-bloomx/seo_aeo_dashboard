const fs = require('fs');
const path = require('path');

const srcDir = 'd:/antigravity/website audit full/frontend/public/brushes/extracted';
const outDir = 'd:/antigravity/website audit full/frontend/public/brushes/strokes';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// For gold_stroke_0 to 9, let's extract their paths cleanly
for (let i = 0; i <= 9; i++) {
  const files = fs.readdirSync(srcDir).filter(f => f.startsWith(`gold_stroke_${i}_`));
  if (files.length === 0) continue;
  const filename = files[0];
  const content = fs.readFileSync(path.join(srcDir, filename), 'utf8');
  
  // Extract viewBox
  const vbMatch = content.match(/viewBox="([^"]+)"/);
  const vb = vbMatch ? vbMatch[1] : '0 0 500 150';
  
  // Find all <path d="..."> inside the file
  const paths = content.match(/<path[^>]+d="([^"]+)"[^>]*>/g) || [];
  
  // Collect paths that are not simple rectangle clip paths
  const validPaths = [];
  paths.forEach(p => {
    const dMatch = p.match(/d="([^"]+)"/);
    if (!dMatch) return;
    const d = dMatch[1];
    // if d is just 4 points rectangle (clip path), skip
    if (d.length > 50) {
      validPaths.push(`<path fill="currentColor" fill-rule="nonzero" d="${d}" />`);
    }
  });
  
  const cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="none">\n${validPaths.join('\n')}\n</svg>`;
  fs.writeFileSync(path.join(outDir, `brush_stroke_${i}.svg`), cleanSvg);
  console.log(`Saved brush_stroke_${i}.svg with ${validPaths.length} paths (viewBox: ${vb})`);
}
