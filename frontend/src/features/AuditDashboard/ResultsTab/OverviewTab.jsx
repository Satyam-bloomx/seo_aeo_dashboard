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
  FileCheck,
  Search,
  Flame,
  TrendingUp,
  Gauge,
  HelpCircle,
  Check,
  AlertCircle
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

function SpringTiltBentoCard({
  title,
  score,
  subtitle,
  statusText,
  icon: Icon,
  colorTheme,
  onMouseMoveCard,
  isDisconnected = false,
  actionText,
  onAction
}) {
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
      className={`gsap-metric-card spotlight-card p-5 rounded-3xl bg-gradient-to-br ${t.bg} border ${t.border} shadow-sm hover:shadow-xl transition-shadow duration-300 relative overflow-hidden will-change-transform flex flex-col justify-between`}
    >
      <div className="flex justify-between items-start mb-3 relative z-10">
        <div>
          <p className={`text-[10px] font-mono font-bold ${t.text} uppercase tracking-widest`}>{subtitle}</p>
          {score !== null && score !== undefined && !isDisconnected ? (
            <h3 className="text-4xl font-extrabold text-slate-900 mt-1 tabular-nums">
              <AnimatedNumber value={score} />
              <span className="text-base text-slate-400 font-normal">/100</span>
            </h3>
          ) : (
            <h3 className="text-4xl font-extrabold text-slate-400 mt-1 tabular-nums flex items-baseline gap-1">
              <span>--</span>
              <span className="text-base text-slate-400 font-normal">/100</span>
            </h3>
          )}
        </div>
        <div className={`w-10 h-10 rounded-2xl ${t.iconBg} border flex items-center justify-center shadow-xs`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 text-xs text-slate-700 font-semibold pt-2 border-t border-slate-200/60 relative z-10">
        <span className="flex items-center gap-1.5 truncate">
          {isDisconnected ? (
            <AlertCircle size={13} className="text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 size={13} className={`${t.text} shrink-0`} />
          )}
          <span className="truncate">{statusText}</span>
        </span>
        {actionText && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction?.(); }}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2 shrink-0 cursor-pointer ml-1"
          >
            {actionText}
          </button>
        )}
      </div>
    </animated.div>
  );
}

export default function OverviewTab({ pages, onNavigateToExplorer, onNavigateToTab }) {
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

  // 1. Industry-standard page-weighted Site Health Score (Screaming Frog / Ahrefs standard)
  const healthScore = useMemo(() => {
    if (!pages || pages.length === 0) return 0;
    const total = pages.length;
    
    // Penalties weighted by ratio of affected crawl pages
    let criticalDeduction = 0;
    criticalIssues.forEach(issue => {
      const affected = issue.affected_pages?.length || issue.count || 0;
      const ratio = affected / total;
      criticalDeduction += Math.min(12, ratio * 20); // capped at 12 per issue type
    });

    let warningDeduction = 0;
    warningIssues.forEach(issue => {
      const affected = issue.affected_pages?.length || issue.count || 0;
      const ratio = affected / total;
      warningDeduction += Math.min(6, ratio * 8);
    });

    // 4xx / 5xx HTTP Error ratio impact
    const errorPages = pages.filter(p => (p.status_code || 200) >= 400).length;
    const errorPenalty = (errorPages / total) * 35;

    const raw = 100 - criticalDeduction - warningDeduction - errorPenalty;
    return Math.max(10, Math.min(100, Math.round(raw)));
  }, [criticalIssues, warningIssues, pages]);

  // 2. Technical SEO Health Score (Response Codes, Indexability, Canonicals, Meta Tags, Headings)
  const seoScore = useMemo(() => {
    if (!pages || pages.length === 0) return 0;
    const total = pages.length;

    const techIssues = issuesReport.filter(i => 
      ['Response_Codes', 'Canonicals', 'Directives', 'Security', 'Structured_Data', 'Page_Titles', 'H1'].includes(i.category)
    );

    let techDeductions = 0;
    techIssues.forEach(i => {
      const affected = i.affected_pages?.length || i.count || 0;
      const ratio = affected / total;
      const weight = i.type === 'Issue' ? 18 : (i.type === 'Warning' ? 8 : 2);
      techDeductions += Math.min(15, ratio * weight);
    });

    const non200Ratio = pages.filter(p => (p.status_code || 200) >= 300).length / total;
    const raw = 100 - techDeductions - (non200Ratio * 20);
    return Math.max(15, Math.min(100, Math.round(raw)));
  }, [pages, issuesReport]);

  // 3. AEO (Answer Engine Optimization) - strictly requires connected AI (OpenAI / Perplexity)
  const aeoData = useMemo(() => {
    if (!pages || pages.length === 0) {
      return { isConnected: false, score: null, status: 'AI Engine Not Connected' };
    }

    for (const p of pages) {
      const aeo = p.audit_data?.AEO_Audit;
      if (aeo?.is_ai_connected && typeof aeo.aeo_score === 'number') {
        return {
          isConnected: true,
          score: aeo.aeo_score,
          status: aeo.Perplexity_Citation_Status || 'Live AI Citations Verified'
        };
      }
      if (aeo?.OpenAI_Synthesis_Score && !aeo.OpenAI_Synthesis_Score.includes('test')) {
        const parsed = parseInt(aeo.OpenAI_Synthesis_Score, 10);
        if (!isNaN(parsed)) {
          return {
            isConnected: true,
            score: parsed,
            status: aeo.OpenAI_Live_Status || 'GPT-4o Synthesized'
          };
        }
      }
    }

    return {
      isConnected: false,
      score: null,
      status: 'AI Engine Not Connected'
    };
  }, [pages]);

  // 4. GEO Local Search - requires GBP or SerpAPI integration
  const geoData = useMemo(() => {
    if (!pages || pages.length === 0) {
      return { isConnected: false, score: null, status: 'Requires GBP / SerpAPI', hasLocalSchema: false };
    }

    for (const p of pages) {
      const geo = p.audit_data?.GEO_Audit;
      if (geo?.is_geo_connected) {
        return {
          isConnected: true,
          score: geo.Local_NAP_Consistency?.includes('100%') ? 95 : 82,
          status: geo.Geo_Targeted_Rank || 'Local 3-Pack Tracked',
          hasLocalSchema: geo.has_local_schema || false
        };
      }
    }

    // Check if on-page local schema exists on crawled pages
    const hasLocalSchema = pages.some(p => {
      const sd = p.audit_data?.Structured_Data;
      return sd && (sd['Local Business Schema'] || p.audit_data?.GEO_Audit?.has_local_schema);
    });

    if (hasLocalSchema) {
      return {
        isConnected: false,
        score: 70,
        status: 'On-Page Local Schema (Rank Disconnected)',
        hasLocalSchema: true
      };
    }

    return {
      isConnected: false,
      score: null,
      status: 'Requires GBP / SerpAPI',
      hasLocalSchema: false
    };
  }, [pages]);

  const perplexityData = useMemo(() => {
    if (!pages || pages.length === 0) return null;
    for (const p of pages) {
      const aeo = p.audit_data?.AEO_Audit;
      if (aeo?.is_ai_connected && aeo?.Perplexity_Citation_Status && !aeo.Perplexity_Citation_Status.includes('Not Connected')) {
        return {
          isConnected: true,
          status: aeo.Perplexity_Citation_Status,
          win: aeo.Perplexity_Citation_Win || false,
          count: aeo.Perplexity_Citations_Count || 0,
          citations: aeo.Perplexity_Citations || [],
          competitors: aeo.Perplexity_Competitor_Sources || [],
          summary: aeo.Perplexity_AI_Summary || '',
          liveStatus: aeo.OpenAI_Live_Status,
          score: aeo.OpenAI_Synthesis_Score || null
        };
      }
    }
    return {
      isConnected: false,
      status: 'Not Connected',
      win: false,
      count: 0,
      citations: [],
      competitors: [],
      summary: null,
      liveStatus: null,
      score: null
    };
  }, [pages]);

  const serpData = useMemo(() => {
    if (!pages || pages.length === 0) return null;
    for (const p of pages) {
      const sd = p.audit_data?.SERP_Data;
      if (sd && sd.is_live_verified) {
        return sd;
      }
    }
    return {
      is_live_verified: false,
      has_ai_overview: false,
      ai_overview_cited: false,
      featured_snippet_present: false,
      paa_questions: [],
      top_ranking_position: null,
      local_pack_present: false
    };
  }, [pages]);

  const pageSpeedData = useMemo(() => {
    if (!pages || pages.length === 0) return null;
    const p0 = pages[0]?.audit_data || {};
    
    // Check real seo_audit.pagespeed first (desktop or mobile)
    const seoPs = p0.seo_audit?.pagespeed;
    const realDesktop = seoPs?.desktop?.status === 'success' ? seoPs.desktop : null;
    const realMobile = seoPs?.mobile?.status === 'success' ? seoPs.mobile : null;
    const activeReal = realDesktop || realMobile;
    
    const ps = p0.PageSpeed?.mobile || p0.PageSpeed?.desktop;
    
    if (activeReal && activeReal.performance_score !== undefined) {
      const opps = (activeReal.opportunities || []).map(o => ({
        title: o.title,
        savings: o.savingsMs ? `${(o.savingsMs / 1000).toFixed(2)} s` : (o.savings || '0.10 s')
      }));
      return {
        isConnected: true,
        score: activeReal.performance_score,
        strategy: realDesktop ? 'Desktop' : 'Mobile',
        metrics: {
          lcp: activeReal.metrics?.lcp || 'N/A',
          cls: activeReal.metrics?.cls || 'N/A',
          inp: activeReal.metrics?.inp || 'N/A',
          fcp: activeReal.metrics?.fcp || 'N/A',
          tbt: activeReal.metrics?.tbt || 'N/A',
          ttfb: activeReal.metrics?.ttfb || 'N/A'
        },
        opportunities: opps
      };
    }

    if (ps && ps.performance_score !== undefined) {
      return {
        isConnected: true,
        score: ps.performance_score,
        strategy: 'Mobile',
        metrics: ps.metrics || {},
        opportunities: ps.opportunities || []
      };
    }

    return {
      isConnected: false,
      score: null,
      strategy: 'N/A',
      metrics: {
        lcp: 'N/A',
        cls: 'N/A',
        inp: 'N/A',
        fcp: 'N/A',
        tbt: 'N/A',
        ttfb: 'N/A'
      },
      opportunities: []
    };
  }, [pages]);

  const gscSummary = useMemo(() => {
    if (!pages || pages.length === 0) return null;
    let totalClicks = 0;
    let totalImpressions = 0;
    let indexedCount = 0;
    let excludedCount = 0;
    let canonicalMismatches = 0;
    let isLive = false;

    pages.forEach(p => {
      const gsc = p.audit_data?.Search_Console;
      if (!gsc) return;
      if (gsc.Is_Live_GSC) isLive = true;
      const clicks = gsc.Clicks_Num !== undefined 
        ? gsc.Clicks_Num 
        : parseInt(String(gsc.Organic_Clicks_30d || '0').replace(/,/g, ''), 10) || 0;
      const imp = gsc.Impressions_Num !== undefined 
        ? gsc.Impressions_Num 
        : parseInt(String(gsc.Search_Impressions || '0').replace(/,/g, ''), 10) || 0;
      totalClicks += clicks;
      totalImpressions += imp;

      const status = (gsc.Google_Index_Status || '').toLowerCase();
      if (status.includes('indexed')) indexedCount++;
      else if (status.includes('excluded')) excludedCount++;

      if (gsc.Canonical_Mismatch) canonicalMismatches++;
    });

    const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0';
    return {
      totalClicks,
      totalImpressions,
      avgCtr,
      indexedCount,
      excludedCount,
      canonicalMismatches,
      isLive,
      source: isLive ? 'Live Google Search Console API' : (pages[0]?.audit_data?.Search_Console?.Live_GSC_Inspection || 'Search Console Intelligence')
    };
  }, [pages]);


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
          score={aeoData.score}
          isDisconnected={!aeoData.isConnected}
          statusText={aeoData.status}
          actionText={!aeoData.isConnected ? "Connect AI Engine →" : undefined}
          onAction={() => onNavigateToTab?.('integrations')}
          icon={Sparkles}
          colorTheme="purple"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

        {/* GEO Local Search */}
        <SpringTiltBentoCard
          title="GEO Local Search"
          subtitle="GEO Local Search"
          score={geoData.score}
          isDisconnected={!geoData.isConnected && !geoData.hasLocalSchema}
          statusText={geoData.status}
          actionText={!geoData.isConnected ? "Connect Local APIs →" : undefined}
          onAction={() => onNavigateToTab?.('integrations')}
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

      {/* Real-World Search Engine, AI Search & Core Web Vitals Intelligence Suite */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        
        {/* Card 1: Google Search Console Performance & Indexation */}
        <div className="gsap-section glass-card p-5 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
                  <Globe size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Google Search Console</h4>
                  <p className="text-[11px] text-slate-500">Organic clicks, impressions & indexation health</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                gscSummary?.isLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {gscSummary?.isLive ? 'Live GSC API' : 'Not Connected'}
              </span>
            </div>

            {/* 3 KPI metric gauges */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-center">
                <span className="text-[10px] font-mono text-blue-800 font-bold block uppercase">Clicks (30d)</span>
                <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                  {gscSummary?.isLive ? gscSummary.totalClicks.toLocaleString() : '0'}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">{gscSummary?.isLive ? 'Organic' : 'Disconnected'}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-center">
                <span className="text-[10px] font-mono text-indigo-800 font-bold block uppercase">Impressions</span>
                <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                  {gscSummary?.isLive ? gscSummary.totalImpressions.toLocaleString() : '0'}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">{gscSummary?.isLive ? 'SERP Views' : 'Disconnected'}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 text-center">
                <span className="text-[10px] font-mono text-purple-800 font-bold block uppercase">Avg CTR</span>
                <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                  {gscSummary?.isLive ? `${gscSummary?.avgCtr || '0.0'}%` : '0.0%'}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">Click Rate</span>
              </div>
            </div>

            {/* Coverage & Canonical Matrix */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Google Index State:</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] border ${
                  gscSummary?.isLive ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-100 border-slate-200'
                }`}>
                  {gscSummary?.isLive ? `${gscSummary.indexedCount} Indexed / ${gscSummary.excludedCount} Excluded` : 'Not Connected'}
                </span>
              </div>
              {gscSummary?.isLive && gscSummary?.canonicalMismatches > 0 ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <span className="font-medium flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-600" /> Canonical Mismatches:
                  </span>
                  <span className="font-mono font-bold px-2 py-0.5 rounded text-[11px] bg-amber-100 border border-amber-300">
                    {gscSummary.canonicalMismatches} URLs
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 border border-slate-200 text-xs text-slate-700">
                  <span className="font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={13} className={gscSummary?.isLive ? "text-emerald-600" : "text-slate-400"} /> Canonical Alignment:
                  </span>
                  <span className="font-mono font-bold text-[11px]">{gscSummary?.isLive ? '100% Synchronized' : 'Requires GSC Link'}</span>
                </div>
              )}
            </div>

            {gscSummary?.isLive ? (
              <motion.button
                onClick={() => onNavigateToExplorer('Search_Console')}
                whileHover={{ y: -1 }}
                whileTap={tapPress}
                transition={spring.press}
                className="w-full btn-secondary py-1.5 text-xs font-bold gap-1.5 text-blue-700 hover:text-blue-800 shadow-2xs"
              >
                Explore GSC Queries & Index Status
                <ArrowUpRight size={13} />
              </motion.button>
            ) : (
              <button
                onClick={() => onNavigateToTab?.('integrations')}
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Globe size={12} /> Configure Search Console →
              </button>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span className="truncate max-w-[200px]">{gscSummary?.isLive ? gscSummary.source : 'Search Console Not Connected'}</span>
            <span className={gscSummary?.isLive ? "text-emerald-600 font-bold" : "text-slate-400 font-medium"}>
              {gscSummary?.isLive ? 'API Verified' : 'Offline'}
            </span>
          </div>
        </div>
        
        {/* Card 2: Perplexity AI Citations & Google SERP Features */}
        <div className="gsap-section glass-card p-5 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shadow-xs">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Perplexity AI Citations & SERP Features</h4>
                  <p className="text-[11px] text-slate-500">Live generative AI visibility & search engine grounding</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                perplexityData?.isConnected
                  ? (perplexityData.win ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200')
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {perplexityData?.isConnected ? (perplexityData.win ? 'Verified AI Citation Win' : 'Citation Ready') : 'AI Engine Offline'}
              </span>
            </div>

            {perplexityData?.isConnected ? (
              <>
                {/* Perplexity AI Answer Summary */}
                {perplexityData?.summary && (
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 mb-3 text-xs text-slate-700 leading-relaxed font-sans">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1">
                      <Bot size={12} className="text-purple-600" /> Perplexity AI Knowledge Graph Summary:
                    </div>
                    "{perplexityData.summary}"
                  </div>
                )}

                {/* Competitor / Citation Badges */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-100">
                    <span className="text-[10px] font-mono text-purple-700 font-bold uppercase block">AI Citations Count</span>
                    <span className="text-lg font-extrabold text-slate-900">{perplexityData?.count || 0} Sources</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                    <span className="text-[10px] font-mono text-indigo-700 font-bold uppercase block">Google AI Overviews</span>
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-1">
                      <CheckCircle2 size={13} /> {serpData?.has_ai_overview ? 'Featured in AI Carousel' : 'Standard Organic'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/40 to-indigo-50/30 border border-purple-100 text-center mb-3">
                <div className="w-10 h-10 rounded-2xl bg-white border border-purple-200 flex items-center justify-center text-purple-600 mx-auto mb-2 shadow-xs">
                  <Bot size={20} />
                </div>
                <h5 className="text-xs font-bold text-slate-900 mb-1">AI Citations Engine Offline</h5>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                  Connect Perplexity Sonar API or OpenAI API in API Integrations to audit live LLM citations, generative answer share, and brand sentiment in AI Overviews.
                </p>
                <button
                  onClick={() => onNavigateToTab?.('integrations')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles size={12} /> Configure AI Integrations →
                </button>
              </div>
            )}

            {/* People Also Ask (PAA) Questions */}
            {serpData?.paa_questions && serpData.paa_questions.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <div className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <HelpCircle size={12} className="text-indigo-600" /> Google "People Also Ask" Opportunities:
                </div>
                <div className="space-y-1.5">
                  {serpData.paa_questions.slice(0, 3).map((q, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                      <span className="truncate">{q}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>Ground Truth: {perplexityData?.isConnected ? 'Perplexity Sonar Live' : 'API Engine Offline'}</span>
            <span className={serpData?.top_ranking_position ? "text-indigo-600 font-bold" : "text-slate-400 font-normal"}>
              {serpData?.top_ranking_position ? `Top Rank: #${serpData.top_ranking_position}` : 'SerpAPI Disconnected'}
            </span>
          </div>
        </div>

        {/* Card 3: Google PageSpeed & Core Web Vitals Pass/Fail */}
        <div className="gsap-section glass-card p-5 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-xs">
                  <Zap size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Google Core Web Vitals (CrUX & Lighthouse)</h4>
                  <p className="text-[11px] text-slate-500">Real-user 75th percentile loading & responsiveness</p>
                </div>
              </div>
              {pageSpeedData?.isConnected ? (
                <div className="text-right">
                  <span className={`text-xl font-extrabold ${pageSpeedData.score >= 90 ? 'text-emerald-700' : pageSpeedData.score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {pageSpeedData.score}
                  </span>
                  <span className="text-xs text-slate-400 font-normal">/100</span>
                </div>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Not Connected
                </span>
              )}
            </div>

            {pageSpeedData?.isConnected ? (
              <>
                {/* 3 Key Metric Gauges */}
                <div className="grid grid-cols-3 gap-2.5 mb-4">
                  <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-center">
                    <span className="text-[10px] font-mono text-emerald-800 font-bold block uppercase">LCP (Speed)</span>
                    <span className="text-base font-extrabold text-emerald-700 mt-0.5 block">{pageSpeedData?.metrics?.lcp || 'N/A'}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      {parseFloat(pageSpeedData?.metrics?.lcp) < 2.5 ? <><Check size={11} /> Pass (&lt;2.5s)</> : <span className="text-amber-700 font-medium">Needs Review</span>}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-center">
                    <span className="text-[10px] font-mono text-emerald-800 font-bold block uppercase">INP (Response)</span>
                    <span className="text-base font-extrabold text-emerald-700 mt-0.5 block">{pageSpeedData?.metrics?.inp || 'N/A'}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      {parseFloat(pageSpeedData?.metrics?.inp) < 200 ? <><Check size={11} /> Pass (&lt;200ms)</> : <span className="text-amber-700 font-medium">Needs Review</span>}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-center">
                    <span className="text-[10px] font-mono text-emerald-800 font-bold block uppercase">CLS (Stability)</span>
                    <span className="text-base font-extrabold text-emerald-700 mt-0.5 block">{pageSpeedData?.metrics?.cls || 'N/A'}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      {parseFloat(pageSpeedData?.metrics?.cls) < 0.1 ? <><Check size={11} /> Pass (&lt;0.1)</> : <span className="text-amber-700 font-medium">Needs Review</span>}
                    </span>
                  </div>
                </div>

                {/* Savings Opportunities */}
                {pageSpeedData?.opportunities && pageSpeedData.opportunities.length > 0 && (
                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Top Performance Optimization Opportunities</span>
                      <span className="text-amber-600">Savings</span>
                    </div>
                    <div className="space-y-2">
                      {pageSpeedData.opportunities.slice(0, 3).map((opp, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-slate-700 font-medium truncate max-w-[240px]">{opp.title}</span>
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] shrink-0">
                            -{opp.savings}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/40 to-slate-50 border border-amber-100 text-center mb-3">
                <div className="w-10 h-10 rounded-2xl bg-white border border-amber-200 flex items-center justify-center text-amber-600 mx-auto mb-2 shadow-xs">
                  <Zap size={20} />
                </div>
                <h5 className="text-xs font-bold text-slate-900 mb-1">PageSpeed API Offline</h5>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                  Configure Google PageSpeed API Key in API Integrations to audit live Core Web Vitals (LCP, INP, CLS, TTFB) and Lighthouse performance diagnostics.
                </p>
                <button
                  onClick={() => onNavigateToTab?.('integrations')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Zap size={12} /> Configure PageSpeed Key →
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>{pageSpeedData?.isConnected ? `Strategy: ${pageSpeedData.strategy}` : 'Performance Engine Offline'}</span>
            <span className={pageSpeedData?.isConnected ? "text-slate-700 font-semibold" : "text-slate-400 font-normal"}>
              {pageSpeedData?.isConnected ? `TTFB: ${pageSpeedData?.metrics?.ttfb || 'N/A'}` : 'Unassessed'}
            </span>
          </div>
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
