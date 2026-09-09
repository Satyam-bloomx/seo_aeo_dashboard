# GSAP (GreenSock Animation Platform) — Complete Architecture & Reference Guide

## 1. Executive Overview & Official Ecosystem
**GSAP (GreenSock)** is the industry-gold standard high-performance JavaScript animation engine. It delivers sub-millisecond precision, robust timeline choreography, numerical interpolation, SVG manipulation, and GPU-composited transformations without React re-render overhead.

* **Primary Packages**: `gsap` (v3.15+), `@gsap/react` (official React 18/19 hook wrapper).
* **Licensing**: 100% Free for all commercial and non-commercial uses (including all Club GreenSock plugins like `Flip`, `ScrollTrigger`, `Draggable`, `MotionPath`, `Inertia`, `SplitText`).
* **Bundle Footprint**: ~24KB min/gzip core. Zero external runtime dependencies.
* **Rendering Model**: Direct DOM mutation via `requestAnimationFrame` tick loop, bypassing React virtual DOM diffing for 60fps / 120fps lock.

---

## 2. Core APIs, Hooks & Plugin Inventory

### A. Core Engine Methods
| Method | Description | Signature / Example |
|---|---|---|
| `gsap.to()` | Animates targets from current state to destination values. | `gsap.to(target, { x: 100, opacity: 1, duration: 0.8, ease: "power3.out" })` |
| `gsap.from()` | Animates targets from specified initial values to current state. | `gsap.from(target, { y: 30, opacity: 0, stagger: 0.1, duration: 0.6 })` |
| `gsap.fromTo()` | Explicitly defines both starting and ending properties. | `gsap.fromTo(target, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5 })` |
| `gsap.set()` | Immediately applies property values with zero duration. | `gsap.set(target, { transformOrigin: "50% 50%", opacity: 0 })` |
| `gsap.timeline()` | Master container for chaining and nesting synchronized animations. | `const tl = gsap.timeline({ repeat: -1, delay: 0.5 });` |
| `gsap.quickTo()` | High-performance optimized function for mouse-tracking properties. | `const xTo = gsap.quickTo(target, "x", { duration: 0.4, ease: "power3" });` |
| `gsap.matchMedia()` | Responsive animation controller that binds to CSS media queries. | `const mm = gsap.matchMedia(); mm.add("(min-width: 768px)", () => { ... });` |

### B. Official React Wrapper: `@gsap/react`
* **Hook**: `useGSAP(callback, options)`
* **Key Features**:
  1. **Automatic Scoping**: Sets a root container ref (`scope: containerRef`) so CSS selectors (`.card`, `.pulse-ring`) only target elements inside that component.
  2. **Automatic Cleanup**: Disposes of all tweens, timelines, and ScrollTrigger instances on component unmount, preventing memory leaks and zombie tickers.
  3. **Revert on Dependency Change**: Supports `dependencies: [activeTab]` to re-run animations cleanly.

---

## 3. Major Official Plugins

### 1. `Flip` (First, Last, Invert, Play)
* **Best For**: Smooth layout transitions, re-parenting elements, expandable cards, and grid-to-fullscreen morphs.
* **How it works**: Records the bounding box before a state change (`Flip.getState()`), applies DOM mutation, then animates smoothly from previous coordinates.
* **Example**:
```javascript
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
gsap.registerPlugin(Flip);

const state = Flip.getState('.bento-item');
setExpanded(!expanded);
// In useGSAP or useEffect:
Flip.from(state, {
  duration: 0.7,
  ease: 'power3.inOut',
  absolute: true
});
```

### 2. `ScrollTrigger`
* **Best For**: Viewport scroll reveals, pinned headers, scrubbing progress bars, and parallax sections.
* **Key Properties**: `trigger`, `start`, `end`, `scrub` (syncs animation to scroll position), `pin`, `toggleActions`.

### 3. `TextPlugin`
* **Best For**: Terminal log streams, typewriter text reveals, and numerical counters.
* **Example**:
```javascript
gsap.to('.terminal-text', {
  duration: 2,
  text: 'Initializing 32-factor Screaming Frog rule engine...',
  ease: 'none'
});
```

---

## 4. Easing Equations & Physical Motion Curves

| Easing Function | Feel & Trajectory | Ideal Use Case |
|---|---|---|
| `power2.out` | Gentle deceleration | Soft UI element entrances, card reveals |
| `power3.out` | Dramatic, snappy deceleration | Dialog / drawer entrances, navigation tabs |
| `power4.out` | High-velocity snap | Button feedback, instant popovers |
| `expo.out` | Ultra-smooth exponential deceleration | Premium Apple-style page hero reveals |
| `back.out(1.7)` | Slight overshoot and spring settle | Metric badges, score pill bounces |
| `elastic.out(1, 0.3)` | Jello-like spring oscillation | Playful celebration badges |
| `sine.inOut` | Continuous fluid wave | Ambient breathing background orbs, radar sweeps |

---

## 5. Next.js 16 & React 19 Implementation Recipes

### Recipe A: Master App Bootloader / Reload Lifecycle (`loading.js` & `AuditDashboard.jsx`)
```javascript
'use client';
import React, { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export default function AppBootloader({ onComplete }) {
  const containerRef = useRef(null);
  const ringRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useGSAP(() => {
    // 1. Continuous gyroscope rotation
    gsap.to(ringRef.current, {
      rotation: 360,
      repeat: -1,
      duration: 12,
      ease: 'none'
    });

    // 2. Multi-stage timeline with realistic telemetry pacing
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(containerRef.current, {
          opacity: 0,
          scale: 0.98,
          duration: 0.5,
          ease: 'power3.inOut',
          onComplete
        });
      }
    });

    const valObj = { val: 0 };
    tl.to(valObj, {
      val: 100,
      duration: 2.2,
      ease: 'power2.inOut',
      onUpdate: () => setProgress(Math.round(valObj.val))
    });
  }, { scope: containerRef });

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center">
      <div ref={ringRef} className="w-40 h-40 rounded-full border-2 border-dashed border-indigo-400"></div>
      <span className="mt-4 font-mono font-bold text-slate-800">{progress}%</span>
    </div>
  );
}
```

### Recipe B: Staggered Bento Metric Cards with Animated Score Counter
```javascript
'use client';
import React, { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export function BentoScoreCard({ score = 92, title = "Technical Health" }) {
  const cardRef = useRef(null);
  const [displayScore, setDisplayScore] = useState(0);

  useGSAP(() => {
    // Stagger entrance
    gsap.from(cardRef.current, {
      y: 20,
      opacity: 0,
      duration: 0.6,
      ease: 'power3.out'
    });

    // Animate score counter
    const obj = { val: 0 };
    gsap.to(obj, {
      val: score,
      duration: 1.8,
      ease: 'expo.out',
      onUpdate: () => setDisplayScore(Math.round(obj.val))
    });
  }, { scope: cardRef });

  return (
    <div ref={cardRef} className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
      <span className="text-3xl font-black text-slate-900">{displayScore}%</span>
      <h3 className="text-xs font-mono uppercase text-slate-500">{title}</h3>
    </div>
  );
}
```

---

## 6. AuditPro Component Mapping
1. **`src/app/loading.js`**: Gyroscopic 3-axis radar rotation, sweeping beam, and master timeline.
2. **`AuditDashboard.jsx`**: `Ctrl + R` app bootloader sequencing and crawl progress percentage interpolation.
3. **`OverviewTab.jsx`**: Staggered scorecard entrance, animated health meter rings, and HTTP bar fill animation.
