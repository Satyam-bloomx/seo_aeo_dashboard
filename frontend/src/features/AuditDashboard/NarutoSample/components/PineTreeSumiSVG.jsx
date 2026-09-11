'use client';

import React from 'react';

/**
 * 100% PURE INLINE SVG SUMI-E JAPANESE PINE TREE (MATSU)
 * Masterful traditional Japanese sumi-e ink painting of a gnarled pine tree
 * tucked neatly into the bottom-left of the sidebar.
 */
export function PineTreeSumiSVG({ className = '', style = {} }) {
  return (
    <svg 
      viewBox="0 0 280 280" 
      fill="none" 
      className={`absolute bottom-0 left-0 w-52 h-56 pointer-events-none z-0 opacity-60 ${className}`}
      style={style}
    >
      <defs>
        {/* Sumi-e Bark Gradient */}
        <linearGradient id="matsuBark" x1="0%" y1="100%" x2="70%" y2="0%">
          <stop offset="0%" stopColor="#2c1a0c" />
          <stop offset="40%" stopColor="#5c3814" />
          <stop offset="75%" stopColor="#9a6428" />
          <stop offset="100%" stopColor="#d49b4b" />
        </linearGradient>

        {/* Soft Golden Mist Glow */}
        <radialGradient id="goldMist" cx="30%" cy="80%" r="60%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#b45309" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Atmospheric Golden Sunset Glow Behind Tree */}
      <circle cx="70" cy="210" r="95" fill="url(#goldMist)" />

      {/* Distant Mountain Peak Silhouette in Dark Sumi Ink */}
      <path 
        d="M10,250 L75,150 L135,220 L185,135 L250,250 Z" 
        fill="#1a1208" 
        opacity="0.4" 
      />

      {/* Main Gnarled Sumi-e Pine Trunk Rising from Left */}
      <path 
        d="M-10,280 C12,270 28,245 32,210 C38,175 30,145 20,110 C12,85 6,55 0,30 L10,28 C18,52 26,78 35,105 C46,140 54,170 48,205 C42,240 26,268 4,280 Z" 
        fill="url(#matsuBark)" 
      />

      {/* Bark Texture Contours */}
      <g stroke="#d49b4b" strokeWidth="0.7" opacity="0.4" fill="none">
        <path d="M10,245 C20,228 26,202 28,175" />
        <path d="M18,220 C26,198 30,166 24,130" />
        <path d="M15,150 C20,122 18,96 10,70" />
      </g>

      {/* Primary Lower Branch Extending Right */}
      <path 
        d="M38,205 C60,196 92,201 122,212 C148,220 178,226 210,218 C192,226 158,228 130,218 C98,210 62,208 42,212 Z" 
        fill="url(#matsuBark)" 
      />
      <path 
        d="M122,214 C142,192 172,180 198,182 C180,186 152,194 130,218 Z" 
        fill="url(#matsuBark)" 
      />

      {/* Primary Mid Branch Extending Right */}
      <path 
        d="M30,145 C52,132 86,134 116,142 C145,150 168,146 194,134 C174,144 146,158 116,150 C86,142 52,140 30,152 Z" 
        fill="url(#matsuBark)" 
      />
      <path 
        d="M86,136 C104,112 130,98 156,100 C134,106 112,118 92,142 Z" 
        fill="url(#matsuBark)" 
      />

      {/* Upper Branch Extending Right */}
      <path 
        d="M20,92 C42,78 68,74 94,80 C118,88 140,82 160,72 C142,80 118,94 94,86 C68,78 42,86 20,96 Z" 
        fill="url(#matsuBark)" 
      />

      {/* Intricate Pine Needle Fan Tufts (Layered Matsu Brushes) */}
      {[
        // Top Clusters
        { x: 126, y: 44, scale: 0.8 },
        { x: 160, y: 72, scale: 0.95 },
        { x: 94, y: 80, scale: 0.75 },
        // Mid Clusters
        { x: 156, y: 100, scale: 0.9 },
        { x: 194, y: 134, scale: 1.0 },
        { x: 116, y: 142, scale: 0.8 },
        // Lower Clusters
        { x: 198, y: 182, scale: 0.9 },
        { x: 210, y: 218, scale: 0.95 },
        { x: 130, y: 218, scale: 0.75 },
      ].map((tuft, i) => (
        <g key={i} transform={`translate(${tuft.x}, ${tuft.y}) scale(${tuft.scale})`}>
          {/* Radial Needle Layer 1 (Dark bronze) */}
          <path 
            d="M-26,-4 Q0,-19 26,-4 Q19,7 0,10 Q-19,7 -26,-4 Z" 
            fill="#5c3814" 
            opacity="0.75" 
          />
          {/* Radial Needle Layer 2 (Warm amber highlight) */}
          <path 
            d="M-20,-3 Q0,-15 20,-3 Q15,5 0,8 Q-15,5 -20,-3 Z" 
            fill="#9a6428" 
            opacity="0.85" 
          />
          <path 
            d="M-14,-2 Q0,-12 14,-2 Q10,3 0,5 Q-10,3 -14,-2 Z" 
            fill="#d49b4b" 
            opacity="0.9" 
          />
          {/* Needle Spoke Lines */}
          <g stroke="#f59e0b" strokeWidth="0.8" strokeLinecap="round" opacity="0.6">
            <line x1="0" y1="2" x2="-22" y2="-7" />
            <line x1="0" y1="2" x2="-15" y2="-13" />
            <line x1="0" y1="2" x2="-7" y2="-16" />
            <line x1="0" y1="2" x2="0" y2="-18" />
            <line x1="0" y1="2" x2="7" y2="-16" />
            <line x1="0" y1="2" x2="15" y2="-13" />
            <line x1="0" y1="2" x2="22" y2="-7" />
          </g>
        </g>
      ))}
    </svg>
  );
}
