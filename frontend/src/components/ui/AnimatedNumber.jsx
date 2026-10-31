'use client';

import React, { useEffect, useState, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { ease } from '@/lib/motion';

/**
 * AnimatedNumber
 * --------------
 * Smoothly animates from previous to target value.
 * Guaranteed visible rendering in both light & dark modes with zero blank frames.
 */
export default function AnimatedNumber({
  value = 0,
  decimals = 0,
  duration = 0.9,
  className = '',
  suffix = '',
  prefix = '',
}) {
  const target = Number(value) || 0;
  const [displayVal, setDisplayVal] = useState(target);
  // The value currently on screen, so an interrupted animation continues from there instead of jumping.
  const currentRef = useRef(target);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      currentRef.current = target; // shown directly below, no animation
      return undefined;
    }
    const start = currentRef.current;
    if (start === target) return undefined;

    const controls = animate(start, target, {
      duration,
      ease: ease.outQuart,
      onUpdate: (latest) => {
        currentRef.current = latest;
        setDisplayVal(latest);
      },
    });
    return () => controls.stop();
  }, [target, duration, reduced]);

  const shown = reduced ? target : displayVal;
  const formatted = `${prefix}${shown.toFixed(decimals)}${suffix}`;

  return (
    <span className={`tabular-nums font-black ${className}`}>
      {formatted}
    </span>
  );
}
