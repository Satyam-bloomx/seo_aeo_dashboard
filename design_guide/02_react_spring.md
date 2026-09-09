# React Spring (@react-spring/web) — Complete Architecture & Physics Guide

## 1. Executive Overview & Physics Foundation
**React Spring** is a physics-based animation library for React that models natural motion using physical equations (mass, tension, friction, and velocity) rather than fixed-time duration curves.

* **Primary Package**: `@react-spring/web` (v9.7+).
* **Core Philosophy**: Nature doesn't use fixed durations (e.g. 300ms). When a physical object is touched, dragged, or thrown, its movement depends on the force applied and spring resistance. React Spring allows interrupted, velocity-preserving gestures without jank.
* **Rendering Architecture**: Interpolates animated values outside of React's state loop using `animated.div` primitives, preventing unnecessary component re-renders.

---

## 2. Core Hook & Component Inventory

| Hook / Component | Description | Primary Use Case |
|---|---|---|
| `useSpring` | Animates values from state A to B using spring physics. | Single element transitions, 3D card tilts, button scale on press. |
| `useSprings` | Creates multiple independent springs for a list of items. | Dynamic lists where individual items react independently to pointer events. |
| `useTrail` | Creates multiple springs that follow a single leader with a staggered trailing delay. | Sequential menu item reveals, breadcrumbs, checklist item entrances. |
| `useTransition` | Handles mounting, unmounting, and reordering lifecycles (Enter, Update, Leave). | Tabs, routing views, toast popups, accordion row removals. |
| `useChain` | Coordinates the execution order of multiple separate hooks. | Firing a modal opening spring first, followed by trailing internal content springs. |
| `animated` | Higher-order wrapper component for HTML elements (`animated.div`, `animated.button`). | Consumes spring values directly without triggering component re-renders. |
| `to` / `interpolate` | Combines multiple spring values or maps ranges to CSS transforms. | Mapping `(x, y)` tilt angles to `perspective(1000px) rotateX(10deg) rotateY(-5deg)`. |

---

## 3. Spring Physics Configurations (`config`)

The `config` object defines the physical material properties of the spring:

```javascript
const springConfig = {
  mass: 1,       // Weight of the object (higher = more inertia/overshoot)
  tension: 170,  // Spring tightness/force (higher = snappier/faster acceleration)
  friction: 26,  // Air/surface resistance (lower = more bouncy oscillation)
  clamp: false,  // If true, stops immediately upon reaching destination without overshooting
  precision: 0.01, // Threshold to settle spring calculation
  velocity: 0    // Initial speed of the object
};
```

### Pre-Built Spring Presets
* `config.default`: Balanced natural motion (`{ mass: 1, tension: 170, friction: 26 }`)
* `config.gentle`: Soft, relaxed deceleration (`{ mass: 1, tension: 120, friction: 14 }`)
* `config.wobbly`: Playful, highly energetic bounce (`{ mass: 1, tension: 180, friction: 12 }`)
* `config.stiff`: Rapid, responsive, snappy snap (`{ mass: 1, tension: 210, friction: 20 }`)
* `config.slow`: Cinematic, heavy floating weight (`{ mass: 1, tension: 280, friction: 60 }`)
* `config.molasses`: High-viscosity slow fluid motion (`{ mass: 1, tension: 280, friction: 120 }`)

---

## 4. Next.js 16 & React 19 Implementation Recipes

### Recipe A: 3D Perspective Card Tilt on Mouse Hover
```javascript
'use client';
import React, { useRef } from 'react';
import { useSpring, animated, to } from '@react-spring/web';

const calcTilt = (x, y, rect) => [
  -(y - rect.top - rect.height / 2) / 20, // RotateX
  (x - rect.left - rect.width / 2) / 20,  // RotateY
  1.03                                    // Scale
];

const transTilt = (x, y, s) =>
  `perspective(1000px) rotateX(${x}deg) rotateY(${y}deg) scale(${s})`;

export function SpringTiltCard({ children }) {
  const cardRef = useRef(null);
  const [props, set] = useSpring(() => ({
    xys: [0, 0, 1],
    config: { mass: 1.2, tension: 280, friction: 22 }
  }));

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    set({ xys: calcTilt(e.clientX, e.clientY, rect) });
  };

  const handleMouseLeave = () => {
    set({ xys: [0, 0, 1] });
  };

  return (
    <animated.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform: to(props.xys, transTilt) }}
      className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm transition-shadow duration-300 hover:shadow-xl will-change-transform"
    >
      {children}
    </animated.div>
  );
}
```

### Recipe B: Physics-Based Staggered Trail for Navigation Items
```javascript
'use client';
import React from 'react';
import { useTrail, animated, config } from '@react-spring/web';

export function NavigationTrail({ items, onItemClick }) {
  const trail = useTrail(items.length, {
    from: { opacity: 0, x: -20 },
    to: { opacity: 1, x: 0 },
    config: config.stiff
  });

  return (
    <div className="flex flex-col space-y-1">
      {trail.map((style, index) => (
        <animated.button
          key={items[index].id}
          style={style}
          onClick={() => onItemClick(items[index])}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 text-left"
        >
          {items[index].label}
        </animated.button>
      ))}
    </div>
  );
}
```

### Recipe C: Interactive Tactile Button with Spring Press
```javascript
'use client';
import React from 'react';
import { useSpring, animated } from '@react-spring/web';

export function TactileSpringButton({ children, onClick }) {
  const [style, set] = useSpring(() => ({
    scale: 1,
    config: { tension: 400, friction: 15 }
  }));

  return (
    <animated.button
      style={style}
      onMouseDown={() => set({ scale: 0.94 })}
      onMouseUp={() => set({ scale: 1 })}
      onMouseLeave={() => set({ scale: 1 })}
      onClick={onClick}
      className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20"
    >
      {children}
    </animated.button>
  );
}
```

---

## 5. AuditPro Component Mapping
1. **`OverviewTab.jsx` Bento Metric Cards**: 3D perspective mouse tilt via `useSpring` with `{ mass: 1.2, tension: 280, friction: 22 }`.
2. **Audit Action Buttons**: Tactile press and release bounce physics.
3. **Score Metric Badges**: Dynamic scale bounce when score updates dynamically.
