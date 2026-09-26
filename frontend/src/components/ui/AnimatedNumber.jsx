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
  const prevRef = useRef(target);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setDisplayVal(target);
      prevRef.current = target;
      return;
    }

    const start = prevRef.current;
    if (start === target) {
      setDisplayVal(target);
      return;
    }

    const controls = animate(start, target, {
      duration,
      ease: ease.outQuart,
      onUpdate: (latest) => {
        setDisplayVal(latest);
      },
      onComplete: () => {
        setDisplayVal(target);
        prevRef.current = target;
      },
    });

    return () => controls.stop();
  }, [target, duration, reduced]);

  const formatted = `${prefix}${displayVal.toFixed(decimals)}${suffix}`;

  return (
    <span className={`tabular-nums font-black ${className}`}>
      {formatted}
    </span>
  );
}
