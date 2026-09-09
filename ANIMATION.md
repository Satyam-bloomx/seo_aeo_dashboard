# AuditPro — Motion System

The single specification for how this product moves. Every animation in the app
resolves to a token in [`frontend/src/lib/motion.js`](frontend/src/lib/motion.js)
or its CSS mirror in [`frontend/src/app/globals.css`](frontend/src/app/globals.css).

- Library reference for the new dependency: [`design_guide/12_framer_motion.md`](design_guide/12_framer_motion.md)
- Existing per-library recipes: [`design_guide/`](design_guide/)

---

## 1. What was wrong, and what changed

### The bug

The UI used Tailwind utility classes from the **`tailwindcss-animate` plugin**:

```jsx
className="… animate-in slide-in-from-right duration-300"
className="… animate-in fade-in zoom-in-95 duration-300"
```

That plugin was **never installed**. `package.json` has `tailwindcss` and
`@tailwindcss/postcss` and nothing else; `globals.css` had no `@plugin`
directive. Under Tailwind v4 an unknown utility emits no CSS and no warning, so
every one of those classes was inert. The sidebar, the URL inspector drawer, the
crawl banner, the completion banner and all four tab panels were rendering with
**zero** animation while looking, in source, like they were animated.

The Headless UI modals did animate in, but were built on the legacy
`<Transition as={Fragment}>` wrapper. That pattern is fragile in Headless UI v2
and, more importantly, gave no shared vocabulary with the rest of the app.

### The fix

| Area | Before | After |
|---|---|---|
| Enter/exit | Dead `animate-in` classes | `AnimatePresence` + shared variants |
| Modals | `Transition` / `TransitionChild` | `AnimatedModal` (`Dialog static` + `AnimatePresence`) |
| Active nav indicator | Instant class swap | `layoutId` shared-layout glide |
| List reordering | AutoAnimate (no exit, no easing token) | `AnimatePresence` + variant stagger |
| Easing | Ad-hoc `duration-300`, `transition-all` | 10 named curves, 6 named durations |
| Reduced motion | Not handled | Handled globally in CSS + per-component in JS |
| Loading screen | 3D rigged flamingo + Three.js + timecode HUD | One SVG mark, wordmark, hairline progress |

New files:

```
frontend/src/lib/motion.js                    motion tokens — the source of truth
frontend/src/components/ui/AnimatedModal.jsx  reusable animated dialog shell
frontend/src/components/ui/AnimatedNumber.jsx ref-driven count-up
```

---

## 2. Principles

**1. Ease-out for entrances *and* exits.**
`ease-in` accelerates from zero, so the first frames barely move and the UI feels
sluggish. `ease-out` front-loads the distance: it reads as "instant, then
settling". This is the largest perceived-speed win available and it costs
nothing. `ease-in-out` is reserved for elements already on screen that travel
from one place to another.

**2. Exits run ~20% faster than entrances.**
Arriving content earns a moment. Dismissed content is already decided —
`exitDuration()` encodes the 0.8 multiplier.

**3. Duration scales with travel, not importance.**

| Interaction | Duration |
|---|---|
| Hover, press, icon swap, checkbox | 100–150ms |
| Tooltip, badge, dropdown | 150–250ms |
| Modal, drawer, slide-over | 200–300ms |
| Full-surface reveal | 450ms |

Nothing in the app exceeds 300ms except the boot screen and deliberate
data-visualisation fills.

**4. Only `transform` and `opacity`.**
`width`, `height`, `top`, `margin` and `padding` force layout on every frame.
Progress bars fill with `scaleX` on an `origin-left` element, not `width`.
The one documented exception is the Issues accordion (§6).

**5. Springs get bounce 0–0.3, or none.**
`spring.snap` (bounce 0) for indicators, `spring.soft` (bounce 0.2) for panels
and confirmations. Anything springier reads as a toy.

**6. Motion must survive being turned off.**
Every animated element degrades under `prefers-reduced-motion: reduce` — see §7.

**7. Skip animation on high-frequency actions.**
If a user does something 100+ times a day, animating it becomes a tax. Table row
hover is a colour change, not a transform.

---

## 3. Tokens

### Easing (`ease` / `easeCss`)

| Token | cubic-bezier | Use |
|---|---|---|
| `outQuad` | `0.25, 0.46, 0.45, 0.94` | Colour and opacity nudges |
| `outCubic` | `0.215, 0.61, 0.355, 1` | General UI workhorse |
| `outQuart` | `0.165, 0.84, 0.44, 1` | Panels, cards, popovers, exits |
| `outQuint` | `0.23, 1, 0.32, 1` | **Signature curve** — default entrances |
| `outExpo` | `0.19, 1, 0.22, 1` | Dramatic reveals, boot mark |
| `outCirc` | `0.075, 0.82, 0.165, 1` | Sharp mechanical snap |
| `inOutCubic` | `0.645, 0.045, 0.355, 1` | On-screen movement |
| `inOutQuart` | `0.77, 0, 0.175, 1` | Ambient drift |
| `inOutExpo` | `1, 0, 0, 1` | Wipes |
| `backOut` | `0.34, 1.56, 0.64, 1` | Tactile confirmations only — use sparingly |

`ease.*` returns an array for Framer Motion. `easeCss.*` returns the
`cubic-bezier(…)` string for inline styles and GSAP. `globals.css` mirrors them
as `--ease-out-quint` etc.

### Duration (seconds)

`instant 0.1` · `micro 0.15` · `fast 0.2` · `base 0.25` · `panel 0.3` · `slow 0.45`

### Springs

| Token | Config | Use |
|---|---|---|
| `spring.snap` | `duration 0.35, bounce 0` | Gliding indicators, layout shifts |
| `spring.soft` | `duration 0.5, bounce 0.2` | Modals, cards, confirmations |
| `spring.press` | `stiffness 620, damping 32, mass 0.7` | Hover/tap feedback |
| `spring.heavy` | `duration 0.6, bounce 0.12` | Large drawers |

### Variants

`fade` · `fadeUp` · `fadeDown` · `modalPanel` · `backdrop` · `slideOverRight` ·
`slideOverLeft` · `bannerDrop` · `popIn` · `tabPanel` ·
`staggerContainer(gap, delay)` + `staggerItem`

### Interaction presets

`hoverLift` (`y: -2`) · `hoverGrow` (`scale: 1.03`) · `tapPress` (`scale: 0.97`) ·
`tapPressSoft` (`scale: 0.985`)

### CSS utilities (`globals.css`)

For static markup that does not need JS orchestration:

`.ap-fade-in` · `.ap-fade-up` · `.ap-fade-down` · `.ap-scale-in` ·
`.ap-slide-right` · `.ap-stagger` (auto-delays up to 8 children) ·
`.shimmer-active` · `.live-dot` (expanding halo) · `.skeleton` · `.link-sweep`

> These are prefixed `ap-` specifically so they can never be confused with a
> Tailwind plugin utility that may or may not be installed. If an `ap-` class
> does nothing, it is missing from `globals.css` and you will find it there.

---

## 4. Library ownership

Each library does the one thing it is best at. Two libraries must never animate
the same property on the same node.

```
                          AUDITPRO MOTION STACK
                                   │
   ┌───────────────┬───────────────┼───────────────┬───────────────┐
   ▼               ▼               ▼               ▼               ▼
FRAMER MOTION    GSAP          ANIME.JS      REACT SPRING      SONNER
enter/exit    boot timeline   SVG gauge      3D card tilt      toasts
layoutId      card stagger    strokeDash     tilt transform    stacking
stagger       (Overview)      + counter
hover/tap
                                                            CANVAS CONFETTI
                                                            completion cannons
```

| Library | Owns | Files |
|---|---|---|
| **Framer Motion** | All enter/exit, `layoutId` indicators, hover/tap physics, list stagger | everywhere — see `12_framer_motion.md` §6 |
| **GSAP** | Boot lifecycle timeline; Overview card entrance | `app/loading.js`, `OverviewTab.jsx` |
| **Anime.js** | Lighthouse gauge `strokeDashoffset` + numeric counter | `PerformanceTab.jsx` |
| **React Spring** | 3D tilt transform on bento score cards | `OverviewTab.jsx` |
| **Headless UI** | Focus trap, ESC, scroll lock, ARIA — **not** the animation | `AnimatedModal.jsx` |
| **Sonner** | Toast stack physics | `app/layout.js` |
| **Canvas Confetti** | Crawl-completion cannons | `AuditDashboard.jsx` |

**Removed:** `@formkit/auto-animate` is no longer imported anywhere. It gave no
exit control and no easing token. It is still in `package.json` — safe to drop
with `npm uninstall @formkit/auto-animate` if you want it gone.

**Now unreferenced:** `components/Animal3D.jsx`, `CyberCore3D.jsx`,
`StudioAnimalDrei.jsx`, `StudioCore3D.jsx` and the `/public/models/*.glb` files
were only used by the old loading screen. They are tree-shaken out of the bundle
since nothing imports them, but they can be deleted — along with `three`,
`@react-three/fiber` and `@react-three/drei` — if no 3D is planned.

---

## 5. The loading screen

`frontend/src/app/loading.js`, previewable at `/loading-demo`.

**Before:** a rigged 3D flamingo in a Three.js/drei canvas, split studio
shutters, a running SMPTE timecode, GPS coordinates and a paragraph of copy.

**After:** one geometric mark, a wordmark, a hairline of progress. Simple and
modern, as requested, and it no longer downloads a GLB before the app can boot.

Composition:

| Layer | Motion |
|---|---|
| Progress ring | `strokeDashoffset`, driven by the timeline counter |
| Outer dashed orbit + satellite | continuous 9s rotation, linear |
| Inner orbit + satellite | continuous 6s **counter**-rotation |
| Core glow | 1.6s `sine.inOut` breathe, yoyo |
| Wordmark | per-character float-up, 30ms stagger |
| Hairline bar | `scaleX` on `origin-left` |
| Ambient wash + masked grid | static, purely to give the void structure |

Timeline (~2.0s):

```
0.00s  mark scales 0.8 → 1 on expo.out
0.25s  wordmark characters stagger up (power3.out)
0.35s  progress charges 0 → 100 on power2.inOut, ring + bar track it
+0.15s everything lifts 10px and fades (power2.out)
       root fades out, then onBootloaderComplete() fires
```

The exit is the fastest beat in the sequence — nobody should wait for a loading
screen to finish leaving. It is rendered *above* the dashboard rather than
instead of it, so the app is already painted and settled when the loader lifts.

Under `prefers-reduced-motion` the entire timeline is skipped: it paints the
finished state and calls back after 0.4s.

---

## 6. Component inventory

| Surface | Motion |
|---|---|
| **Sidebar nav** | `layoutId` pill glides between rows (`spring.snap`); emerald edge bar glides with it; rows stagger in at 45ms; icons rotate + scale on hover; hover wash cross-fades |
| **Sidebar PDF button** | Sheen sweeps across on hover; icon counter-rotates; `tapPressSoft` |
| **Mobile nav drawer** | Slides from `-100%` on `spring.heavy`, scrim cross-fades, both exit |
| **URL inspector drawer** | Slides from `100%` on `spring.heavy`; contents cascade at 50ms; close button rotates 90° on hover; copy icon cross-fades to a tick |
| **Tab body** | `AnimatePresence mode="wait"` cross-fade with 8px lift, keyed on `activeTab` |
| **Crawl banner** | `bannerDrop` from the top edge with `transformOrigin: top`; progress fills via `scaleX`; shimmer sweep |
| **Completion banner** | `popIn`; tick icon springs in from `scale 0, rotate -90` at +100ms |
| **Run Audit button** | Label cross-fades between idle and "Crawling…" on `mode="wait"` |
| **Empty state** | Cascade; search icon breathes on a 3.2s loop; quick-launch chips lift on hover |
| **Modals (all 3)** | `Dialog static` + `AnimatePresence`; backdrop cross-fade; panel `scale 0.96 → 1` + 16px lift on `spring.soft`; exit 240ms `outQuart` |
| **Settings nav** | `layoutId` pill; panel swap on `mode="wait"`; preset cards stagger and lift; checkbox tick springs in and out |
| **Executive report** | Section-by-section cascade at 70ms; print/close button physics |
| **API key modal** | Result banner springs in, icon rotates in; eye toggle cross-fades; both buttons cross-fade their labels |
| **Overview** | GSAP card stagger; React Spring 3D tilt; `AnimatedNumber` count-up; distribution bars fill on `scaleX` with 70ms offsets; 12-category grid staggers at 30ms with a hover arrow; findings list uses `layout` + exit |
| **Issues** | Severity filter `layoutId` pill; rows enter/exit with `layout`; chevron rotates 180°; accordion height animation |
| **Performance** | Mobile/desktop `layoutId` pill; Anime.js gauge; six vitals stagger with bars filling at 50ms offsets; opportunities slide on hover |
| **URL grid** | Rows enter/exit, stagger capped at 12 rows; export icon nudges down on hover |
| **Integrations** | Cards stagger and lift; connected/disconnected badge swaps on `mode="wait"`; masked key and test banner animate both directions |
| **404** | Full cascade; radar badge breathes inside an expanding halo |
| **Toasts** | Sonner physics; `expand` fans the stack on hover; 4 visible, 4.2s |

---

## 7. Accessibility

**CSS layer** — `globals.css` collapses all durations to 0.01ms under
`prefers-reduced-motion: reduce` and explicitly kills the looping animations
(`ambient-bg`, `shimmer-active`, `live-dot`, `skeleton`) that a duration
override alone would leave spinning.

**JS layer** — `useReducedMotion()` swaps travelling variants for `fade`:

```jsx
const reduced = useReducedMotion();
<motion.aside variants={reduced ? fade : slideOverRight} … />
```

`respectMotion(variants, reduced)` does this generically.

**Imperative layer** — GSAP, Anime.js and Canvas Confetti do not read the media
query themselves, so each entry point checks:

```js
if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
```

Guarded in `loading.js`, `OverviewTab.jsx`, `PerformanceTab.jsx` and
`fireCelebrationCannons()`.

**Touch** — CSS hover states are gated on
`@media (hover: hover) and (pointer: fine)` so a tap never leaves an element
stuck in a hover state.

**Focus** — a global `:focus-visible` ring (2px indigo, 2px offset) replaces the
removed default outlines.

---

## 8. Adding a new animation

1. **Does a variant already exist?** Use it. `fadeUp`, `popIn`, `tabPanel` and
   `slideOverRight` cover most cases.
2. **Something appears or disappears?** Wrap it in `AnimatePresence`, give it a
   stable `key` and an `exit`.
3. **An indicator moves between positions?** `layoutId`, not two separate
   animations.
4. **A list?** `staggerContainer` + `staggerItem`. Cap the delay past ~12 items.
5. **Pick a duration from §2**, an ease-out curve from §3. Never write a raw
   `cubic-bezier` or a bare millisecond number in a component.
6. **Check the property.** If it is not `transform` or `opacity`, justify it in a
   comment.
7. **Test with reduced motion on** (Windows: Settings → Accessibility → Visual
   effects → Animation effects off; Chrome DevTools: Rendering → Emulate CSS
   `prefers-reduced-motion`).
8. If you need a genuinely new curve or duration, **add it to `lib/motion.js`
   and mirror it in `globals.css`** — do not inline it.

---

## 9. Verification

```bash
cd frontend
npx next build     # compiles clean
npx eslint src     # no new errors introduced by the motion work
npm run dev        # then visit /, /loading-demo, and any 404 path
```

Remaining ESLint errors in `URLExplorerTab`, `IntegrationsPanel`,
`SettingsModal`, `StudioAnimalDrei` and `integrations/callback` are pre-existing
React-compiler warnings about `setState`-in-effect and mutation. They are
unrelated to motion and were not introduced here.
