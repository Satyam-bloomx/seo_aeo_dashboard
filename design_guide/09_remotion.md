# Remotion — Complete Architecture & Programmatic Video Rendering Guide

## 1. Executive Overview & Programmatic Video Architecture
**Remotion** is a framework for creating programmatic MP4 videos, animated reels, and dynamic motion graphics using standard React components, CSS, and SVG.

* **Primary Packages**: `@remotion/player` (web player), `remotion` (core frame rendering engine).
* **Core Philosophy**: Treat video as a function of time:
$$\text{Visual Frame} = f(\text{Frame Number}, \text{FPS}, \text{Props})$$
* **Core Strengths**:
  1. **React Component Based**: Any React component, Tailwind class, SVG icon, or GSAP animation can be rendered as a video frame.
  2. **Frame-Accurate Math**: Replaces non-deterministic `requestAnimationFrame` with precise frame numbers (`useCurrentFrame()`).
  3. **Automated Audit Video Summaries**: Enables generating a 15-second client executive video report directly from crawl data.

---

## 2. Core Hook & Component Inventory

| Primitive | Signature | Purpose |
|---|---|---|
| `<Player>` | `<Player component={...} durationInFrames={180} fps={30} />` | Embeddable React video player with playback controls. |
| `<Composition>` | `<Composition id="AuditSummary" component={...} width={1920} height={1080} />` | Declares resolution, frame rate, and duration for rendering. |
| `<Sequence>` | `<Sequence from={30} durationInFrames={60}>` | Schedules sub-components to appear at specific frame intervals. |
| `useCurrentFrame()` | `const frame = useCurrentFrame()` | Returns the active integer frame index (e.g. `45`). |
| `useVideoConfig()` | `const { fps, durationInFrames, width, height } = useVideoConfig()` | Exposes video metadata properties. |
| `interpolate()` | `interpolate(frame, [0, 30], [0, 100], { extrapolateRight: 'clamp' })` | Mathematical range mapping for properties. |
| `spring()` | `spring({ frame, fps, config: { damping: 12 } })` | Computes frame-accurate spring physics curves. |

---

## 3. Next.js 16 Implementation Recipe: 15-Second Animated Audit Reel

```javascript
'use client';
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ShieldCheck, Activity, Globe, Zap } from 'lucide-react';

export function AuditVideoSummaryComposition({ auditData }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene 1: Logo & Title Intro (Frames 0 - 60)
  const introOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const introScale = spring({ frame, fps, config: { damping: 10 } });

  // Scene 2: Health Score Reveal (Frames 45 - 120)
  const scoreProgress = interpolate(frame, [45, 90], [0, auditData?.healthScore || 94], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <div className="w-full h-full bg-[#0F172A] text-white flex flex-col items-center justify-center p-12 font-sans relative overflow-hidden">
      
      {/* Background Radial Glow */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />

      {/* Frame 0 - 60: Intro Header */}
      {frame < 60 && (
        <div 
          style={{ opacity: introOpacity, transform: `scale(${introScale})` }}
          className="flex flex-col items-center text-center space-y-4"
        >
          <div className="w-20 h-20 rounded-3xl bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-500/50">
            <Activity size={44} className="text-emerald-400" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">AuditPro Telemetry Report</h1>
          <p className="text-slate-400 font-mono text-sm">{auditData?.domain || 'bloomxsolutions.com'}</p>
        </div>
      )}

      {/* Frame 45 - 150: Live Score Metric Reveal */}
      {frame >= 45 && (
        <div className="flex flex-col items-center text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-7xl font-black font-mono text-emerald-400">
            {Math.round(scoreProgress)}%
          </div>
          <h2 className="text-xl font-bold uppercase tracking-widest text-slate-300">
            Technical SEO & AEO Health Index
          </h2>
          
          <div className="grid grid-cols-3 gap-6 pt-6">
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-center">
              <span className="text-2xl font-bold text-indigo-400">32 / 32</span>
              <p className="text-xs text-slate-400 mt-1">Rules Passed</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-center">
              <span className="text-2xl font-bold text-purple-400">98%</span>
              <p className="text-xs text-slate-400 mt-1">AEO Extraction</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-center">
              <span className="text-2xl font-bold text-amber-400">18ms</span>
              <p className="text-xs text-slate-400 mt-1">INP Speed</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
```

---

## 4. AuditPro Future Extension
* Remotion can be embedded in `ExecutiveReportModal.jsx` using `@remotion/player` to provide downloadable 15-second MP4 video reels for client presentations.
