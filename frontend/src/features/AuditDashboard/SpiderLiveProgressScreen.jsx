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
import { duration, ease, fadeUp, spring, staggerContainer, staggerItem, tapPress, tween } from '@/lib/motion';

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

      {/* Compact Live Progress Header */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c0c0e] p-4 sm:p-5 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: Title, Target & Current Stage */}
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CAE366] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CAE366]"></span>
              </span>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-[#D6E5FC] tracking-tight">
                Auditing Website
              </h2>
              {url && (
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-md">
                  · {url.replace(/^https?:\/\//, '')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <Activity size={13} className="text-[#CAE366] animate-pulse shrink-0" />
              <span className="font-medium truncate">{currentStage.label}</span>
              <span className="hidden md:inline text-[11px] text-slate-400 dark:text-slate-500 truncate">
                — {currentStage.sub}
              </span>
            </div>
          </div>

          {/* Right: Progress stats & Bar */}
          <div className="sm:w-72 shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 dark:text-slate-400">
                <strong className="text-slate-900 dark:text-[#D6E5FC] font-semibold">{pagesCrawled}</strong> URLs extracted
              </span>
              <span className="font-bold text-[#CAE366] tabular-nums">{progress}%</span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-[#CAE366]"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.max(4, progress)}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500">
              <span>Depth: {crawlerSettings.maxDepth || 4}</span>
              <span>Threads: {crawlerSettings.maxConcurrent || 5}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Live Discovered URLs Stream & Real-time Tab Navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Live Discovered URLs Ticker */}
        <div className="lg:col-span-2 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-indigo-600 dark:text-indigo-400 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Live Discovered Endpoints Stream</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
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
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="flex items-center gap-2 truncate max-w-md">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        (page.status_code || 200) >= 400
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}>
                        {page.status_code || 200}
                      </span>
                      <span className="font-mono text-slate-700 dark:text-slate-300 truncate" title={page.url}>
                        {page.url}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
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
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Layers size={16} className="text-indigo-600 dark:text-indigo-400" /> Real-time Live Inspectors
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              You can switch to any tab below while the spider is active to inspect real-time tables as new URLs stream in:
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onSwitchTab && onSwitchTab('explorer')}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                    <ListTree size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">URL Data Grid</h4>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{pages.length} live records</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => onSwitchTab && onSwitchTab('issues')}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-rose-50/70 dark:hover:bg-rose-950/50 border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-700 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400">Issues & Diagnostics</h4>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">Live rule engine</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => onSwitchTab && onSwitchTab('performance')}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-amber-50/70 dark:hover:bg-amber-950/50 border border-slate-200 dark:border-slate-700 hover:border-amber-200 dark:hover:border-amber-700 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
                    <Zap size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">Speed & Core Vitals</h4>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">PageSpeed inspector</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 text-center pt-2 border-t border-slate-100 dark:border-slate-800">
            Final synthesis reveals automatically on completion
          </div>
        </div>

      </div>

    </div>
  );
}
