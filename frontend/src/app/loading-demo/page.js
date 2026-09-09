'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Loading from '../loading';
import { RotateCw, Gauge, Zap, Accessibility } from 'lucide-react';
import { spring, staggerContainer, staggerItem, tapPress } from '@/lib/motion';

/**
 * /loading-demo — preview harness for the boot screen.
 * Replays the sequence on demand so the motion can be reviewed in isolation.
 */

const NOTES = [
  {
    Icon: Gauge,
    tint: 'bg-indigo-50 text-indigo-600',
    title: 'Geometric progress mark',
    body: 'A single SVG: two counter-rotating orbits, a breathing core and a progress ring driven by strokeDashoffset. No 3D payload, no model download.',
  },
  {
    Icon: Zap,
    tint: 'bg-emerald-50 text-emerald-600',
    title: '~2s GSAP lifecycle',
    body: 'Mark settles on expo.out, wordmark characters stagger at 30ms, progress charges on power2.inOut, then everything lifts and fades. Exit is deliberately the fastest beat.',
  },
  {
    Icon: Accessibility,
    tint: 'bg-amber-50 text-amber-600',
    title: 'Reduced-motion aware',
    body: 'With prefers-reduced-motion the whole timeline is skipped: the screen paints its finished state and hands off. No spin, no pulse, no stagger.',
  },
];

export default function LoadingDemoPage() {
  const [animKey, setAnimKey] = useState(0);
  const [isDone, setIsDone] = useState(false);

  const replay = () => {
    setIsDone(false);
    setAnimKey((k) => k + 1);
  };

  return (
    <div className="relative flex h-screen w-screen select-none flex-col overflow-hidden bg-[#F8FAFC] font-sans">
      <div className="ambient-bg" />

      {/* What sits underneath, revealed once the loader lifts away. */}
      <div className="relative z-10 flex flex-col p-8">
        <div className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xl font-black text-white shadow-md">
              A
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                Boot Sequence Preview
              </h1>
              <p className="font-mono text-xs text-slate-500">
                {isDone ? 'Sequence complete — dashboard revealed' : 'Running…'}
              </p>
            </div>
          </div>

          <motion.button
            onClick={replay}
            whileHover={{ y: -2 }}
            whileTap={tapPress}
            initial="rest"
            animate="rest"
            transition={spring.press}
            className="btn-primary gap-2 px-4 py-2 text-xs font-bold shadow-md"
          >
            <motion.span
              variants={{ rest: { rotate: 0 }, hover: { rotate: -180 } }}
              transition={{ duration: 0.5 }}
              className="flex"
            >
              <RotateCw className="h-4 w-4 text-emerald-400" />
            </motion.span>
            Replay Sequence
          </motion.button>
        </div>

        <motion.div
          key={animKey}
          variants={staggerContainer(0.08, 0.15)}
          initial="initial"
          animate="animate"
          className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {NOTES.map(({ Icon, tint, title, body }) => (
            <motion.div
              key={title}
              variants={staggerItem}
              whileHover={{ y: -3 }}
              transition={spring.press}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-800">{title}</h3>
              <p className="text-xs leading-relaxed text-slate-500">{body}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <Loading key={animKey} isBootloader onBootloaderComplete={() => setIsDone(true)} />
    </div>
  );
}
