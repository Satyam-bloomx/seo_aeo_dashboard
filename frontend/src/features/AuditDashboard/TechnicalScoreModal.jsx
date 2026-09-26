'use client';
import React, { useState, useMemo } from 'react';
import { DialogTitle } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { spring, staggerContainer, staggerItem, tapPress } from '@/lib/motion';
import {
  X,
  Globe,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  Bot,
  FileCode,
  Radio,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Info
} from 'lucide-react';

const PILLAR_ICONS = {
  crawlability: <Radio size={16} className="text-blue-600 dark:text-blue-400" />,
  indexability: <Bot size={16} className="text-emerald-600 dark:text-emerald-400" />,
  architecture: <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />,
  metadata: <FileCode size={16} className="text-purple-600 dark:text-purple-400" />,
  rendering: <Zap size={16} className="text-amber-600 dark:text-amber-400" />,
};

export default function TechnicalScoreModal({
  isOpen,
  onClose,
  technicalSeoResult,
  totalPages = 0,
  onExploreCategory
}) {
  const [activeTab, setActiveTab] = useState('pillars'); // 'pillars' | 'all-checks'
  const [expandedPillars, setExpandedPillars] = useState({ architecture: true }); // Open worst pillar by default
  const [pillarFilters, setPillarFilters] = useState({}); // { [pillarId]: 'all' | 'flagged' | 'passed' }
  const [searchQuery, setSearchQuery] = useState('');
  const [globalFilter, setGlobalFilter] = useState('all'); // 'all' | 'flagged' | 'passed'

  if (!technicalSeoResult) return null;

  const { score, technicalScore, grade, technicalGrade, pillars = [], checksSummary = {} } = technicalSeoResult;
  const displayScore = technicalScore !== undefined ? technicalScore : score;
  const displayGrade = technicalGrade || grade;
  const allChecks = checksSummary.allChecks || [];

  const togglePillar = (id) => {
    setExpandedPillars(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const setFilterForPillar = (pillarId, filter) => {
    setPillarFilters(prev => ({
      ...prev,
      [pillarId]: filter
    }));
  };

  // Filtered checks for "All Checks" tab
  const filteredAllChecks = useMemo(() => {
    return allChecks.filter(check => {
      const matchesSearch = !searchQuery || 
        check.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        check.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (check.rootCause && check.rootCause.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = 
        globalFilter === 'all' || 
        (globalFilter === 'flagged' && !check.isPassing) ||
        (globalFilter === 'passed' && check.isPassing);

      return matchesSearch && matchesStatus;
    });
  }, [allChecks, searchQuery, globalFilter]);

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} size="2xl">
      <div className="flex flex-col bg-white dark:bg-slate-900 overflow-hidden rounded-3xl max-h-[90vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-900 text-indigo-200 shadow-sm ring-1 ring-indigo-900/10">
              <Globe size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle as="h2" className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  Technical SEO Score Audit Breakdown
                </DialogTitle>
                <span className="rounded-md border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  5-Pillar Standard
                </span>
                <span className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                  {checksSummary.totalEvaluated || 61} Automated Tests
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Evaluates 61 granular technical rules across 14 categories matching Screaming Frog v20.4 & Google Search Central
              </p>
            </div>
          </div>

          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.05 }}
            whileTap={tapPress}
            transition={spring.press}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Composite Score & Telemetry Banner */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row items-center justify-between gap-5 p-5 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-slate-50 to-blue-50/60 dark:from-indigo-950/40 dark:via-slate-900/90 dark:to-blue-950/30 border border-indigo-100 dark:border-indigo-900/40 shadow-xs"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white font-mono text-2xl font-black shadow-md shadow-indigo-500/20">
                {displayScore}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold border ${displayGrade.color}`}>
                    Grade {displayGrade.letter}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {displayGrade.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Synthesizes <strong className="text-slate-900 dark:text-white">{checksSummary.totalEvaluated || 61} diagnostic checks</strong> across <strong className="text-slate-900 dark:text-white">{totalPages}</strong> crawled URLs.
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>URL Health Hygiene:</span>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-mono">
                    {checksSummary.errorFreePages} / {totalPages} Error-Free Pages ({checksSummary.errorFreeRatio}%)
                  </strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 font-mono text-xs border-t md:border-t-0 md:border-l border-indigo-100/80 dark:border-indigo-900/40 pt-3 md:pt-0 md:pl-5 shrink-0 w-full md:w-auto justify-around md:justify-end">
              <div className="text-center">
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-sans">Total Evaluated</span>
                <span className="font-bold text-slate-900 dark:text-white text-base">{checksSummary.totalEvaluated || 61} Checks</span>
              </div>
              <div className="text-center">
                <span className="text-emerald-600 dark:text-emerald-400 block text-[10px] uppercase font-sans">Passing Clean</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300 text-base">{checksSummary.passedCount}</span>
              </div>
              <div className="text-center">
                <span className="text-rose-600 dark:text-rose-400 block text-[10px] uppercase font-sans">Issues Flagged</span>
                <span className="font-bold text-rose-700 dark:text-rose-300 text-base">{checksSummary.issuesCount}</span>
              </div>
            </div>
          </motion.div>

          {/* Educational Callout explaining the 5-Pillar Architecture */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs">
            <Info size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                How Technical SEO Scoring Works: 5 Core Pillars Aggregating 61+ Underlying Tests
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Rather than treating all checks as a flat list, enterprise audit suites (Ahrefs, Semrush, Screaming Frog) group tests into <strong>5 weighted architectural pillars</strong>. Beneath each pillar, dozens of exact technical rules are tested against every internal page. Click on any pillar below to inspect its full list of passing and flagged checks.
              </p>
            </div>
          </div>

          {/* View Mode Toggle: 5 Pillars vs All 61 Checks */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('pillars')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'pillars'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                5 Core Architectural Pillars
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('all-checks')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'all-checks'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Full Telemetry Directory</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  {checksSummary.totalEvaluated || 61}
                </span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              {activeTab === 'pillars' ? 'Click any pillar to expand all checks' : `${filteredAllChecks.length} checks shown`}
            </div>
          </div>

          {/* TAB 1: 5 CORE PILLARS WITH INTERACTIVE DRILL-DOWN */}
          {activeTab === 'pillars' && (
            <div className="space-y-4">
              {pillars.map((pillar) => {
                const isExcellent = pillar.score >= 90;
                const isGood = pillar.score >= 75;
                const isExpanded = Boolean(expandedPillars[pillar.id]);
                const filter = pillarFilters[pillar.id] || 'all';

                const pillarChecks = pillar.checks || [];
                const displayedChecks = pillarChecks.filter(c => {
                  if (filter === 'flagged') return !c.isPassing;
                  if (filter === 'passed') return c.isPassing;
                  return true;
                });

                return (
                  <div
                    key={pillar.id}
                    className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden shadow-xs hover:border-indigo-300/80 dark:hover:border-indigo-500/40 transition-colors"
                  >
                    {/* Pillar Card Header (Clickable Accordion) */}
                    <div
                      onClick={() => togglePillar(pillar.id)}
                      className="p-4 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors select-none"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shrink-0">
                            {PILLAR_ICONS[pillar.id] || <Layers size={16} />}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                {pillar.name}
                              </h4>
                              <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                Weight: {pillar.weight}
                              </span>
                              <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                {pillar.passedCount || 0} Passing / {pillar.flaggedCount || 0} Flagged
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                              {pillar.summary}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className={`font-mono text-base font-extrabold ${
                              isExcellent 
                                ? 'text-emerald-700 dark:text-emerald-300' 
                                : isGood 
                                ? 'text-indigo-700 dark:text-indigo-300' 
                                : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {pillar.score}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">/100</span>
                          </div>
                          <div className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isExcellent 
                              ? 'bg-emerald-500' 
                              : isGood 
                              ? 'bg-indigo-500' 
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${pillar.score}%` }}
                        />
                      </div>
                    </div>

                    {/* Expandable Drill-Down Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-3"
                        >
                          {/* Inner Filter Pill Bar */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                                Filter Tests:
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFilterForPillar(pillar.id, 'all'); }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                  filter === 'all'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                }`}
                              >
                                All ({pillar.totalCount || pillarChecks.length})
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFilterForPillar(pillar.id, 'flagged'); }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                  filter === 'flagged'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                                }`}
                              >
                                Flagged ({pillar.flaggedCount || 0})
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFilterForPillar(pillar.id, 'passed'); }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                  filter === 'passed'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                                }`}
                              >
                                Passing ({pillar.passedCount || 0})
                              </button>
                            </div>

                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                              Categories: {pillar.categories?.join(', ').replace(/_/g, ' ')}
                            </span>
                          </div>

                          {/* List of Granular Checks */}
                          <div className="space-y-2 pt-1">
                            {displayedChecks.length === 0 ? (
                              <div className="text-center py-4 text-xs text-slate-400">
                                No checks match this filter.
                              </div>
                            ) : (
                              displayedChecks.map((check) => {
                                const isPassing = check.isPassing;
                                const isHigh = check.priority === 'High' || check.type === 'Issue';
                                const isMedium = check.priority === 'Medium' || check.type === 'Warning';

                                return (
                                  <div
                                    key={check.name}
                                    className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors ${
                                      isPassing
                                        ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                                        : isHigh
                                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                                        : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2.5">
                                      <div className="mt-0.5 shrink-0">
                                        {isPassing ? (
                                          <CheckCircle2 size={15} className="text-emerald-500" />
                                        ) : isHigh ? (
                                          <AlertCircle size={15} className="text-rose-500" />
                                        ) : (
                                          <AlertTriangle size={15} className="text-amber-500" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-bold text-slate-900 dark:text-white">
                                            {check.name}
                                          </span>
                                          <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase ${
                                            isPassing
                                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                              : isHigh
                                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                              : isMedium
                                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                              : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                                          }`}>
                                            {isPassing ? 'Passing Clean' : `${check.priority} Priority`}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                          {isPassing 
                                            ? `Passed 100% clean across all ${totalPages} crawled internal URLs.`
                                            : check.rootCause || check.impact || 'Condition detected during site crawl.'}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                      {isPassing ? (
                                        <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                                          0 URLs Flagged
                                        </span>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                                            {check.count} pages ({check.percentage}%)
                                          </span>
                                          {onExploreCategory && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                onClose();
                                                onExploreCategory(check.category);
                                              }}
                                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                                              title="Explore in URL Grid"
                                            >
                                              <span>Inspect</span>
                                              <ExternalLink size={11} />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: FULL DIRECTORY OF ALL 61 TECHNICAL CHECKS */}
          {activeTab === 'all-checks' && (
            <div className="space-y-4">
              {/* Search & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search 61 technical checks (e.g. title, 404, canonical, H1, alt, cwv)..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setGlobalFilter('all')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      globalFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    All ({allChecks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlobalFilter('flagged')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      globalFilter === 'flagged'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    Flagged ({checksSummary.issuesCount || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlobalFilter('passed')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      globalFilter === 'passed'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    Passing ({checksSummary.passedCount || 0})
                  </button>
                </div>
              </div>

              {/* Table / List of all checks */}
              <div className="space-y-2">
                {filteredAllChecks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No technical checks found matching "{searchQuery}".
                  </div>
                ) : (
                  filteredAllChecks.map((check) => {
                    const isPassing = check.isPassing;
                    const isHigh = check.priority === 'High' || check.type === 'Issue';

                    return (
                      <div
                        key={check.name}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors ${
                          isPassing
                            ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                            : isHigh
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                            : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 shrink-0">
                            {isPassing ? (
                              <CheckCircle2 size={15} className="text-emerald-500" />
                            ) : isHigh ? (
                              <AlertCircle size={15} className="text-rose-500" />
                            ) : (
                              <AlertTriangle size={15} className="text-amber-500" />
                            )}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {check.name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {check.category.replace(/_/g, ' ')}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase ${
                                isPassing
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : isHigh
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                              }`}>
                                {isPassing ? 'Passing' : `${check.priority} Priority`}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                              {check.rootCause || check.impact}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {isPassing ? (
                            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                              Clean (0 Flagged)
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                                {check.count} pages ({check.percentage}%)
                              </span>
                              {onExploreCategory && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onExploreCategory(check.category);
                                  }}
                                  className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <span>Inspect</span>
                                  <ExternalLink size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/80 px-6 py-4">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            Audit standard: Screaming Frog v20.4 + Google Search Central (61 Active Checks)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary py-2 px-4 text-xs font-bold rounded-xl cursor-pointer"
          >
            Done Inspecting
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
