'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Globe,
  Radio,
  Layers,
  Sparkles,
  Zap,
  Activity,
  ChevronRight,
  ListTree,
  AlertTriangle,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { duration, ease, spring, staggerContainer, staggerItem, tapPress, tween } from '@/lib/motion';

const STAGES = [
  { threshold: 0, label: 'Initiating Spider & Robots Protocol', sub: 'Parsing robots.txt, sitemaps and seed endpoints...' },
  { threshold: 25, label: 'Deep Crawling & DOM Extraction', sub: 'Analyzing canonicals, titles, H1/H2 tags & meta directives...' },
  { threshold: 55, label: 'Evaluating AEO & Knowledge Graph Signals', sub: 'Synthesizing LLM extractable answers & schema markup...' },
  { threshold: 80, label: 'Measuring Core Web Vitals & Local SERP', sub: 'Testing LCP, CLS, INP, TTFB & regional NAP consistency...' },
  { threshold: 95, label: 'Finalizing Audit Index & Compliance Matrix', sub: 'Compiling 32 technical parameters across all pages...' },
];

export default function SpiderLiveProgressScreen({
  url,
  progress = 0,
  pagesCrawled = 0,
  pages = [],
  crawlerSettings = {},
  onSwitchTab
}) {
  const reduced = useReducedMotion();

  const currentStage = useMemo(() => {
    let current = STAGES[0];
    for (const stage of STAGES) {
      if (progress >= stage.threshold) {
        current = stage;
      }
    }
    return current;
  }, [progress]);

  const recentPages = useMemo(() => {
    if (!pages || pages.length === 0) return [];
    return [...pages].reverse().slice(0, 6);
  }, [pages]);

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-1 space-y-6">

      {/* Top Hero Banner with Kinetic Scanner */}
      <motion.div
        variants={staggerContainer(0.06, 0.08)}
        initial="initial"
        animate="animate"
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm"
      >
        {/* Ambient background glow */}
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          
          {/* Left info & progress */}
          <div className="flex-1 space-y-4 max-w-xl text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Screaming Frog Spider Active (v20.4)
            </div>

            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Auditing Website Architecture
              </h2>
              <p className="text-xs sm:text-sm font-mono text-indigo-600 font-bold mt-1 truncate">
                Target: {url || 'Active Website'}
              </p>
            </div>

            {/* Stage indicator */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Activity size={14} className="text-indigo-600 animate-pulse" />
                  {currentStage.label}
                </span>
                <span className="font-mono font-bold text-emerald-700">{progress}%</span>
              </div>
              <p className="text-[11px] text-slate-500">{currentStage.sub}</p>
            </div>

            {/* Glowing Progress bar */}
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200 p-0.5">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-teal-500 to-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                  initial={{ width: '0%' }}
                  animate={{ width: `${Math.max(5, progress)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Discovered: <strong className="text-slate-700">{pagesCrawled} URLs</strong></span>
                <span>Max Depth: <strong className="text-slate-700">{crawlerSettings.maxDepth || 3}</strong></span>
                <span>Threads: <strong className="text-slate-700">{crawlerSettings.maxConcurrent || 5}</strong></span>
              </div>
            </div>
          </div>

          {/* Right Kinetic Orbital Radar Scanner */}
          <div className="relative flex items-center justify-center shrink-0 w-48 h-48 sm:w-56 sm:h-56">
            {/* Radar outer rings */}
            <motion.div
              animate={reduced ? undefined : { rotate: 360 }}
              transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
              className="absolute inset-0 rounded-full border border-dashed border-indigo-300/80"
            />
            <motion.div
              animate={reduced ? undefined : { rotate: -360 }}
              transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
              className="absolute inset-4 rounded-full border border-slate-200"
            />
            <motion.div
              animate={reduced ? undefined : { scale: [1, 1.08, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
              className="absolute inset-8 rounded-full bg-emerald-500/10 blur-sm"
            />

            {/* Center pulsing core */}
            <div className="relative z-10 flex flex-col items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-xl border border-indigo-500/30">
              <span className="text-3xl font-black font-mono tracking-tight text-emerald-400">
                {progress}%
              </span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400">
                Crawling
              </span>
            </div>
          </div>

        </div>
      </motion.div>

      {/* Live Discovered URLs Stream & Real-time Tab Navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Live Discovered URLs Ticker */}
        <div className="lg:col-span-2 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-indigo-600 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-900">Live Discovered Endpoints Stream</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-500 font-semibold">
              {pages.length} URLs extracted
            </span>
          </div>

          {recentPages.length > 0 ? (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {recentPages.map((page, idx) => (
                  <motion.div
                    key={page.id || page.url || idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={tween(duration.fast, ease.outQuart)}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="flex items-center gap-2 truncate max-w-md">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        (page.status_code || 200) >= 400
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {page.status_code || 200}
                      </span>
                      <span className="font-mono text-slate-700 truncate" title={page.url}>
                        {page.url}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {page.content_type || 'text/html'}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <Loader2 size={24} className="animate-spin text-indigo-500 mx-auto" />
              <p className="text-xs font-mono">Dispatched HTTP crawler spider... Streaming discovered endpoints</p>
            </div>
          )}
        </div>

        {/* Real-time Tab Peek Cards */}
        <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Layers size={16} className="text-indigo-600" /> Real-time Live Inspectors
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              You can switch to any tab below while the spider is active to inspect real-time tables as new URLs stream in:
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onSwitchTab && onSwitchTab('explorer')}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                    <ListTree size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">URL Data Grid</h4>
                    <span className="text-[11px] font-mono text-slate-500">{pages.length} live records</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => onSwitchTab && onSwitchTab('issues')}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-rose-50/70 border border-slate-200 hover:border-rose-200 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-rose-600">Issues & Diagnostics</h4>
                    <span className="text-[11px] font-mono text-slate-500">Live rule engine</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => onSwitchTab && onSwitchTab('performance')}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-amber-50/70 border border-slate-200 hover:border-amber-200 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
                    <Zap size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-amber-600">Speed & Core Vitals</h4>
                    <span className="text-[11px] font-mono text-slate-500">PageSpeed inspector</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 text-center pt-2 border-t border-slate-100">
            Final synthesis reveals automatically on completion
          </div>
        </div>

      </div>

    </div>
  );
}
