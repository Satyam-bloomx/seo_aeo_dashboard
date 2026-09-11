const fs = require('fs');
const path = require('path');

// Read stroke_banner_3.svg (2 paths, ultra clean dry-brush)
const b3Raw = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_3.svg', 'utf8');
const vb3 = b3Raw.match(/viewBox="([^"]+)"/)[1];
const paths3 = b3Raw.match(/<path[^>]+d="([^"]+)"[^>]*>/g) || [];

// Read stroke_banner_1.svg (8 paths)
const b1Raw = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_1.svg', 'utf8');
const vb1 = b1Raw.match(/viewBox="([^"]+)"/)[1];
const paths1 = b1Raw.match(/<path[^>]+d="([^"]+)"[^>]*>/g) || [];

// Read stroke_banner_2.svg (536 paths)
const b2Raw = fs.readFileSync('d:/antigravity/website audit full/frontend/public/brushes/banners/stroke_banner_2.svg', 'utf8');
const vb2 = b2Raw.match(/viewBox="([^"]+)"/)[1];
const paths2 = b2Raw.match(/<path[^>]+d="([^"]+)"[^>]*>/g) || [];

console.log('Generating PureVectorBrushes.jsx with actual SVG paths...');

// Extract d attribute values
function getDValues(pathArr) {
  return pathArr.map(p => {
    const m = p.match(/d="([^"]+)"/);
    return m ? m[1] : '';
  }).filter(Boolean);
}

const dList3 = getDValues(paths3);
const dList1 = getDValues(paths1);

const code = `'use client';

import React from 'react';

/**
 * 100% PURE INLINE SVG VECTOR BRUSH COMPONENTS
 * No CSS background images, no external PNGs.
 * Real SVG vector geometry with full CSS styling, gradients and drop-shadows.
 */

// 1. Pure SVG Orange Brush Stroke for Sidebar Active Tabs
export function BrushOrangeTabSVG({ className = '', style = {} }) {
  return (
    <svg 
      viewBox="${vb3}" 
      preserveAspectRatio="none"
      className={\`absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_2px_10px_rgba(242,106,27,0.7)] \${className}\`}
      style={style}
    >
      <defs>
        <linearGradient id="orangeTabGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      ${dList3.map((d, i) => `<path fill="url(#orangeTabGrad)" fillRule="nonzero" d="${d}" />`).join('\n      ')}
    </svg>
  );
}

// 2. Pure SVG Orange Brush Stroke for "Run Audit" Button
export function BrushOrangeBtnSVG({ className = '', style = {} }) {
  return (
    <svg 
      viewBox="${vb3}" 
      preserveAspectRatio="none"
      className={\`absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_2px_12px_rgba(242,106,27,0.75)] \${className}\`}
      style={style}
    >
      <defs>
        <linearGradient id="orangeBtnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="40%" stopColor="#f97316" />
          <stop offset="80%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      ${dList3.map((d, i) => `<path fill="url(#orangeBtnGrad)" fillRule="nonzero" d="${d}" />`).join('\n      ')}
    </svg>
  );
}

// 3. Pure SVG Deep Teal-Green Brush Stroke for "2 Engines Synchronized"
export function BrushGreenBannerSVG({ className = '', style = {} }) {
  return (
    <svg 
      viewBox="${vb3}" 
      preserveAspectRatio="none"
      className={\`absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_3px_12px_rgba(6,95,70,0.65)] \${className}\`}
      style={style}
    >
      <defs>
        <linearGradient id="greenBannerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#047857" />
          <stop offset="50%" stopColor="#065f46" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      ${dList3.map((d, i) => `<path fill="url(#greenBannerGrad)" fillRule="nonzero" d="${d}" />`).join('\n      ')}
    </svg>
  );
}

// 4. Pure SVG Orange Brush Stroke for Filter Pills ("All 7", etc.)
export function BrushFilterPillSVG({ className = '', style = {} }) {
  return (
    <svg 
      viewBox="${vb3}" 
      preserveAspectRatio="none"
      className={\`absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)] pointer-events-none drop-shadow-[0_2px_8px_rgba(242,106,27,0.65)] \${className}\`}
      style={style}
    >
      <defs>
        <linearGradient id="orangePillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      ${dList3.map((d, i) => `<path fill="url(#orangePillGrad)" fillRule="nonzero" d="${d}" />`).join('\n      ')}
    </svg>
  );
}

// 5. Pure SVG Japanese Ink Claw Slash Mark
export function ClawSlashSVG({ size = 34, className = '' }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 40 40" 
      fill="none" 
      className={\`shrink-0 drop-shadow-[0_2px_8px_rgba(242,106,27,0.75)] \${className}\`}
    >
      <path 
        d="M6,32 C11,25 22,14 36,7 C33,11 26,18 21,24 C16,29 10,34 6,32 Z" 
        fill="#ea580c" 
      />
      <path 
        d="M4,35 C8,30 18,21 30,13 C26,17 19,24 14,29 C11,32 6,37 4,35 Z" 
        fill="#f97316" 
      />
      <path 
        d="M11,27 C16,21 25,13 34,8 C30,12 23,18 19,22 Z" 
        fill="#fb923c" 
      />
    </svg>
  );
}
`;

fs.writeFileSync('d:/antigravity/website audit full/frontend/src/features/AuditDashboard/NarutoSample/components/PureVectorBrushes.jsx', code);
console.log('Generated PureVectorBrushes.jsx successfully!');
