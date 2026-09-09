# Framer Motion — Enter/Exit Choreography & Shared-Layout Indicators

> **Added to the stack in this redesign.** Everything below is already wired up in
> `frontend/src/lib/motion.js`. Read `ANIMATION.md` at the repo root for the
> system-level rules; this file is the library-specific reference.

| | |
|---|---|
| **Package** | `framer-motion@13.2.0` (already in `package.json`) |
| **Import** | `import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion'` |
| **Owns** | Element **exit** animations, shared-layout (`layoutId`) indicators, declarative hover/tap physics, list stagger orchestration |
| **Does NOT own** | Boot timeline (GSAP), SVG gauge math (Anime.js), 3D card tilt (React Spring), toasts (Sonner), confetti (Canvas Confetti) |

---

## 1. Why it was added

The previous build leaned on Tailwind's `animate-in fade-in slide-in-from-right`
utility family. **Those classes ship with the `tailwindcss-animate` /
`tw-animate-css` plugin, which was never installed.** Under Tailwind v4 with only
`@tailwindcss/postcss` configured, every one of them compiled to nothing. That is
the literal reason the sidebar had no motion and popups appeared and vanished
with a hard cut.

Two options existed:

1. Install `tailwindcss-animate` and keep using utility classes.
2. Use Framer Motion, which was **already a dependency** and already paid for in
   bundle size.

Option 2 won because CSS classes fundamentally cannot animate an element that
React is about to unmount. A modal closing, a drawer sliding out, a table row
being filtered away — none of those have a CSS-only solution, because the node is
gone before a transition can run. `AnimatePresence` keeps the node mounted until
its exit animation finishes, then removes it. That single capability is what the
whole "popups have no exit animation" complaint came down to.

---

## 2. The three patterns that do 90% of the work

### 2.1 `AnimatePresence` — animate on the way out

The child must have a stable `key` and an `exit` prop (or a variant named
`exit`). Without a key, Framer Motion cannot tell a swap from an update.

```jsx
import { AnimatePresence, motion } from 'framer-motion';
import { bannerDrop } from '@/lib/motion';

<AnimatePresence initial={false}>
  {isAuditing && (
    <motion.div
      key="crawl-banner"
      variants={bannerDrop}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ transformOrigin: 'top' }}
    >
      …
    </motion.div>
  )}
</AnimatePresence>
```

Modes:

| mode | behaviour | use for |
|---|---|---|
| *(default)* | outgoing and incoming overlap | independent items (toasts, table rows) |
| `"wait"` | outgoing finishes before incoming starts | tab panels, icon swaps, button label changes |
| `"popLayout"` | outgoing is popped out of flow so siblings reflow immediately | filtered lists, badges |

`initial={false}` suppresses the entrance animation on first paint — use it
whenever the element may already be visible when the page loads, otherwise
everything "flies in" on every refresh.

**Gotchas that bit us:**
- A `<React.Fragment>` child is invisible to `AnimatePresence`. Two conditional
  siblings need two separate keyed `motion` elements, not one fragment.
- A non-`motion` child (e.g. the GSAP-driven `Loading` component) registers no
  exit — the wrapper is a no-op there. `loading.js` runs its own fade-out and
  only then calls back, which is why it is *not* wrapped.

### 2.2 `layoutId` — the gliding indicator

Render **one** indicator element, only inside the active item. When `activeTab`
changes, React unmounts it from row A and mounts it in row B; Framer Motion
matches the shared `layoutId` and physically animates it between the two
measured positions.

```jsx
<LayoutGroup id="sidebar-nav">
  {tabs.map(tab => (
    <motion.button key={tab.id} className="relative …">
      {activeTab === tab.id && (
        <motion.span
          layoutId="sidebar-active-pill"
          transition={spring.snap}
          className="absolute inset-0 -z-10 rounded-xl bg-slate-900"
        />
      )}
      <span className="relative">{tab.label}</span>
    </motion.button>
  ))}
</LayoutGroup>
```

Rules:
- The pill must be **absolutely positioned** and the button `relative`.
- Put it behind content with `-z-10`, and give the real content `relative` so it
  paints above.
- `LayoutGroup id` scopes the measurement, so two independent nav lists on screen
  never try to share one pill.
- Use `spring.snap` (`bounce: 0`). A bouncy pill reads as unserious.

Live in: `Sidebar.jsx`, `SettingsModal.jsx` (settings nav), `IssuesTab.jsx`
(severity filters), `PerformanceTab.jsx` (mobile/desktop toggle).

### 2.3 Variant stagger — cascading lists

Parent declares the rhythm, children declare the movement. Children inherit the
parent's animation state automatically — no per-child `animate` prop.

```jsx
import { staggerContainer, staggerItem } from '@/lib/motion';

<motion.div variants={staggerContainer(0.05, 0.1)} initial="initial" animate="animate">
  {items.map(i => <motion.div key={i.id} variants={staggerItem}>…</motion.div>)}
</motion.div>
```

`staggerContainer(stagger, delay)` — `stagger` is the gap between children in
seconds, `delay` waits before the first one.

**Cap the cascade on long lists.** A 500-row grid at 15ms apart is a 7.5 second
animation. `URLExplorerTab` clamps it:

```jsx
delay: Math.min(idx, 12) * 0.015
```

---

## 3. Hover and tap physics

Declarative, and correctly interruptible — a spring caught mid-flight continues
from its current velocity instead of restarting.

```jsx
<motion.button whileHover={{ y: -2 }} whileTap={tapPress} transition={spring.press}>
```

For a **parent hover driving child motion** (icon rotates when the row is
hovered), use named variants rather than CSS `group-hover`, so the child gets
spring physics:

```jsx
<motion.button initial="rest" whileHover="hover" animate="rest">
  <motion.span
    variants={{ rest: { rotate: 0 }, hover: { rotate: 90 } }}
    transition={spring.press}
  >
    <Settings size={16} />
  </motion.span>
</motion.button>
```

> `whileHover` fires on touch devices as a sticky pseudo-hover. For pure CSS
> hovers we gate on `@media (hover: hover) and (pointer: fine)` in `globals.css`;
> Framer's own pointer handling is already event-based so it does not need it.

---

## 4. Reduced motion

`useReducedMotion()` returns the live value of the OS setting.

```jsx
const reduced = useReducedMotion();

<motion.div variants={reduced ? fade : slideOverRight} … />
```

`respectMotion(variants, reduced)` in `lib/motion.js` does the same thing
generically: it strips every transform and leaves an instant opacity change.

Never make reduced motion mean *no feedback* — an element still needs to appear
and disappear, it just must not travel.

---

## 5. Performance rules

| Do | Don't |
|---|---|
| Animate `x`, `y`, `scale`, `rotate`, `opacity` | Animate `width`, `height`, `top`, `left`, `margin`, `padding` |
| Fill a bar with `scaleX` on a `w-full origin-left` element | Animate the bar's `width` |
| Add `will-change-transform` to large moving panels | Add it to everything (it costs a layer per element) |
| Drive high-frequency counters through a ref (`AnimatedNumber`) | Drive a 60fps counter through `setState` |
| Use `layout` on a handful of rows | Use `layout` on 500 rows without measuring |

The one sanctioned exception is the `IssuesTab` accordion, which animates
`height: 0 → auto`. An accordion has no honest transform equivalent, the content
is small and fixed-size, and it is wrapped in `overflow-hidden` so the reflow is
contained. It is commented as such in the source.

---

## 6. Where it is used in AuditPro

| File | What Framer Motion does there |
|---|---|
| `components/ui/AnimatedModal.jsx` | `Dialog static` + `AnimatePresence` — the reusable animated modal shell |
| `components/ui/AnimatedNumber.jsx` | `animate()` + `useInView` count-up, written via ref |
| `features/.../Sidebar/Sidebar.jsx` | Gliding pill + edge bar, nav stagger, icon springs, sheen sweep |
| `features/.../AuditDashboard.jsx` | Tab cross-fade, crawl/completion banners, URL inspector slide-over, mobile nav drawer, button label swaps |
| `features/.../SettingsModal/SettingsModal.jsx` | Settings-nav pill, tab panel swap, preset stagger, checkbox tick |
| `features/.../ExecutiveReportModal.jsx` | Report section cascade, print/close button physics |
| `features/.../ApiKeyModal.jsx` | Test-result banner, eye-toggle swap, button label swaps |
| `features/.../ResultsTab/OverviewTab.jsx` | Category grid stagger, findings list layout, distribution bars |
| `features/.../ResultsTab/IssuesTab.jsx` | Filter pill, row enter/exit, accordion |
| `features/.../ResultsTab/PerformanceTab.jsx` | Strategy pill, vitals stagger, bar fills, opportunity list |
| `features/.../ResultsTab/URLExplorerTab.jsx` | Row enter/exit with capped stagger |
| `features/.../IntegrationsPanel.jsx` | Card stagger, connection badge swap, test banner |
| `app/not-found.js`, `app/loading-demo/page.js` | Page-level cascades |

---

## 7. Interop with the rest of the stack

Framer Motion and the other libraries must never animate the same property on
the same node — the last writer wins and you get a flicker.

- **GSAP** owns `loading.js` end to end. Framer Motion is not used there.
- **Anime.js** owns the Lighthouse gauge's `strokeDashoffset` and its counter in
  `PerformanceTab`. Its old `.metric-card-item` stagger was **removed** when the
  cards moved to Framer variants — both were animating opacity and translateY on
  the same nodes.
- **React Spring** owns the 3D tilt `transform` on `SpringTiltBentoCard`. Framer
  Motion therefore does not set `transform` on that element; entrance is handled
  by GSAP on an outer class instead.
- **AutoAnimate** was removed from `Sidebar`, `SettingsModal`, `IssuesTab` and
  `OverviewTab`. It has no exit control and no easing token — `AnimatePresence`
  replaced it everywhere. It remains a dependency but is no longer imported.
- **Sonner** ships its own physics; we only configure presentation in
  `app/layout.js`.
