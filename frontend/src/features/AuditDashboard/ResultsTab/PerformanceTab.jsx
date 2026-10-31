'use client';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { animate } from 'animejs';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { ease, spring, staggerContainer, staggerItem, tapPress, tween, duration } from '@/lib/motion';
import {
  Zap,
  Smartphone,
  Monitor,
  Clock,
  Globe,
  Search,
  RotateCcw,
  Loader2,
  Sparkles,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/api/client';

const STRATEGIES = [
  { id: 'mobile', label: 'Mobile', Icon: Smartphone },
  { id: 'desktop', label: 'Desktop', Icon: Monitor },
];

function getOpportunitySubtitle(title = '') {
  const t = title.toLowerCase();
  if (t.includes('render-blocking')) return 'Deliver critical JS/CSS inline and defer non-critical assets.';
  if (t.includes('next-gen') || t.includes('webp') || t.includes('avif')) return 'Serve modern WebP or AVIF formats for superior compression over legacy JPEG/PNG.';
  if (t.includes('size images') || t.includes('properly size')) return 'Serve responsive, appropriately-scaled images to conserve bandwidth and reduce memory usage.';
  if (t.includes('unused javascript') || t.includes('unused js')) return 'Defer or tree-shake unused scripts to decrease network payload and main-thread execution time.';
  if (t.includes('unused css')) return 'Remove unused stylesheet rules and defer non-critical styles until after paint.';
  if (t.includes('compression') || t.includes('text compression')) return 'Serve resources with Gzip or Brotli compression to minimize total network transfer bytes.';
  if (t.includes('minify javascript')) return 'Minify script files to reduce download size and script parsing time.';
  if (t.includes('minify css')) return 'Minify stylesheet bundles to accelerate render tree construction.';
  if (t.includes('preconnect') || t.includes('dns-prefetch')) return 'Establish early third-party connections to accelerate external resource loading.';
  if (t.includes('cache') || t.includes('caching')) return 'Extend cache lifetimes for static assets to speed up repeat visits.';
  return 'Apply modern web optimization best practices to reduce payload and latency.';
}

export default function PerformanceTab({ pages }) {
  const [strategy, setStrategy] = useState('mobile');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [inspectedUrl, setInspectedUrl] = useState(null);
  const [customPerfData, setCustomPerfData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const reduced = useReducedMotion();
  const circleRef = useRef(null);
  const numberRef = useRef(null);

  // Available crawled URLs list for quick selection (prioritizing pages with verified PageSpeed data)
  const crawledUrls = useMemo(() => {
    if (!pages || pages.length === 0) return [];
    const withPerf = [];
    const withoutPerf = [];
    for (const p of pages) {
      if (!p.url) continue;
      const ps = p.audit_data?.PageSpeed || p.audit_data?.PageSpeed_Insights;
      if (ps && typeof ps === 'object' && (ps.mobile?.metrics || ps.metrics)) {
        withPerf.push(p.url);
      } else {
        withoutPerf.push(p.url);
      }
    }
    return [...withPerf, ...withoutPerf];
  }, [pages]);

  // Handle single URL analysis without affecting other tabs
  const handleAnalyzeUrl = async (targetUrl) => {
    const urlToTest = (targetUrl || customUrlInput || '').trim();
    if (!urlToTest) {
      toast.warning('Please enter or select a page URL to analyze.');
      return;
    }

    // Check if URL is already in crawled pages array with verified PageSpeed metrics
    const matchedPage = pages?.find(p => p.url === urlToTest);
    const matchedPs = matchedPage?.audit_data?.PageSpeed || matchedPage?.audit_data?.PageSpeed_Insights;
    if (matchedPs && typeof matchedPs === 'object' && (matchedPs.mobile?.metrics || matchedPs.desktop?.metrics || matchedPs.metrics)) {
      setInspectedUrl(urlToTest);
      setCustomPerfData(matchedPs);
      toast.success(`Loaded Core Web Vitals for ${urlToTest}`);
      return;
    }

    setIsAnalyzing(true);
    setInspectedUrl(urlToTest);

    try {
      const res = await axios.post(`${API_BASE_URL}/performance/analyze`, { url: urlToTest });

      if (res.data?.data) {
        setCustomPerfData(res.data.data);
        toast.success(`Performance analyzed for ${urlToTest}`, {
          description: 'Live Google PageSpeed Insights data retrieved.'
        });
      } else {
        // No measurement is shown rather than an estimate.
        setCustomPerfData(null);
        toast.warning('No PageSpeed data available', {
          description: res.data?.is_live_api
            ? 'Google PageSpeed Insights did not return results for this URL.'
            : 'Connect a PageSpeed Insights API key in Integrations to measure Core Web Vitals.'
        });
      }
    } catch (err) {
      console.error('Failed to analyze URL performance:', err);
      setCustomPerfData(null);
      toast.error('Performance analysis failed', {
        description: err.response?.data?.detail || 'Could not reach the PageSpeed service. Please try again.'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResetToSitewide = () => {
    setInspectedUrl(null);
    setCustomPerfData(null);
    setCustomUrlInput('');
    toast.info('Switched back to sitewide performance overview.');
  };

  // Derive metrics and opportunities based on inspected URL or sitewide overview
  const { metrics, opportunities, isLiveCustom, measuredUrl, fieldData } = useMemo(() => {
    let sourceData = null;
    let measuredFrom = inspectedUrl || null;

    if (customPerfData) {
      sourceData = customPerfData[strategy] || customPerfData;
    } else if (pages && pages.length > 0) {
      const pageWithPerf = pages.find(p => {
        const ps = p.audit_data?.PageSpeed || p.audit_data?.PageSpeed_Insights;
        return ps && typeof ps === 'object' && ((ps[strategy] && ps[strategy].metrics) || ps.metrics);
      }) || pages.find(p => {
        const ps = p.audit_data?.PageSpeed || p.audit_data?.PageSpeed_Insights;
        return ps && typeof ps === 'object' && (ps.mobile?.metrics || ps.desktop?.metrics);
      }) || pages[0];

      const pagespeedRaw = pageWithPerf?.audit_data?.PageSpeed || pageWithPerf?.audit_data?.PageSpeed_Insights || null;
      if (pagespeedRaw && typeof pagespeedRaw === 'object') {
        sourceData = pagespeedRaw[strategy] || (pagespeedRaw.mobile || pagespeedRaw);
        measuredFrom = pageWithPerf?.url || null;
      }
    }

    if (!sourceData || !sourceData.metrics) {
      return {
        metrics: null,
        opportunities: [],
        isLiveCustom: Boolean(inspectedUrl),
        measuredUrl: measuredFrom,
        fieldData: null,
      };
    }

    const score = typeof sourceData.performance_score === 'number' ? sourceData.performance_score : null;
    const dynamicMetrics = sourceData.metrics || {};

    // INP only exists as real-user (CrUX) field data; lab runs cannot measure it, so it is never estimated.
    const formattedInp = dynamicMetrics.inp || '-';

    return {
      metrics: {
        overallScore: score,
        lcp: dynamicMetrics.lcp || '-',
        inp: formattedInp,
        cls: dynamicMetrics.cls || '-',
        // Older audits stored Lighthouse's sentence ("Root document took 280 ms"); keep only the time.
        ttfb: String(dynamicMetrics.ttfb || '').match(/[\d.,]+\s*m?s\b/)?.[0] || dynamicMetrics.ttfb || '-',
        fcp: dynamicMetrics.fcp || '-',
        tbt: dynamicMetrics.tbt || '-',
        speedIndex: dynamicMetrics.speedIndex || '-'
      },
      opportunities: (sourceData.opportunities || []).filter(opp => {
        const title = (opp.title || '').toLowerCase();
        return !title.includes('was short') && !title.includes('was fast') && !title.includes('is fast');
      }),
      isLiveCustom: Boolean(inspectedUrl),
      measuredUrl: measuredFrom,
      // Real-visitor (Chrome UX Report) data, kept apart from the lab test above.
      fieldData: sourceData.field_data?.available ? sourceData.field_data : null,
    };
  }, [pages, strategy, customPerfData, inspectedUrl]);

  const getScoreColor = (score) => {
    if (!score && score !== 0) return { text: 'text-slate-500 dark:text-slate-400', stroke: '#94A3B8', bg: 'bg-slate-50 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700', label: 'N/A' };
    if (score >= 90) return { text: 'text-emerald-700 dark:text-emerald-300', stroke: '#059669', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-900/50', label: 'Good' };
    if (score >= 50) return { text: 'text-amber-700 dark:text-amber-300', stroke: '#D97706', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-900/50', label: 'Needs Improvement' };
    return { text: 'text-rose-700 dark:text-rose-300', stroke: '#E11D48', bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-900/50', label: 'Poor' };
  };

  const evaluateVital = (rawValue, metricType) => {
    if (!rawValue || rawValue === '-') {
      return { status: 'N/A', tone: 'slate', fill: 0.1, target: '-' };
    }
    const num = parseFloat(String(rawValue).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) {
      return { status: 'Audited', tone: 'indigo', fill: 0.7, target: '-' };
    }

    if (metricType === 'lcp') {
      if (num <= 2.5) return { status: 'Good', tone: 'emerald', fill: 0.9, target: '< 2.5s' };
      if (num <= 4.0) return { status: 'Needs Work', tone: 'amber', fill: 0.55, target: '< 2.5s' };
      return { status: 'Poor', tone: 'rose', fill: 0.25, target: '< 2.5s' };
    }
    if (metricType === 'cls') {
      if (num <= 0.1) return { status: 'Good', tone: 'emerald', fill: 0.92, target: '< 0.1' };
      if (num <= 0.25) return { status: 'Needs Work', tone: 'amber', fill: 0.55, target: '< 0.1' };
      return { status: 'Poor', tone: 'rose', fill: 0.2, target: '< 0.1' };
    }
    if (metricType === 'inp') {
      let inpMs = num;
      if (String(rawValue).includes('s') && !String(rawValue).includes('ms')) {
        inpMs = num * 1000;
      }
      if (inpMs <= 200) return { status: 'Good', tone: 'emerald', fill: 0.88, target: '< 200ms' };
      if (inpMs <= 500) return { status: 'Needs Work', tone: 'amber', fill: 0.55, target: '< 200ms' };
      return { status: 'Poor', tone: 'rose', fill: 0.2, target: '< 200ms' };
    }
    if (metricType === 'ttfb') {
      if (num <= 800) return { status: 'Fast', tone: 'emerald', fill: 0.85, target: '< 800ms' };
      if (num <= 1800) return { status: 'Moderate', tone: 'amber', fill: 0.55, target: '< 800ms' };
      return { status: 'Slow', tone: 'rose', fill: 0.25, target: '< 800ms' };
    }
    if (metricType === 'fcp') {
      if (num <= 1.8) return { status: 'Good', tone: 'emerald', fill: 0.88, target: '< 1.8s' };
      if (num <= 3.0) return { status: 'Needs Work', tone: 'amber', fill: 0.55, target: '< 1.8s' };
      return { status: 'Poor', tone: 'rose', fill: 0.25, target: '< 1.8s' };
    }
    if (metricType === 'speedIndex') {
      if (num <= 3.4) return { status: 'Good', tone: 'emerald', fill: 0.85, target: '< 3.4s' };
      if (num <= 5.8) return { status: 'Needs Work', tone: 'amber', fill: 0.55, target: '< 3.4s' };
      return { status: 'Poor', tone: 'rose', fill: 0.25, target: '< 3.4s' };
    }
    return { status: 'Optimal', tone: 'emerald', fill: 0.8, target: '-' };
  };

  const vitals = useMemo(() => {
    if (!metrics) return [];
    const lcpEval = evaluateVital(metrics.lcp, 'lcp');
    const clsEval = evaluateVital(metrics.cls, 'cls');
    const inpEval = evaluateVital(metrics.inp, 'inp');
    const ttfbEval = evaluateVital(metrics.ttfb, 'ttfb');
    const fcpEval = evaluateVital(metrics.fcp, 'fcp');
    const siEval = evaluateVital(metrics.speedIndex, 'speedIndex');

    return [
      { label: 'LCP (Largest Paint)', value: metrics.lcp, ...lcpEval },
      { label: 'CLS (Layout Shift)', value: metrics.cls, ...clsEval },
      { label: 'INP (real visitors only)', value: metrics.inp, ...inpEval },
      { label: "Server response (Google's test)", value: metrics.ttfb, ...ttfbEval },
      { label: 'FCP (First Paint)', value: metrics.fcp, ...fcpEval },
      { label: 'Speed Index', value: metrics.speedIndex, ...siEval },
    ];
  }, [metrics]);

  const scoreMeta = getScoreColor(metrics?.overallScore);
  const circumference = 283;
  const currentScore = metrics?.overallScore ?? 0;
  const targetOffset = circumference - (currentScore / 100) * circumference;

  // Anime.js v4 SVG Path Stroke & Numeric Counter Animation
  useEffect(() => {
    if (!circleRef.current || !numberRef.current || !metrics) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      circleRef.current.style.strokeDashoffset = String(targetOffset);
      numberRef.current.textContent = String(metrics.overallScore);
      return;
    }

    if (typeof animate === 'function') {
      animate(circleRef.current, {
        strokeDashoffset: [circumference, targetOffset],
        duration: 1600,
        ease: 'outExpo'
      });

      const counter = { val: 0 };
      animate(counter, {
        val: metrics.overallScore,
        round: 1,
        duration: 1600,
        ease: 'outExpo',
        onUpdate: () => {
          if (numberRef.current) {
            numberRef.current.textContent = `${Math.round(counter.val)}`;
          }
        }
      });
    }
  }, [metrics, targetOffset, circumference, strategy, inspectedUrl]);

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-2 space-y-5 pb-20 md:pb-6">

      {/* Header & Device Strategy Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Zap className="text-amber-500 shrink-0" size={24} />
            Performance & Core Web Vitals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Lab test by Google Lighthouse{measuredUrl ? <> of <span className="font-semibold break-all">{measuredUrl.replace(/^https?:\/\//, '')}</span></> : ''}, measured during this audit. Real-visitor data is shown separately when Google has it.
          </p>
          {metrics && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
              {fieldData
                ? <>Real visitors ({fieldData.scope === 'origin' ? 'whole site' : 'this page'}, 75th percentile): LCP {fieldData.lcp_p75_ms != null ? `${(fieldData.lcp_p75_ms / 1000).toFixed(1)} s` : 'no data'} · INP {fieldData.inp_p75_ms != null ? `${fieldData.inp_p75_ms} ms` : 'no data'} · CLS {fieldData.cls_p75 ?? 'no data'}</>
                : 'Real visitors: Google does not have enough Chrome visitor data for this site yet, so only the lab test is shown.'}
            </p>
          )}
        </div>

        {/* Strategy Buttons */}
        <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0 self-start sm:self-auto">
          <LayoutGroup id="perf-strategy">
            {STRATEGIES.map(({ id, label, Icon }) => {
              const isActive = strategy === id;
              return (
                <motion.button
                  key={id}
                  onClick={() => setStrategy(id)}
                  whileTap={tapPress}
                  transition={spring.press}
                  aria-pressed={isActive}
                  className={`relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold cursor-pointer outline-none transition-colors duration-150 ${
                    isActive ? 'text-slate-900 dark:text-white font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="perf-strategy-pill"
                      transition={reduced ? { duration: 0 } : spring.snap}
                      className="absolute inset-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xs"
                    />
                  )}
                  <Icon size={15} className="relative z-10 text-indigo-600 dark:text-indigo-400" />
                  <span className="relative z-10">{label}</span>
                </motion.button>
              );
            })}
          </LayoutGroup>
        </div>
      </div>

      {/* Single URL Inspector & Speed Tester Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-xs font-bold font-mono text-slate-900 dark:text-white uppercase">Test Specific Page Speed</span>
          </div>

          {inspectedUrl && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-900/50 truncate max-w-xs">
                Inspecting: {inspectedUrl}
              </span>
              <button
                onClick={handleResetToSitewide}
                className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title="Return to overall crawl average"
              >
                <RotateCcw size={12} /> Sitewide
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              placeholder="Paste any URL to analyze speed (e.g. https://bloomxsolutions.com/services/)..."
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAnalyzeUrl();
                }
              }}
              className="w-full glass-input pl-9 pr-4 py-2 font-mono text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl"
            />
          </div>

          <motion.button
            onClick={() => handleAnalyzeUrl()}
            disabled={isAnalyzing || !customUrlInput.trim()}
            whileTap={isAnalyzing ? undefined : tapPress}
            transition={spring.press}
            className="btn-primary py-2 px-4 text-xs font-bold gap-2 disabled:opacity-50 shrink-0 shadow-xs"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isAnalyzing ? 'busy' : 'idle'}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={tween(duration.micro, ease.outQuart)}
                className="flex items-center gap-1.5"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-emerald-400" /> Testing Vitals...
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-emerald-400" /> Test Page Vitals
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Quick Selection Chips of Crawled URLs */}
        {crawledUrls.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar max-w-full pt-1 text-[11px] font-mono">
            <span className="text-slate-400 dark:text-slate-500 font-semibold shrink-0">Quick Select:</span>
            {crawledUrls.slice(0, 6).map((u, i) => (
              <button
                key={i}
                onClick={() => {
                  setCustomUrlInput(u);
                  handleAnalyzeUrl(u);
                }}
                className={`px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${
                  inspectedUrl === u
                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300'
                }`}
              >
                {u.replace(/^https?:\/\/[^\/]+/, '') || '/'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Score & Top Telemetry */}
      {metrics ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">

            {/* Animated Lighthouse Gauge */}
            <div className="glass-card p-6 flex flex-col items-center justify-center relative overflow-hidden text-center bg-white dark:bg-slate-900/90 shadow-sm border border-slate-200 dark:border-slate-800 rounded-3xl">
              <div className="relative w-40 h-40 sm:w-44 sm:h-44 flex items-center justify-center mb-3">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    className="text-slate-100 dark:text-slate-800 stroke-current"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    ref={circleRef}
                    cx="50"
                    cy="50"
                    r="45"
                    stroke={scoreMeta.stroke}
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span ref={numberRef} className={`text-4xl font-extrabold font-mono ${scoreMeta.text}`}>
                    {metrics.overallScore}
                  </span>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 dark:text-slate-500">Score</span>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${scoreMeta.bg} ${scoreMeta.text} ${scoreMeta.border}`}>
                {scoreMeta.label} ({strategy.toUpperCase()})
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">Lab test (Google Lighthouse)</p>
            </div>

            {/* 6 Core Web Vitals Bento Cards */}
            <motion.div
              key={`${strategy}-${inspectedUrl || 'sitewide'}`}
              variants={staggerContainer(0.05, 0.1)}
              initial="initial"
              animate="animate"
              className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3.5"
            >
              {vitals.map((v, i) => {
                const toneStyle = {
                  emerald: { text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
                  amber: { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500', badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
                  rose: { text: 'text-rose-700 dark:text-rose-400', bar: 'bg-rose-500', badge: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
                  indigo: { text: 'text-indigo-700 dark:text-indigo-400', bar: 'bg-indigo-500', badge: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
                  slate: { text: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-400', badge: 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' }
                }[v.tone] || { text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };

                return (
                  <motion.div
                    key={v.label}
                    variants={staggerItem}
                    whileHover={{ y: -3 }}
                    transition={spring.press}
                    className="metric-card-item p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase truncate">{v.label}</span>
                      {v.status && (
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${toneStyle.badge}`}>
                          {v.status}
                        </span>
                      )}
                    </div>
                    <div className="my-1.5 sm:my-2">
                      <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono truncate">{v.value}</div>
                      <p className={`text-[9px] sm:text-[10px] font-semibold truncate ${toneStyle.text}`}>
                        Target: {v.target}
                      </p>
                    </div>
                    <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                      <motion.div
                        className={`h-full w-full origin-left rounded-full ${toneStyle.bar}`}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.max(0.08, Math.min(1, v.fill || 0.8)) }}
                        transition={{ duration: 0.8, ease: ease.outQuart, delay: 0.15 + i * 0.05 }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

          </div>

          {/* Actionable Opportunities List */}
          {opportunities.length > 0 && (
            <div className="glass-card p-4 sm:p-5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className="text-amber-500 shrink-0" size={18} />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Actionable Speed Opportunities {inspectedUrl ? `for Selected Page` : ''}
                  </h4>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">{opportunities.length} optimizations available</span>
              </div>

              <motion.div
                variants={staggerContainer(0.06, 0.15)}
                initial="initial"
                animate="animate"
                className="space-y-3"
              >
                <AnimatePresence initial={false}>
                {opportunities.map((opp, idx) => (
                  <motion.div
                    key={opp.title}
                    variants={staggerItem}
                    exit={{ opacity: 0, x: -12 }}
                    whileHover={{ x: 3 }}
                    transition={spring.press}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white">{opp.title}</h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{getOpportunitySubtitle(opp.title)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs text-emerald-800 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/50 self-start sm:self-auto shrink-0">
                      <Clock size={12} /> Saves ~{opp.savings}
                    </div>
                  </motion.div>
                ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}
        </>
      ) : (
        <div className="p-12 text-center bg-white dark:bg-slate-900/80 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-xs">
            <Zap size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No PageSpeed Telemetry Loaded</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Enter any webpage URL in the search input above to run an on-demand Google Lighthouse & Core Web Vitals diagnostic in isolation.
          </p>
        </div>
      )}

    </div>
  );
}
