# Aceternity UI & Motion Primitives — Complete Architecture & Shader Effects Guide

## 1. Executive Overview & Visual Aesthetic
**Aceternity UI** and **Motion Primitives** represent the forefront of modern, highly aesthetic web UI patterns. They combine **CSS custom properties (`--mouse-x`, `--mouse-y`), conic gradients, radial illumination, and GPU-composited backdrop filters** to create breathtaking, tactile interfaces.

* **Core Strengths**:
  1. **Spotlight Illumination**: Real-time cursor tracking creates an interactive soft spotlight behind cards as the mouse moves.
  2. **Hover Border Gradients**: Conic-gradient rotating borders that highlight elements on focus or hover.
  3. **Bento Grid Architecture**: Asymmetric card layouts with varied visual weights and micro-animations.
  4. **Ambient Shimmer Beams**: Glowing ambient gradients that travel across borders and progress bars.

---

## 2. Component Pattern Inventory

| Pattern | Mechanism | Visual Result |
|---|---|---|
| **Spotlight Card** | Mouse coordinates calculate `radial-gradient(circle at var(--mouse-x) var(--mouse-y))` | Soft colored illumination follows cursor inside cards. |
| **Shimmer Button / Progress** | Animated `linear-gradient` with `background-size: 200% 100%` and `animation: shimmer 2s infinite` | Sleek light reflection moving horizontally across elements. |
| **Glow Border Card** | Inset double borders with low-opacity colored shadows (`shadow-indigo-500/10`) | Elevated floating aesthetic with crisp definition. |
| **Gliding Active Indicator** | Absolute positioned indicator box with CSS transform transition | Glides smoothly underneath active tabs without flashing. |

---

## 3. Mathematical Coordinate Tracking for Spotlights

To track mouse position without React re-render lag:
```javascript
const handleMouseMove = (e) => {
  const { currentTarget, clientX, clientY } = e;
  const { left, top } = currentTarget.getBoundingClientRect();
  currentTarget.style.setProperty('--mouse-x', `${clientX - left}px`);
  currentTarget.style.setProperty('--mouse-y', `${clientY - top}px`);
};
```

In Tailwind CSS / Vanilla CSS:
```css
.spotlight-card {
  position: relative;
  background-color: #FFFFFF;
}

.spotlight-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    600px circle at var(--mouse-x, 0px) var(--mouse-y, 0px),
    rgba(79, 70, 229, 0.08),
    transparent 40%
  );
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.spotlight-card:hover::before {
  opacity: 1;
}
```

---

## 4. Next.js 16 & React 19 Implementation Recipes

### Recipe A: Spotlight Bento Card (`OverviewTab.jsx`)
```javascript
'use client';
import React from 'react';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';

export function SpotlightBentoCard({ title, score, status, icon: Icon = ShieldCheck }) {
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="spotlight-card group relative p-6 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all duration-300 overflow-hidden"
    >
      <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
            <Icon size={20} />
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            {status}
          </span>
        </div>

        <div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">{score}%</div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{title}</h4>
        </div>
      </div>
    </div>
  );
}
```

### Recipe B: Gliding Active Navigation Pill (`Sidebar.jsx`)
```javascript
'use client';
import React, { useState } from 'react';
import { Layers, ShieldCheck, Globe, Zap, Sliders } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'issues', label: 'Issues & Traps', icon: ShieldCheck },
  { id: 'explorer', label: 'URL Explorer', icon: Globe },
  { id: 'performance', label: 'Core Web Vitals', icon: Zap }
];

export function GlidingSidebarNav({ activeTab, onTabChange }) {
  return (
    <nav className="relative flex flex-col space-y-1.5 p-2 bg-slate-50 rounded-2xl border border-slate-200">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative z-10 flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors duration-200 text-left ${
              isActive ? 'text-indigo-700 font-extrabold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {/* Smooth Active Sliding Pill Indicator */}
            {isActive && (
              <div 
                className="absolute inset-0 bg-white border border-slate-200 shadow-sm rounded-xl -z-10 animate-in fade-in zoom-in-95 duration-200"
              />
            )}

            <Icon size={16} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

---

## 5. AuditPro Component Mapping
1. **`OverviewTab.jsx` Bento Grid**: Spotlight mouse tracking illumination on all 4 core metric bento cards.
2. **`Sidebar.jsx`**: Gliding active indicator and icon hover micro-rotations.
3. **Crawl Progress Bar**: Shimmer animated gradient reflection.
