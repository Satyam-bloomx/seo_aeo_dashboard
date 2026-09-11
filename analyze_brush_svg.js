const fs = require('fs');
const path = require('path');

const brushesDir = 'd:/antigravity/website audit full/brushes';

function analyzeFile(filename) {
  const content = fs.readFileSync(path.join(brushesDir, filename), 'utf8');
  console.log('=== ANALYZING:', filename, '===');
  
  // Find all <use>, <path>, <g>
  const gMatches = content.match(/<g[\s\S]*?<\/g>/g) || [];
  console.log('Top level or distinct g blocks:', gMatches.length);
  
  // Look for clipPaths or defs
  const clipPaths = content.match(/<clipPath id="([^"]+)">[\s\S]*?<\/clipPath>/g) || [];
  console.log('Clip paths:', clipPaths.length);
  clipPaths.slice(0, 10).forEach(cp => {
    const id = cp.match(/id="([^"]+)"/)[1];
    const pathD = cp.match(/d="([^"]+)"/);
    console.log('  clipPath', id, 'bounds:', pathD ? pathD[1].substring(0, 80) : 'no d');
  });

  // Extract paths
  const pathMatches = content.match(/<path[^>]+>/g) || [];
  console.log('Path tags count:', pathMatches.length);
  pathMatches.slice(0, 5).forEach((p, i) => {
    console.log(`  Path ${i}:`, p.substring(0, 120));
  });
}

analyzeFile('vecteezy_brush-stroke-and-gold-circle-element-vectorcollection-set_10486364.svg');
analyzeFile('vecteezy_vector-ink-splash-set_26233053.svg');
