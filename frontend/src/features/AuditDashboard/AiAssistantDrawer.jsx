'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles,
  X,
  Search,
  Download,
  FileText,
  Copy,
  Check,
  Code2,
  Terminal,
  ExternalLink,
  Loader2,
  Zap,
  Globe,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Bot,
  RefreshCw,
  FileCode,
  Gauge,
  CheckCircle2
} from 'lucide-react';
import { getAiPageDeepdive } from '@/api/client';
import { exportAiAuditMarkdown, exportAiAuditPDF, providerName } from '@/utils/aiAuditExport';
import { copyToClipboard } from '@/utils/clipboard';
import { spring, tapPress } from '@/lib/motion';

export default function AiAssistantDrawer({
  isOpen,
  onClose,
  initialUrl = '',
  domain = '',
  pages = []
}) {
  // Single URL Deep Dive State. The URL follows initialUrl (or the first crawled page) when that changes,
  // but stays as the user typed or cleared it otherwise.
  const suggestedUrl = initialUrl || pages?.[0]?.url || '';
  const [deepdiveUrl, setDeepdiveUrl] = useState(suggestedUrl);
  const [syncedUrl, setSyncedUrl] = useState(suggestedUrl);
  if (suggestedUrl !== syncedUrl) {
    setSyncedUrl(suggestedUrl);
    if (suggestedUrl) setDeepdiveUrl(suggestedUrl);
  }
  const [customGoal, setCustomGoal] = useState('');
  const [deepdiveLoading, setDeepdiveLoading] = useState(false);
  const [deepdiveResult, setDeepdiveResult] = useState(null);
  const [showDossier, setShowDossier] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedRewrite, setCopiedRewrite] = useState(null);
  const [exporting, setExporting] = useState(null); // 'pdf' | 'md' | null

  // Run Single Link Deep Dive
  const handleRunDeepDive = async (e) => {
    if (e) e.preventDefault();
    if (!deepdiveUrl || !deepdiveUrl.trim()) {
      toast.error('Please enter or paste a valid website URL.');
      return;
    }

    setDeepdiveLoading(true);
    setDeepdiveResult(null);

    try {
      const activeProjId = typeof window !== 'undefined'
        ? parseInt(localStorage.getItem('active_project_id') || '1', 10)
        : 1;

      const res = await getAiPageDeepdive({
        project_id: activeProjId,
        url: deepdiveUrl.trim(),
        user_query: customGoal.trim() || undefined
      });

      if (res && res.success) {
        setDeepdiveResult(res);
        toast.success(`Deep dive complete for ${res.platform?.name || 'page'}!`);
      } else {
        toast.error('Failed to complete page deep dive. Please verify backend connection.');
      }
    } catch (err) {
      console.error('Deep dive error:', err);
      toast.error('Deep dive inspection failed. Check your API integrations.');
    } finally {
      setDeepdiveLoading(false);
    }
  };

  const handleCopyCode = async (code) => {
    if (!code) return;
    const ok = await copyToClipboard(code, 'Code snippet');
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyAnswer = async (text) => {
    if (!text) return;
    const ok = await copyToClipboard(text, 'AEO Answer Block');
    if (ok) {
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
    }
  };

  const handleCopyRewrite = async (row) => {
    if (!row?.proposed) return;
    const ok = await copyToClipboard(row.proposed, row.label);
    if (ok) {
      setCopiedRewrite(row.element);
      setTimeout(() => setCopiedRewrite(null), 2000);
    }
  };

  const handleExport = async (kind) => {
    if (!deepdiveResult) return;
    const url = deepdiveResult.dossier?.tier1_crawl?.url || deepdiveUrl;
    setExporting(kind);
    try {
      if (kind === 'pdf') await exportAiAuditPDF(deepdiveResult, url);
      else exportAiAuditMarkdown(deepdiveResult, url);
    } catch (err) {
      console.error('AI audit export failed:', err);
      toast.error('Could not create the download. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  // Dialog behaviour: focus moves into the drawer, Escape closes it, focus returns on close.
  const panelRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const data = deepdiveResult?.data || null;
  const platform = deepdiveResult?.platform || null;
  const tier = deepdiveResult?.tier || 4;
  const aiProvider = deepdiveResult?.ai_provider || null;
  // A provider is set up but did not answer (rate limit, outage): different from "no provider connected".
  const aiFailed = Boolean(deepdiveResult && !deepdiveResult.is_live_ai && aiProvider);
  const rewrites = data?.content_rewrites || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
        {/* Backdrop Scrim */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        />

        {/* Drawer Panel */}
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="AI SEO assistant"
          tabIndex={-1}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="relative w-full max-w-2xl sm:max-w-3xl h-full bg-white dark:bg-[#090C12] border-l border-slate-200 dark:border-white/[0.1] shadow-2xl flex flex-col z-10 overflow-hidden"
        >
          {/* Top Bar / Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0D111A]/80 backdrop-blur-md flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-emerald-400 p-[1.5px] shadow-md">
                <div className="w-full h-full rounded-[14px] bg-slate-900 flex items-center justify-center text-white">
                  <Sparkles size={18} className="text-[#CAE366] animate-pulse" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    AI Page Audit
                  </h2>
                  {deepdiveResult && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      {deepdiveResult.tier_badges?.join(' + ') || `Tier ${tier}`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {aiFailed
                    ? <>{aiProvider.label} did not answer this time, so only the page checks are shown</>
                    : aiProvider && deepdiveResult?.is_live_ai
                      ? <>Written by <strong className="text-slate-700 dark:text-slate-300">{aiProvider.label} ({aiProvider.model})</strong>, your connected AI provider</>
                      : 'Scores, issues and ready-to-use copy for one page, written by your connected AI provider'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Close AI audit"
            >
              <X size={18} />
            </button>
          </div>

          {/* Single page audit */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              {/* URL Input Box */}
              <form onSubmit={handleRunDeepDive} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="url"
                      value={deepdiveUrl}
                      onChange={(e) => setDeepdiveUrl(e.target.value)}
                      placeholder="Paste any URL (e.g. https://lifechangingastro.com/collections/child-pregnancy)..."
                      required
                      className="w-full pl-10 pr-20 py-2.5 rounded-xl border border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.04] text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {deepdiveUrl && (
                      <button
                        type="button"
                        onClick={() => setDeepdiveUrl('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <motion.button
                    type="submit"
                    disabled={deepdiveLoading}
                    whileTap={tapPress}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-md hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {deepdiveLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-[#CAE366]" />
                        <span>Auditing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} className="text-[#CAE366]" />
                        <span>Deep Dive Audit</span>
                      </>
                    )}
                  </motion.button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customGoal}
                    onChange={(e) => setCustomGoal(e.target.value)}
                    placeholder="Optional goal / query (e.g. 'Optimize Liquid code' or 'Fix duplicate title')..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-transparent text-[11px] text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                  />
                  {pages && pages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDeepdiveUrl(pages[0].url)}
                      className="px-2 py-1 rounded-md text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    >
                      Use Target Page
                    </button>
                  )}
                </div>
              </form>

              {/* Loading Animation State */}
              {deepdiveLoading && (
                <div className="p-8 rounded-2xl border border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/20 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Loader2 size={24} className="animate-spin text-[#CAE366]" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Auditing the page...
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                    Reading the page, scoring its checks and asking your connected AI provider for fixes and rewritten copy. This usually takes 10-30 seconds.
                  </p>
                </div>
              )}

              {/* Deep Dive Results */}
              {data && !deepdiveLoading && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  {/* Top Score & Verdict Card */}
                  <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-slate-50 to-white dark:from-[#0D111A] dark:to-[#07090E] shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 border border-slate-700 shadow-md">
                          <span className={`text-xl font-black font-mono ${
                            typeof data.composite_score !== 'number' ? 'text-slate-400' :
                            data.composite_score >= 80 ? 'text-emerald-400' :
                            data.composite_score >= 60 ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {typeof data.composite_score === 'number' ? data.composite_score : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Composite Audit Score
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {typeof data.composite_score !== 'number' ? 'Not scored (the page could not be fetched)' :
                               data.composite_score >= 80 ? 'Good' :
                               data.composite_score >= 60 ? 'Needs work' : 'Poor'}
                              {typeof data.composite_score === 'number' && !deepdiveResult.is_live_ai && (
                                <span className="font-medium text-slate-500 dark:text-slate-400"> (page checks only)</span>
                              )}
                            </span>
                            {platform && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                {platform.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {data.search_intent && (
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200/60 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300">
                            Intent: {data.search_intent}
                          </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                          deepdiveResult.is_live_ai
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                          {deepdiveResult.is_live_ai ? `Reviewed by ${providerName(deepdiveResult)}` : deepdiveResult.powered_by}
                        </span>
                        {aiFailed && (
                          <button
                            type="button"
                            onClick={() => handleRunDeepDive()}
                            disabled={deepdiveLoading}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer"
                          >
                            Retry AI review
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Downloads */}
                    <div className="flex flex-wrap items-center gap-2">
                      <motion.button
                        type="button"
                        onClick={() => handleExport('pdf')}
                        disabled={!!exporting}
                        whileTap={tapPress}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 cursor-pointer"
                      >
                        {exporting === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        Download PDF
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => handleExport('md')}
                        disabled={!!exporting}
                        whileTap={tapPress}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-300 dark:border-white/[0.12] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] disabled:opacity-60 cursor-pointer"
                      >
                        <FileText size={13} />
                        Download Markdown
                      </motion.button>
                    </div>

                    {/* Verdict */}
                    <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.04]">
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                        <span className="font-bold text-slate-900 dark:text-white mr-1.5">Executive Verdict:</span>
                        {data.verdict}
                      </p>
                    </div>

                    {/* 4 Pillars Breakdown */}
                    {data.score_breakdown && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {Object.entries(data.score_breakdown).map(([k, v]) => (
                          <div key={k} className="p-3 rounded-xl border border-slate-200/60 dark:border-white/[0.05] bg-white dark:bg-[#0B0E15]">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block capitalize">
                              {k.replace(/_/g, ' ')}
                            </span>
                            <div className="flex items-baseline justify-between mt-1">
                              <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                                {v.score ?? '—'}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                {v.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ready-to-use copy: current text and issues from the crawler, proposed text from the AI */}
                  {rewrites.length > 0 && (
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] space-y-3">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <FileText size={14} className="text-indigo-500" />
                          Ready-to-use copy
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Written from your page&apos;s own content. Review before publishing.
                        </p>
                      </div>
                      {rewrites.map((row) => (
                        <div key={row.element} className="rounded-xl border border-slate-200/80 dark:border-white/[0.06] p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{row.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.status === 'fix'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {row.status === 'fix' ? 'Needs fixing' : 'OK, optional improvement'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400">
                            <span className="font-semibold text-slate-500">Current ({row.current_length} chars): </span>
                            {row.current || <em>missing</em>}
                          </div>
                          {row.issues?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {row.issues.map((issue) => (
                                <span key={issue} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                  {issue}
                                </span>
                              ))}
                            </div>
                          )}
                          {row.proposed ? (
                            <div className="rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 p-2.5 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">{row.proposed}</p>
                                {/* Copy is offered only for text that meets its own length rule; anything else needs editing first. */}
                                {row.proposed_in_range ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyRewrite(row)}
                                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                  >
                                    {copiedRewrite === row.element ? <Check size={12} /> : <Copy size={12} />}
                                    {copiedRewrite === row.element ? 'Copied' : 'Copy'}
                                  </button>
                                ) : (
                                  <span className="shrink-0 rounded-md border border-amber-300 dark:border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                    Needs editing
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                <span className={row.proposed_in_range ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>
                                  {row.proposed_length} chars
                                </span>
                                {' '}(recommended {row.recommended_range?.[0]}-{row.recommended_range?.[1]})
                                {!row.proposed_in_range && row.proposed_length > (row.recommended_range?.[1] ?? Infinity) && (
                                  <strong className="text-amber-600 dark:text-amber-400"> · Too long: Google will cut it off, trim before pasting</strong>
                                )}
                                {!row.proposed_in_range && row.proposed_length < (row.recommended_range?.[0] ?? 0) && (
                                  <strong className="text-amber-600 dark:text-amber-400"> · Short: consider adding detail</strong>
                                )}
                                {row.reason && <> · {row.reason}</>}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {row.keep_current
                                ? <><strong className="text-emerald-600 dark:text-emerald-400">Keep the current copy.</strong>{row.reason ? ` ${row.reason}` : ''}</>
                                : deepdiveResult.is_live_ai
                                  ? 'No rewrite proposed.'
                                  : aiFailed
                                    ? `${aiProvider.label} did not answer, so there is no rewrite yet. Use "Retry AI review" above.`
                                    : 'Connect an AI provider in Integrations to get rewritten copy.'}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Critical Findings */}
                  {data.critical_findings && data.critical_findings.length > 0 && (
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-amber-500" />
                        Multi-API Diagnostic Findings
                      </h4>
                      <ul className="space-y-1.5">
                        {data.critical_findings.map((f, i) => (
                          <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                            <span className="text-indigo-500 font-bold mt-0.5">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Production Code Fix */}
                  {data.production_code_fix && (
                    <div className="rounded-2xl border border-indigo-500/30 dark:border-indigo-500/40 bg-slate-900 overflow-hidden shadow-lg">
                      <div className="px-4 py-3 bg-slate-950/80 border-b border-indigo-900/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Code2 size={16} className="text-[#CAE366]" />
                          <span className="text-xs font-bold text-white tracking-wide">
                            Production-Ready Platform Fix ({platform?.name || 'Template Code'})
                          </span>
                        </div>
                        <motion.button
                          onClick={() => handleCopyCode(data.production_code_fix)}
                          whileTap={tapPress}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/30 text-indigo-200 text-xs font-bold transition-all cursor-pointer"
                        >
                          {copiedCode ? (
                            <>
                              <Check size={13} className="text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>Copy Code</span>
                            </>
                          )}
                        </motion.button>
                      </div>

                      <div className="p-4 overflow-x-auto">
                        <pre className="font-mono text-xs text-indigo-100 leading-relaxed whitespace-pre-wrap">
                          {data.production_code_fix}
                        </pre>
                      </div>

                      {platform?.template_hint && (
                        <div className="px-4 py-2.5 bg-slate-950/50 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
                          <FileCode size={13} className="text-amber-400 shrink-0" />
                          <span>Target file: <strong className="text-slate-200">{platform.template_hint}</strong></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AEO Direct Answer Block */}
                  {data.aeo_direct_answer_block && (
                    <div className="p-4 rounded-2xl border border-emerald-500/25 bg-emerald-50/20 dark:bg-emerald-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <Bot size={14} />
                          AEO Direct Answer Block (Google AI Overview / Perplexity Citation)
                        </h4>
                        <button
                          onClick={() => handleCopyAnswer(data.aeo_direct_answer_block)}
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          {copiedAnswer ? 'Copied!' : 'Copy Block'}
                        </button>
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed italic bg-white/60 dark:bg-black/20 p-3 rounded-xl border border-emerald-500/20">
                        &ldquo;{data.aeo_direct_answer_block}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Strategic Engineering Advice */}
                  {data.strategic_advice && (
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] flex items-start gap-3">
                      <Lightbulb size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                          Next Engineering Sprint Priority
                        </h5>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                          {data.strategic_advice}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Dossier Inspector */}
                  {deepdiveResult.dossier_markdown && (
                    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
                      <button
                        onClick={() => setShowDossier(!showDossier)}
                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-white/[0.03] text-left text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Cpu size={14} className="text-indigo-400" />
                          View Grounding Intelligence Dossier ({deepdiveResult.tier_badges?.join(' + ')})
                        </span>
                        {showDossier ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {showDossier && (
                        <div className="p-4 bg-slate-50 dark:bg-slate-950 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                          {deepdiveResult.dossier_markdown}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
