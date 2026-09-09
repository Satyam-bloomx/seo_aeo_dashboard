'use client';
import React, { useState, useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { generateIssuesReport, RULE_METADATA } from '@/utils/IssuesEngine';
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
  ListTree
} from 'lucide-react';

const SEVERITY_FILTERS = [
  { id: 'ALL', label: 'All', countKey: 'Total', active: 'bg-slate-900', idle: 'text-slate-600' },
  { id: 'ERRORS', label: 'Errors', countKey: 'Issue', active: 'bg-rose-600', idle: 'text-rose-700' },
  { id: 'WARNINGS', label: 'Warnings', countKey: 'Warning', active: 'bg-amber-600', idle: 'text-amber-700' },
  { id: 'OPPORTUNITIES', label: 'Opportunities', countKey: 'Opportunity', active: 'bg-indigo-600', idle: 'text-indigo-700' },
];

export default function IssuesTab({ pages, onIssueClick }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);

  const reduced = useReducedMotion();

  const issuesReport = useMemo(() => generateIssuesReport(pages), [pages]);

  const summary = useMemo(() => {
    return issuesReport.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, { Issue: 0, Warning: 0, Opportunity: 0, Total: issuesReport.length });
  }, [issuesReport]);

  const filteredIssues = useMemo(() => {
    return issuesReport.filter(issue => {
      if (filterType === 'ERRORS' && issue.type !== 'Issue') return false;
      if (filterType === 'WARNINGS' && issue.type !== 'Warning') return false;
      if (filterType === 'OPPORTUNITIES' && issue.type !== 'Opportunity') return false;

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

  const getTypeIcon = (type) => {
    switch (type) {
      case 'Issue': return <AlertCircle className="text-rose-600 w-4 h-4 shrink-0" />;
      case 'Warning': return <AlertTriangle className="text-amber-600 w-4 h-4 shrink-0" />;
      case 'Opportunity': return <Lightbulb className="text-indigo-600 w-4 h-4 shrink-0" />;
      default: return null;
    }
  };

  const handleCopy = (url, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="flex flex-col h-full space-y-4 overflow-hidden">

      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Audit Diagnostic Issues</h2>
          <p className="text-xs text-slate-500 mt-0.5">Prioritized diagnostic rules detected across all scanned pages with root-cause analysis.</p>
        </div>

        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <LayoutGroup id="issue-filters">
            {SEVERITY_FILTERS.map((f) => {
              const isActive = filterType === f.id;
              return (
                <motion.button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  whileTap={tapPress}
                  transition={spring.press}
                  aria-pressed={isActive}
                  className={`relative px-3.5 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer transition-colors duration-150 flex items-center justify-center ${
                    isActive ? 'text-white' : `${f.idle} hover:text-slate-900`
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
                    {f.label} ({summary[f.countKey]})
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
          className="w-full glass-input pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 rounded-xl"
        />
      </div>

      {/* Issues Table Container */}
      <div className="flex-1 bg-white border border-slate-200 relative overflow-hidden flex flex-col shadow-xs rounded-2xl">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-20 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider">Diagnostic Rule</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider">Severity</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider text-right">Affected URLs</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider text-right">% Impact</th>
                <th className="px-5 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
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
                        className={`transition-colors group hover:bg-slate-50 cursor-pointer ${isExpanded ? 'bg-slate-50/90' : ''}`}
                        onClick={() => setExpandedIssue(isExpanded ? null : rowKey)}
                      >
                        <td
                          className="px-5 py-3.5 font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-2"
                        >
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={spring.snap}
                            className="flex shrink-0"
                          >
                            <ChevronDown
                              size={14}
                              className={isExpanded ? 'text-indigo-600' : 'text-slate-400'}
                            />
                          </motion.span>
                          <span>{issue.name}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-700 font-semibold">
                            {issue.category.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 font-bold">
                            {getTypeIcon(issue.type)}
                            <span className={issue.type === 'Issue' ? 'text-rose-700' : issue.type === 'Warning' ? 'text-amber-700' : 'text-indigo-700'}>
                              {issue.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                          {issue.count || affectedList.length || 1}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-500 font-medium">
                          {issue.percentage}%
                        </td>
                        <td className="px-5 py-3.5 text-center">
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
                            className="btn-secondary px-3 py-1 text-[11px] font-bold flex items-center gap-1 mx-auto shadow-xs"
                            title="Explore affected URLs in Grid"
                          >
                            Explore <ExternalLink size={12} />
                          </motion.button>
                        </td>
                      </motion.tr>

                      {/* Expanded Deep Diagnostic Root Cause & Affected URLs Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/95 border-b border-slate-200">
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

                                {/* 3-Pillar Diagnostic Analysis Bento */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                  
                                  {/* 1. Root Cause */}
                                  <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-xs flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center gap-2 text-rose-700 font-bold font-mono text-[11px] uppercase tracking-wider mb-1.5">
                                        <Info size={14} className="text-rose-600" />
                                        <span>Why This Error Occurred (Root Cause)</span>
                                      </div>
                                      <p className="text-xs text-slate-600 leading-relaxed font-sans">
                                        {issue.rootCause || 'Detected during automated DOM inspection against W3C and SEO standards.'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* 2. Search Engine & AI Impact */}
                                  <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-xs flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center gap-2 text-amber-700 font-bold font-mono text-[11px] uppercase tracking-wider mb-1.5">
                                        <Flame size={14} className="text-amber-600" />
                                        <span>Search & AI Engine Impact</span>
                                      </div>
                                      <p className="text-xs text-slate-600 leading-relaxed font-sans">
                                        {issue.impact || 'Causes crawl inefficiencies, diluted search relevancy, or snippet rendering errors.'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* 3. Step-by-Step Remediation */}
                                  <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center gap-2 text-emerald-700 font-bold font-mono text-[11px] uppercase tracking-wider mb-1.5">
                                        <Wrench size={14} className="text-emerald-600" />
                                        <span>Step-by-Step Fix Guide</span>
                                      </div>
                                      <p className="text-xs text-slate-600 leading-relaxed font-sans">
                                        {issue.fixGuide || 'Review template code and update HTML structures according to webmaster guidelines.'}
                                      </p>
                                    </div>
                                  </div>

                                </div>

                                {/* Affected URLs Interactive List */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <ListTree size={14} className="text-indigo-600" />
                                      <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                                        Affected URLs ({affectedList.length})
                                      </h4>
                                    </div>
                                    <button
                                      onClick={() => onIssueClick({
                                        category: issue.category,
                                        name: issue.ruleName || issue.name
                                      })}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      Open All in URL Grid <ExternalLink size={11} />
                                    </button>
                                  </div>

                                  {affectedList.length > 0 ? (
                                    <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-slate-100 border border-slate-100 rounded-lg">
                                      {affectedList.slice(0, 50).map((page, pIdx) => {
                                        const isCopied = copiedUrl === page.url;
                                        return (
                                          <div key={page.id || page.url || pIdx} className="px-3 py-2 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-2 truncate max-w-xl">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                (page.status_code || 200) >= 400
                                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              }`}>
                                                {page.status_code || 200}
                                              </span>
                                              <span className="font-mono text-slate-700 truncate" title={page.url}>
                                                {page.url}
                                              </span>
                                            </div>
                                            <button
                                              onClick={(e) => handleCopy(page.url, e)}
                                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                                              title="Copy URL"
                                            >
                                              {isCopied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                            </button>
                                          </div>
                                        );
                                      })}
                                      {affectedList.length > 50 && (
                                        <div className="p-2 text-center text-xs text-slate-500 font-mono bg-slate-50">
                                          + {affectedList.length - 50} more affected URLs. Click "Open All in URL Grid" to inspect full list.
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-500 font-mono">No specific URL records loaded.</p>
                                  )}
                                </div>

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
                      <p className="font-bold text-slate-900 text-sm">No matching diagnostic issues.</p>
                      <p className="text-xs text-slate-500 mt-1">All audit parameters satisfy clean health standards.</p>
                    </div>
                  </td>
                </motion.tr>
              )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
