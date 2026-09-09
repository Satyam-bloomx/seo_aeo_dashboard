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
            {/* Primary Facet Gradient */}
            <linearGradient id="logo-prism-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4F46E5" />
              <stop offset="50%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>

            {/* Secondary Accent Gradient */}
            <linearGradient id="logo-prism-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#4F46E5" />
            </linearGradient>

            {/* Glowing Radar Sweep Gradient */}
            <linearGradient id="logo-radar" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="1" />
              <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
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
            opacity="0.08"
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
            stroke="#CBD5E1"
            strokeWidth="1.2"
            strokeDasharray="4 6"
            opacity="0.7"
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
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Layer 4: Central Quantum Pulse Core */}
          <circle
            cx="50"
            cy="36"
            r="4.5"
            fill="#10B981"
            filter="url(#logo-glow)"
            className={animated ? 'animate-pulse' : ''}
          />
          <circle cx="50" cy="36" r="2" fill="#FFFFFF" />

          {/* Corner Coordinate Tick Marks */}
          <circle cx="50" cy="8" r="2" fill="#4F46E5" />
          <circle cx="92" cy="50" r="2" fill="#10B981" />
          <circle cx="50" cy="92" r="2" fill="#06B6D4" />
          <circle cx="8" cy="50" r="2" fill="#6366F1" />
        </svg>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="font-extrabold text-base tracking-tight text-slate-900 font-sans">
              Audit
            </span>
            <span className="font-black text-base tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 font-sans">
              Pro
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 uppercase tracking-widest ml-1">
              AI//SEO
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
            ENGINE V20.4
          </span>
        </div>
      )}
    </div>
  );
}
