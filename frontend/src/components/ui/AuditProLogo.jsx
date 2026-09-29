'use client';
import React from 'react';

export default function AuditProLogo({
  size = 36,
  animated = true,
  showText = true,
  className = '',
}) {
  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Animated SVG Emblem */}
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-sm overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Primary Facet Gradient - BloomX Blue to Navy */}
            <linearGradient id="logo-prism-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4B88FF" />
              <stop offset="60%" stopColor="#223A6A" />
              <stop offset="100%" stopColor="#183578" />
            </linearGradient>

            {/* Secondary Accent Gradient - BloomX Lime to Blue */}
            <linearGradient id="logo-prism-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#CAE366" />
              <stop offset="50%" stopColor="#8DA834" />
              <stop offset="100%" stopColor="#223A6A" />
            </linearGradient>

            {/* Glowing Radar Sweep Gradient */}
            <linearGradient id="logo-radar" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#CAE366" stopOpacity="1" />
              <stop offset="50%" stopColor="#4B88FF" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#223A6A" stopOpacity="0" />
            </linearGradient>

            <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Ambient Aura */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="url(#logo-prism-1)"
            opacity="0.12"
          />

          {/* Layer 1: Outer Rotating Kinetic Orbital Ring */}
          <circle
            cx="50"
            cy="50"
            r="42"
            stroke="url(#logo-radar)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="90 170"
            className={animated ? 'animate-[spin_4s_linear_infinite] origin-center' : ''}
          />

          {/* Layer 2: Counter-Rotating Secondary Dash Ring */}
          <circle
            cx="50"
            cy="50"
            r="35"
            stroke="#C7CDA1"
            strokeWidth="1.2"
            strokeDasharray="4 6"
            opacity="0.5"
            className={animated ? 'animate-[spin_10s_linear_infinite_reverse] origin-center' : ''}
          />

          {/* Layer 3: Central Isometric 'A' Prism Structure */}
          {/* Left Wing */}
          <path
            d="M50 18 L24 72 L38 72 L50 44 L62 72 L76 72 Z"
            fill="url(#logo-prism-1)"
            opacity="0.95"
          />

          {/* Right Refraction Facet */}
          <path
            d="M50 18 L50 44 L62 72 L76 72 Z"
            fill="url(#logo-prism-2)"
            opacity="0.9"
          />

          {/* Crossbar Scanning Beam */}
          <path
            d="M34 56 L66 56"
            stroke="#CAE366"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.95"
          />

          {/* Layer 4: Central Quantum Pulse Core */}
          <circle
            cx="50"
            cy="36"
            r="4.5"
            fill="#CAE366"
            filter="url(#logo-glow)"
            className={animated ? 'animate-pulse' : ''}
          />
          <circle cx="50" cy="36" r="2" fill="#FFFFFF" />

          {/* Corner Coordinate Tick Marks */}
          <circle cx="50" cy="8" r="2" fill="#4B88FF" />
          <circle cx="92" cy="50" r="2" fill="#CAE366" />
          <circle cx="50" cy="92" r="2" fill="#33B6F7" />
          <circle cx="8" cy="50" r="2" fill="#223A6A" />
        </svg>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white font-sans transition-colors">
              BloomX
            </span>
            <span className="font-bold text-base tracking-tight text-[#CAE366] font-sans">
              AuditPro
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#CAE366]/10 text-[#CAE366] border border-[#CAE366]/30 uppercase tracking-wider ml-1 transition-colors">
              SPIDER
            </span>
          </div>
          <span className="text-[10px] font-sans text-slate-400 dark:text-[#D6E5FC]/60 tracking-wider mt-0.5">
            Performance SEO Architecture
          </span>
        </div>
      )}
    </div>
  );
}
