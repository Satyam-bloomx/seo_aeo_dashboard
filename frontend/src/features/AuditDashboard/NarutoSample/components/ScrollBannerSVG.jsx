'use client';

import React from 'react';

/**
 * 100% PURE INLINE SVG NINJA JUTSU SCROLL BANNER FRAME
 * Wooden spool rollers, aged deckle parchment paper, gold highlights, and red seal medallion.
 */
export function ScrollBannerFrameSVG({ className = '', style = {} }) {
  return (
    <svg 
      viewBox="0 0 1000 120" 
      preserveAspectRatio="none" 
      className={`absolute inset-0 w-full h-full pointer-events-none z-0 ${className}`}
      style={style}
    >
      <defs>
        {/* Parchment Gradient */}
        <linearGradient id="parchmentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fefbf3" />
          <stop offset="50%" stopColor="#fdf6e7" />
          <stop offset="100%" stopColor="#f5ebdb" />
        </linearGradient>

        {/* Gold/Wood Spool Cylinders */}
        <linearGradient id="spoolGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4a2e0e" />
          <stop offset="25%" stopColor="#8a5a22" />
          <stop offset="50%" stopColor="#d4a368" />
          <stop offset="75%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#5c3d18" />
        </linearGradient>

        {/* Red Seal Radial Gradient */}
        <radialGradient id="redSealGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="70%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </radialGradient>
      </defs>

      {/* Main Parchment Scroll Body with Deckle Torn Edge */}
      <path 
        d="M12,4 L988,4 Q994,4 994,10 L994,110 Q994,116 988,116 L12,116 Q6,116 6,110 L6,10 Q6,4 12,4 Z" 
        fill="url(#parchmentGrad)" 
        stroke="#caa368" 
        strokeWidth="2.5" 
      />

      {/* Subtle Inner Inking Contour Line */}
      <path 
        d="M18,9 L982,9 L982,111 L18,111 Z" 
        fill="none" 
        stroke="#e4cfb2" 
        strokeWidth="1.2" 
        strokeDasharray="8 4" 
        opacity="0.85" 
      />

      {/* Left Wooden Roller Spool */}
      <rect x="0" y="0" width="8" height="120" rx="4" fill="url(#spoolGrad)" stroke="#38230b" strokeWidth="1" />
      <rect x="1" y="2" width="6" height="6" rx="2" fill="#caa368" />
      <rect x="1" y="112" width="6" height="6" rx="2" fill="#caa368" />

      {/* Right Wooden Roller Spool */}
      <rect x="992" y="0" width="8" height="120" rx="4" fill="url(#spoolGrad)" stroke="#38230b" strokeWidth="1" />
      <rect x="993" y="2" width="6" height="6" rx="2" fill="#caa368" />
      <rect x="993" y="112" width="6" height="6" rx="2" fill="#caa368" />

      {/* Gold Corner Hardware Pins */}
      <circle cx="16" cy="14" r="3.5" fill="#caa368" stroke="#5c3d18" strokeWidth="1" />
      <circle cx="16" cy="14" r="1" fill="#fff" />

      <circle cx="984" cy="14" r="3.5" fill="#caa368" stroke="#5c3d18" strokeWidth="1" />
      <circle cx="984" cy="14" r="1" fill="#fff" />

      <circle cx="16" cy="106" r="3.5" fill="#caa368" stroke="#5c3d18" strokeWidth="1" />
      <circle cx="16" cy="106" r="1" fill="#fff" />

      <circle cx="984" cy="106" r="3.5" fill="#caa368" stroke="#5c3d18" strokeWidth="1" />
      <circle cx="984" cy="106" r="1" fill="#fff" />
    </svg>
  );
}
