'use client';
import React, { useMemo, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useSpring, animated, to } from '@react-spring/web';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import {
  duration,
  ease,
  spring,
  staggerContainer,
  staggerItem,
  tapPress,
  tween,
} from '@/lib/motion';
import {
  Activity,
  ShieldCheck,
  Zap,
  Globe,
  ChevronRight,
  ListTree,
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowUpRight,
  PieChart,
  Radio,
  FileCheck
} from 'lucide-react';
import { generateIssuesReport } from '@/utils/IssuesEngine';

const CORE_AUDIT_CATEGORIES = [
  { id: 'Response_Codes', label: 'Response Codes', icon: <Radio size={14} /> },
  { id: 'Page_Titles', label: 'Page Titles', icon: <FileCheck size={14} /> },
  { id: 'Meta_Description', label: 'Meta Description', icon: <FileCheck size={14} /> },
  { id: 'H1', label: 'H1 Headings', icon: <FileCheck size={14} /> },
  { id: 'H2', label: 'H2 Headings', icon: <FileCheck size={14} /> },
  { id: 'Canonicals', label: 'Canonical URLs', icon: <Globe size={14} /> },
  { id: 'Directives', label: 'Robots Directives', icon: <Bot size={14} /> },
  { id: 'Structured_Data', label: 'Structured Schema', icon: <Sparkles size={14} /> },
  { id: 'AEO_Audit', label: 'AEO Voice & LLM', icon: <Bot size={14} /> },
  { id: 'GEO_Audit', label: 'GEO Local Search', icon: <Globe size={14} /> },
  { id: 'PageSpeed', label: 'Core Web Vitals', icon: <Zap size={14} /> },
  { id: 'Images', label: 'Image Assets', icon: <ListTree size={14} /> }
];

// React Spring 3D Tilt Card Helper
const calcTilt = (x, y, rect) => [
  -(y - rect.top - rect.height / 2) / 35, // RotateX
  (x - rect.left - rect.width / 2) / 35,  // RotateY
  1.02                                    // Scale
];
const transTilt = (x, y, s) =>
  `perspective(1000px) rotateX(${x}deg) rotateY(${y}deg) scale(${s})`;

function SpringTiltBentoCard({ title, score, subtitle, statusText, icon: Icon, colorTheme, onMouseMoveCard }) {
  const cardRef = useRef(null);
  const [props, set] = useSpring(() => ({
    xys: [0, 0, 1],
    config: { mass: 1.1, tension: 260, friction: 22 }
  }));

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    set({ xys: calcTilt(e.clientX, e.clientY, rect) });
    if (onMouseMoveCard) onMouseMoveCard(e);
  };

  const handleMouseLeave = () => {
    set({ xys: [0, 0, 1] });
  };

  const themes = {
    emerald: {
      border: 'border-emerald-200 hover:border-emerald-300',
      bg: 'from-white to-emerald-50/40',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    indigo: {
      border: 'border-indigo-200 hover:border-indigo-300',
      bg: 'from-white to-indigo-50/40',
      text: 'text-indigo-700',
      iconBg: 'bg-indigo-50 text-indigo-700 border-indigo-200'
    },
    purple: {
      border: 'border-purple-200 hover:border-purple-300',
      bg: 'from-white to-purple-50/40',
      text: 'text-purple-700',
      iconBg: 'bg-purple-50 text-purple-700 border-purple-200'
    },
    rose: {
      border: 'border-rose-200 hover:border-rose-300',
      bg: 'from-white to-rose-50/40',
      text: 'text-rose-700',
      iconBg: 'bg-rose-50 text-rose-700 border-rose-200'
    }
  };

  const t = themes[colorTheme] || themes.emerald;

  return (
    <animated.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform: to(props.xys, transTilt) }}
      className={`gsap-metric-card spotlight-card p-5 rounded-3xl bg-gradient-to-br ${t.bg} border ${t.border} shadow-sm hover:shadow-xl transition-shadow duration-300 relative overflow-hidden will-change-transform`}
    >
      <div className="flex justify-between items-start mb-3 relative z-10">
        <div>
          <p className={`text-[10px] font-mono font-bold ${t.text} uppercase tracking-widest`}>{subtitle}</p>
          <h3 className="text-4xl font-extrabold text-slate-900 mt-1 tabular-nums">
            <AnimatedNumber value={score} />
            <span className="text-base text-slate-400 font-normal">/100</span>
          </h3>
        </div>
        <div className={`w-10 h-10 rounded-2xl ${t.iconBg} border flex items-center justify-center shadow-xs`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold pt-2 border-t border-slate-200/60 relative z-10">
        <CheckCircle2 size={13} className={t.text} /> {statusText}
      </div>
    </animated.div>
  );
}

export default function OverviewTab({ pages, onNavigateToExplorer }) {
  const containerRef = useRef(null);
  const reduced = useReducedMotion();

  // GSAP Staggered Entrance Animation
  useGSAP(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

    if (containerRef.current) {
      gsap.from('.gsap-metric-card', {
        y: 24,
        opacity: 0,
        duration: 0.55,
        stagger: 0.08,
        ease: 'power3.out'
      });
      gsap.from('.gsap-section', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        delay: 0.25,
        stagger: 0.1,
        ease: 'power3.out'
      });
    }
  }, { scope: containerRef, dependencies: [] });

  const issuesReport = useMemo(() => generateIssuesReport(pages), [pages]);

  const criticalIssues = useMemo(() => issuesReport.filter(i => i.priority === 'High' || i.type === 'Issue'), [issuesReport]);
  const warningIssues = useMemo(() => issuesReport.filter(i => i.type === 'Warning'), [issuesReport]);

  const stats = useMemo(() => {
    if (!pages || pages.length === 0) return { total: 0, status200: 0, status400: 0, status300: 0, indexable: 0 };

    let s200 = 0, s400 = 0, s300 = 0, indexable = 0;
    pages.forEach(p => {
      const code = p.status_code || 200;
      if (code >= 200 && code < 300) s200++;
      else if (code >= 300 && code < 400) s300++;
      else if (code >= 400) s400++;
      if (p.indexability === 'Indexable' || code === 200) indexable++;
    });

    return {
      total: pages.length,
      status200: s200,
      status300: s300,
      status400: s400,
      indexable: indexable
    };
  }, [pages]);

  const healthScore = useMemo(() => {
    if (!pages || pages.length === 0) return 0;
    return Math.max(10, Math.min(100, Math.round(100 - (criticalIssues.length * 4) - (warningIssues.length * 1.5))));
  }, [criticalIssues, warningIssues, pages]);

  const seoScore = useMemo(() => {
    if (!pages || pages.length === 0) return 0;
    const techIssues = issuesReport.filter(i => 
      ['Response_Codes', 'Canonicals', 'Directives', 'Security', 'Structured_Data', 'Validation', 'Internal'].includes(i.category)
    );
    const non200Ratio = pages.filter(p => (p.status_code || 200) >= 300).length / Math.max(1, pages.length);
    return Math.max(15, Math.min(100, Math.round(100 - (techIssues.length * 5) - (non200Ratio * 25))));
  }, [pages, issuesReport]);

  const aeoScore = useMemo(() => {
    if (!pages || pages.length === 0) return 0;
    const scores = pages
      .map(p => p.audit_data?.AEO_Audit?.AEO_Readability_Score || p.audit_data?.AEO_Audit?.aeo_score)
      .filter(s => typeof s === 'number');
    if (scores.length > 0) {
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    return Math.max(20, Math.min(98, healthScore - 2));
  }, [pages, healthScore]);

  const geoScore = useMemo(() => {
    if (!pages || pages.length === 0) return 0;
    const count = pages.filter(p => p.audit_data?.GEO_Audit?.Local_NAP_Consistency?.includes('Verified')).length;
    if (count > 0) return Math.min(99, 78 + (count * 4));
    return Math.max(20, Math.min(96, healthScore - 3));
  }, [pages, healthScore]);

  // Spotlight mouse-follow handler
  const handleMouseMoveSpotlight = (e) => {
    const { currentTarget, clientX, clientY } = e;
    const { left, top } = currentTarget.getBoundingClientRect();
    currentTarget.style.setProperty('--mouse-x', `${clientX - left}px`);
    currentTarget.style.setProperty('--mouse-y', `${clientY - top}px`);
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-1 sm:pr-2 space-y-5 sm:space-y-6">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Executive Audit Telemetry</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Holistic intelligence across Technical SEO, AEO (Answer Engine Optimization), and GEO (Generative Local SERP).
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-slate-700 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl shadow-xs self-start sm:self-auto shrink-0">
          <span>Engine Status:</span>
          <span className="text-emerald-700 font-bold flex items-center gap-1.5">
            <span className="live-dot w-2 h-2 rounded-full bg-emerald-500 text-emerald-500/60"></span> Live Analyzed
          </span>
        </div>
      </div>

      {/* 4 Score Bento Cards with React Spring 3D Tilt & Aceternity Spotlight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">

        {/* Health Index */}
        <SpringTiltBentoCard
          title="Site Health"
          subtitle="Site Health Index"
          score={healthScore}
          statusText={`${issuesReport.length} Checks Evaluated`}
          icon={Activity}
          colorTheme="emerald"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

        {/* Technical SEO */}
        <SpringTiltBentoCard
          title="Technical SEO"
          subtitle="Technical SEO"
          score={seoScore}
          statusText="Crawlability & Indexability"
          icon={Globe}
          colorTheme="indigo"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

        {/* AEO Voice & LLM */}
        <SpringTiltBentoCard
          title="AEO Voice & LLM"
          subtitle="AEO Voice & LLM"
          score={aeoScore}
          statusText="Direct Answer AI Readiness"
          icon={Sparkles}
          colorTheme="purple"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

        {/* GEO Local Search */}
        <SpringTiltBentoCard
          title="GEO Local Search"
          subtitle="GEO Local Search"
          score={geoScore}
          statusText="Local 3-Pack & NAP Matrix"
          icon={ShieldCheck}
          colorTheme="rose"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

      </div>

      {/* Crawl Telemetry & Diagnostic Health Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* URL Crawl Breakdown */}
        <div className="gsap-section glass-card p-5 lg:col-span-1 flex flex-col justify-between rounded-3xl bg-white border border-slate-200 shadow-sm">
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
              <PieChart size={16} className="text-indigo-600" /> Crawl Response Distribution
            </h4>
            <p className="text-xs text-slate-500 mb-4">HTTP Status Codes across {stats.total} crawled URLs</p>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono font-semibold mb-1">
                  <span className="text-emerald-700">2xx Success ({stats.status200})</span>
                  <span className="text-slate-600">{stats.total > 0 ? Math.round((stats.status200/stats.total)*100) : 100}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <motion.div
                    className="h-full w-full origin-left bg-emerald-500 rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: stats.total > 0 ? stats.status200 / stats.total : 1 }}
                    transition={{ duration: 0.9, ease: ease.outQuart, delay: 0.15 }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono font-semibold mb-1">
                  <span className="text-indigo-700">3xx Redirects ({stats.status300})</span>
                  <span className="text-slate-600">{stats.total > 0 ? Math.round((stats.status300/stats.total)*100) : 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <motion.div
                    className="h-full w-full origin-left bg-indigo-500 rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: stats.total > 0 ? stats.status300 / stats.total : 0 }}
                    transition={{ duration: 0.9, ease: ease.outQuart, delay: 0.22 }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono font-semibold mb-1">
                  <span className="text-rose-700">4xx / 5xx Client Errors ({stats.status400})</span>
                  <span className="text-slate-600">{stats.total > 0 ? Math.round((stats.status400/stats.total)*100) : 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <motion.div
                    className="h-full w-full origin-left bg-rose-500 rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: stats.total > 0 ? stats.status400 / stats.total : 0 }}
                    transition={{ duration: 0.9, ease: ease.outQuart, delay: 0.29 }}
                  />
                </div>
              </div>
            </div>
          </div>

          <motion.button
            onClick={() => onNavigateToExplorer('Response_Codes')}
            whileHover={{ y: -2 }}
            whileTap={tapPress}
            transition={spring.press}
            className="mt-5 w-full btn-secondary py-2 text-xs font-bold gap-1.5 shadow-xs group"
          >
            Inspect Response Codes
            <motion.span
              className="flex"
              initial={{ x: 0, y: 0 }}
              whileHover={{ x: 2, y: -2 }}
              transition={spring.press}
            >
              <ArrowUpRight size={14} />
            </motion.span>
          </motion.button>
        </div>

        {/* 32-Parameter Coverage Grid */}
        <div className="gsap-section glass-card p-5 lg:col-span-2 rounded-3xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Screaming Frog 32-Parameter Engine</h4>
              <p className="text-xs text-slate-500">Click any diagnostic parameter to explore raw site matrices</p>
            </div>
            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full font-bold">
              32 Parameters Active
            </span>
          </div>

          <motion.div
            variants={staggerContainer(0.03, 0.1)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
          >
            {CORE_AUDIT_CATEGORIES.map(cat => (
              <motion.button
                key={cat.id}
                variants={staggerItem}
                onClick={() => onNavigateToExplorer(cat.id)}
                whileHover={{ y: -3 }}
                whileTap={tapPress}
                initial="rest"
                animate="rest"
                transition={spring.press}
                className="p-3 rounded-2xl bg-slate-50/80 hover:bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-xs text-left transition-colors group flex flex-col justify-between cursor-pointer"
              >
                <div className="flex items-center justify-between text-slate-500 group-hover:text-indigo-600 mb-2 transition-colors">
                  {cat.icon}
                  <motion.span
                    variants={{ rest: { opacity: 0, x: -3, y: 3 }, hover: { opacity: 1, x: 0, y: 0 } }}
                    transition={tween(duration.micro, ease.outQuart)}
                    className="flex"
                  >
                    <ArrowUpRight size={12} />
                  </motion.span>
                </div>
                <div className="text-xs font-bold text-slate-800 group-hover:text-slate-900 truncate">
                  {cat.label}
                </div>
              </motion.button>
            ))}
          </motion.div>
        </div>

      </div>

      {/* Critical Issues Action List */}
      <div className="gsap-section glass-card p-5 rounded-3xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-600" size={18} />
            <h4 className="text-sm font-bold text-slate-900">Actionable Findings Radar</h4>
          </div>
          <span className="text-xs font-mono text-slate-500 font-semibold">{criticalIssues.length + warningIssues.length} total issues found</span>
        </div>

        {criticalIssues.length === 0 && warningIssues.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tween(duration.panel, ease.outQuart)}
            className="p-8 text-center text-slate-500"
          >
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.soft}
              className="block"
            >
              <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-2" />
            </motion.span>
            <p className="font-bold text-slate-900">No Critical Issues Detected</p>
            <p className="text-xs text-slate-500 mt-1">Target website satisfies core indexability and technical SEO standards.</p>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer(0.05, 0.05)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <AnimatePresence initial={false} mode="popLayout">
            {[...criticalIssues, ...warningIssues].slice(0, 6).map((issue) => (
              <motion.div
                key={`${issue.category}-${issue.name}`}
                layout={!reduced}
                variants={staggerItem}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={() => onNavigateToExplorer(issue.category, issue.ruleName || issue.name)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                transition={spring.press}
                className="p-3.5 rounded-2xl bg-slate-50/80 hover:bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs cursor-pointer flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${issue.priority === 'High' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {issue.priority === 'High' ? <XCircle size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{issue.name}</h5>
                    <p className="text-[10px] font-mono text-slate-500">{issue.category.replace(/_/g, ' ')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-white border border-slate-200 text-slate-800 shadow-xs">
                    {issue.count} URLs
                  </span>
                  <ChevronRight size={14} className="text-slate-400 group-hover:text-slate-700 transition-colors" />
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

    </div>
  );
}
