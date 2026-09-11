const fs = require('fs');
const path = require('path');

const svgPath = 'd:/antigravity/website audit full/brushes/vecteezy_brush-stroke-and-gold-circle-element-vectorcollection-set_10486364.svg';
const content = fs.readFileSync(svgPath, 'utf8');

// Find all <defs>
const defsMatch = content.match(/<defs>([\s\S]*?)<\/defs>/);
const defs = defsMatch ? defsMatch[1] : '';

// Find all top-level <g> or rendering groups
// In many vector files, there are <g clip-path="..."> elements
const gBlocks = content.match(/<g[\s\S]*?<\/g>/g) || [];
console.log('Total g blocks:', gBlocks.length);

const outDir = 'd:/antigravity/website audit full/frontend/public/brushes/extracted';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Let's also check all <path> elements that are not inside <clipPath>
// In the SVG, let's see how paths are laid out
const body = content.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/<\/?svg[^>]*>/g, '');

// Let's parse all clipPath definitions to know bounding boxes
const clipMap = {};
const cpRegex = /<clipPath id="([^"]+)">\s*<path[^>]*d="([^"]+)"/g;
let m;
while ((m = cpRegex.exec(defs)) !== null) {
  const id = m[1];
  const d = m[2];
  // extract M x y L x y etc
  const nums = d.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (nums && nums.length >= 8) {
    const xs = [parseFloat(nums[0]), parseFloat(nums[2]), parseFloat(nums[4]), parseFloat(nums[6])];
    const ys = [parseFloat(nums[1]), parseFloat(nums[3]), parseFloat(nums[5]), parseFloat(nums[7])];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    clipMap[id] = { minX, minY, width: maxX - minX, height: maxY - minY };
  }
}

console.log('Clip bounds found:', Object.keys(clipMap).length);
Object.entries(clipMap).slice(0, 15).forEach(([id, b]) => {
  console.log(id, '=>', JSON.stringify(b));
});
