'use client';

import React, { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';
import { ease } from '@/lib/motion';

/**
 * AnimatedNumber
 * --------------
 * Counts from 0 (or the previous value) up to `value` when it scrolls into
 * view, and again whenever `value` changes.
 *
 * Writes straight to `textContent` via a ref rather than through React state:
 * a 60fps counter driving `setState` would re-render the whole card tree on
 * every frame. Under reduced motion it prints the final number immediately.
 */
export default function AnimatedNumber({
  value = 0,
  decimals = 0,
  duration = 1.1,
  className = '',
  suffix = '',
  prefix = '',
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const previous = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const target = Number(value) || 0;
    const format = (n) => `${prefix}${n.toFixed(decimals)}${suffix}`;

    if (reduced || !inView) {
      node.textContent = format(inView ? target : previous.current);
      if (inView) previous.current = target;
      return;
    }

    const controls = animate(previous.current, target, {
      duration,
      ease: ease.outQuart,
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
      onComplete: () => {
        previous.current = target;
      },
    });

    return () => controls.stop();
  }, [value, inView, reduced, decimals, duration, prefix, suffix]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}
      {(0).toFixed(decimals)}
      {suffix}
    </span>
  );
}
