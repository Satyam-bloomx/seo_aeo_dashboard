# Anime.js — Complete Architecture & SVG Vector Physics Guide

## 1. Executive Overview & Mathematical Foundation
**Anime.js** is a lightweight JavaScript animation engine with a specialized focus on **SVG attributes, vector path drawing, morphing, and staggered numeric interpolation**.

* **Primary Package**: `animejs` (v3.2+ / v4.0+).
* **Bundle Footprint**: ~14KB min/gzip.
* **Core Strengths**: Unmatched native support for SVG properties (`stroke-dashoffset`, `stroke-dasharray`, `points`, `d` path morphing, `transformOrigin`), custom non-linear spring and bezier easings, and numeric DOM object mutations.

---

## 2. Core API Inventory & SVG Primitives

### A. Primary Functions (Anime.js v4)
| API | Signature | Purpose |
|---|---|---|
| `animate()` | `animate(targets, { ...params })` | Main animation execution function. |
| `createTimeline()` | `createTimeline({ ... })` | Chains sequential animations with offsets and labels. |
| `stagger()` | `stagger(val, { start, from, grid, axis })` | Creates multi-directional staggered delay arrays (e.g. from center, random, or 2D grid). |
| `setDashoffset` | `setDashoffset(svgPathElement)` | Automatically calculates and assigns the total path length to `stroke-dasharray` and `stroke-dashoffset`. |


---

## 3. SVG Animation Capabilities

### 1. SVG Path Drawing (`strokeDashoffset`)
Anime.js eliminates the manual `getTotalLength()` math in SVG path drawing:
```javascript
import anime from 'animejs';

anime({
  targets: '.gauge-circle-path',
  strokeDashoffset: [anime.setDashoffset, 0],
  easing: 'easeInOutCubic',
  duration: 1600,
  delay: function(el, i) { return i * 200; }
});
```

### 2. SVG Vector Path Morphing (`d` attribute)
Morphs one SVG polygon/shape into another with identical point counts:
```javascript
anime({
  targets: '.morphing-path',
  d: [
    { value: 'M10 80 Q 95 10 180 80' },
    { value: 'M10 80 Q 95 150 180 80' }
  ],
  easing: 'easeInOutQuad',
  duration: 2000,
  loop: true
});
```

### 3. Circular Telemetry Gauge Calculation
Calculates the exact circumference for a circle of radius `r`:
$$\text{Circumference} = 2 \times \pi \times r$$
$$\text{Offset} = \text{Circumference} \times \left(1 - \frac{\text{Score}}{100}\right)$$

---

## 4. Next.js 16 & React 19 Implementation Recipes

### Recipe A: Animated Circular Lighthouse Score Gauge (`PerformanceTab.jsx`)
```javascript
'use client';
import React, { useEffect, useRef } from 'react';
import anime from 'animejs';

export function LighthouseGauge({ score = 94, size = 120, strokeWidth = 10 }) {
  const circleRef = useRef(null);
  const textRef = useRef(null);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference * (1 - score / 100);

  useEffect(() => {
    if (!circleRef.current || !textRef.current) return;

    // 1. Animate SVG circle stroke
    anime({
      targets: circleRef.current,
      strokeDashoffset: [circumference, targetOffset],
      duration: 1800,
      easing: 'easeOutExpo'
    });

    // 2. Animate numerical counter
    const counter = { val: 0 };
    anime({
      targets: counter,
      val: score,
      round: 1,
      duration: 1800,
      easing: 'easeOutExpo',
      update: () => {
        if (textRef.current) {
          textRef.current.textContent = `${counter.val}`;
        }
      }
    });
  }, [score, circumference, targetOffset]);

  const getColor = (val) => {
    if (val >= 90) return '#059669'; // Emerald
    if (val >= 50) return '#D97706'; // Amber
    return '#E11D48'; // Rose
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background Track Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Animated Progress Circle */}
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>

      <div className="absolute flex flex-col items-center justify-center text-center">
        <span ref={textRef} className="text-2xl font-black font-mono text-slate-900 leading-none">
          0
        </span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
          Score
        </span>
      </div>
    </div>
  );
}
```

### Recipe B: Staggered Core Web Vitals Waveform Dial
```javascript
'use client';
import React, { useEffect, useRef } from 'react';
import anime from 'animejs';

export function WebVitalsWaveform() {
  const containerRef = useRef(null);

  useEffect(() => {
    anime({
      targets: '.waveform-bar',
      scaleY: [
        { value: [0.2, 1], duration: 400 },
        { value: 0.2, duration: 400 }
      ],
      delay: anime.stagger(80, { from: 'center' }),
      loop: true,
      easing: 'easeInOutSine'
    });
  }, []);

  return (
    <div ref={containerRef} className="flex items-center gap-1 h-8">
      {[...Array(9)].map((_, i) => (
        <div
          key={i}
          className="waveform-bar w-1.5 h-full bg-indigo-600 rounded-full origin-bottom"
        />
      ))}
    </div>
  );
}
```

---

## 5. AuditPro Component Mapping
1. **`PerformanceTab.jsx`**: Animated circular Lighthouse score gauge and Core Web Vitals (LCP, INP, CLS) speed meters.
2. **`loading.js`**: SVG telemetry circle stroke dash animations.
3. **`ExecutiveReportModal.jsx`**: Animated report grading badges.
