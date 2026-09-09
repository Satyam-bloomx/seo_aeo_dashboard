'use client';

import React, { useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { easeCss } from '@/lib/motion';

/**
 * AuditPro — Boot / Loading screen
 * --------------------------------
 * Deliberately quiet: one geometric mark, one wordmark, one hairline of
 * progress. No 3D payload, no telemetry dump, no text clutter.
 *
 * Motion breakdown
 *   0.00s  mark scales up from 0.8 with an ease-out-expo settle
 *   0.15s  the two orbit rings begin their infinite counter-rotation
 *   0.25s  wordmark characters float up on a 30ms stagger
 *   0.35s  progress ring + hairline bar charge 0 → 100
 *   exit   everything lifts 10px and fades on ease-out; no shutters
 *
 * Everything animated is `transform` / `opacity` / `stroke-dashoffset`, all of
 * which stay on the compositor.
 */

const WORDMARK = 'AUDITPRO'.split('');
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

export default function Loading({
  isBootloader = false,
  onBootloaderComplete = null,
  label = 'Preparing your audit workspace',
}) {
  const rootRef = useRef(null);
  const progressRingRef = useRef(null);
  const progressBarRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const paintProgress = useCallback((value) => {
    const pct = Math.round(value);
    setProgress(pct);
    if (progressRingRef.current) {
      progressRingRef.current.style.strokeDashoffset = `${
        RING_C - (RING_C * pct) / 100
      }`;
    }
    if (progressBarRef.current) {
      progressBarRef.current.style.transform = `scaleX(${pct / 100})`;
    }
  }, []);

  useGSAP(
    () => {
      const reduced = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)'
      )?.matches;

      // Reduced motion: skip straight to a filled, static state.
      if (reduced) {
        paintProgress(100);
        gsap.set('.boot-el', { opacity: 1, y: 0, scale: 1 });
        if (isBootloader && onBootloaderComplete) {
          gsap.delayedCall(0.4, onBootloaderComplete);
        }
        return;
      }

      // --- Continuous orbit rotation (independent of the master timeline) ---
      gsap.to('.orbit-outer', {
        rotate: 360,
        duration: 9,
        repeat: -1,
        ease: 'none',
        transformOrigin: '50% 50%',
      });
      gsap.to('.orbit-inner', {
        rotate: -360,
        duration: 6,
        repeat: -1,
        ease: 'none',
        transformOrigin: '50% 50%',
      });
      gsap.to('.core-glow', {
        scale: 1.12,
        opacity: 0.85,
        duration: 1.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        transformOrigin: '50% 50%',
      });

      // --- Master lifecycle ---
      const tl = gsap.timeline({
        repeat: isBootloader ? 0 : -1,
        repeatDelay: isBootloader ? 0 : 0.6,
        onRepeat: () => paintProgress(0),
      });

      tl.fromTo(
        '.boot-mark',
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.7, ease: 'expo.out' }
      )
        .fromTo(
          '.boot-char',
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, stagger: 0.03, ease: 'power3.out' },
          '-=0.45'
        )
        .fromTo(
          '.boot-meta',
          { y: 8, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.45, stagger: 0.06, ease: 'power3.out' },
          '-=0.35'
        );

      // Progress charge — eased so it decelerates into 100 rather than
      // slamming into it.
      const counter = { val: 0 };
      tl.to(
        counter,
        {
          val: 100,
          duration: 1.3,
          ease: 'power2.inOut',
          onUpdate: () => paintProgress(counter.val),
        },
        '-=0.5'
      );

      // Exit: single soft lift-and-fade. Fast, because nobody enjoys a
      // loading screen taking its time to leave.
      tl.to(
        '.boot-el',
        {
          y: -10,
          opacity: 0,
          duration: 0.42,
          stagger: 0.04,
          ease: 'power2.out',
        },
        '+=0.15'
      ).to(
        rootRef.current,
        {
          opacity: 0,
          duration: 0.3,
          ease: 'power2.out',
          onComplete: () => {
            if (isBootloader && onBootloaderComplete) onBootloaderComplete();
          },
        },
        '-=0.2'
      );
    },
    { scope: rootRef, dependencies: [isBootloader] }
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#F8FAFC] select-none font-sans"
      role="status"
      aria-live="polite"
      aria-label={`${label} — ${progress}%`}
    >
      {/* Soft ambient wash so the flat slate doesn't read as dead space. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 42%, rgba(224,231,255,0.75) 0%, transparent 55%), radial-gradient(circle at 50% 78%, rgba(209,250,229,0.5) 0%, transparent 55%)',
        }}
      />

      {/* Hairline grid — barely visible, gives the void some structure. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #0F172A 1px, transparent 1px), linear-gradient(to bottom, #0F172A 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse at center, black 20%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 20%, transparent 72%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-8 px-6">
        {/* ---------------------------------------------------------------- */}
        {/* Geometric mark                                                   */}
        {/* ---------------------------------------------------------------- */}
        <div className="boot-el boot-mark relative">
          <svg
            width="136"
            height="136"
            viewBox="0 0 136 136"
            fill="none"
            aria-hidden="true"
            className="overflow-visible"
          >
            <defs>
              <linearGradient id="ap-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4F46E5" />
                <stop offset="55%" stopColor="#0EA5E9" />
                <stop offset="100%" stopColor="#10B981" />
              </linearGradient>
              <radialGradient id="ap-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Breathing core glow */}
            <circle
              className="core-glow"
              cx="68"
              cy="68"
              r="34"
              fill="url(#ap-core)"
            />

            {/* Static track */}
            <circle
              cx="68"
              cy="68"
              r={RING_R}
              stroke="#E2E8F0"
              strokeWidth="2"
              fill="none"
            />

            {/* Progress ring — driven by stroke-dashoffset */}
            <circle
              ref={progressRingRef}
              cx="68"
              cy="68"
              r={RING_R}
              stroke="url(#ap-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              transform="rotate(-90 68 68)"
              style={{
                strokeDasharray: RING_C,
                strokeDashoffset: RING_C,
                transition: `stroke-dashoffset 90ms ${easeCss.outQuad}`,
              }}
            />

            {/* Outer dashed orbit */}
            <g className="orbit-outer">
              <circle
                cx="68"
                cy="68"
                r="40"
                stroke="#CBD5E1"
                strokeWidth="1"
                strokeDasharray="2 10"
                fill="none"
              />
              <circle cx="68" cy="28" r="3" fill="#4F46E5" />
            </g>

            {/* Inner counter-rotating orbit */}
            <g className="orbit-inner">
              <circle
                cx="68"
                cy="68"
                r="26"
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="1 7"
                fill="none"
              />
              <circle cx="68" cy="42" r="2.5" fill="#10B981" />
            </g>

            {/* Solid centre dot */}
            <circle cx="68" cy="68" r="5" fill="#0F172A" />
          </svg>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Wordmark                                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="boot-el flex flex-col items-center gap-2">
          <div className="flex items-center" aria-hidden="true">
            {WORDMARK.map((char, i) => (
              <span
                key={`${char}-${i}`}
                className={`boot-char inline-block text-[22px] font-black tracking-[0.24em] ${
                  i < 5 ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {char}
              </span>
            ))}
          </div>
          <p className="boot-meta text-[11px] font-medium text-slate-500">
            {label}
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Hairline progress                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="boot-el boot-meta w-56 space-y-2">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-slate-200/80">
            <div
              ref={progressBarRef}
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500"
              style={{
                transform: 'scaleX(0)',
                transition: `transform 90ms ${easeCss.outQuad}`,
              }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] tracking-wider text-slate-400">
            <span>LOADING</span>
            <span className="tabular-nums font-semibold text-slate-600">
              {progress.toString().padStart(3, '0')}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
