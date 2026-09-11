const fs = require('fs');
const path = require('path');

// Let's analyze stroke_banner_1, stroke_banner_2, stroke_banner_3
const b1 = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_1.svg', 'utf8');
const b2 = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_2.svg', 'utf8');
const b3 = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_3.svg', 'utf8');

console.log('Banner 1 size:', b1.length, 'vb:', b1.match(/viewBox="([^"]+)"/)[1]);
console.log('Banner 2 size:', b2.length, 'vb:', b2.match(/viewBox="([^"]+)"/)[1]);
console.log('Banner 3 size:', b3.length, 'vb:', b3.match(/viewBox="([^"]+)"/)[1]);
