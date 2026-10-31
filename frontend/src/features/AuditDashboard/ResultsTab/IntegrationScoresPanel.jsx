'use client';

import React from 'react';
import { Gauge, Search, BarChart3, ListOrdered, Bot, MapPin, ShieldCheck } from 'lucide-react';
import { useCrawlSummary } from '@/context/CrawlSummaryContext';

/**
 * One card per integration with its own score/metrics from the backend scoring engine.
 * Integration data never affects Site Health; each card only shows what that integration measured.
 */
const STATUS = {
  ok: { label: 'Measured', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60' },
  insufficient: { label: 'Not enough data', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60' },
  unconfirmed: { label: 'Match unconfirmed', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60' },
  no_data: { label: 'Not connected', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
};

const fmt = (v, suffix = '') => (v === null || v === undefined || v === '' ? '—' : `${typeof v === 'number' ? v.toLocaleString() : v}${suffix}`);

function cwvLine(cwv) {
  if (!cwv) return 'No real-user (CrUX) data for these URLs';
  // ok is true / false, or null when Google has no visitor data for that metric (not a failure).
  const part = (label, ok, value) => (ok == null ? `${label} no data` : `${label} ${value ?? '—'} ${ok ? '✓' : '✗'}`);
  return [
    part('LCP', cwv.lcp_good, cwv.lcp_ms != null ? `${(cwv.lcp_ms / 1000).toFixed(1)}s` : null),
    part('INP', cwv.inp_good, cwv.inp_ms != null ? `${cwv.inp_ms}ms` : null),
    part('CLS', cwv.cls_good, cwv.cls),
  ].join(' · ');
}

function buildCards(integrations, aiCrawlers) {
  const ps = integrations.pagespeed || {};
  const gsc = integrations.search_console || {};
  const ga = integrations.google_analytics || {};
  const serp = integrations.serp || {};
  const ai = integrations.ai_visibility || {};
  const gbp = integrations.google_business || {};
  const crawlerCard = {
    id: 'ai_crawlers', title: 'AI crawler access', source: 'robots.txt (from this crawl)', icon: ShieldCheck,
    status: aiCrawlers?.status === 'ok' ? 'ok' : 'no_data',
    headline: aiCrawlers?.status === 'ok' ? (aiCrawlers.search_bots_allowed ? 'Search bots allowed' : 'Search bots blocked') : '—',
    headlineLabel: 'ChatGPT, Claude & Perplexity search crawlers',
    lines: aiCrawlers?.status === 'ok' ? [
      aiCrawlers.training_bots_blocked?.length
        ? `Training crawlers blocked: ${aiCrawlers.training_bots_blocked.join(', ')}`
        : 'No AI training crawlers blocked',
      `llms.txt: ${aiCrawlers.llms_txt?.present ? 'present' : 'not found'} (informational)`,
    ] : [],
    reason: aiCrawlers?.status === 'ok' ? 'Informational: blocking AI training is a policy choice, not an error.' : 'Run a whole-site audit to check robots.txt.',
    noConnect: true,
  };
  return [
    crawlerCard,
    {
      id: 'pagespeed', title: 'Core Web Vitals', source: 'PageSpeed Insights', icon: Gauge, status: ps.status,
      headline: ps.core_web_vitals
        ? (ps.core_web_vitals.passed === true ? 'Passed' : ps.core_web_vitals.passed === false ? 'Failed' : 'Not enough data')
        : fmt(ps.lab_score_mobile, '/100'),
      headlineLabel: ps.core_web_vitals ? 'Field assessment (p75)' : 'Lighthouse lab score (mobile)',
      lines: ps.status === 'ok' ? [
        cwvLine(ps.core_web_vitals),
        `Lab score: mobile ${fmt(ps.lab_score_mobile)} · desktop ${fmt(ps.lab_score_desktop)} (${ps.measured_pages} page${ps.measured_pages === 1 ? '' : 's'} measured)`,
      ] : [],
      reason: ps.reason,
    },
    {
      id: 'search_console', title: 'Search visibility', source: 'Search Console', icon: Search, status: gsc.status,
      headline: gsc.indexed_pct != null ? `${gsc.indexed_pct}%` : fmt(gsc.property_totals?.clicks ?? gsc.crawled_url_clicks),
      headlineLabel: gsc.indexed_pct != null ? 'Inspected URLs indexed' : 'Clicks (last 30 days)',
      lines: gsc.status === 'ok' ? [
        gsc.property_totals
          ? `Property: ${fmt(gsc.property_totals.clicks)} clicks · ${fmt(gsc.property_totals.impressions)} impressions · CTR ${fmt(gsc.property_totals.avg_ctr)} · avg position ${fmt(gsc.property_totals.avg_position)}`
          : `Crawled URLs: ${fmt(gsc.crawled_url_clicks)} clicks · ${fmt(gsc.crawled_url_impressions)} impressions`,
        gsc.ctr_vs_benchmark != null
          ? `CTR vs position benchmark: ${gsc.ctr_vs_benchmark}× (${gsc.ctr_rows} URLs with 100+ impressions)`
          : gsc.ctr_reason,
        gsc.indexed_pct == null ? gsc.indexed_reason : `${gsc.inspected_urls} URLs inspected`,
      ].filter(Boolean) : [],
      reason: gsc.reason,
    },
    {
      id: 'google_analytics', title: 'Traffic & engagement', source: 'Google Analytics 4', icon: BarChart3, status: ga.status,
      headline: fmt(ga.engagement_rate), headlineLabel: 'Engagement rate (30 days)',
      lines: ga.status && ga.status !== 'no_data' ? [
        `${fmt(ga.sessions_30d)} sessions · organic ${fmt(ga.organic_sessions_30d)}${ga.organic_share_pct != null ? ` (${ga.organic_share_pct}%)` : ''}`,
        ga.avg_engagement_time ? `Average engagement time ${ga.avg_engagement_time}` : null,
      ].filter(Boolean) : [],
      reason: ga.reason,
    },
    {
      id: 'serpapi', title: 'Keyword rankings', icon: ListOrdered, status: serp.status,
      source: serp.position_source === 'google_live' ? 'Google (live) + Search Console' : 'Search Console + Gemini',
      headline: serp.score != null ? `${serp.score}/100` : '—',
      headlineLabel: `Visibility across ${serp.tracked_keywords || 0} non-branded searches`,
      lines: serp.status && serp.status !== 'no_data' ? [
        serp.positioned_items ? `Top 3: ${fmt(serp.top3)} · top 10: ${fmt(serp.top10)} of ${fmt(serp.positioned_items)}` : 'No Google positions (connect Search Console)',
        serp.ai_questions ? `AI answers: Gemini cites you in ${serp.ai_cited_questions} of ${serp.ai_questions} questions` : null,
        serp.aio_shown ? `AI Overviews: cited in ${serp.aio_cited} of ${serp.aio_shown}` : null,
      ].filter(Boolean) : [],
      reason: serp.reason,
      opensTab: 'keywords',
      actionLabel: 'Open Keywords & AI answers',
    },
    {
      id: 'perplexity', title: 'AI answer visibility',
      source: ai.engine === 'gemini_google_search' ? 'Gemini with Google Search' : ai.engine === 'google_ai_overview' ? 'Google AI Overviews' : 'Perplexity / AI engines',
      icon: Bot, status: ai.status,
      headline: ai.score != null ? `${ai.score}%` : ai.cited === true ? 'Cited' : ai.cited === false ? 'Not cited' : '—',
      headlineLabel: ai.engine === 'gemini_google_search'
        ? `Cited in ${fmt(ai.ai_cited_questions)} of ${fmt(ai.ai_questions)} questions (3 runs each)`
        : ai.engine === 'google_ai_overview'
          ? `Cited in ${fmt(ai.aio_cited)} of ${fmt(ai.aio_shown)} AI Overviews`
          : 'Branded test query (1 prompt)',
      lines: ai.engine === 'gemini_google_search' && ai.ai_mentioned_questions != null
        ? [`Mentioned by name in ${ai.ai_mentioned_questions} of ${ai.ai_questions}`] : [],
      reason: ai.reason,
      opensTab: 'keywords',
      actionLabel: 'Open Keywords & AI answers',
    },
    {
      id: 'google_business', title: 'Local presence', source: 'Google Business Profile', icon: MapPin, status: gbp.status,
      headline: gbp.rating ? `★ ${gbp.rating}` : '—', headlineLabel: 'Google rating',
      lines: gbp.reviews != null ? [`${fmt(gbp.reviews)} reviews`] : [],
      reason: gbp.reason,
    },
  ];
}

export default function IntegrationScoresPanel({ onConnect, onOpenTab }) {
  const summary = useCrawlSummary();
  if (!summary?.integrations) return null;
  const allCards = buildCards(summary.integrations, summary.crawl?.ai_crawlers);
  // Sources without data collapse into one "connect more" row instead of a wall of empty cards.
  const cards = allCards.filter(c => c.status !== 'no_data' || c.noConnect);
  const unconnected = allCards.filter(c => c.status === 'no_data' && !c.noConnect);

  return (
    <section aria-labelledby="integration-scores-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="integration-scores-heading" className="text-base font-black text-slate-900 dark:text-white">Integration insights</h2>
        <p className="text-xs text-slate-600 dark:text-slate-300">Each source is scored on its own. Only page speed also counts toward the headline score.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map(card => {
          const st = STATUS[card.status] || STATUS.no_data;
          const Icon = card.icon;
          return (
            <article key={card.id} className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{card.title}</h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{card.source}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
              </div>
              {card.status !== 'no_data' && (
                <div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">{card.headline}</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">{card.headlineLabel}</div>
                </div>
              )}
              {card.lines.map((line, i) => (
                <p key={i} className="text-xs text-slate-700 dark:text-slate-300">{line}</p>
              ))}
              {card.reason && <p className="text-xs text-slate-600 dark:text-slate-400 italic">{card.reason}</p>}
              {card.opensTab && card.status !== 'no_data' && onOpenTab && (
                <button
                  type="button"
                  onClick={() => onOpenTab(card.opensTab)}
                  className="mt-auto self-start rounded-full border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                >
                  {card.actionLabel}
                </button>
              )}
              {card.status === 'no_data' && onConnect && !card.noConnect && (
                <button
                  type="button"
                  onClick={() => onConnect(card.id)}
                  className="mt-auto self-start rounded-full border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                >
                  Connect {card.source}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {unconnected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-4 py-3">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 mr-1">Connect more data (optional):</span>
          {unconnected.map(card => (
            <button
              key={card.id}
              type="button"
              onClick={() => (card.opensTab && onOpenTab ? onOpenTab(card.opensTab) : onConnect?.(card.id))}
              disabled={!onConnect && !onOpenTab}
              title={card.reason || undefined}
              className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:cursor-default"
            >
              {card.title} <span className="text-slate-500 dark:text-slate-400">({card.source})</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
