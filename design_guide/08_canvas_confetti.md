# Canvas Confetti — Complete Architecture & Vector Particle Physics Guide

## 1. Executive Overview & Particle Engine Architecture
**Canvas Confetti** is a high-performance vector particle physics engine that renders particle bursts directly onto an HTML5 `<canvas>` element using hardware-accelerated 2D context operations.

* **Primary Package**: `canvas-confetti` (v1.9+).
* **Bundle Footprint**: ~6.2KB min/gzip.
* **Core Strengths**:
  1. **Zero DOM Overhead**: Animates thousands of particles at 60fps without creating a single DOM node.
  2. **Physical Kinematics**: Simulates gravity, drag/air resistance, angular rotation velocity, and particle decay.
  3. **Multi-Source Cannons**: Fires particles from specified screen coordinates `(origin: { x, y })`.

---

## 2. API & Physics Parameter Inventory

| Parameter | Type | Default | Description |
|---|---|---|---|
| `particleCount` | Number | `50` | Number of confetti particles to spawn per blast. |
| `angle` | Number | `90` | Direction of the blast in degrees (`90` = straight up). |
| `spread` | Number | `45` | Spread angle of the blast cone. |
| `startVelocity` | Number | `45` | Initial launch speed of particles. |
| `decay` | Number | `0.9` | Rate of velocity loss per frame (lower = slows down faster). |
| `gravity` | Number | `1` | Downward gravitational acceleration force. |
| `drift` | Number | `0` | Horizontal wind drift speed. |
| `ticks` | Number | `200` | Lifetime duration in animation frames before fading. |
| `origin` | Object | `{ x: 0.5, y: 0.5 }` | Screen coordinates `(0 to 1)` where particles emerge. |
| `colors` | Array | `[...]` | Hex color palette array for the particles. |
| `shapes` | Array | `['square', 'circle']` | Vector shape types (`'square'`, `'circle'`, `'star'`). |
| `scalar` | Number | `1` | Size scale multiplier of individual confetti pieces. |

---

## 3. High-End Celebration Recipes

### Recipe A: Side Cannon Dual Blast (Audit Completion)
Fires two synchronized cannons from the bottom-left and bottom-right corners of the screen:

```javascript
'use client';
import confetti from 'canvas-confetti';

export function fireCelebrationCannons() {
  const count = 200;
  const defaults = {
    origin: { y: 0.85 },
    colors: ['#059669', '#10B981', '#4F46E5', '#6366F1', '#F59E0B']
  };

  function fire(particleRatio, opts) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio)
    });
  }

  // Multi-stage velocity dispersion
  fire(0.25, { spread: 26, startVelocity: 55, origin: { x: 0.2, y: 0.85 } });
  fire(0.20, { spread: 60, origin: { x: 0.2, y: 0.85 } });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, origin: { x: 0.2, y: 0.85 } });

  fire(0.25, { spread: 26, startVelocity: 55, origin: { x: 0.8, y: 0.85 } });
  fire(0.20, { spread: 60, origin: { x: 0.8, y: 0.85 } });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, origin: { x: 0.8, y: 0.85 } });
}
```

### Recipe B: Realistic Fireworks Finale (100% Score Milestone)
```javascript
'use client';
import confetti from 'canvas-confetti';

export function fireMilestoneFireworks(durationMs = 3000) {
  const animationEnd = Date.now() + durationMs;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / durationMs);
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      colors: ['#10B981', '#4F46E5', '#06B6D4', '#8B5CF6']
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      colors: ['#10B981', '#4F46E5', '#06B6D4', '#8B5CF6']
    });
  }, 250);
}
```

---

## 4. AuditPro Component Mapping
1. **`AuditDashboard.jsx`**: Triggered when a crawl completes 100% of URLs and reveals the celebratory audit banner.
2. **`ExecutiveReportModal.jsx`**: Fired upon 1-click export of the executive PDF certificate.
