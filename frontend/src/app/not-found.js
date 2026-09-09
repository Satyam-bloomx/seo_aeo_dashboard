'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldAlert, ArrowLeft, Radio } from 'lucide-react';
import { spring, staggerContainer, staggerItem, tapPress } from '@/lib/motion';

const DIAGNOSTICS = [
  ['Response Code', '404 (Not Found)', 'font-bold text-rose-600'],
  ['Spider Directive', 'NOINDEX, FOLLOW', ''],
  ['Resolver Engine', 'AuditPro Screaming Frog Core', ''],
];

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#F8FAFC] p-6 font-sans text-slate-900">
      <div className="ambient-bg" />

      <motion.div
        variants={staggerContainer(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="glass-card relative z-10 flex w-full max-w-lg flex-col items-center border border-slate-200 bg-white/90 p-8 text-center shadow-xl backdrop-blur-md md:p-10"
      >
        {/* Radar beacon — the ring expands out of the badge on a loop. */}
        <motion.div
          variants={staggerItem}
          className="relative mb-6 flex h-20 w-20 items-center justify-center"
        >
          <span className="live-dot absolute inset-2 rounded-full bg-rose-500/10 text-rose-500/25" />
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm"
          >
            <Radio size={32} />
          </motion.div>
        </motion.div>

        <motion.div
          variants={staggerItem}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-rose-700"
        >
          <ShieldAlert size={14} /> HTTP 404 — Crawl Node Unreachable
        </motion.div>

        <motion.h1
          variants={staggerItem}
          className="mb-2 text-3xl font-black tracking-tight text-slate-900"
        >
          URL Endpoint Not Found
        </motion.h1>

        <motion.p variants={staggerItem} className="mb-6 text-xs leading-relaxed text-slate-500">
          The requested path could not be resolved within the website crawl graph. The resource may
          have been deleted, redirected via 301, or excluded by crawler robot rules.
        </motion.p>

        <motion.div
          variants={staggerItem}
          className="mb-6 w-full space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-left font-mono text-[11px] text-slate-600"
        >
          {DIAGNOSTICS.map(([label, value, cls]) => (
            <div key={label} className="flex justify-between">
              <span className="text-slate-400">{label}:</span>
              <span className={cls}>{value}</span>
            </div>
          ))}
        </motion.div>

        <motion.div variants={staggerItem} className="w-full">
          <motion.div whileHover={{ y: -2 }} whileTap={tapPress} transition={spring.press}>
            <Link href="/" className="btn-primary w-full gap-2 py-2.5 text-xs font-bold shadow-sm">
              <ArrowLeft size={15} /> Return to Mission Control
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 font-mono text-xs text-slate-400"
      >
        AuditPro Telemetry Suite &bull; Diagnostic Error Handler
      </motion.div>
    </div>
  );
}
