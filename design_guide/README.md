# AuditPro — Master Motion & UI Design Architecture Guide

Welcome to the comprehensive, multi-library animation and UI reference library for **AuditPro**. This folder houses dedicated, real-time documentation and code recipes for each specialized animation library in the ecosystem.

---

## 📚 Library Reference Index

| File | Library | Core Specialization & Domain |
|---|---|---|
| [01_gsap.md](./01_gsap.md) | **GSAP (GreenSock)** | Complex timelines, multi-stage loading sequences, numeric counters, text typing, and staggered reveals. |
| [02_react_spring.md](./02_react_spring.md) | **React Spring** | Physics-based micro-interactions, mass/tension/friction dynamics, 3D card tilt, and tactile button presses. |
| [03_auto_animate.md](./03_auto_animate.md) | **AutoAnimate (FormKit)** | Zero-config DOM mutation observer for accordions, data table filtering, and dynamic lists. |
| [04_animejs.md](./04_animejs.md) | **Anime.js** | Mathematical SVG vector path drawing (`strokeDashoffset`), circular Lighthouse telemetry gauges, and path morphing. |
| [05_headless_ui_dialogs.md](./05_headless_ui_dialogs.md) | **Headless UI / Radix** | Accessible modal dialogs, slide-over inspector sheets, focus trapping, and Apple-grade spring scale/fade transitions. |
| [06_aceternity_and_motion_primitives.md](./06_aceternity_and_motion_primitives.md) | **Aceternity UI & Primitives** | GPU-accelerated cursor spotlight illumination (`--mouse-x`, `--mouse-y`), gliding active navigation pills, and bento grid styling. |
| [07_sonner_toasts.md](./07_sonner_toasts.md) | **Sonner** | Physics-driven stacked toast notifications, real-time crawler progress alerts, and API benchmark feedback. |
| [08_canvas_confetti.md](./08_canvas_confetti.md) | **Canvas Confetti** | 2D vector particle physics engine for milestone completions and audit celebration cannons. |
| [09_remotion.md](./09_remotion.md) | **Remotion** | Programmatic React video rendering, frame-accurate animation math, and automated audit video reel generation. |
| [10_barba_and_view_transitions.md](./10_barba_and_view_transitions.md) | **Barba.js & View Transitions** | Seamless page-to-page route transitions and container morphing without layout flashes. |
| [12_framer_motion.md](./12_framer_motion.md) | **Framer Motion** ⭐ | Element **exit** animations (`AnimatePresence`), gliding `layoutId` indicators, declarative hover/tap springs, and list stagger orchestration. |

> ⭐ **Framer Motion is the primary motion layer.** It was added because the app
> was relying on `tailwindcss-animate` utility classes (`animate-in`,
> `slide-in-from-right`, `zoom-in-95`) from a plugin that is not installed — so
> they compiled to nothing. See [`../ANIMATION.md`](../ANIMATION.md) for the
> full motion system: easing tokens, durations, springs and accessibility.

---

## 🎯 The Core Philosophy: "Use Each Library For What It Does Best"

Rather than forcing a single library to handle all animation tasks poorly, AuditPro uses a **Domain-Specialized Motion Stack**:

```
                                  AUDITPRO APPLICATION
                                           │
          ┌────────────────────────────────┼────────────────────────────────┐
          ▼                                ▼                                ▼
    TIMELINES & HUD               ENTER / EXIT & UI                    SVG & ALERTS
   ┌───────────────┐               ┌───────────────┐                ┌───────────────┐
   │     GSAP      │               │ FRAMER MOTION │                │   Anime.js    │
   │ (Boot screen, │               │ (AnimatePres- │                │ (SVG Gauges,  │
   │  Overview     │               │  ence, layout │                │  Path Math)   │
   │  stagger)     │               │  Id, stagger, │                ├───────────────┤
   └───────────────┘               │  hover/tap)   │                │    Sonner     │
                                   ├───────────────┤                │ (Toasts, Live │
                                   │ React Spring  │                │  Alerts)      │
                                   │ (3D card tilt)│                ├───────────────┤
                                   ├───────────────┤                │Canvas Confetti│
                                   │  Headless UI  │                │(Celebrations) │
                                   │ (a11y only -  │                └───────────────┘
                                   │  focus trap,  │
                                   │  ESC, ARIA)   │
                                   └───────────────┘

   AutoAnimate has been retired - it offered no exit control and no shared
   easing tokens. AnimatePresence replaced it in every location.
```
