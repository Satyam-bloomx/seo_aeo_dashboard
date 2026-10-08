'use client';
import React, { useState, useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { generateIssuesReport, RULE_METADATA, buildIssueAiContext, applyAiDiagnosis } from '@/utils/IssuesEngine';
import { getAiDiagnoseIssue } from '@/api/client';
import { duration, ease, spring, tapPress, tween } from '@/lib/motion';
import { toast } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  Search,
  HelpCircle,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
  Info,
  Wrench,
  Flame,
  ListTree,
  Sparkles,
  Layers,
  CheckCircle2,
  TrendingUp,
  XCircle,
  FileText,
  Loader2,
  RefreshCw
} from 'lucide-react';
import AiRemediationModal from '../AiRemediationModal';
import IssueExpandedDetail from './IssueExpandedDetail';
import { copyToClipboard } from '@/utils/clipboard';
import { isDuplicateRule, buildDuplicateClusters } from '@/utils/duplicateDetector';

function getPageEvidence(page, ruleName = '') {
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
        page.title_1 ? { label: 'Page Title', value: page.title_1, note: (page.title_1_length || page.title_1?.length || 0) + ' chars' } : null,
        page.h1_1 ? { label: 'Main H1', value: page.h1_1, note: (page.h1_1_length || page.h1_1?.length || 0) + ' chars' } : null
      ].filter(Boolean)
    };
  }

  return null;
}

const PRIORITY_FILTERS = [
  { id: 'ALL', label: 'All Issues', countKey: 'Total', active: 'bg-slate-900 dark:bg-indigo-600', idle: 'text-slate-600 dark:text-slate-400' },
  { id: 'HIGH', label: 'High Priority', countKey: 'High', active: 'bg-rose-600', idle: 'text-rose-700 dark:text-rose-400' },
  { id: 'MEDIUM', label: 'Medium Priority', countKey: 'Medium', active: 'bg-amber-600', idle: 'text-amber-700 dark:text-amber-400' },
  { id: 'LOW', label: 'Low Priority', countKey: 'Low', active: 'bg-blue-600', idle: 'text-blue-700 dark:text-blue-400' },
];

export default function IssuesTab({ pages, onIssueClick, onSelectPage }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [aiModalIssue, setAiModalIssue] = useState(null);
  const [aiDiagnoses, setAiDiagnoses] = useState({});
  const [aiLoading, setAiLoading] = useState({});

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('audit_ai_diagnoses_cache');
      if (stored) {
        setAiDiagnoses(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load AI diagnoses cache', e);
    }
  }, []);

  const fetchAiDiagnosis = async (issue, force = false) => {
    const issueKey = issue.ruleName || issue.name;
    if (!force && aiDiagnoses[issueKey]) return;

    setAiLoading(prev => ({ ...prev, [issueKey]: true }));
    try {
      const firstUrl = issue.affected_pages?.[0]?.url || pages?.[0]?.url || '';
      let domain = '';
      try {
        if (firstUrl) domain = new URL(firstUrl).hostname;
      } catch {}

      const ctx = buildIssueAiContext(issue, domain);
      const res = await getAiDiagnoseIssue(ctx);
      if (res && res.data) {
        setAiDiagnoses(prev => {
          const next = { ...prev, [issueKey]: res };
          try {
            localStorage.setItem('audit_ai_diagnoses_cache', JSON.stringify(next));
          } catch {}
          return next;
        });
        if (res.is_live_ai) {
          toast.success(`Enhanced diagnosis with ${res.powered_by || 'AI'}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch AI diagnosis:', err);
    } finally {
      setAiLoading(prev => ({ ...prev, [issueKey]: false }));
    }
  };

  const handleToggleExpand = (rowKey, issue) => {
    if (expandedIssue === rowKey) {
      setExpandedIssue(null);
    } else {
      setExpandedIssue(rowKey);
      const issueKey = issue.ruleName || issue.name;
      if (!aiDiagnoses[issueKey] && !aiLoading[issueKey]) {
        fetchAiDiagnosis(issue);
      }
    }
  };

  const reduced = useReducedMotion();


  const issuesReport = useMemo(() => generateIssuesReport(pages), [pages]);

  const summary = useMemo(() => {
    return issuesReport.reduce((acc, issue) => {
      const p = issue.priority || (issue.type === 'Issue' ? 'High' : (issue.type === 'Warning' ? 'Medium' : 'Low'));
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, { High: 0, Medium: 0, Low: 0, Total: issuesReport.length });
  }, [issuesReport]);

  const filteredIssues = useMemo(() => {
    return issuesReport.filter(issue => {
      const p = issue.priority || (issue.type === 'Issue' ? 'High' : (issue.type === 'Warning' ? 'Medium' : 'Low'));
      if (filterType === 'HIGH' && p !== 'High') return false;
      if (filterType === 'MEDIUM' && p !== 'Medium') return false;
      if (filterType === 'LOW' && p !== 'Low') return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          issue.name.toLowerCase().includes(q) ||
          issue.category.toLowerCase().includes(q) ||
          (issue.rootCause && issue.rootCause.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [issuesReport, filterType, searchQuery]);

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'High':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            High Priority
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Medium Priority
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Low Priority
          </span>
        );
      default:
        return null;
    }
  };

  const handleCopy = async (url, e) => {
    e.stopPropagation();
    if (!url) return;
    const ok = await copyToClipboard(url, 'URL');
    if (ok) {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  return (
    <div className="flex flex-col min-h-full md:h-full space-y-3 sm:space-y-4 md:overflow-hidden">

      {/* Top Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Audit Diagnostic Issues</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Prioritized diagnostic rules detected across all scanned pages with root-cause analysis.</p>
        </div>

        {/* Priority Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto no-scrollbar max-w-full flex-nowrap">
          <LayoutGroup id="issue-filters">
            {PRIORITY_FILTERS.map((f) => {
              const isActive = filterType === f.id;
              return (
                <motion.button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  whileTap={tapPress}
                  transition={spring.press}
                  aria-pressed={isActive}
                  className={`relative px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer transition-colors duration-150 flex items-center justify-center shrink-0 whitespace-nowrap ${
                    isActive ? 'text-white' : `${f.idle} hover:text-slate-900 dark:hover:text-white`
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="issue-filter-pill"
                      transition={reduced ? { duration: 0 } : spring.snap}
                      className={`absolute inset-0 rounded-lg shadow-sm ${f.active}`}
                    />
                  )}
                  <span className="relative z-10 tabular-nums">
                    {f.label} ({summary[f.countKey] || 0})
                  </span>
                </motion.button>
              );
            })}
          </LayoutGroup>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative shrink-0">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search issues by rule name, category, or root cause..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full glass-input pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl"
        />
      </div>

      {/* Issues Table Container */}
      <div className="flex-1 min-h-[460px] md:min-h-0 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 relative overflow-hidden flex flex-col shadow-xs rounded-2xl">
        
        {/* Mobile View: High-Density Interactive Cards (< 768px) */}
        <div className="md:hidden flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {filteredIssues.length > 0 ? (
              filteredIssues.map((issue) => {
                const rowKey = `${issue.category}-${issue.name}`;
                const isExpanded = expandedIssue === rowKey;
                const affectedList = issue.affected_pages || [];

                return (
                  <motion.div
                    key={rowKey}
                    layout={!reduced}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={tween(duration.fast, ease.outQuart)}
                    className={`rounded-xl border transition-colors overflow-hidden ${
                      isExpanded
                        ? 'bg-slate-50/90 dark:bg-slate-800/80 border-indigo-300 dark:border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div
                      onClick={() => handleToggleExpand(rowKey, issue)}
                      className="p-3.5 cursor-pointer space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getPriorityBadge(issue.priority || (issue.type === 'Issue' ? 'High' : (issue.type === 'Warning' ? 'Medium' : 'Low')))}
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300 font-semibold">
                            {issue.category.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {issue.count || affectedList.length || 1} URLs
                          </span>
                          <span className="text-slate-400">({issue.percentage}%)</span>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-snug">
                          {issue.name}
                        </h4>
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={spring.snap}
                          className="mt-0.5 text-slate-400 shrink-0"
                        >
                          <ChevronDown size={15} />
                        </motion.span>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAiModalIssue(issue);
                          }}
                          className="flex-1 min-w-0 py-1.5 px-2 text-[11px] font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60 dark:hover:bg-indigo-600 dark:hover:text-white transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Sparkles size={11} className="text-amber-500 shrink-0" />
                          <span className="truncate">Fix with AI</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onIssueClick({
                              category: issue.category,
                              name: issue.ruleName || issue.name
                            });
                          }}
                          className="flex-1 min-w-0 py-1.5 px-2 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <span className="truncate">Explore in Grid</span>
                          <ExternalLink size={11} className="shrink-0" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          height: tween(duration.base, ease.outQuart),
                          opacity: tween(duration.fast, ease.outQuad),
                        }}
                        className="border-t border-slate-200 dark:border-slate-800 overflow-hidden"
                      >
                        <div className="p-3 sm:p-4 space-y-4 bg-slate-50/70 dark:bg-slate-950/60">
                          <IssueExpandedDetail
                            issue={issue}
                            pages={pages}
                            aiDiagnoses={aiDiagnoses}
                            aiLoading={aiLoading}
                            fetchAiDiagnosis={fetchAiDiagnosis}
                            setAiModalIssue={setAiModalIssue}
                            onIssueClick={onIssueClick}
                            onSelectPage={onSelectPage}
                            copiedUrl={copiedUrl}
                            handleCopy={handleCopy}
                          />
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400">
                <ShieldCheck size={32} className="text-emerald-600 mx-auto mb-2" />
                <p className="font-bold text-slate-900 dark:text-white text-xs">No matching diagnostic issues.</p>
                <p className="text-[11px] text-slate-500 mt-0.5">All audit parameters satisfy clean health standards.</p>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop View: Full Diagnostic Table (>= 768px) */}
        <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
          <table className="w-full min-w-[650px] text-left text-xs text-slate-700 dark:text-slate-300 border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-950/80 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">Diagnostic Rule</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">Priority</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Affected URLs</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">% Impact</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900/60">
              <AnimatePresence initial={false} mode="popLayout">
              {filteredIssues.length > 0 ? (
                filteredIssues.map((issue, idx) => {
                  const rowKey = `${issue.category}-${issue.name}`;
                  const isExpanded = expandedIssue === rowKey;
                  const affectedList = issue.affected_pages || [];

                  return (
                    <React.Fragment key={rowKey}>
                      <motion.tr
                        layout={!reduced}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={tween(duration.fast, ease.outQuart)}
                        className={`transition-colors group hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${isExpanded ? 'bg-slate-50/90 dark:bg-slate-800/80' : ''}`}
                        onClick={() => handleToggleExpand(rowKey, issue)}
                      >
                        <td
                          className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-2"
                        >
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={spring.snap}
                            className="flex shrink-0"
                          >
                            <ChevronDown
                              size={14}
                              className={isExpanded ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}
                            />
                          </motion.span>
                          <span>{issue.name}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300 font-semibold">
                            {issue.category.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {getPriorityBadge(issue.priority || (issue.type === 'Issue' ? 'High' : (issue.type === 'Warning' ? 'Medium' : 'Low')))}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {issue.count || affectedList.length || 1}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-500 dark:text-slate-400 font-medium">
                          {issue.percentage}%
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <motion.button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAiModalIssue(issue);
                              }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={tapPress}
                              transition={spring.press}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60 dark:hover:bg-indigo-600 dark:hover:text-white transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Generate 1-Click AI Fix with GPT-4o"
                            >
                              <Sparkles size={11} className="text-amber-500" />
                              <span>Fix with AI</span>
                            </motion.button>
                            <motion.button
                              onClick={(e) => {
                                e.stopPropagation();
                                onIssueClick({
                                  category: issue.category,
                                  name: issue.ruleName || issue.name
                                });
                              }}
                              whileHover={{ y: -1 }}
                              whileTap={tapPress}
                              transition={spring.press}
                              className="btn-secondary px-2.5 py-1 text-[11px] font-bold flex items-center gap-1 shadow-xs"
                              title="Explore affected URLs in Grid"
                            >
                              Explore <ExternalLink size={11} />
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>

                      {/* Expanded Deep Diagnostic Root Cause & Affected URLs Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/95 dark:bg-slate-950/90 border-b border-slate-200 dark:border-slate-800">
                          <td colSpan={6} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{
                                height: tween(duration.base, ease.outQuart),
                                opacity: tween(duration.fast, ease.outQuad),
                              }}
                              className="overflow-hidden"
                            >
                              <div className="px-6 py-5 space-y-4">
                                <IssueExpandedDetail
                                  issue={issue}
                                  pages={pages}
                                  aiDiagnoses={aiDiagnoses}
                                  aiLoading={aiLoading}
                                  fetchAiDiagnosis={fetchAiDiagnosis}
                                  setAiModalIssue={setAiModalIssue}
                                  onIssueClick={onIssueClick}
                                  onSelectPage={onSelectPage}
                                  copiedUrl={copiedUrl}
                                  handleCopy={handleCopy}
                                />
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <motion.tr
                  key="empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={tween(duration.base, ease.outQuart)}
                >
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <motion.span
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={spring.soft}
                        className="mb-2 flex"
                      >
                        <ShieldCheck size={36} className="text-emerald-600" />
                      </motion.span>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">No matching diagnostic issues.</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">All audit parameters satisfy clean health standards.</p>
                    </div>
                  </td>
                </motion.tr>
              )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Remediation Slide-Over Modal */}
      <AiRemediationModal
        isOpen={Boolean(aiModalIssue)}
        issue={aiModalIssue}
        pages={pages}
        onClose={() => setAiModalIssue(null)}
      />
    </div>
  );
}
