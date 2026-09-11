const fs = require('fs');
const path = require('path');

const brushesDir = 'd:/antigravity/website audit full/brushes';
const files = fs.readdirSync(brushesDir).filter(f => f.endsWith('.svg'));

files.forEach(f => {
  const content = fs.readFileSync(path.join(brushesDir, f), 'utf8');
  console.log('----------------------------------------------------');
  console.log('FILE:', f);
  console.log('Length:', content.length);
  const vb = content.match(/viewBox="([^"]+)"/);
  console.log('viewBox:', vb ? vb[1] : 'none');
  const width = content.match(/width="([^"]+)"/);
  const height = content.match(/height="([^"]+)"/);
  console.log('dim:', width ? width[1] : '', 'x', height ? height[1] : '');
  
  // count top level elements / groups / paths
  const paths = content.match(/<path[^>]*>/g) || [];
  console.log('Path count:', paths.length);
  const groups = content.match(/<g[^>]*>/g) || [];
  console.log('Group count:', groups.length);
  
  // Show first 300 chars of content (after svg tag)
  console.log('Snippet:', content.substring(0, 400).replace(/\n/g, ' '));
});
