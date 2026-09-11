import React from 'react';

/**
 * Traditional Sumi-e Japanese Pine Tree & Enso Logo for the Sidebar.
 */

export function SidebarPineTree({ className = '' }) {
  return (
    <div 
      className={`absolute bottom-0 left-0 w-60 h-64 pointer-events-none z-0 ${className}`}
      style={{
        backgroundImage: `url('/naruto_assets/sidebar_pine_clean.png')`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'bottom left',
        opacity: 0.75,
      }}
    />
  );
}

export function EnsoBrandLogo() {
  return (
    <div className="flex items-center gap-3 pb-6 border-b border-white/10 mb-6">
      <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
        <svg className="absolute inset-0 w-full h-full drop-shadow-[0_2px_8px_rgba(242,106,27,0.6)]" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="21" fill="none" stroke="#d97706" strokeWidth="2.8" strokeLinecap="round" strokeDasharray="115 20" />
          <circle cx="25" cy="25" r="18" fill="none" stroke="#f26a1b" strokeWidth="1" strokeOpacity="0.5" />
        </svg>
        {/* Mountain Silhouette */}
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <path d="M16,4 L6,26 L26,26 Z" fill="#ffffff" />
          <path d="M16,4 L12,12 L16,10 L20,13 Z" fill="#cbd5e1" opacity="0.75" />
          <path d="M16,4 L11,15 L14,14 L16,18 L19,13 L22,16 L26,26 L6,26 Z" fill="#ffffff" />
          <path d="M16,4 L14,12 L16,10 L19,13 L21,9 Z" fill="#0b121e" opacity="0.3" />
        </svg>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-white font-ink-title tracking-tight">Audit Pro</span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-[#131d2b] text-slate-300 border border-slate-600">
            AI/SEO
          </span>
        </div>
        <div className="text-[10px] font-mono tracking-widest text-slate-400 mt-0.5">
          ENGINE v2.4
        </div>
      </div>
    </div>
  );
}
