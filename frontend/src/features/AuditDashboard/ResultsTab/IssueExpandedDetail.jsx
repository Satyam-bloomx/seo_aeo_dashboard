'use client';
import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
  Info,
  Sparkles,
  Layers,
  CheckCircle2,
  TrendingUp,
  XCircle,
  Loader2,
  RefreshCw,
  ListTree
} from 'lucide-react';
import { applyAiDiagnosis } from '@/utils/IssuesEngine';
import { isDuplicateRule, buildDuplicateClusters } from '@/utils/duplicateDetector';

export function getPageEvidence(page, ruleName = '') {
  if (!page) return null;
  const rn = (ruleName || '').toLowerCase();

  // 1. Same as H1
  if (rn.includes('same as h1')) {
    return {
      type: 'same_as_h1',
      items: [
        { label: 'Page Title (<title>)', value: page.title_1 || '(None)', note: (page.title_1_length || page.title_1?.length || 0) + ' chars' },
        { label: 'Main Heading (<h1>)', value: page.h1_1 || '(None)', note: (page.h1_1_length || page.h1_1?.length || 0) + ' chars' },
      ],
      warning: 'Title and H1 use identical text'
    };
  }

  // 2. Title length issues
  if (rn.includes('title') && (rn.includes('60') || rn.includes('over') || rn.includes('short') || rn.includes('30') || rn.includes('below') || rn.includes('pixel'))) {
    const len = page.title_1_length || page.title_1?.length || 0;
    const isOver = len > 60;
    return {
      type: 'title_length',
      items: [
        { 
          label: 'Current Title (<title>)', 
          value: page.title_1 || '(Empty)', 
          note: isOver ? len + ' chars (' + (len - 60) + ' chars over 60 recommended)' : len + ' chars (Under 30 chars)' 
        },
      ]
    };
  }

  // 3. Title Missing
  if (rn.includes('title') && rn.includes('missing')) {
    return {
      type: 'missing_title',
      items: [
        { label: 'Title Tag', value: 'No <title> tag found in HTML head', isError: true }
      ]
    };
  }

  // 4. Meta description missing
  if (rn.includes('meta description') && rn.includes('missing')) {
    return {
      type: 'missing_meta_desc',
      items: [
        { label: 'Meta Description', value: 'No <meta name="description"> tag found on page', isError: true }
      ]
    };
  }

  // 5. Meta description length
  if (rn.includes('meta description') && (rn.includes('155') || rn.includes('160') || rn.includes('over') || rn.includes('below') || rn.includes('70') || rn.includes('short'))) {
    const len = page.meta_desc_1_length || page.meta_desc_1?.length || 0;
    const isOver = len > 160;
    return {
      type: 'meta_desc_length',
      items: [
        { 
          label: 'Current Meta Description', 
          value: page.meta_desc_1 || '(Empty)', 
          note: isOver ? len + ' chars (' + (len - 160) + ' chars over 160 recommended)' : len + ' chars (Below 70 chars)' 
        }
      ]
    };
  }

  // 6. H1 Missing or Multiple
  if (rn.includes('h1')) {
    if (rn.includes('missing')) {
      return {
        type: 'missing_h1',
        items: [
          { label: 'Main Heading (<h1>)', value: 'No <h1> heading tag found in page HTML', isError: true }
        ]
      };
    }
    if (rn.includes('multiple')) {
      return {
        type: 'multiple_h1',
        items: [
          { label: 'Primary <h1>', value: page.h1_1 || '(None)' },
          { label: 'Secondary <h1>', value: page.h1_2 || '(None)' }
        ],
        warning: 'Multiple <h1> tags confuse search hierarchy'
      };
    }
    if (rn.includes('70') || rn.includes('over')) {
      const len = page.h1_1_length || page.h1_1?.length || 0;
      return {
        type: 'h1_length',
        items: [
          { label: 'Current <h1> Heading', value: page.h1_1 || '(Empty)', note: len + ' chars (Over 70 limit)' }
        ]
      };
    }
  }

  // 7. Broken / Status codes
  if (page.status_code && page.status_code >= 400) {
    return {
      type: 'http_error',
      items: [
        { label: 'HTTP Status Code', value: page.status_code + ' ' + (page.status_name || 'Client/Server Error'), isError: true }
      ]
    };
  }

  // 8. Redirects (3xx)
  if (page.status_code && page.status_code >= 300 && page.status_code < 400) {
    return {
      type: 'redirect',
      items: [
        { label: 'HTTP Status', value: page.status_code + ' Redirect' },
        { label: 'Redirects To', value: page.audit_data?.Response_Codes?.Redirect_URL || page.redirect_url || 'Target redirect location' }
      ]
    };
  }

  // 9. Word count / Thin content
  if (rn.includes('low content') || rn.includes('word count') || rn.includes('thin')) {
    return {
      type: 'word_count',
      items: [
        { label: 'Page Word Count', value: (page.word_count || 0) + ' words', note: 'Minimum recommended: 300+ words' }
      ]
    };
  }

  // 10. Canonical tag
  if (rn.includes('canonical')) {
    return {
      type: 'canonical',
      items: [
        { label: 'Canonical URL (<link rel="canonical">)', value: page.canonical_link_element_1 || 'No canonical tag found' }
      ]
    };
  }

  // Fallback
  if (page.title_1 || page.h1_1) {
    return {
      type: 'overview',
      items: [
        { label: 'Title Tag', value: page.title_1 || '(None)' },
        { label: 'Primary <h1>', value: page.h1_1 || '(None)' }
      ]
    };
  }

  return null;
}

export default function IssueExpandedDetail({
  issue,
  pages = [],
  aiDiagnoses = {},
  aiLoading = {},
  fetchAiDiagnosis,
  setAiModalIssue,
  onIssueClick,
  onSelectPage,
  copiedUrl,
  handleCopy
}) {
  const issueKey = issue.ruleName || issue.name;
  const aiData = aiDiagnoses[issueKey];
  const isAiLoading = Boolean(aiLoading[issueKey]);
  const isAiEnriched = Boolean(aiData?.is_live_ai);
  const displayIssue = aiData ? applyAiDiagnosis(issue, aiData) : issue;
  const affectedList = issue.affected_pages || [];

  return (
    <div className="space-y-4 text-left">
      {/* Top AI Remediation & Dynamic Synthesis Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-slate-950 dark:via-indigo-950/80 dark:to-slate-950 p-3.5 sm:p-4 rounded-2xl border border-indigo-800/40 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-white">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-amber-400 shrink-0">
            {isAiLoading ? (
              <Loader2 size={16} className="animate-spin text-indigo-400" />
            ) : (
              <Sparkles size={16} />
            )}
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
              <span>{isAiEnriched ? 'AI-Tailored Diagnostic Intelligence' : 'Automated Diagnostic Guidance'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
                isAiEnriched
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-indigo-500/30 text-indigo-300 border-indigo-400/30'
              }`}>
                {isAiLoading ? 'Synthesizing...' : isAiEnriched ? (aiData.powered_by || 'Live AI Engine') : 'Standard Baseline'}
              </span>
            </h5>
            <p className="text-[11px] text-slate-300 mt-0.5">
              {isAiEnriched
                ? 'Diagnosis, traffic impact, and before/after fixes are customized specifically for this domain and page markup.'
                : 'Synthesize production-ready markup, meta tags, and H1 restructuring directly for this error.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap w-full sm:w-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fetchAiDiagnosis(issue, true);
            }}
            disabled={isAiLoading}
            className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            title="Generate fresh live AI diagnosis for this issue"
          >
            <RefreshCw size={12} className={isAiLoading ? 'animate-spin text-indigo-400' : ''} />
            <span>{isAiEnriched ? 'Regenerate' : 'Analyze AI'}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAiModalIssue(issue);
            }}
            className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0 cursor-pointer"
          >
            <Sparkles size={13} className="text-amber-300" />
            <span>AI Fix Assistant</span>
          </button>
        </div>
      </div>

      {/* Human-Friendly 3-Pillar Diagnostic Analysis Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* 1. What's Happening */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs mb-1.5">
              <Info size={15} className="shrink-0 text-indigo-500" />
              <span>What’s Happening</span>
              <span className="text-[10px] font-normal text-slate-400">· Plain English</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
              {displayIssue.rootCause || 'Detected during automated DOM inspection against W3C and SEO standards.'}
            </p>
          </div>
        </div>

        {/* 2. Why It Matters For Rankings */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-amber-200/70 dark:border-amber-900/30 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs mb-1.5">
              <TrendingUp size={15} className="shrink-0 text-amber-500" />
              <span>Why It Matters</span>
              <span className="text-[10px] font-normal text-slate-400">· Traffic & AI Impact</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
              {displayIssue.impact || 'Causes crawl inefficiencies, diluted search relevancy, or snippet rendering errors.'}
            </p>
          </div>
        </div>

        {/* 3. Step-by-Step Fix Guide */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-200/70 dark:border-emerald-900/30 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs mb-1.5">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
              <span>How to Fix This</span>
              <span className="text-[10px] font-normal text-slate-400">· Action Steps</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans whitespace-pre-line">
              {displayIssue.fixGuide || 'Review template code and update HTML structures according to webmaster guidelines.'}
            </p>
          </div>
        </div>
      </div>

      {/* Best Practice Fix & Real-World Example Showcase */}
      {(displayIssue.exampleBefore || displayIssue.exampleAfter || displayIssue.tip) && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/70 text-slate-100 p-4 rounded-xl border border-indigo-500/25 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-500/20">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-400/10 text-amber-300 flex items-center justify-center shrink-0 border border-amber-400/20">
                <Lightbulb size={13} />
              </div>
              <h6 className="text-xs font-bold text-white tracking-wide">
                Best Practice Fix & Real-World Example
              </h6>
            </div>
            {displayIssue.tip && (
              <span className="text-[10px] font-medium text-indigo-300 bg-indigo-900/50 px-2.5 py-0.5 rounded-full border border-indigo-700/40 w-fit">
                💡 Pro Strategy Included
              </span>
            )}
          </div>

          {(displayIssue.exampleBefore || displayIssue.exampleAfter) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
              {displayIssue.exampleBefore && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-rose-400 font-semibold text-[11px]">
                    <XCircle size={13} />
                    <span>What to Avoid (The Issue)</span>
                  </div>
                  <div className="p-2 rounded bg-black/50 border border-rose-900/30 text-[11px] font-mono text-slate-300 break-words leading-relaxed select-all">
                    {displayIssue.exampleBefore}
                  </div>
                </div>
              )}

              {displayIssue.exampleAfter && (
                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 size={13} />
                    <span>Recommended Fix (Best Practice)</span>
                  </div>
                  <div className="p-2 rounded bg-black/50 border border-emerald-900/30 text-[11px] font-mono text-emerald-200 break-words leading-relaxed select-all">
                    {displayIssue.exampleAfter}
                  </div>
                </div>
              )}
            </div>
          )}

          {displayIssue.tip && (
            <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-800/30 flex items-start gap-2 text-[11px] text-slate-300 leading-relaxed">
              <span className="font-bold text-indigo-300 shrink-0">💡 Strategy Tip:</span>
              <span>{displayIssue.tip}</span>
            </div>
          )}
        </div>
      )}

      {/* Affected URLs or Duplicate Clusters View */}
      {(() => {
        const isDup = isDuplicateRule(issue.ruleName || issue.name);
        if (isDup) {
          const duplicateClusters = buildDuplicateClusters(affectedList, issue.ruleName || issue.name, pages);
          return (
            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/40 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Layers size={13} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase font-mono tracking-wider flex items-center gap-2">
                      <span>Duplicate URL Clusters & Counterpart Links</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                        {duplicateClusters.length} {duplicateClusters.length === 1 ? 'Cluster' : 'Clusters'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Grouped by shared duplicate element. Primary/Main URL is paired with its duplicate page links.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onIssueClick({
                    category: issue.category,
                    name: issue.ruleName || issue.name
                  })}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
                >
                  Open All in URL Grid <ExternalLink size={11} />
                </button>
              </div>

              {/* Clusters List */}
              <div className="space-y-3.5 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                {duplicateClusters.map((cluster, cIdx) => {
                  const main = cluster.mainPage;
                  const dups = cluster.duplicates || [];

                  return (
                    <div
                      key={cluster.clusterKey || cIdx}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 p-3 sm:p-3.5 space-y-3 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      {/* Cluster Header with Shared Value */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                            Cluster #{cIdx + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title={cluster.sharedValue}>
                            <strong className="text-slate-900 dark:text-white font-mono text-[11px]">{cluster.categoryLabel}:</strong> "{cluster.sharedValue}"
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                          {cluster.totalCount} URLs in cluster
                        </span>
                      </div>

                      {/* Main / Primary URL Card */}
                      {main && (
                        <div className="rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
                                MAIN / PRIMARY URL
                              </span>
                              {main.canonical_link_element_1 && (
                                <span className="text-[9px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold" title={main.canonical_link_element_1}>
                                  {main.canonical_link_element_1 === main.url ? '(Self-Canonical)' : '(Has Canonical)'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white dark:bg-slate-900 text-emerald-700 border border-emerald-200 dark:border-emerald-800">
                                {main.status_code || 200}
                              </span>
                              {main.word_count && (
                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                  {main.word_count} words
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 flex items-center gap-1.5">
                              <a
                                href={main.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                                title="Open live URL in browser"
                              >
                                {main.url}
                              </a>
                              <a
                                href={main.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                                title="Open live website link"
                              >
                                <ExternalLink size={12} />
                              </a>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {onSelectPage && (
                                <button
                                  type="button"
                                  onClick={() => onSelectPage(main)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                  title="Inspect telemetry in dashboard drawer"
                                >
                                  Inspect
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => handleCopy(main.url, e)}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                                title="Copy URL"
                              >
                                {copiedUrl === main.url ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Duplicate Instances List */}
                      <div className="space-y-2 pl-3 border-l-2 border-amber-300 dark:border-amber-700/60 ml-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-400 font-bold block">
                          ↳ Duplicate Page Link{dups.length > 1 ? 's' : ''} ({dups.length}):
                        </span>

                        {dups.map((dup, dIdx) => (
                          <div
                            key={dup.url || dIdx}
                            className="rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 p-2.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  <AlertTriangle size={10} className="text-amber-600" />
                                  DUPLICATE OF MAIN
                                </span>
                                {dup.canonical_link_element_1 && dup.canonical_link_element_1 !== dup.url && (
                                  <span className="text-[9px] font-mono text-slate-500 truncate max-w-xs" title={`Canonical: ${dup.canonical_link_element_1}`}>
                                    → Canonical: {dup.canonical_link_element_1}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {dup.status_code || 200}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                                <a
                                  href={dup.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline truncate"
                                  title="Open duplicate live link"
                                >
                                  {dup.url}
                                </a>
                                <a
                                  href={dup.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0"
                                  title="Open live website link"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {onSelectPage && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectPage(dup)}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                    title="Inspect telemetry in dashboard drawer"
                                  >
                                    Inspect
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => handleCopy(dup.url, e)}
                                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                                  title="Copy Duplicate URL"
                                >
                                  {copiedUrl === dup.url ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // Standard non-duplicate Affected URLs List
        return (
          <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <ListTree size={14} className="text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase font-mono tracking-wider">
                  Affected URLs ({affectedList.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onIssueClick({
                  category: issue.category,
                  name: issue.ruleName || issue.name
                })}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                Open All in URL Grid <ExternalLink size={11} />
              </button>
            </div>

            {affectedList.length > 0 ? (
              <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg">
                {affectedList.slice(0, 50).map((page, pIdx) => {
                  const isCopied = copiedUrl === page.url;
                  const evidence = getPageEvidence(page, issue.ruleName || issue.name);
                  return (
                    <div key={page.id || page.url || pIdx} className="px-3 py-2.5 sm:px-3.5 sm:py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors space-y-2">
                      <div className="flex items-center justify-between text-xs gap-3">
                        <div className="flex items-center gap-2 truncate max-w-xl min-w-0">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                            (page.status_code || 200) >= 400
                              ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                              : (page.status_code || 200) >= 300
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
                          }`}>
                            {page.status_code || 200}
                          </span>
                          <span className="font-mono text-slate-800 dark:text-slate-200 font-medium truncate" title={page.url}>
                            {page.url}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
                            title="Open URL in browser"
                          >
                            <ExternalLink size={12} />
                          </a>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(page.url, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                            title="Copy URL"
                          >
                            {isCopied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>

                      {/* Live Diagnostic Evidence on this URL */}
                      {evidence && evidence.items && evidence.items.length > 0 && (
                        <div className="p-2 sm:p-2.5 rounded-lg bg-slate-100/90 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800/80 text-[11px] space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">Live On-Page Snapshot</span>
                            {evidence.warning && (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                ⚠️ {evidence.warning}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {evidence.items.map((it, idx) => (
                              <div key={idx} className="p-1.5 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200/50 dark:border-slate-800/60 flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{it.label}</span>
                                  {it.note && <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-medium">{it.note}</span>}
                                </div>
                                <div className={`text-xs font-mono truncate select-all ${it.isError ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-800 dark:text-slate-200'}`} title={it.value}>
                                  {it.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {affectedList.length > 50 && (
                  <div className="p-2 text-center text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-950">
                    + {affectedList.length - 50} more affected URLs. Click "Open All in URL Grid" to inspect full list.
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">No specific URL records loaded.</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
