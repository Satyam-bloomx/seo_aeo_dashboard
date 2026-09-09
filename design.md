# AuditPro — Next.js & Tailwind CSS Architecture (Light Mode & Motion)

## 1. Design Philosophy & Aesthetic Identity

- **Framework**: Next.js 16 (App Router) + Tailwind CSS (v4) + React 19.
- **Language**: JavaScript / JSX (`.js`, `.jsx`).
- **Core Aesthetic**: Crisp Light Mode with layered micro-shadows, subtle tinted glass panels, fluid ambient meshes, tactile spring physics, and high data density.
- **Animation & Motion Stack** (full spec: [`ANIMATION.md`](./ANIMATION.md)):
  - **Framer Motion (`framer-motion` v13)** - *primary motion layer*: element enter **and exit** via `AnimatePresence`, gliding `layoutId` active indicators, declarative hover/tap springs, and list stagger orchestration.
  - **GSAP (`gsap` + `@gsap/react`)**: the ~2.0s boot-screen master timeline and the Overview bento card entrance stagger.
  - **Anime.js (`animejs` v4)**: Lighthouse gauge `strokeDashoffset` drawing and its numeric counter.
  - **React Spring (`@react-spring/web`)**: 3D interactive card tilt on hover.
  - **Headless UI (`@headlessui/react`)**: accessibility only - focus trap, ESC, scroll lock, ARIA. Animation is driven by Framer Motion via `AnimatedModal`.
  - **Sonner (`sonner`)**: animated, interactive toast notification popups.
  - **Canvas Confetti (`canvas-confetti`)**: dual vector celebration cannons on crawl completion.
  - *Retired*: **Three.js / drei** (the 3D loading models) and **AutoAnimate** are no longer imported anywhere.

- **Motion tokens**: 10 named easing curves, 6 named durations and 4 spring presets live in `frontend/src/lib/motion.js`, mirrored as CSS custom properties in `globals.css`. Components never inline a raw `cubic-bezier` or millisecond value.

---

## 2. Dynamic Color Architecture (Bespoke Light Palette)

| Role | Color Name | Hex / Value | Purpose |
|---|---|---|---|
| **Base Canvas** | Pure Slate Mesh | `#F8FAFC` to `#F1F5F9` | Ambient background canvas with animated soft gradient mesh |
| **Surface (Level 1)** | Crisp White Card | `#FFFFFF` | Primary content panels, cards, tables, modal bodies |
| **Surface (Level 2)** | Subdued Slate | `#F8FAFC` / `#F1F5F9` | Table headers, secondary toolbars, drawer panels, input fields |
| **Borders & Dividers** | Refined Slate Border | `#E2E8F0` / `#CBD5E1` | Crisp 1px structural dividers with subtle hover transitions |
| **Text (Primary)** | Deep Midnight Slate | `#0F172A` | Ultra-high contrast readable titles, values, and table cells |
| **Text (Muted)** | Steel Slate | `#64748B` | Secondary descriptions, timestamps, metric labels |
| **Accent Primary** | Vivid Emerald Core | `#10B981` / `#059669` | Primary CTAs, 100% health indicators, successful 2xx codes |
| **Accent Secondary** | Electric Royal Indigo | `#4F46E5` / `#6366F1` | Active navigation tabs, links, focus rings, tech highlights |
| **Accent AEO / AI** | Radiant Violet Pulse | `#7C3AED` / `#8B5CF6` | AEO Voice & LLM Readiness scores, extractability badges |
| **Accent GEO / Local** | Crimson Rose | `#E11D48` / `#F43F5E` | Local 3-Pack, NAP consistency indicators, critical errors |
| **Accent Warning** | Warm Amber Gold | `#D97706` / `#F59E0B` | Warnings, redirects, performance notices |

---

## 3. Clean Next.js File Structure

```
frontend/src/
├── app/
│   ├── favicon.ico
│   ├── globals.css                # Tailwind CSS import & utility classes
│   ├── layout.js                  # Next.js RootLayout (Google Fonts & Sonner Toaster)
│   ├── loading.js                 # GSAP boot screen: geometric mark, wordmark, hairline progress
│   ├── loading-demo/
│   │   └── page.js                # Standalone preview route for the animated loading screen
│   ├── not-found.js               # Next.js 404 Page with diagnostic error details
│   ├── page.js                    # Next.js Home Page (renders AuditDashboard)
│   └── integrations/
│       └── callback/
│           └── page.js            # Google OAuth Callback Route
│
├── components/
│   └── ui/
│       ├── AnimatedModal.jsx      # Headless UI Dialog + AnimatePresence (animates on close, not just open)
│       └── AnimatedNumber.jsx     # Ref-driven count-up, no per-frame re-render
│
├── lib/
│   └── motion.js                  # Motion design tokens: easings, durations, springs, variants
│
├── features/
│   └── AuditDashboard/
│       ├── AuditDashboard.jsx     # Master mission control with live crawler & toast alerts
│       ├── ApiKeyModal.jsx        # API Key modal with live test verification
│       ├── ExecutiveReportModal.jsx # Client-ready printable Executive PDF certificate
│       ├── IntegrationsPanel.jsx  # API Integrations Hub with live latency benchmarking
│       ├── ResultsTab/
│       │   ├── OverviewTab.jsx    # Bento scorecards with GSAP stagger & spotlight
│       │   ├── IssuesTab.jsx      # Diagnostic table with @formkit/auto-animate accordion
│       │   ├── PerformanceTab.jsx # Mobile/Desktop Lighthouse simulator & Core Web Vitals
│       │   └── URLExplorerTab.jsx # Screaming Frog 32-parameter data grid with CSV export
│       ├── SettingsModal/
│       │   └── SettingsModal.jsx  # Crawler Configuration Console (Presets, limits, spider)
│       └── Sidebar/
│           └── Sidebar.jsx        # layoutId gliding pill, staggered nav, icon springs
│
├── store/
│   └── crawlStore.js              # Zustand state management
└── utils/
    └── IssuesEngine.js            # Diagnostic rule engine calculating issues from crawl data
```

---

## 4. Loading Screen Architecture (`loading.js`)

- **Design Philosophy**: Simple and modern. One geometric mark, one wordmark, one hairline of progress - no 3D payload, no timecode HUD, no data dump. The screen exists to fill ~2 seconds gracefully and then get out of the way.
- **Layers**:
  1. `Progress Ring`: gradient stroke (`#4F46E5` -> `#0EA5E9` -> `#10B981`) driven by `stroke-dashoffset`.
  2. `Outer Dashed Orbit`: 9s continuous rotation with a single indigo satellite.
  3. `Inner Orbit`: 6s **counter**-rotation with an emerald satellite.
  4. `Breathing Core`: radial glow on a 1.6s `sine.inOut` yoyo.
  5. `Ambient wash + masked hairline grid`: static structure behind the mark.
- **Typography & Progress**: `AUDITPRO` floats up character-by-character on a 30ms stagger; a 3px gradient bar fills via `scaleX` beside a tabular `000%` readout.
- **Lifecycle** (~2.0s): mark settles on `expo.out` -> wordmark staggers -> progress charges on `power2.inOut` -> everything lifts 10px and fades on `power2.out`. The exit is the fastest beat in the sequence.
- **Layering**: rendered *above* the dashboard rather than instead of it, so the app is already painted and settled when the loader lifts away.
- **Reduced motion**: the entire timeline is skipped - the finished state paints immediately and hands off after 0.4s.
- **Preview**: standalone at `/loading-demo` with a replay control.
