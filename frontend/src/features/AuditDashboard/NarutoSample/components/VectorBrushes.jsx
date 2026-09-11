import React from 'react';

/**
 * High-definition vector brush strokes extracted from authentic Japanese sumi-e
 * and dry-brush vector assets. Uses pure SVG paths and natural bristle textures.
 */

// 1. Horizontal Orange Dry-Brush for Left Sidebar Tabs
export function BrushOrangeTab({ className = '', style = {} }) {
  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-visible select-none ${className}`}
      style={{
        backgroundImage: `url('/naruto_assets/tab_dashboard_brush.png')`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        filter: 'drop-shadow(0 2px 10px rgba(242, 106, 27, 0.75))',
        ...style
      }}
    />
  );
}

// 2. Horizontal Orange Dry-Brush for "Run Audit" Button
export function BrushOrangeBtn({ className = '', style = {} }) {
  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-visible select-none ${className}`}
      style={{
        backgroundImage: `url('/naruto_assets/run_audit_brush.png')`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        filter: 'drop-shadow(0 2px 12px rgba(242, 106, 27, 0.75))',
        ...style
      }}
    />
  );
}

// 3. Horizontal Teal-Green Dry-Brush for "2 Engines Synchronized"
export function BrushGreenBanner({ className = '', style = {} }) {
  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-visible select-none ${className}`}
      style={{
        backgroundImage: `url('/naruto_assets/green_synchronized_brush.png')`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        filter: 'drop-shadow(0 3px 12px rgba(6, 95, 70, 0.6))',
        ...style
      }}
    />
  );
}

// 4. Horizontal Orange Dry-Brush for Filter Tabs ("All 7", etc.)
export function BrushFilterPill({ className = '', style = {} }) {
  return (
    <div 
      className={`absolute -inset-1.5 pointer-events-none overflow-visible select-none ${className}`}
      style={{
        backgroundImage: `url('/naruto_assets/tab_dashboard_brush.png')`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        filter: 'drop-shadow(0 2px 8px rgba(242, 106, 27, 0.65))',
        ...style
      }}
    />
  );
}

// 5. Japanese Ink Claw Slash Mark for Title
export function ClawSlash({ className = '', size = 34 }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 40 40" 
      fill="none" 
      className={`shrink-0 drop-shadow-[0_2px_8px_rgba(242,106,27,0.75)] ${className}`}
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
