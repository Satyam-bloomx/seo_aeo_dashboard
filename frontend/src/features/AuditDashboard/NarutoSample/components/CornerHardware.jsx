import React from 'react';

/**
 * Ornate Japanese brass & steel corner brackets with metallic hardware rivets.
 */

const THEMES = {
  gold: {
    plate: '#caa062',
    border: '#7a511e',
    screwOuter: '#5c3910',
    screwInner: '#caa062',
    screwHighlight: '#ffffff',
  },
  cyan: {
    plate: '#7db7d6',
    border: '#336280',
    screwOuter: '#1e3c50',
    screwInner: '#7db7d6',
    screwHighlight: '#ffffff',
  },
  purple: {
    plate: '#8462b8',
    border: '#482e70',
    screwOuter: '#351d56',
    screwInner: '#8462b8',
    screwHighlight: '#ffffff',
  },
  indigo: {
    plate: '#818cf8',
    border: '#3730a3',
    screwOuter: '#312e81',
    screwInner: '#818cf8',
    screwHighlight: '#ffffff',
  },
};

export function CornerBrackets({ theme = 'gold', size = 38 }) {
  const t = THEMES[theme] || THEMES.gold;

  return (
    <>
      {/* Top Left */}
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 36 36" 
        fill="none" 
        className="absolute top-0 left-0 pointer-events-none drop-shadow-xs z-20"
      >
        <path 
          d="M2,24 C2,12 12,2 24,2 L34,2 C30,4 28,8 28,12 C28,18 20,26 12,28 C8,28 4,30 2,34 Z" 
          fill={t.plate} 
          stroke={t.border} 
          strokeWidth="1.2" 
        />
        <circle cx="11" cy="11" r="3.2" fill={t.screwOuter} />
        <circle cx="10.5" cy="10.5" r="2.4" fill={t.screwInner} />
        <circle cx="9.8" cy="9.8" r="0.8" fill={t.screwHighlight} />
      </svg>

      {/* Top Right */}
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 36 36" 
        fill="none" 
        className="absolute top-0 right-0 pointer-events-none drop-shadow-xs z-20"
      >
        <path 
          d="M34,24 C34,12 24,2 12,2 L2,2 C6,4 8,8 8,12 C8,18 16,26 24,28 C28,28 32,30 34,34 Z" 
          fill={t.plate} 
          stroke={t.border} 
          strokeWidth="1.2" 
        />
        <circle cx="25" cy="11" r="3.2" fill={t.screwOuter} />
        <circle cx="25.5" cy="10.5" r="2.4" fill={t.screwInner} />
        <circle cx="26.2" cy="9.8" r="0.8" fill={t.screwHighlight} />
      </svg>

      {/* Bottom Left */}
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 36 36" 
        fill="none" 
        className="absolute bottom-0 left-0 pointer-events-none drop-shadow-xs z-20"
      >
        <path 
          d="M2,12 C2,24 12,34 24,34 L34,34 C30,32 28,28 28,24 C28,18 20,10 12,8 C8,8 4,6 2,2 Z" 
          fill={t.plate} 
          stroke={t.border} 
          strokeWidth="1.2" 
        />
        <circle cx="11" cy="25" r="3.2" fill={t.screwOuter} />
        <circle cx="10.5" cy="25.5" r="2.4" fill={t.screwInner} />
        <circle cx="9.8" cy="26.2" r="0.8" fill={t.screwHighlight} />
      </svg>

      {/* Bottom Right */}
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 36 36" 
        fill="none" 
        className="absolute bottom-0 right-0 pointer-events-none drop-shadow-xs z-20"
      >
        <path 
          d="M34,12 C34,24 24,34 12,34 L2,34 C6,32 8,28 8,24 C8,18 16,10 24,8 C28,8 32,6 34,2 Z" 
          fill={t.plate} 
          stroke={t.border} 
          strokeWidth="1.2" 
        />
        <circle cx="25" cy="25" r="3.2" fill={t.screwOuter} />
        <circle cx="25.5" cy="25.5" r="2.4" fill={t.screwInner} />
        <circle cx="26.2" cy="26.2" r="0.8" fill={t.screwHighlight} />
      </svg>
    </>
  );
}
