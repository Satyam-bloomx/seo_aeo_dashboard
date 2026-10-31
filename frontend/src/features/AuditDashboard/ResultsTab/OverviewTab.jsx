'use client';
import React, { useMemo, useRef, useState } from 'react';
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
  AlertCircle,
  Info
} from 'lucide-react';
import { generateIssuesReport } from '@/utils/IssuesEngine';
import { calculateTechnicalSeoScore } from '@/utils/technicalSeoScore';
import TechnicalScoreModal from '../TechnicalScoreModal';
import { gscIndexState } from '@/utils/gscStatus';
import { useCrawlSummary } from '@/context/CrawlSummaryContext';
import TopFixesCard from './TopFixesCard';
import IntegrationScoresPanel from './IntegrationScoresPanel';


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
      border: 'border-emerald-200 dark:border-emerald-500/25 hover:border-emerald-300 dark:hover:border-emerald-500/40',
      bg: 'from-white to-emerald-50/40 dark:from-slate-900/95 dark:to-emerald-950/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/80'
    },
    indigo: {
      border: 'border-indigo-200 dark:border-indigo-500/25 hover:border-indigo-300 dark:hover:border-indigo-500/40',
      bg: 'from-white to-indigo-50/40 dark:from-slate-900/95 dark:to-indigo-950/30',
      text: 'text-indigo-700 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/80'
    },
    purple: {
      border: 'border-purple-200 dark:border-purple-500/25 hover:border-purple-300 dark:hover:border-purple-500/40',
      bg: 'from-white to-purple-50/40 dark:from-slate-900/95 dark:to-purple-950/30',
      text: 'text-purple-700 dark:text-purple-400',
      iconBg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/80'
    },
    rose: {
      border: 'border-rose-200 dark:border-rose-500/25 hover:border-rose-300 dark:hover:border-rose-500/40',
      bg: 'from-white to-rose-50/40 dark:from-slate-900/95 dark:to-rose-950/30',
      text: 'text-rose-700 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/80'
    }
  };

  const t = themes[colorTheme] || themes.emerald;

  return (
    <animated.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform: to(props.xys, transTilt) }}
      className={`gsap-metric-card spotlight-card p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br ${t.bg} border ${t.border} shadow-xs hover:shadow-xl transition-shadow duration-300 relative overflow-hidden will-change-transform flex flex-col justify-between`}
    >
      <div className="flex justify-between items-start mb-2.5 sm:mb-3 relative z-10">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`text-[10px] font-mono font-bold ${t.text} uppercase tracking-widest`}>{title || subtitle}</p>
            {subtitle && subtitle !== title && (
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-400 font-medium">· {subtitle}</span>
            )}
          </div>
          {score !== null && score !== undefined && !isDisconnected ? (
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mt-0.5 sm:mt-1 tabular-nums">
              <AnimatedNumber value={score} />
              <span className="text-sm sm:text-base text-slate-400 font-normal">/100</span>
            </h3>
          ) : (
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-400 dark:text-slate-400 mt-0.5 sm:mt-1 tabular-nums flex items-baseline gap-1">
              <span>--</span>
              <span className="text-sm sm:text-base text-slate-400 dark:text-slate-400 font-normal">/100</span>
            </h3>
          )}
        </div>
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl ${t.iconBg} border flex items-center justify-center shadow-xs shrink-0`}>
          <Icon size={18} className="sm:w-5 sm:h-5" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 text-xs text-slate-700 dark:text-slate-300 font-semibold pt-2 border-t border-slate-200/60 dark:border-slate-800/80 relative z-10">
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
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline underline-offset-2 shrink-0 cursor-pointer ml-1"
          >
            {actionText}
          </button>
        )}
      </div>
    </animated.div>
  );
}

// Integration panels for the overview, derived from crawled pages and connected integrations.
function computeAeoData(pages, integrationsStatus) {
  const geminiInt = integrationsStatus?.find(i => i.id === 'gemini' && i.connected);
  const openaiInt = integrationsStatus?.find(i => i.id === 'openai' && i.connected);
  const pplxInt = integrationsStatus?.find(i => i.id === 'perplexity' && i.connected);
  const hasAiIntegration = Boolean(geminiInt || openaiInt || pplxInt);

  if (pages && pages.length > 0) {
    for (const p of pages) {
      const aeo = p.audit_data?.AEO_Audit;
      if (aeo?.is_ai_connected && typeof aeo.aeo_score === 'number') {
        return {
          isConnected: true,
          score: aeo.aeo_score,
          status: aeo.Gemini_Live_Status || aeo.Perplexity_Citation_Status || aeo.OpenAI_Live_Status || 'Gemini 3 Flash Verified'
        };
      }
      if (aeo?.Gemini_Synthesis_Score && !aeo.Gemini_Synthesis_Score.includes('test')) {
        const parsed = parseInt(aeo.Gemini_Synthesis_Score, 10);
        if (!isNaN(parsed)) {
          return {
            isConnected: true,
            score: parsed,
            status: aeo.Gemini_Live_Status || 'Google Gemini 3 Flash Synthesized'
          };
        }
      }
    }
  }

  if (hasAiIntegration) {
    const model = geminiInt?.selected_model || 'gemini-3.5-flash';
    return {
      isConnected: true,
      score: null,
      status: `Google Gemini (${model}) connected: run a new audit to collect data`
    };
  }

  return {
    isConnected: false,
    score: null,
    status: 'AI Engine Not Connected'
  };
}

function computeGeoData(pages, integrationsStatus) {
  const serpInt = integrationsStatus?.find(i => i.id === 'serpapi' && i.connected);
  const gbpInt = integrationsStatus?.find(i => i.id === 'google_business' && i.connected);
  const hasGeoIntegration = Boolean(serpInt || gbpInt);

  if (pages && pages.length > 0) {
    for (const p of pages) {
      const geo = p.audit_data?.GEO_Audit;
      if (geo?.is_geo_connected) {
        return {
          isConnected: true,
          score: typeof geo.geo_score === 'number' ? geo.geo_score : null,
          status: geo.Geo_Targeted_Rank || 'Local search data collected',
          hasLocalSchema: geo.has_local_schema || false
        };
      }
    }

    const hasLocalSchema = pages.some(p => {
      const sd = p.audit_data?.Structured_Data;
      return sd && (sd['Local Business Schema'] || p.audit_data?.GEO_Audit?.has_local_schema);
    });

    if (hasGeoIntegration) {
      return {
        isConnected: true,
        score: null,
        status: 'Connected: run a new audit to collect data',
        hasLocalSchema: hasLocalSchema
      };
    }

    if (hasLocalSchema) {
      return {
        isConnected: false,
        score: null,
        status: 'On-Page Local Schema (Rank Disconnected)',
        hasLocalSchema: true
      };
    }
  }

  if (hasGeoIntegration) {
    return {
      isConnected: true,
      score: null,
      status: 'Connected: run a new audit to collect data',
      hasLocalSchema: false
    };
  }

  return {
    isConnected: false,
    score: null,
    status: 'Requires GBP / SerpAPI',
    hasLocalSchema: false
  };
}

function computePerplexityData(pages, integrationsStatus) {
  const geminiInt = integrationsStatus?.find(i => i.id === 'gemini' && i.connected);
  const openaiInt = integrationsStatus?.find(i => i.id === 'openai' && i.connected);
  const pplxInt = integrationsStatus?.find(i => i.id === 'perplexity' && i.connected);
  const hasAiIntegration = Boolean(geminiInt || openaiInt || pplxInt);

  if (pages && pages.length > 0) {
    for (const p of pages) {
      const aeo = p.audit_data?.AEO_Audit;
      if (aeo?.is_ai_connected || aeo?.Gemini_Key_Takeaway || aeo?.Gemini_Live_Status) {
        return {
          isConnected: true,
          status: aeo.Gemini_Live_Status || aeo.Perplexity_Citation_Status || aeo.OpenAI_Live_Status || 'AI data collected',
          win: aeo.Perplexity_Citation_Win === true,
          count: aeo.Perplexity_Citations_Count || (aeo.Perplexity_Citations || []).length,
          citations: aeo.Perplexity_Citations || [],
          competitors: aeo.Perplexity_Competitor_Sources || [],
          summary: aeo.Gemini_Key_Takeaway || aeo.Perplexity_AI_Summary || null,
          liveStatus: aeo.Gemini_Live_Status || null,
          score: aeo.Gemini_Synthesis_Score || (typeof aeo.aeo_score === 'number' ? `${aeo.aeo_score}/100` : null),
          intent: aeo.Gemini_Search_Intent || null
        };
      }
    }
  }

  if (hasAiIntegration) {
    const model = geminiInt?.selected_model || 'gemini-3.5-flash';
    return {
      isConnected: true,
      status: `Google Gemini (${model}) connected: run a new audit to collect data`,
      win: false,
      count: 0,
      citations: [],
      competitors: [],
      summary: null,
      liveStatus: null,
      score: null,
      intent: null
    };
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
}

function computeSerpData(pages, integrationsStatus) {
  const serpInt = integrationsStatus?.find(i => i.id === 'serpapi' && i.connected);
  if (pages && pages.length > 0) {
    for (const p of pages) {
      const sd = p.audit_data?.SERP_Data;
      if (sd && (sd.is_live_verified || (sd.paa_questions && sd.paa_questions.length > 0))) {
        return {
          ...sd,
          top_ranking_position: sd.top_ranking_position ?? null,
          has_ai_overview: sd.has_ai_overview === true,
          paa_questions: sd.paa_questions || []
        };
      }
    }
  }

  if (serpInt) {
    // Connected but no SERP data collected yet: report nothing rather than a guess.
    return {
      is_live_verified: false,
      awaiting_data: true,
      has_ai_overview: false,
      ai_overview_cited: false,
      featured_snippet_present: false,
      paa_questions: [],
      top_ranking_position: null,
      local_pack_present: false
    };
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
}

// The settings this crawl actually ran with, so results can be read against them.
function CrawlSettingsLine({ settings }) {
  if (!settings) return null;
  const rules = Array.isArray(settings.exclude_paths) ? settings.exclude_paths.length : (settings.exclude_paths ? String(settings.exclude_paths).split('\n').filter(Boolean).length : 0);
  const parts = [
    settings.max_pages != null && `up to ${settings.max_pages} pages`,
    settings.max_depth != null && `depth ${settings.max_depth}`,
    rules > 0 && `${rules} exclusion rule${rules === 1 ? '' : 's'}`,
    settings.js_rendering && 'JavaScript rendering on',
    settings.ignore_robots && 'robots.txt ignored',
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="-mt-2 text-[11px] text-slate-500 dark:text-slate-400">Crawl settings used: {parts.join(' · ')}</p>;
}

// Pages the crawler could not check for reasons that are not the site's fault (kept out of the score),
// and sites whose bot protection blocked the crawler, with what to do about it.
function FetchProblemsNotice({ crawl, onShowFailed }) {
  const nc = crawl?.not_counted || {};
  const notCounted = (nc.ours || 0) + (nc.unknown || 0) + (nc.blocked || 0);
  const blocked = crawl?.blocked;
  if (!notCounted && !blocked?.count) return null;
  return (
    <div role="status" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-white/[0.03] px-4 py-3 text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
      {notCounted > 0 && (
        <p>
          <span className="font-bold">{notCounted} page{notCounted === 1 ? '' : 's'} could not be checked</span>
          {' '}because of a problem on our side or a network issue, after 2 retries. They are <strong>not counted in the score</strong>.
          {onShowFailed && (
            <button type="button" onClick={onShowFailed} className="ml-1.5 font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">See which pages</button>
          )}
        </p>
      )}
      {blocked?.count > 0 && (
        <div>
          <p>
            <span className="font-bold">This site blocks automated crawlers ({blocked.provider || 'bot protection'})</span>
            {' '}on {blocked.count} page{blocked.count === 1 ? '' : 's'}. To audit it fully, ask the site owner to allow AuditPro:
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-600 dark:text-slate-300">
            <li>Cloudflare: Security → WAF → Custom rules → create a rule &quot;User Agent contains AuditPro&quot; with action <em>Skip</em> (or allow our server IP under Security → WAF → Tools → IP Access Rules).</li>
            <li>Other firewalls: allowlist the user-agent <code className="font-mono">{blocked.user_agent || 'AuditProBot'}</code> and our server&apos;s IP address.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// What the crawl covered, and why any URLs it found were not crawled. Silent when nothing was left out.
function CrawlCoverageNotice({ coverage }) {
  if (!coverage) return null;
  const reasons = [
    coverage.not_crawled_page_limit > 0 && `${coverage.not_crawled_page_limit} beyond the ${coverage.max_pages}-page limit`,
    coverage.not_crawled_depth_limit > 0 && `${coverage.not_crawled_depth_limit} deeper than depth ${coverage.max_depth}`,
    coverage.excluded_by_rules > 0 && `${coverage.excluded_by_rules} excluded by your URL rules`,
    coverage.outside_start_folder > 0 && `${coverage.outside_start_folder} outside the start folder ${coverage.start_folder || ''}`.trim(),
  ].filter(Boolean);
  const capped = coverage.pages_over_link_limit > 0;
  if (reasons.length === 0 && !capped) return null;
  const skipped = (coverage.not_crawled_page_limit || 0) + (coverage.not_crawled_depth_limit || 0) + (coverage.excluded_by_rules || 0)
    + (coverage.outside_start_folder || 0);
  return (
    <div role="status" className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
      <p className="font-bold">
        Crawled {coverage.crawled} URLs{skipped > 0 && <>; found {skipped} more that were not crawled</>}.
      </p>
      {reasons.length > 0 && <p className="mt-0.5">Not crawled: {reasons.join(', ')}. Raise the limits in Crawler Settings to include them.</p>}
      {capped && (
        <p className="mt-0.5">
          {coverage.pages_over_link_limit} page{coverage.pages_over_link_limit === 1 ? '' : 's'} had more than {coverage.link_limit_per_page} links; only the first {coverage.link_limit_per_page} on each were followed.
        </p>
      )}
    </div>
  );
}

// Why the headline score is what it is: each row is points taken off (or added), from the backend.
function ScoreExplanation({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return (
    <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-4 py-2.5 text-xs">
      <summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-200">How the headline score is calculated</summary>
      <ul className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <li key={`${r.label}-${i}`} className="flex items-start justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{r.label}</span>{r.detail ? <span className="text-slate-500 dark:text-slate-400"> · {r.detail}</span> : null}
            </span>
            <span className={`shrink-0 font-mono font-bold ${Number(r.impact) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {Number(r.impact) > 0 ? '+' : ''}{Math.round(Number(r.impact) * 10) / 10}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function OverviewTab({ pages, integrationsStatus = [], onNavigateToExplorer, onNavigateToTab }) {
  const containerRef = useRef(null);
  const reduced = useReducedMotion();
  const [showTechScoreModal, setShowTechScoreModal] = useState(false);

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

  const crawlSummary = useCrawlSummary();
  const keywordCard = crawlSummary?.integrations?.serp;
  const issuesReport = useMemo(() => generateIssuesReport(pages, crawlSummary), [pages, crawlSummary]);

  const highPriorityIssues = useMemo(() => issuesReport.filter(i => i.priority === 'High'), [issuesReport]);
  const mediumPriorityIssues = useMemo(() => issuesReport.filter(i => i.priority === 'Medium'), [issuesReport]);
  const lowPriorityIssues = useMemo(() => issuesReport.filter(i => i.priority === 'Low'), [issuesReport]);

  const criticalIssues = highPriorityIssues;
  const warningIssues = mediumPriorityIssues;

  const stats = useMemo(() => {
    if (!pages || pages.length === 0) return { total: 0, status200: 0, status400: 0, status300: 0, indexable: 0 };

    let s200 = 0, s400 = 0, s300 = 0, indexable = 0;
    pages.forEach(p => {
      const code = p.status_code ?? 0;
      if (code >= 200 && code < 300) s200++;
      else if (code >= 300 && code < 400) s300++;
      else if (code >= 400) s400++;
      
      const isCanonSelf = !p.canonical_link_element_1 || p.canonical_link_element_1 === p.url;
      const isIndexable = p.indexability === 'Indexable' || (!p.indexability && code === 200 && isCanonSelf);
      if (isIndexable) indexable++;
    });

    return {
      total: pages.length,
      status200: s200,
      status300: s300,
      status400: s400,
      indexable: indexable
    };
  }, [pages]);

  // Site Health and category scores come from the backend scoring engine (single source of truth).
  const technicalSeoResult = useMemo(() => {
    return calculateTechnicalSeoScore(pages, issuesReport, crawlSummary);
  }, [pages, issuesReport, crawlSummary]);

  const healthScore = pages?.length > 0 ? technicalSeoResult.siteHealthScore : null;
  const seoScore = technicalSeoResult.weightedPassRate ?? null;
  const isPageMode = crawlSummary?.mode === 'page';
  const answerReadiness = crawlSummary?.integrations?.answer_readiness;
  const structuredScore = crawlSummary?.categories?.['Structured data']?.score ?? null;
  const pagesWithSchema = (pages || []).filter(p => (p.audit_data?.Structured_Data?.Schema_Types || []).length > 0).length;

  // 3. AEO (Answer Engine Optimization) - checks crawled pages & active AI integration
  const aeoData = useMemo(() => computeAeoData(pages, integrationsStatus), [pages, integrationsStatus]);

  // 4. GEO Local Search - checks crawled pages & SerpAPI / Google Business integration
  const geoData = useMemo(() => computeGeoData(pages, integrationsStatus), [pages, integrationsStatus]);

  const perplexityData = useMemo(() => computePerplexityData(pages, integrationsStatus), [pages, integrationsStatus]);

  const serpData = useMemo(() => computeSerpData(pages, integrationsStatus), [pages, integrationsStatus]);

  const pageSpeedData = useMemo(() => {
    const psInt = integrationsStatus?.find(i => (i.id === 'google_pagespeed' || i.id === 'pagespeed') && i.connected);

    if (pages && pages.length > 0) {
      // The measured page (PageSpeed runs on a few top pages, not always the first row), mobile first:
      // Google ranks on mobile, and the Speed tab shows mobile by default.
      const measured = pages.find(p => p.audit_data?.PageSpeed?.mobile || p.audit_data?.PageSpeed?.desktop || p.audit_data?.seo_audit?.pagespeed) || pages[0];
      const p0 = measured?.audit_data || {};
      const seoPs = p0.seo_audit?.pagespeed;
      const realDesktop = seoPs?.desktop?.status === 'success' ? seoPs.desktop : null;
      const realMobile = seoPs?.mobile?.status === 'success' ? seoPs.mobile : null;
      const activeReal = realMobile || realDesktop;
      const ps = p0.PageSpeed?.mobile || p0.PageSpeed?.desktop;
      const measuredUrl = measured?.url || null;

      if (activeReal && activeReal.performance_score !== undefined) {
        const opps = (activeReal.opportunities || []).map(o => ({
          title: o.title,
          savings: o.savingsMs ? `${(o.savingsMs / 1000).toFixed(2)} s` : (o.savings || null)
        }));
        return {
          isConnected: true,
          measuredUrl,
          score: activeReal.performance_score,
          strategy: realMobile ? 'Mobile' : 'Desktop',
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
          measuredUrl,
          score: ps.performance_score,
          strategy: p0.PageSpeed?.mobile ? 'Mobile' : 'Desktop',
          metrics: ps.metrics || { lcp: 'N/A', cls: 'N/A', inp: 'N/A', ttfb: 'N/A' },
          opportunities: ps.opportunities || []
        };
      }
    }

    if (psInt) {
      // Key connected but this crawl has no measurements yet.
      return {
        isConnected: true,
        score: null,
        strategy: 'N/A',
        awaitingData: true,
        metrics: { lcp: 'N/A', cls: 'N/A', inp: 'N/A', fcp: 'N/A', tbt: 'N/A', ttfb: 'N/A' },
        opportunities: []
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
  }, [pages, integrationsStatus]);

  const getCategoryMetricBadge = (catId) => {
    if (!pages || pages.length === 0) return { label: '0 Active', color: 'slate' };
    switch (catId) {
      case 'Response_Codes': {
        const okCount = pages.filter(p => (p.status_code ?? 0) >= 200 && (p.status_code ?? 0) < 300).length;
        return { label: `${okCount}/${pages.length} 200 OK`, color: okCount === pages.length ? 'emerald' : 'amber' };
      }
      case 'Page_Titles': {
        const present = pages.filter(p => p.title_1 && p.title_1.trim().length > 0).length;
        return { label: `${present}/${pages.length} Present`, color: present === pages.length ? 'emerald' : 'amber' };
      }
      case 'Meta_Description': {
        const present = pages.filter(p => {
          const desc = p.meta_desc_1 || p.meta_description_1 || p.audit_data?.Meta_Description?.['Meta Description 1'];
          return desc && String(desc).trim().length > 0;
        }).length;
        return { label: `${present}/${pages.length} Present`, color: present > 0 ? 'emerald' : 'amber' };
      }
      case 'H1': {
        const h1Count = pages.filter(p => p.h1_1 && p.h1_1.trim().length > 0).length;
        return { label: `${h1Count}/${pages.length} Unique H1`, color: h1Count === pages.length ? 'emerald' : 'amber' };
      }
      case 'H2': {
        const h2Count = pages.filter(p => p.h2_1 && p.h2_1.trim().length > 0).length;
        return { label: `${h2Count}/${pages.length} Structured`, color: h2Count > 0 ? 'emerald' : 'blue' };
      }
      case 'Canonicals': {
        const canonCount = pages.filter(p => p.canonical_link_element_1 || p.audit_data?.Canonicals?.['Contains Canonical']).length;
        return { label: `${canonCount}/${pages.length} Declared`, color: canonCount === pages.length ? 'emerald' : 'amber' };
      }
      case 'Directives': {
        const noindexCount = pages.filter(p => p.audit_data?.Directives?.NoIndex === true).length;
        return noindexCount > 0
          ? { label: `${noindexCount} Noindex`, color: 'amber' }
          : { label: 'All Indexable', color: 'emerald' };
      }
      case 'Structured_Data': {
        const withSchema = pages.filter(p => (p.audit_data?.Structured_Data?.Schema_Types || []).length > 0).length;
        return { label: `${withSchema}/${pages.length} With Schema`, color: withSchema > 0 ? 'purple' : 'amber' };
      }
      case 'AEO_Audit': {
        return { label: aeoData.isConnected ? 'AI Connected' : 'AI Standby', color: aeoData.isConnected ? 'purple' : 'slate' };
      }
      case 'GEO_Audit': {
        return { label: geoData.isConnected ? 'Local SERP' : 'Local Standby', color: geoData.isConnected ? 'emerald' : 'slate' };
      }
      case 'PageSpeed': {
        const hasScore = typeof pageSpeedData.score === 'number';
        return { label: hasScore ? `${pageSpeedData.score}/100 Lab` : (pageSpeedData.isConnected ? 'Not measured' : 'Vitals Standby'), color: hasScore ? (pageSpeedData.score >= 50 ? 'emerald' : 'amber') : 'slate' };
      }
      case 'Images': {
        const totalImgs = pages.reduce((acc, p) => acc + (p.audit_data?.Images?.Total_Images ?? p.audit_data?.Images?.['Total Images'] ?? 0), 0);
        return { label: `${totalImgs} Assets`, color: 'blue' };
      }
      default:
        return { label: `${pages.length} URLs`, color: 'slate' };
    }
  };

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

      const indexState = gscIndexState(gsc);
      if (indexState === 'indexed') indexedCount++;
      else if (indexState === 'not_indexed') excludedCount++;

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

  const ga4Summary = useMemo(() => {
    if (!pages || pages.length === 0) return null;
    let totalSessions = 0;
    let zombieCount = 0;
    let isLive = false;

    pages.forEach(p => {
      const ga4 = p.audit_data?.Google_Analytics;
      if (!ga4) return;
      if (ga4.Live_GA4_Stream === 'Connected & Active') isLive = true;
      const sessions = parseInt(String(ga4.Sessions_30d || '0').replace(/,/g, ''), 10) || 0;
      totalSessions += sessions;
      if (ga4.Is_Zombie_Page) zombieCount++;
    });

    return {
      totalSessions,
      zombieCount,
      isLive
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
    <div ref={containerRef} className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-1 sm:pr-2 space-y-5 sm:space-y-6 pb-20 md:pb-6">

      {/* Top Header */}
      <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Audit overview</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            How your site does on Google, in AI answers, and in local search.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 rounded-xl shadow-xs self-start sm:self-auto shrink-0">
          <span>Engine Status:</span>
          {pages?.length > 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="live-dot w-2 h-2 rounded-full bg-emerald-500 text-emerald-500/60"></span> Live Analyzed
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span> Ready to Audit
            </span>
          )}
        </div>
      </div>

      {!isPageMode && <CrawlSettingsLine settings={crawlSummary?.crawl?.settings} />}
      {!isPageMode && <CrawlCoverageNotice coverage={crawlSummary?.crawl?.coverage} />}
      <FetchProblemsNotice crawl={crawlSummary?.crawl} onShowFailed={() => onNavigateToExplorer?.('Response_Codes', 'Could not check')} />

      {crawlSummary && (
        <TopFixesCard
          issues={issuesReport}
          speed={pageSpeedData?.score != null ? pageSpeedData : null}
          siteLabel={pages?.[0]?.url ? new URL(pages[0].url).hostname : ''}
          onOpenSpeed={() => onNavigateToTab?.('performance')}
          onOpenIssue={(issue) => {
            const view = String(issue?.name || '').split(':').slice(1).join(':').trim();
            if (issue?.category) onNavigateToExplorer?.(issue.category, view || 'All');
            else onNavigateToTab?.('issues');
          }}
        />
      )}

      {/* 4 Score Bento Cards with React Spring 3D Tilt & Aceternity Spotlight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">

        {/* Health Index */}
        <SpringTiltBentoCard
          title={isPageMode ? "Page Score" : "Site Health"}
          subtitle={isPageMode ? "Single-page audit" : "Overall: page checks, broken pages and speed"}
          score={isPageMode ? technicalSeoResult.pageScore : healthScore}
          statusText={
            !crawlSummary ? (pages?.length > 0 ? 'Calculating scores…' : 'Awaiting Audit URL')
              : isPageMode ? 'Site-level checks need a whole-site crawl'
              : `${technicalSeoResult.checksSummary.errorFreePages} URLs without critical errors (${technicalSeoResult.checksSummary.errorFreeRatio ?? "—"}%)`
          }
          icon={Activity}
          colorTheme="emerald"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

        {/* Technical SEO */}
        <SpringTiltBentoCard
          title="Checks Passed"
          subtitle="Share of checks passed (serious problems count more)"
          score={seoScore}
          statusText={crawlSummary ? `${technicalSeoResult.checksSummary?.totalEvaluated ?? 0} of ${technicalSeoResult.checksSummary?.totalChecks ?? 0} checks evaluated` : (pages?.length > 0 ? 'Calculating scores…' : 'Awaiting Audit URL')}
          actionText={crawlSummary ? "Score breakdown →" : undefined}
          onAction={() => setShowTechScoreModal(true)}
          icon={Globe}
          colorTheme="indigo"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

        {/* Answer readiness: share of answer-engine criteria met on AI-assessed pages */}
        <SpringTiltBentoCard
          title="Answer Readiness"
          subtitle="Can ChatGPT, Google AI and Perplexity quote you?"
          score={answerReadiness?.score ?? null}
          isDisconnected={answerReadiness?.status !== 'ok'}
          statusText={answerReadiness?.status === 'ok'
            ? `${answerReadiness.pages_assessed} page${answerReadiness.pages_assessed === 1 ? '' : 's'} assessed`
            : 'Needs an AI provider'}
          actionText={answerReadiness?.status !== 'ok' ? "Connect AI provider →" : undefined}
          onAction={() => onNavigateToTab?.('integrations')}
          icon={Sparkles}
          colorTheme="purple"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

        {/* Structured data category score (crawl-based) */}
        <SpringTiltBentoCard
          title="Structured Data"
          subtitle="Schema presence & validity"
          score={structuredScore}
          isDisconnected={false}
          statusText={crawlSummary ? `${pagesWithSchema} of ${pages?.length || 0} URLs have schema` : (pages?.length > 0 ? 'Calculating scores…' : 'Awaiting Audit URL')}
          actionText={crawlSummary ? 'View pages →' : undefined}
          onAction={() => onNavigateToExplorer?.('Structured_Data')}
          icon={ShieldCheck}
          colorTheme="rose"
          onMouseMoveCard={handleMouseMoveSpotlight}
        />

      </div>

      <ScoreExplanation rows={crawlSummary?.crawl?.score_explanation || crawlSummary?.score_explanation} />

      <IntegrationScoresPanel onConnect={() => onNavigateToTab?.('integrations')} onOpenTab={(tab) => onNavigateToTab?.(tab)} />

      {/* Crawl Telemetry & Diagnostic Health Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* URL Crawl Breakdown */}
        <div className="gsap-section glass-card p-5 lg:col-span-1 flex flex-col justify-between rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <PieChart size={16} className="text-indigo-600 dark:text-indigo-400" /> Crawl Response Distribution
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">HTTP Status Codes across {stats.total} crawled URLs</p>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono font-semibold mb-1">
                  <span className="text-emerald-700 dark:text-emerald-400">2xx Success ({stats.status200})</span>
                  <span className="text-slate-600 dark:text-slate-300">{stats.total > 0 ? Math.round((stats.status200/stats.total)*100) : 100}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
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
                  <span className="text-indigo-700 dark:text-indigo-400">3xx Redirects ({stats.status300})</span>
                  <span className="text-slate-600 dark:text-slate-300">{stats.total > 0 ? Math.round((stats.status300/stats.total)*100) : 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
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
                  <span className="text-rose-700 dark:text-rose-400">4xx / 5xx Client Errors ({stats.status400})</span>
                  <span className="text-slate-600 dark:text-slate-300">{stats.total > 0 ? Math.round((stats.status400/stats.total)*100) : 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
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
        <div className="gsap-section glass-card p-5 lg:col-span-2 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">What we checked</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Click a check to see the pages behind it</p>
            </div>
            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60 px-2.5 py-1 rounded-full font-bold">
              32 Parameters Active
            </span>
          </div>

          <motion.div
            variants={staggerContainer(0.03, 0.1)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
          >
            {CORE_AUDIT_CATEGORIES.map(cat => {
              const badge = getCategoryMetricBadge(cat.id);
              return (
                <motion.button
                  key={cat.id}
                  variants={staggerItem}
                  onClick={() => onNavigateToExplorer(cat.id)}
                  whileHover={{ y: -3 }}
                  whileTap={tapPress}
                  initial="rest"
                  animate="rest"
                  transition={spring.press}
                  className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-xs text-left transition-colors group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-2 transition-colors">
                    <div className="flex items-center gap-1.5">
                      {cat.icon}
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                        badge.color === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/80' :
                        badge.color === 'purple' ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/80' :
                        badge.color === 'amber' ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/80' :
                        badge.color === 'blue' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}>
                        {badge.label}
                      </span>
                    </div>
                    <motion.span
                      variants={{ rest: { opacity: 0, x: -3, y: 3 }, hover: { opacity: 1, x: 0, y: 0 } }}
                      transition={tween(duration.micro, ease.outQuart)}
                      className="flex"
                    >
                      <ArrowUpRight size={12} />
                    </motion.span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white truncate">
                    {cat.label}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        </div>

      </div>

      {/* Real-World Search Engine, AI Search & Core Web Vitals Intelligence Suite */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        
        {/* Card 1: Google Search Console Performance & Indexation */}
        <div className="gsap-section glass-card p-5 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
                  <Globe size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Google Intelligence</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">GSC search rank & GA4 user analytics</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                gscSummary?.isLive || ga4Summary?.isLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
              }`}>
                {gscSummary?.isLive || ga4Summary?.isLive ? 'Live Sync' : 'Not Connected'}
              </span>
            </div>

            {/* 3 KPI metric gauges */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3">
              <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-center">
                <span className="text-[8px] xs:text-[10px] sm:text-[10px] font-mono text-blue-800 dark:text-blue-300 font-bold block uppercase truncate">Clicks (30d)</span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block truncate">
                  {gscSummary?.isLive ? gscSummary.totalClicks.toLocaleString() : '0'}
                </span>
                <span className="text-[8px] xs:text-[10px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate block">{gscSummary?.isLive ? 'Organic' : 'Offline'}</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-center">
                <span className="text-[8px] xs:text-[10px] sm:text-[10px] font-mono text-indigo-800 dark:text-indigo-300 font-bold block uppercase truncate">Impressions</span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block truncate">
                  {gscSummary?.isLive ? gscSummary.totalImpressions.toLocaleString() : '0'}
                </span>
                <span className="text-[8px] xs:text-[10px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate block">{gscSummary?.isLive ? 'SERP Views' : 'Offline'}</span>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 text-center">
                <span className="text-[8px] xs:text-[10px] sm:text-[10px] font-mono text-purple-800 dark:text-purple-300 font-bold block uppercase truncate">GA4 Sessions</span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 block truncate">
                  {ga4Summary?.totalSessions ? ga4Summary.totalSessions.toLocaleString() : (gscSummary?.isLive ? `${gscSummary?.avgCtr || '0.0'}%` : '0')}
                </span>
                <span className="text-[8px] xs:text-[10px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate block">
                  {ga4Summary?.totalSessions ? 'Visitors' : 'CTR'}
                </span>
              </div>
            </div>

            {/* Coverage & Canonical Matrix */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Google Index State:</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] border ${
                  gscSummary?.isLive ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60' : 'text-slate-500 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                }`}>
                  {gscSummary?.isLive ? `${gscSummary.indexedCount} Indexed / ${gscSummary.excludedCount} Excluded` : 'Not Connected'}
                </span>
              </div>
              {gscSummary?.isLive && gscSummary?.canonicalMismatches > 0 ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-medium flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" /> Canonical Mismatches:
                  </span>
                  <span className="font-mono font-bold px-2 py-0.5 rounded text-[11px] bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-800">
                    {gscSummary.canonicalMismatches} URLs
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={13} className={gscSummary?.isLive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"} /> Canonical Alignment:
                  </span>
                  <span className="font-mono font-bold text-[11px]">{gscSummary?.isLive ? (gscSummary.canonicalMismatches > 0 ? `${gscSummary.canonicalMismatches} mismatch(es)` : 'No mismatches found') : 'Requires GSC Link'}</span>
                </div>
              )}
            </div>

            {gscSummary?.isLive || ga4Summary?.isLive ? (
              <div className="flex flex-col gap-1.5">
                <motion.button
                  onClick={() => onNavigateToTab?.('integrations')}
                  whileHover={{ y: -1 }}
                  whileTap={tapPress}
                  transition={spring.press}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-bold gap-1.5 inline-flex items-center justify-center shadow-xs cursor-pointer"
                >
                  <Globe size={13} />
                  Open Live Integrations Workspace
                  <ArrowUpRight size={13} />
                </motion.button>
                <button
                  onClick={() => onNavigateToExplorer('Search_Console')}
                  className="w-full text-center py-1 text-[11px] font-mono text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer"
                >
                  View URL Explorer Grid →
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigateToTab?.('integrations')}
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Globe size={12} /> Configure Google Accounts →
              </button>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span className="truncate max-w-[200px]">{gscSummary?.isLive ? gscSummary.source : 'Google APIs Disconnected'}</span>
            <span className={gscSummary?.isLive || ga4Summary?.isLive ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-slate-400 font-medium"}>
              {gscSummary?.isLive || ga4Summary?.isLive ? 'API Verified' : 'Offline'}
            </span>
          </div>
        </div>
        
        {/* Card 2: Perplexity AI Citations & Google SERP Features */}
        <div className="gsap-section glass-card p-5 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900/50 flex items-center justify-center text-purple-700 dark:text-purple-300 shadow-xs">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">AI Engine Citations & SERP Features</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Live Gemini / Perplexity generative visibility & AEO citations</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                perplexityData?.isConnected
                  ? (perplexityData.win ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60' : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60')
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60'
              }`}>
                {perplexityData?.isConnected ? (perplexityData.win ? 'Verified AI Citation Win' : 'AEO Verified') : 'AI Engine Offline'}
              </span>
            </div>

            {perplexityData?.isConnected ? (
              <>
                {/* AI Answer Summary */}
                {perplexityData?.summary && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 mb-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      <Bot size={12} className="text-purple-600 dark:text-purple-400" /> {perplexityData.liveStatus?.includes('Gemini') ? 'Google Gemini Synthesis & Grounding:' : 'Perplexity / LLM AI Knowledge Graph Summary:'}
                    </div>
                    &quot;{perplexityData.summary}&quot;
                    {perplexityData.intent && (
                      <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 text-[10px] font-mono text-purple-700 dark:text-purple-300">
                        <span className="font-bold uppercase">Detected Intent:</span> {perplexityData.intent}
                      </div>
                    )}
                  </div>
                )}

                {/* Competitor / Citation Badges */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
                    <span className="text-[10px] font-mono text-purple-700 dark:text-purple-300 font-bold uppercase block">AI Citations / Sources</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">{perplexityData?.count || 0} Sources</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                    <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 font-bold uppercase block">Google AI Overviews</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-1">
                      {keywordCard?.aio_shown
                        ? <><CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" /> Cited in {keywordCard.aio_cited} of {keywordCard.aio_shown}</>
                        : keywordCard?.status && keywordCard.status !== 'no_data' ? 'None shown for your searches' : 'Not checked yet'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/40 to-indigo-50/30 dark:from-purple-950/30 dark:to-indigo-950/20 border border-purple-100 dark:border-purple-900/40 text-center mb-3">
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400 mx-auto mb-2 shadow-xs">
                  <Bot size={20} />
                </div>
                <h5 className="text-xs font-bold text-slate-900 dark:text-white mb-1">AI Citations Engine Offline</h5>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                  Connect Google Gemini API, Perplexity Sonar API, or OpenAI API in API Integrations to audit live LLM citations, generative answer share, and brand sentiment in AI Overviews.
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
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <HelpCircle size={12} className="text-indigo-600 dark:text-indigo-400" /> Google &quot;People Also Ask&quot; Opportunities:
                </div>
                <div className="space-y-1.5">
                  {serpData.paa_questions.slice(0, 3).map((q, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                      <span className="truncate">{q}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>Ground Truth: {perplexityData?.isConnected ? 'Perplexity Sonar Live' : 'API Engine Offline'}</span>
            <button
              type="button"
              onClick={() => onNavigateToTab?.('keywords')}
              className={keywordCard?.top10 != null ? "text-indigo-600 dark:text-indigo-400 font-bold hover:underline" : "text-slate-500 dark:text-slate-400 font-normal hover:underline"}
            >
              {keywordCard?.top10 != null ? `Top 10: ${keywordCard.top10} of ${keywordCard.positioned_items ?? keywordCard.tracked_keywords} searches` : 'Check keywords →'}
            </button>
          </div>
        </div>

        {/* Card 3: Google PageSpeed & Core Web Vitals Pass/Fail */}
        <div className="gsap-section glass-card p-5 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-400 shadow-xs">
                  <Zap size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Page speed (lab test)</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[16rem]" title={pageSpeedData?.measuredUrl || undefined}>
                    Lighthouse {pageSpeedData?.strategy && pageSpeedData.strategy !== 'N/A' ? pageSpeedData.strategy.toLowerCase() : ''} run
                    {pageSpeedData?.measuredUrl ? ` on ${pageSpeedData.measuredUrl.replace(/^https?:\/\//, '')}` : ''}. Real-visitor results are in Integration insights.
                  </p>
                </div>
              </div>
              {pageSpeedData?.isConnected ? (
                <div className="text-right">
                  <span className={`text-xl font-extrabold ${pageSpeedData.score >= 90 ? 'text-emerald-700 dark:text-emerald-400' : pageSpeedData.score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {pageSpeedData.score}
                  </span>
                  <span className="text-xs text-slate-400 font-normal">/100</span>
                </div>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                  Not Connected
                </span>
              )}
            </div>

            {pageSpeedData?.isConnected ? (
              <>
                {/* 3 Key Metric Gauges */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 mb-4">
                  <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-center">
                    <span className="text-[8px] xs:text-[10px] sm:text-[10px] font-mono text-emerald-800 dark:text-emerald-300 font-bold block uppercase truncate">LCP (Speed)</span>
                    <span className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 block truncate">{pageSpeedData?.metrics?.lcp || 'N/A'}</span>
                    <span className="text-[8px] xs:text-[10px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-0.5 mt-0.5 truncate">
                      {parseFloat(pageSpeedData?.metrics?.lcp) < 2.5 ? <><Check size={10} /> Pass</> : <span className="text-amber-700 dark:text-amber-400 font-medium">Review</span>}
                    </span>
                  </div>

                  <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-center">
                    <span className="text-[8px] xs:text-[10px] sm:text-[10px] font-mono text-emerald-800 dark:text-emerald-300 font-bold block uppercase truncate">INP (Response)</span>
                    <span className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 block truncate">{pageSpeedData?.metrics?.inp || 'N/A'}</span>
                    <span className="text-[8px] xs:text-[10px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-0.5 mt-0.5 truncate">
                      {parseFloat(pageSpeedData?.metrics?.inp) < 200 ? <><Check size={10} /> Pass</> : <span className="text-amber-700 dark:text-amber-400 font-medium">Review</span>}
                    </span>
                  </div>

                  <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-center">
                    <span className="text-[8px] xs:text-[10px] sm:text-[10px] font-mono text-emerald-800 dark:text-emerald-300 font-bold block uppercase truncate">CLS (Stability)</span>
                    <span className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 block truncate">{pageSpeedData?.metrics?.cls || 'N/A'}</span>
                    <span className="text-[8px] xs:text-[10px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-0.5 mt-0.5 truncate">
                      {parseFloat(pageSpeedData?.metrics?.cls) < 0.1 ? <><Check size={10} /> Pass</> : <span className="text-amber-700 dark:text-amber-400 font-medium">Review</span>}
                    </span>
                  </div>
                </div>

                {/* Savings Opportunities */}
                {pageSpeedData?.opportunities && pageSpeedData.opportunities.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Top Performance Opportunities</span>
                      <span className="text-amber-600 dark:text-amber-400">Savings</span>
                    </div>
                    <div className="space-y-2">
                      {pageSpeedData.opportunities.slice(0, 3).map((opp, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[240px]">{opp.title}</span>
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 px-2 py-0.5 rounded text-[11px] shrink-0">
                            -{opp.savings}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/40 to-slate-50 dark:from-amber-950/30 dark:to-slate-900/60 border border-amber-100 dark:border-amber-900/40 text-center mb-3">
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto mb-2 shadow-xs">
                  <Zap size={20} />
                </div>
                <h5 className="text-xs font-bold text-slate-900 dark:text-white mb-1">PageSpeed API Offline</h5>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
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

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>{pageSpeedData?.isConnected ? `Strategy: ${pageSpeedData.strategy}` : 'Performance Engine Offline'}</span>
            <span className={pageSpeedData?.isConnected ? "text-slate-700 dark:text-slate-300 font-semibold" : "text-slate-400 font-normal"}>
              {pageSpeedData?.isConnected ? `TTFB: ${pageSpeedData?.metrics?.ttfb || 'N/A'}` : 'Unassessed'}
            </span>
          </div>
        </div>

      </div>

      {/* Actionable Findings Radar - 3-Tier Priority Categorization */}
      <div className="gsap-section glass-card p-5 rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-600 dark:text-amber-400" size={18} />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Actionable Findings Radar</h4>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800/80 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              {highPriorityIssues.length} High
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/80 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {mediumPriorityIssues.length} Medium
            </span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800/80 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {lowPriorityIssues.length} Low
            </span>
            <span className="text-slate-400 dark:text-slate-400 font-normal ml-1">
              ({issuesReport.length} total)
            </span>
          </div>
        </div>

        {issuesReport.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tween(duration.panel, ease.outQuart)}
            className="p-8 text-center text-slate-500 dark:text-slate-400"
          >
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.soft}
              className="block"
            >
              <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
            </motion.span>
            <p className="font-bold text-slate-900 dark:text-white">No Priority Issues Detected</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Target website satisfies all core indexability, technical SEO, and content standards.</p>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer(0.05, 0.05)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <AnimatePresence initial={false} mode="popLayout">
            {[...highPriorityIssues, ...mediumPriorityIssues, ...lowPriorityIssues].slice(0, 8).map((issue) => (
              <motion.div
                key={`${issue.category}-${issue.name}`}
                layout={!reduced}
                variants={staggerItem}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={() => onNavigateToExplorer(issue.category, issue.ruleName || issue.name)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                transition={spring.press}
                className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-xs cursor-pointer flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    issue.priority === 'High' 
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800/80' 
                      : issue.priority === 'Medium'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/80'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800/80'
                  }`}>
                    {issue.priority === 'High' ? (
                      <XCircle size={16} />
                    ) : issue.priority === 'Medium' ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <Info size={16} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                        {issue.name}
                      </h5>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border shrink-0 ${
                        issue.priority === 'High'
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800/80'
                          : issue.priority === 'Medium'
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/80'
                          : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800/80'
                      }`}>
                        {issue.priority}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">{issue.category.replace(/_/g, ' ')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-xs">
                    {issue.count} URLs
                  </span>
                  <ChevronRight size={14} className="text-slate-400 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" />
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* 5-Pillar Technical SEO Score Audit Modal */}
      <TechnicalScoreModal
        isOpen={showTechScoreModal}
        onClose={() => setShowTechScoreModal(false)}
        technicalSeoResult={technicalSeoResult}
        totalPages={pages?.length || 0}
        onExploreCategory={(cat) => onNavigateToExplorer?.(cat)}
      />
    </div>
  );
}
