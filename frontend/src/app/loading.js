'use client';

import React, { useRef, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { easeCss } from '@/lib/motion';

/**
 * AuditPro — Cinematic Boot / Loading Screen
 * ------------------------------------------
 * Pure black canvas (#000000), deep atmospheric ambient lighting,
 * iconic kinetic prism emblem, and real-time diagnostic telemetry.
 */

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

const STAGES = [
  { threshold: 0, text: 'Connecting to spider crawler protocol...' },
  { threshold: 24, text: 'Calibrating technical SEO & AEO diagnostics...' },
  { threshold: 52, text: 'Synthesizing PageRank & internal link graph...' },
  { threshold: 78, text: 'Finalizing compliance matrix & vitals...' },
  { threshold: 94, text: 'Workspace environment ready. Launching...' },
];

export default function Loading({
  isBootloader = false,
  onBootloaderComplete = null,
  label = 'Preparing your audit workspace',
}) {
  const rootRef = useRef(null);
  const progressRingRef = useRef(null);
  const progressBarRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const currentStageText = useMemo(() => {
    let current = STAGES[0].text;
    for (const s of STAGES) {
      if (progress >= s.threshold) current = s.text;
    }
    return current;
  }, [progress]);

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

      if (reduced) {
        paintProgress(100);
        gsap.set('.boot-content', { opacity: 1, y: 0, scale: 1 });
        if (isBootloader && onBootloaderComplete) {
          gsap.delayedCall(0.3, onBootloaderComplete);
        }
        return;
      }

      // Continuous kinetic emblem rotations
      gsap.to('.orbit-outer', {
        rotate: 360,
        duration: 9,
        repeat: -1,
        ease: 'none',
        transformOrigin: '50% 50%',
      });
      gsap.to('.orbit-inner', {
        rotate: -360,
        duration: 12,
        repeat: -1,
        ease: 'none',
        transformOrigin: '50% 50%',
      });
      gsap.to('.pulse-aura', {
        scale: 1.2,
        opacity: 0.7,
        duration: 1.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        transformOrigin: '50% 50%',
      });

      // Master entrance & progress lifecycle
      const tl = gsap.timeline({
        repeat: isBootloader ? 0 : -1,
        repeatDelay: isBootloader ? 0 : 0.8,
        onRepeat: () => paintProgress(0),
      });

      tl.fromTo(
        '.boot-emblem',
        { scale: 0.82, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.4)' }
      )
        .fromTo(
          '.boot-meta',
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: 'power3.out' },
          '-=0.35'
        );

      const counter = { val: 0 };
      tl.to(
        counter,
        {
          val: 100,
          duration: 1.45,
          ease: 'power2.inOut',
          onUpdate: () => paintProgress(counter.val),
        },
        '-=0.3'
      );

      // Smooth exit
      tl.to(
        '.boot-content',
        {
          y: -14,
          opacity: 0,
          duration: 0.38,
          ease: 'power2.in',
        },
        '+=0.15'
      ).to(
        rootRef.current,
        {
          opacity: 0,
          duration: 0.28,
          ease: 'power2.out',
          onComplete: () => {
            if (isBootloader && onBootloaderComplete) onBootloaderComplete();
          },
        },
        '-=0.15'
      );
    },
    { scope: rootRef, dependencies: [isBootloader] }
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-black select-none font-sans text-neutral-100"
      role="status"
      aria-live="polite"
      aria-label={`${label} — ${progress}%`}
    >
      {/* Deep atmospheric gradient aura — smooth, deeply diffused glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-tr from-indigo-600/15 via-sky-500/10 to-emerald-500/10 rounded-full blur-[150px]"
      />

      {/* Subtle hairline micro-grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Main Staging Content */}
      <div className="boot-content relative z-10 flex flex-col items-center gap-7 px-6 max-w-sm w-full">
        
        {/* Animated Brand Emblem with Glowing Progress Ring */}
        <div className="boot-emblem relative flex items-center justify-center">
          <svg
            width="140"
            height="140"
            viewBox="0 0 140 140"
            fill="none"
            aria-hidden="true"
            className="overflow-visible"
          >
            <defs>
              <linearGradient id="boot-progress-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>

              <linearGradient id="boot-prism-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="50%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>

              <linearGradient id="boot-prism-2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#059669" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>

              <filter id="boot-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Glowing Aura Behind Core */}
            <circle
              className="pulse-aura"
              cx="70"
              cy="70"
              r="40"
              fill="url(#boot-progress-grad)"
              opacity="0.12"
              filter="url(#boot-glow)"
            />

            {/* Inactive Track */}
            <circle
              cx="70"
              cy="70"
              r={RING_R}
              stroke="#1f1f1f"
              strokeWidth="2.5"
              fill="none"
            />

            {/* Active Circular Progress Ring */}
            <circle
              ref={progressRingRef}
              cx="70"
              cy="70"
              r={RING_R}
              stroke="url(#boot-progress-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              transform="rotate(-90 70 70)"
              style={{
                strokeDasharray: RING_C,
                strokeDashoffset: RING_C,
                transition: `stroke-dashoffset 90ms ${easeCss.outQuad}`,
              }}
            />

            {/* Outer Counter-Rotating Dashed Orbit */}
            <g className="orbit-outer">
              <circle
                cx="70"
                cy="70"
                r="42"
                stroke="#404040"
                strokeWidth="1.2"
                strokeDasharray="4 8"
                fill="none"
                opacity="0.7"
              />
              <circle cx="70" cy="28" r="2.5" fill="#38bdf8" />
            </g>

            {/* Inner Rotating Telemetry Orbit */}
            <g className="orbit-inner">
              <circle
                cx="70"
                cy="70"
                r="30"
                stroke="#525252"
                strokeWidth="1"
                strokeDasharray="2 7"
                fill="none"
                opacity="0.5"
              />
              <circle cx="70" cy="40" r="2" fill="#10b981" />
            </g>

            {/* Isometric Prism Logo Structure */}
            <path
              d="M70 42 L49 80 L60 80 L70 60 L80 80 L91 80 Z"
              fill="url(#boot-prism-1)"
              opacity="0.95"
            />
            <path
              d="M70 42 L70 60 L80 80 L91 80 Z"
              fill="url(#boot-prism-2)"
              opacity="0.9"
            />
            <path
              d="M57 70 L83 70"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.9"
            />

            {/* Glowing Core Dot */}
            <circle
              cx="70"
              cy="54"
              r="3.5"
              fill="#10b981"
              filter="url(#boot-glow)"
            />
            <circle cx="70" cy="54" r="1.5" fill="#ffffff" />
          </svg>
        </div>

        {/* Brand Headline */}
        <div className="boot-meta flex flex-col items-center text-center gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black tracking-tight text-[#f4f4f5]">
              Audit
            </span>
            <span className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400">
              Pro
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-neutral-900 text-emerald-400 border border-neutral-800 uppercase tracking-widest ml-1">
              v20.4
            </span>
          </div>
          <p className="text-xs font-mono text-[#a1a1aa] min-h-[18px] transition-all">
            {currentStageText}
          </p>
        </div>

        {/* Hairline Progress Bar Container */}
        <div className="boot-meta w-64 sm:w-72 space-y-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-900 border border-neutral-800">
            <div
              ref={progressBarRef}
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 shadow-[0_0_12px_rgba(56,189,248,0.5)]"
              style={{
                transform: 'scaleX(0)',
                transition: `transform 90ms ${easeCss.outQuad}`,
              }}
            />
          </div>

          <div className="flex items-center justify-between font-mono text-[10px] tracking-wider text-neutral-400">
            <span className="inline-flex items-center gap-1.5 font-semibold text-neutral-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              INITIALIZING
            </span>
            <span className="tabular-nums font-bold text-[#f4f4f5]">
              {progress.toString().padStart(3, '0')}%
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
