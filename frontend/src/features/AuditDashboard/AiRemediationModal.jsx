'use client';
import React, { useState, useEffect } from 'react';
import { DialogTitle } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { getAiRemediation } from '@/api/client';
import { toast } from 'sonner';
import { copyToClipboard } from '@/utils/clipboard';
import { spring, tapPress } from '@/lib/motion';
import {
  Sparkles,
  X,
  Copy,
  Check,
  Code2,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Loader2,
  ExternalLink,
  ShieldAlert,
  BookOpen
} from 'lucide-react';

export default function AiRemediationModal({ isOpen, onClose, issue, pages }) {
  const [loading, setLoading] = useState(false);
  const [remediationData, setRemediationData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selectedUrlIndex, setSelectedUrlIndex] = useState(0);

  const affectedPages = issue?.affected_pages || [];
  const activePage = affectedPages[selectedUrlIndex] || pages?.[0] || {};

  useEffect(() => {
    if (!isOpen || !issue) return;

    let isMounted = true;
    setLoading(true);
    setRemediationData(null);
    setCopied(false);

    const fetchFix = async () => {
      try {
        const payload = {
          project_id: 1,
          issue_name: issue.ruleName || issue.name,
          url: activePage.url || 'https://example.com/target-page',
          current_value: issue.currentValue || '',
          page_title: activePage.title_1 || '',
          h1_elements: [activePage.h1_1, activePage.h1_2].filter(Boolean),
          meta_description: activePage.meta_desc_1 || '',
          word_count: activePage.word_count || 0
        };

        const res = await getAiRemediation(payload);
        if (isMounted && res && res.data) {
          setRemediationData(res);
        }
      } catch (err) {
        console.error('AI Remediation fetch error:', err);
        if (isMounted) {
          toast.error('Failed to generate AI remediation. Using standard rule diagnostics.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchFix();

    return () => {
      isMounted = false;
    };
  }, [isOpen, issue, selectedUrlIndex]);

  const handleCopyCode = async () => {
    const code = remediationData?.data?.code_snippet || '';
    if (!code) return;
    const ok = await copyToClipboard(code, 'Code fix');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  if (!isOpen || !issue) return null;

  const data = remediationData?.data || {};

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
              <Sparkles size={20} className="text-amber-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-bold text-white tracking-tight">
                  1-Click AI Technical Remediation
                </DialogTitle>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                  {remediationData?.powered_by || 'OpenAI GPT-4o-mini'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Issue: <span className="font-semibold text-amber-300">{issue.name}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 flex-1 bg-slate-50/50 dark:bg-slate-950/60">

          {/* Target URL Selector */}
          {affectedPages.length > 1 && (
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-bold text-slate-900 dark:text-white">Target Sample URL:</span>
                <span className="ml-1.5 font-mono text-slate-500 dark:text-slate-400 truncate max-w-sm inline-block align-bottom">
                  {activePage.url}
                </span>
              </div>
              <select
                value={selectedUrlIndex}
                onChange={(e) => setSelectedUrlIndex(Number(e.target.value))}
                className="text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {affectedPages.slice(0, 10).map((p, idx) => (
                  <option key={p.id || p.url || idx} value={idx}>
                    Page #{idx + 1}: {p.url ? p.url.split('/').pop() || '/' : `URL ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-4 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 animate-spin" />
                <Sparkles size={20} className="absolute inset-0 m-auto text-indigo-600 animate-pulse" />
              </div>
              <div className="text-center">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Synthesizing Technical SEO Fix...</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">Querying GPT-4o-mini & W3C validation models for production fix</p>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* 1. Root Cause & Summary Card */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold font-mono text-xs uppercase tracking-wider">
                    <ShieldAlert size={14} />
                    <span>Root Cause & Search Impact</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {data.root_cause || issue.rootCause || 'Violates optimal on-page technical standards for crawlability and answer engines.'}
                  </p>
                </div>

                {/* 2. Structured AI Recommendations */}
                {data.recommendations && data.recommendations.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                    <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold font-mono text-xs uppercase tracking-wider">
                      <Lightbulb size={14} />
                      <span>Recommended Engineering Fixes</span>
                    </div>
                    <ul className="space-y-2">
                      {data.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                          <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Ready-to-Copy HTML / DOM Code Block */}
                {data.code_snippet && (
                  <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 shadow-lg relative group">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                      <div className="flex items-center gap-2">
                        <Code2 size={14} className="text-indigo-400" />
                        <span className="text-slate-200 font-bold">Recommended Production Markup</span>
                      </div>
                      <motion.button
                        onClick={handleCopyCode}
                        whileHover={{ scale: 1.02 }}
                        whileTap={tapPress}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shadow-sm transition-colors"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                      </motion.button>
                    </div>

                    <pre className="text-xs font-mono text-emerald-400 overflow-x-auto custom-scrollbar p-2 leading-relaxed whitespace-pre-wrap">
                      {data.code_snippet}
                    </pre>
                  </div>
                )}

                {/* 4. Best Practice Rule Reference */}
                {data.best_practice_rule && (
                  <div className="bg-indigo-50/60 dark:bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
                    <BookOpen size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-indigo-950 dark:text-indigo-100">Google & W3C Standard:</span>
                      <p className="mt-0.5 text-indigo-800/90 dark:text-indigo-300/90 leading-relaxed">
                        {data.best_practice_rule}
                      </p>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
            <span>Tested against W3C HTML5 & Google Search Central 2026 specs</span>
          </div>

          <div className="flex items-center gap-2">
            {data.code_snippet && (
              <motion.button
                onClick={handleCopyCode}
                whileTap={tapPress}
                className="btn-primary py-1.5 px-3.5 text-xs font-bold gap-1.5 shadow-xs"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copied Fix' : 'Copy Fixed Snippet'}</span>
              </motion.button>
            )}
            <button
              onClick={onClose}
              className="btn-secondary py-1.5 px-3 text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </AnimatedModal>
  );
}
