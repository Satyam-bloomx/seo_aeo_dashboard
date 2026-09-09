'use client';

/**
 * AuditPro — Central Motion Design Tokens
 * ---------------------------------------
 * Single source of truth for every easing curve, duration and variant used
 * across the app. Import from here instead of hand-writing transitions so
 * the whole product moves with one consistent physical language.
 *
 * Rules encoded here (see ANIMATION.md for the reasoning):
 *   1. Enter AND exit both use ease-out curves — never ease-in. ease-out
 *      front-loads the motion which reads as "instant + settling", the single
 *      biggest perceived-speed win in UI animation.
 *   2. Exits run ~20% faster than entrances. Nobody wants to wait to dismiss.
 *   3. Only `transform` and `opacity` animate. No width/height/margin/padding
 *      (layout thrash), no blur above 20px.
 *   4. Everything respects `prefers-reduced-motion`.
 */

// ---------------------------------------------------------------------------
// 1. EASING CURVES
// ---------------------------------------------------------------------------
// Penner curves expressed as cubic-beziers. Framer Motion takes them as arrays.

export const ease = {
  // --- Ease-out family: entrances, exits, anything appearing or leaving ---
  outQuad: [0.25, 0.46, 0.45, 0.94], // gentlest — color/opacity nudges
  outCubic: [0.215, 0.61, 0.355, 1], // default UI workhorse
  outQuart: [0.165, 0.84, 0.44, 1], // panels, cards, popovers
  outQuint: [0.23, 1, 0.32, 1], // primary AuditPro signature curve
  outExpo: [0.19, 1, 0.22, 1], // dramatic reveals, loading shutters
  outCirc: [0.075, 0.82, 0.165, 1], // sharp mechanical snap

  // --- Ease-in-out family: elements already on screen that MOVE ---
  inOutCubic: [0.645, 0.045, 0.355, 1],
  inOutQuart: [0.77, 0, 0.175, 1],
  inOutExpo: [1, 0, 0, 1], // shutter / wipe transitions

  // --- Overshoot: use sparingly, only on tactile confirmations ---
  backOut: [0.34, 1.56, 0.64, 1],
};

// CSS-string equivalents for plain `transition:` declarations / GSAP.
export const easeCss = Object.fromEntries(
  Object.entries(ease).map(([k, v]) => [k, `cubic-bezier(${v.join(', ')})`])
);

// ---------------------------------------------------------------------------
// 2. DURATIONS (seconds)
// ---------------------------------------------------------------------------
// Bucketed by interaction weight. Bigger surface = longer travel = more time.

export const duration = {
  instant: 0.1,
  micro: 0.15, // hover, press, icon swap, checkbox
  fast: 0.2, // tooltip, badge, inline reveal
  base: 0.25, // dropdown, popover, tab content
  panel: 0.3, // modal, drawer, slide-over
  slow: 0.45, // full-surface / hero reveals
};

// Exit is 20% quicker than the matching entrance.
export const exitDuration = (d) => +(d * 0.8).toFixed(3);

// ---------------------------------------------------------------------------
// 3. SPRINGS
// ---------------------------------------------------------------------------
// Apple-style duration+bounce springs. Bounce stays in 0–0.3; anything higher
// reads as a toy, not a tool.

export const spring = {
  /** Crisp, no wobble — layout shifts, gliding indicators. */
  snap: { type: 'spring', duration: 0.35, bounce: 0 },
  /** Default tactile spring for panels and cards. */
  soft: { type: 'spring', duration: 0.5, bounce: 0.2 },
  /** Quick physical press feedback. */
  press: { type: 'spring', stiffness: 620, damping: 32, mass: 0.7 },
  /** Slow, heavy — large drawers. */
  heavy: { type: 'spring', duration: 0.6, bounce: 0.12 },
};

// Convenience tween builders.
export const tween = (d = duration.base, curve = ease.outQuint) => ({
  duration: d,
  ease: curve,
});

export const tweenOut = (d = duration.base, curve = ease.outQuart) => ({
  duration: exitDuration(d),
  ease: curve,
});

// ---------------------------------------------------------------------------
// 4. REUSABLE VARIANTS
// ---------------------------------------------------------------------------

/** Plain cross-fade. Safest possible transition. */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: tween(duration.base) },
  exit: { opacity: 0, transition: tweenOut(duration.base) },
};

/** Fade + small upward travel. The default "content appeared" motion. */
export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: tween(duration.panel) },
  exit: { opacity: 0, y: -8, transition: tweenOut(duration.base) },
};

/** Fade + downward travel — for things anchored to the top edge. */
export const fadeDown = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0, transition: tween(duration.panel) },
  exit: { opacity: 0, y: -12, transition: tweenOut(duration.base) },
};

/** Modal / dialog body. Scale from 96% so it grows toward the viewer. */
export const modalPanel = {
  initial: { opacity: 0, scale: 0.96, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring.soft },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 8,
    transition: tweenOut(duration.panel, ease.outQuart),
  },
};

/** Dimmed backdrop behind a modal or drawer. */
export const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: tween(duration.panel, ease.outQuad) },
  exit: { opacity: 0, transition: tweenOut(duration.panel, ease.outQuad) },
};

/** Right-hand slide-over inspector. */
export const slideOverRight = {
  initial: { x: '100%', opacity: 0.6 },
  animate: { x: 0, opacity: 1, transition: spring.heavy },
  exit: {
    x: '100%',
    opacity: 0.4,
    transition: tweenOut(duration.panel, ease.outQuart),
  },
};

/** Left-hand mobile navigation drawer. */
export const slideOverLeft = {
  initial: { x: '-100%' },
  animate: { x: 0, transition: spring.heavy },
  exit: { x: '-100%', transition: tweenOut(duration.panel, ease.outQuart) },
};

/** Banner that pushes in from the top of a column. */
export const bannerDrop = {
  initial: { opacity: 0, y: -14, scaleY: 0.96 },
  animate: {
    opacity: 1,
    y: 0,
    scaleY: 1,
    transition: { ...spring.soft, opacity: tween(duration.fast) },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: tweenOut(duration.base, ease.outQuart),
  },
};

/** Toast-like pop used by inline confirmations. */
export const popIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: spring.soft },
  exit: { opacity: 0, scale: 0.94, transition: tweenOut(duration.fast) },
};

/** Tab-panel swap. Subtle so rapid tab clicking never feels laggy. */
export const tabPanel = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: tween(duration.base, ease.outQuart) },
  exit: { opacity: 0, y: -6, transition: tweenOut(duration.fast) },
};

// ---------------------------------------------------------------------------
// 5. STAGGER ORCHESTRATION
// ---------------------------------------------------------------------------
// Parent gets `staggerContainer`, children get `staggerItem`.

export const staggerContainer = (stagger = 0.05, delay = 0) => ({
  initial: {},
  animate: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
  exit: {
    transition: { staggerChildren: stagger * 0.5, staggerDirection: -1 },
  },
});

export const staggerItem = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: tween(duration.panel, ease.outQuint) },
  exit: { opacity: 0, y: -8, transition: tweenOut(duration.fast) },
};

// ---------------------------------------------------------------------------
// 6. INTERACTION PRESETS
// ---------------------------------------------------------------------------
// Drop straight onto `whileHover` / `whileTap`.

export const hoverLift = { y: -2, transition: spring.press };
export const hoverGrow = { scale: 1.03, transition: spring.press };
export const tapPress = { scale: 0.97, transition: spring.press };
export const tapPressSoft = { scale: 0.985, transition: spring.press };

// ---------------------------------------------------------------------------
// 7. ACCESSIBILITY
// ---------------------------------------------------------------------------

/**
 * Strip movement from a variant set while keeping the opacity change, for
 * users who asked for reduced motion. Pass the result of `useReducedMotion()`.
 */
export const respectMotion = (variants, reduced) => {
  if (!reduced) return variants;
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.01 } },
    exit: { opacity: 0, transition: { duration: 0.01 } },
  };
};
