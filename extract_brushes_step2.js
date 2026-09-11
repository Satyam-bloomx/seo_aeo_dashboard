const fs = require('fs');
const path = require('path');

const brushesDir = 'd:/antigravity/website audit full/brushes';
const outDir = 'd:/antigravity/website audit full/frontend/public/brushes/extracted';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Let's process vecteezy_brush-stroke-and-gold-circle-element-vectorcollection-set_10486364.svg
function processGoldBrushSet() {
  const content = fs.readFileSync(path.join(brushesDir, 'vecteezy_brush-stroke-and-gold-circle-element-vectorcollection-set_10486364.svg'), 'utf8');
  
  // Find all <g clip-path="url(#clip-...)">
  const gRegex = /<g clip-path="url\(#(clip-\d+)\)">([\s\S]*?)<\/g>/g;
  let match;
  let index = 0;
  
  // We can extract each group with its clip box
  // Let's also parse defs for clips
  const defsMatch = content.match(/<defs>([\s\S]*?)<\/defs>/);
  const defs = defsMatch ? defsMatch[1] : '';
  
  const clipBounds = {};
  const cpRegex = /<clipPath id="(clip-\d+)">\s*<path[^>]*d="([^"]+)"/g;
  let cm;
  while ((cm = cpRegex.exec(defs)) !== null) {
    const id = cm[1];
    const d = cm[2];
    const nums = d.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (nums && nums.length >= 8) {
      const xs = [parseFloat(nums[0]), parseFloat(nums[2]), parseFloat(nums[4]), parseFloat(nums[6])];
      const ys = [parseFloat(nums[1]), parseFloat(nums[3]), parseFloat(nums[5]), parseFloat(nums[7])];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      clipBounds[id] = { minX, minY, width: maxX - minX, height: maxY - minY };
    }
  }

  // Find all major g blocks
  // In the file, each major item is enclosed in <g clip-path="url(#clip-X)"> ... </g>
  while ((match = gRegex.exec(content)) !== null) {
    const clipId = match[1];
    const innerContent = match[2];
    const bounds = clipBounds[clipId];
    
    if (bounds && bounds.width > 50 && bounds.height > 20) {
      const vb = `${bounds.minX - 5} ${bounds.minY - 5} ${bounds.width + 10} ${bounds.height + 10}`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n${defsMatch ? defsMatch[0] : ''}\n<g clip-path="url(#${clipId})">\n${innerContent}\n</g>\n</svg>`;
      const filename = `gold_stroke_${index}_w${Math.round(bounds.width)}_h${Math.round(bounds.height)}.svg`;
      fs.writeFileSync(path.join(outDir, filename), svg);
      console.log(`Extracted: ${filename} (viewBox: ${vb})`);
      index++;
    }
  }
}

// 2. Let's also check vecteezy_brushed-paint-vector-design_15533955.svg
function processBrushedPaintDesign() {
  const content = fs.readFileSync(path.join(brushesDir, 'vecteezy_brushed-paint-vector-design_15533955.svg'), 'utf8');
  console.log('Brushed paint size:', content.length);
  // Let's copy it to public as well for direct reference
  fs.writeFileSync(path.join(outDir, 'all_brushed_paint_vector.svg'), content);
}

// 3. Let's process vecteezy_gold-spray-paint-frames-graffiti-stencil-banners_16265408.svg
function processGoldSprayFrames() {
  const content = fs.readFileSync(path.join(brushesDir, 'vecteezy_gold-spray-paint-frames-graffiti-stencil-banners_16265408.svg'), 'utf8');
  console.log('Gold spray frames size:', content.length);
  fs.writeFileSync(path.join(outDir, 'gold_spray_frames.svg'), content);
}

// 4. Vector ink splash
function processInkSplash() {
  const content = fs.readFileSync(path.join(brushesDir, 'vecteezy_vector-ink-splash-set_26233053.svg'), 'utf8');
  fs.writeFileSync(path.join(outDir, 'ink_splash_set.svg'), content);
}

processGoldBrushSet();
processBrushedPaintDesign();
processInkSplash();
