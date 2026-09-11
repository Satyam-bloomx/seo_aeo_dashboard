const fs = require('fs');
const path = require('path');

// Let's inspect stroke_banner_1.svg, stroke_banner_2.svg, stroke_banner_3.svg in public/brushes/banners
const b1 = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_1.svg', 'utf8');
const b2 = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_2.svg', 'utf8');
const b3 = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_3.svg', 'utf8');

function extractPathsAndVb(svgStr) {
  const vb = svgStr.match(/viewBox="([^"]+)"/)[1];
  const paths = svgStr.match(/<path[^>]+d="([^"]+)"/g) || [];
  return { vb, paths };
}

console.log('Banner 1:', extractPathsAndVb(b1).paths.length, 'paths');
console.log('Banner 2:', extractPathsAndVb(b2).paths.length, 'paths');
console.log('Banner 3:', extractPathsAndVb(b3).paths.length, 'paths');
