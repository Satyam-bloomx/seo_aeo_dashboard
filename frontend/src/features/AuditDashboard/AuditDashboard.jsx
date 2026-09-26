'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Sidebar from './Sidebar/Sidebar';
import OverviewTab from './ResultsTab/OverviewTab';
import IssuesTab from './ResultsTab/IssuesTab';
import URLExplorerTab from './ResultsTab/URLExplorerTab';
import PerformanceTab from './ResultsTab/PerformanceTab';
import ExecutiveReportModal from './ExecutiveReportModal';
import ExportAuditModal from './ExportAuditModal';
import SettingsModal from './SettingsModal/SettingsModal';
import IntegrationsPanel from './IntegrationsPanel';
import NarutoSamplePanel from './NarutoSample/NarutoSamplePanel';
import SpiderLiveProgressScreen from './SpiderLiveProgressScreen';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Loading from '../../app/loading';
import { API_BASE_URL } from '@/api/client';
import { generateIssuesReport } from '@/utils/IssuesEngine';
import { copyToClipboard } from '@/utils/clipboard';
import { getDiagnosticDetail, getPriorityMeta } from '@/utils/diagnosticDetails';
import { getPageDuplicateRelationships } from '@/utils/duplicateDetector';
import {
  bannerDrop,
  duration,
  ease,
  fade,
  popIn,
  slideOverLeft,
  slideOverRight,
  spring,
  staggerContainer,
  staggerItem,
  tabPanel,
  tapPress,
  tween,
} from '@/lib/motion';
import {
  Search,
  Loader2,
  X,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Globe,
  Sliders,
  Copy,
  Check,
  Menu,
  CheckCircle2,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Link2,
  AlertTriangle,
  AlertCircle,
  Info,
  Wrench,
  ShieldCheck,
  HelpCircle,
  ExternalLink,
  Layers,
} from 'lucide-react';

const fireCelebrationCannons = () => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

  const count = 180;
  const defaults = {
    origin: { y: 0.85 },
    colors: ['#059669', '#10B981', '#4F46E5', '#6366F1', '#F59E0B'],
  };

  const fire = (particleRatio, opts) =>
    confetti({ ...defaults, ...opts, particleCount: Math.floor(count * particleRatio) });

  [0.2, 0.8].forEach((x) => {
    fire(0.25, { spread: 26, startVelocity: 55, origin: { x, y: 0.85 } });
    fire(0.2, { spread: 60, origin: { x, y: 0.85 } });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, origin: { x, y: 0.85 } });
  });
};

const QUICK_TARGETS = [
  'https://bloomxsolutions.com/',
  'https://example.com/',
  'https://news.ycombinator.com/',
];

export default function AuditDashboard() {
  const reduced = useReducedMotion();

  const [isAppInitializing, setIsAppInitializing] = useState(true);
  const [url, setUrl] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab) {
        setActiveTab(tab);
      }
    }
  }, []);

  // Auto-load latest crawl data on mount so dashboard is populated immediately
  useEffect(() => {
    const loadLatestCrawl = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/crawls/latest`);
        if (res.ok) {
          const latest = await res.json();
          if (latest?.id) {
            setCrawlId(latest.id);
            setUrl(latest.seed_url || '');
            setStatus(latest.status || 'completed');
            const pRes = await fetch(`${API_BASE_URL}/crawls/${latest.id}/pages`);
            if (pRes.ok) {
              const pagesData = await pRes.json();
              if (Array.isArray(pagesData) && pagesData.length > 0) {
                setPages(pagesData);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not auto-load latest crawl:', err);
      }
    };
    loadLatestCrawl();
  }, []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('presets');
  const [isExecutiveReportOpen, setIsExecutiveReportOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);

  const handleOpenSettings = (tab = 'presets') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const DEFAULT_CRAWLER_SETTINGS = {
    maxPages: 500,
    maxDepth: 4,
    maxConcurrent: 5,
    stealthDelay: 0,
    ignoreUrlParams: true,
    checkExternalLinks: false,
    excludePaths: '',
    ignoreRobots: false,
    jsRendering: false,
    userAgent: 'SEO-Spider-Bot',
    crawlAuthorArchives: false,
  };

  const [crawlerSettings, setCrawlerSettings] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('audit_crawler_settings');
        if (saved) return { ...DEFAULT_CRAWLER_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('Failed to load crawler settings from localStorage', e);
      }
    }
    return DEFAULT_CRAWLER_SETTINGS;
  });

  const [crawlId, setCrawlId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [pagesCrawled, setPagesCrawled] = useState(0);
  const [pages, setPages] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [inlinks, setInlinks] = useState([]);
  const [isLoadingInlinks, setIsLoadingInlinks] = useState(false);

  useEffect(() => {
    if (selectedRow?.id) {
      setIsLoadingInlinks(true);
      fetch(`${API_BASE_URL}/pages/${selectedRow.id}/inlinks`)
        .then(res => res.json())
        .then(data => {
          setInlinks(Array.isArray(data) ? data : []);
          setIsLoadingInlinks(false);
        })
        .catch(err => {
          console.error("Failed to fetch inlinks:", err);
          setInlinks([]);
          setIsLoadingInlinks(false);
        });
    } else {
      setInlinks([]);
    }
  }, [selectedRow?.id]);

  const issuesReport = useMemo(() => generateIssuesReport(pages), [pages]);

  const [explorerCategory, setExplorerCategory] = useState('Page_Titles');
  const [explorerView, setExplorerView] = useState('All');

  const handleNavigateToExplorer = (category, view = 'All') => {
    if (category) setExplorerCategory(category);
    if (view) setExplorerView(view);
    setActiveTab('explorer');
  };

  const startAudit = async (e, targetOverrideUrl = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const rawTarget = targetOverrideUrl || url;
    if (!rawTarget) return;

    let normalizedUrl = rawTarget.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    try {
      const parsed = new URL(normalizedUrl);
      if (!parsed.pathname || parsed.pathname === '') {
        parsed.pathname = '/';
      }
      normalizedUrl = parsed.toString();
    } catch (_) {}
    setUrl(normalizedUrl);

    setIsAuditing(true);
    setStatus('running');
    setProgress(0);
    setPagesCrawled(0);
    setPages([]);
    setActiveTab('overview');
    setSelectedRow(null);
    setShowCompletionBanner(false);

    toast.info(`Spider initiated on ${normalizedUrl}`, {
      description: `Max ${crawlerSettings.maxPages} pages & depth ${crawlerSettings.maxDepth}`,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/crawls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed_url: normalizedUrl,
          max_depth: crawlerSettings.maxDepth,
          max_concurrent: crawlerSettings.maxConcurrent,
          max_pages: crawlerSettings.maxPages,
          stealth_delay: crawlerSettings.stealthDelay,
          ignore_url_params: crawlerSettings.ignoreUrlParams,
          check_external_links: crawlerSettings.checkExternalLinks,
          exclude_paths: crawlerSettings.excludePaths,
          ignore_robots: crawlerSettings.ignoreRobots,
          js_rendering: crawlerSettings.jsRendering,
          user_agent: crawlerSettings.userAgent,
          crawl_author_archives: crawlerSettings.crawlAuthorArchives ?? false,
        }),
      });

      if (!response.ok) {
        let errMessage = `Server responded with status ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.detail) errMessage = errData.detail;
        } catch (_) {}
        throw new Error(errMessage);
      }

      const data = await response.json();
      if (!data?.id) throw new Error('Server returned invalid crawl response.');
      setCrawlId(data.id);
    } catch (error) {
      console.error('Failed to start audit:', error);
      setStatus('failed');
      setIsAuditing(false);
      toast.error('Failed to start audit crawl', {
        description: error.message || 'Please check backend server connection.',
      });
    }
  };

  const handleQuickLaunch = (targetUrl) => {
    setUrl(targetUrl);
    toast.success(`Loaded seed URL: ${targetUrl}`);
  };

  const handleClearAudit = async () => {
    setIsAuditing(false);
    setStatus(null);
    setProgress(0);
    setPagesCrawled(0);
    setPages([]);
    setUrl('');
    setCrawlId(null);
    setSelectedRow(null);
    setInlinks([]);
    setShowCompletionBanner(false);

    try {
      await fetch(`${API_BASE_URL}/crawls`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Backend clear crawls error:', err);
    }

    toast.success('Audit data cleared', {
      description: 'Dashboard and crawl records have been cleared.',
    });
  };

  const fetchResults = useCallback(async () => {
    if (!crawlId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/crawls/${crawlId}/pages`);
      if (response.ok) {
        const pagesData = await response.json();
        setPages(Array.isArray(pagesData) ? pagesData : []);
      }
    } catch (error) {
      console.error('Failed to fetch pages:', error);
    }
  }, [crawlId]);

  useEffect(() => {
    let intervalId;

    const checkStatus = async () => {
      if (!crawlId || status === 'completed' || status === 'failed') return;

      try {
        const response = await fetch(`${API_BASE_URL}/crawls/${crawlId}/status`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data || typeof data !== 'object') return;

        setStatus(data.status);
        setPagesCrawled(data.pages_crawled);
        setProgress(Math.min(95, Math.floor((data.pages_crawled / 50) * 100)));

        if (data.pages_crawled > 0) fetchResults();

        if (data.status === 'completed') {
          setProgress(100);
          try {
            const finalRes = await fetch(`${API_BASE_URL}/crawls/${crawlId}/pages`);
            if (finalRes.ok) {
              const finalPages = await finalRes.json();
              setPages(finalPages);
            }
          } catch (e) {
            console.error('Failed to fetch final pages:', e);
          }
          setIsAuditing(false);
          setShowCompletionBanner(true);
          fireCelebrationCannons();
          toast.success('Technical Audit Completed!', {
            description: `Successfully analyzed ${data.pages_crawled || 'all'} URLs with 32 parameters.`,
          });
        } else if (data.status === 'failed') {
          setIsAuditing(false);
          toast.error('Audit crawl encountered an issue.');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    if (crawlId && status === 'running') {
      intervalId = setInterval(checkStatus, 2500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [crawlId, status, fetchResults]);

  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [inspectorFilter, setInspectorFilter] = useState('all'); // 'all' | 'issues' | 'passed'
  const [expandedDiagnostics, setExpandedDiagnostics] = useState({});

  const handleCopyUrl = async (text) => {
    const ok = await copyToClipboard(text, 'URL');
    if (ok) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleCopyText = async (text, fieldId, label = 'Text') => {
    const ok = await copyToClipboard(text, label);
    if (ok) {
      setCopiedKeyId(fieldId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    }
  };

  const toggleDiagnosticExpanded = (id) => {
    setExpandedDiagnostics(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // -------------------------------------------------------------------------
  // Right-hand URL inspector
  // -------------------------------------------------------------------------
  const renderDrawer = () => (
    <AnimatePresence>
      {selectedRow && (
        <motion.aside
          key="url-inspector"
          variants={reduced ? fade : slideOverRight}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-slate-200 bg-white text-slate-900 shadow-[0_0_60px_-12px_rgba(15,23,42,0.25)] will-change-transform sm:w-[420px] md:relative md:w-[440px] xl:w-[480px]"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-3.5 sm:p-4 shrink-0">
            <div className="min-w-0 flex-1 pr-2">
              <span className="mb-0.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                URL Specs Inspector
              </span>
              <div className="flex items-center gap-2">
                <h3 className="truncate text-xs font-bold text-slate-900" title={selectedRow.url}>
                  {selectedRow.url}
                </h3>
                <motion.button
                  onClick={() => handleCopyUrl(selectedRow.url)}
                  whileHover={{ scale: 1.15 }}
                  whileTap={tapPress}
                  transition={spring.press}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 shrink-0"
                  title="Copy URL"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copiedUrl ? 'done' : 'copy'}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={tween(duration.micro, ease.outQuart)}
                      className="flex"
                    >
                      {copiedUrl ? (
                        <Check size={12} className="text-emerald-600" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>
            <motion.button
              onClick={() => setSelectedRow(null)}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={tapPress}
              transition={spring.press}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 shrink-0"
              aria-label="Close inspector"
            >
              <X size={18} />
            </motion.button>
          </div>

          <motion.div
            variants={staggerContainer(0.05, 0.08)}
            initial="initial"
            animate="animate"
            className="custom-scrollbar flex-1 space-y-6 overflow-auto p-5"
          >
            <motion.div variants={staggerItem}>
              <h4 className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <ChevronRight size={13} className="text-indigo-600" /> Core Telemetry
              </h4>
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Status Code</span>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${selectedRow.status_code >= 400
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                  >
                    {selectedRow.status_code || 200}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Word Count</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedRow.word_count || 0} words
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Indexability</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {selectedRow.indexability || 'Indexable'}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Duplicate Pages Detected Section */}
            {(() => {
              const dupInfo = getPageDuplicateRelationships(selectedRow, pages);
              if (!dupInfo.hasDuplicates) return null;
              const totalDuplicates = dupInfo.relationships.reduce((acc, r) => acc + r.counterparts.length, 0);

              return (
                <motion.div variants={staggerItem}>
                  <h4 className="mb-2.5 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <Layers size={13} className="text-amber-600 dark:text-amber-400" /> Duplicate Pages Detected
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                      {totalDuplicates} {totalDuplicates === 1 ? 'Duplicate' : 'Duplicates'}
                    </span>
                  </h4>

                  <div className="space-y-3 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20 p-3.5">
                    <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
                      This page shares duplicate content or headings with other URLs on this site. Direct counterpart links:
                    </p>

                    <div className="space-y-2.5">
                      {dupInfo.relationships.map((rel) => (
                        <div key={rel.id} className="rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 p-2.5 space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              {rel.type}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {rel.counterparts.length} {rel.counterparts.length === 1 ? 'match' : 'matches'}
                            </span>
                          </div>

                          {rel.sharedValue && (
                            <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800/70 text-[10px] font-mono text-slate-600 dark:text-slate-300 truncate" title={rel.sharedValue}>
                              <span className="font-bold text-slate-400">{rel.sharedLabel}: </span>
                              <span>"{rel.sharedValue}"</span>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            {rel.counterparts.map((cp, idx) => (
                              <div key={cp.url || idx} className="flex items-center justify-between gap-1.5 p-2 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={cp.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate"
                                    title="Open counterpart live duplicate page"
                                  >
                                    <span className="truncate">{cp.url}</span>
                                    <ExternalLink size={10} className="shrink-0 text-slate-400 hover:text-indigo-600" />
                                  </a>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {cp.pageObj && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedRow(cp.pageObj)}
                                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                                      title="Switch inspector to this duplicate page"
                                    >
                                      Inspect
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleCopyUrl(cp.url)}
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                                    title="Copy Duplicate URL"
                                  >
                                    <Copy size={11} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })()}

            {/* On-Page Content & Headings Inspection (Exact text & Character counts without space) */}
            <motion.div variants={staggerItem}>
              <h4 className="mb-2.5 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <span className="flex items-center gap-1.5">
                  <ChevronRight size={13} className="text-indigo-600" /> On-Page Elements & Headings
                </span>
                <span className="text-[9px] text-slate-400 font-normal">Exact text & character lengths</span>
              </h4>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                {/* Page Title */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">Title 1</span>
                    {selectedRow.title_1 ? (
                      <span className="font-mono text-[10px] text-slate-500">
                        <strong className="text-slate-800">{selectedRow.title_1.length}</strong> chars ({selectedRow.title_1.replace(/\s+/g, '').length} no spaces)
                        {selectedRow.title_1_pixel_width ? ` | ${selectedRow.title_1_pixel_width}px` : ''}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">0 (Missing)</span>
                    )}
                  </div>
                  {selectedRow.title_1 ? (
                    <div className="group/item flex items-start justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-semibold leading-relaxed">
                      <span className="select-all">{selectedRow.title_1}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(selectedRow.title_1, 'title_1', 'Title 1')}
                        className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-200 transition-opacity"
                        title="Copy Title"
                      >
                        {copiedKeyId === 'title_1' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs italic text-rose-600 bg-rose-50/60 p-2 rounded-lg border border-rose-200/60">No Title 1 tag detected</div>
                  )}
                </div>

                {/* Meta Description */}
                <div className="space-y-1 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">Meta Description 1</span>
                    {selectedRow.meta_desc_1 ? (
                      <span className="font-mono text-[10px] text-slate-500">
                        <strong className="text-slate-800">{selectedRow.meta_desc_1.length}</strong> chars ({selectedRow.meta_desc_1.replace(/\s+/g, '').length} no spaces)
                        {selectedRow.meta_desc_1_pixel_width ? ` | ${selectedRow.meta_desc_1_pixel_width}px` : ''}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">0 (Missing)</span>
                    )}
                  </div>
                  {selectedRow.meta_desc_1 ? (
                    <div className="group/item flex items-start justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 leading-relaxed font-normal">
                      <span className="select-all">{selectedRow.meta_desc_1}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(selectedRow.meta_desc_1, 'meta_desc_1', 'Meta Description 1')}
                        className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-200 transition-opacity"
                        title="Copy Meta Description"
                      >
                        {copiedKeyId === 'meta_desc_1' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs italic text-rose-600 bg-rose-50/60 p-2 rounded-lg border border-rose-200/60">No Meta Description 1 tag detected</div>
                  )}
                </div>

                {/* H1 Headings */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">H1 Headings</span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold border ${
                      !selectedRow.h1_1 
                        ? 'bg-rose-50 text-rose-700 border-rose-200' 
                        : selectedRow.h1_2 
                        ? 'bg-amber-50 text-amber-700 border-amber-200' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {!selectedRow.h1_1 ? '0 H1 (Missing)' : selectedRow.h1_2 ? '2 H1s (Multiple)' : '1 H1'}
                    </span>
                  </div>
                  {selectedRow.h1_1 ? (
                    <div className="space-y-1">
                      <div className="group/item flex items-start justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-semibold leading-relaxed">
                        <div>
                          <span className="text-[10px] font-mono text-indigo-600 uppercase font-bold block">H1-1 ({selectedRow.h1_1.length} chars, {selectedRow.h1_1.replace(/\s+/g, '').length} no spaces):</span>
                          <span className="select-all">{selectedRow.h1_1}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(selectedRow.h1_1, 'h1_1', 'H1-1')}
                          className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-200 transition-opacity"
                          title="Copy H1-1"
                        >
                          {copiedKeyId === 'h1_1' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                        </button>
                      </div>
                      {selectedRow.h1_2 && (
                        <div className="group/item flex items-start justify-between gap-2 p-2 rounded-lg bg-white border border-amber-200/80 text-xs text-slate-900 font-semibold leading-relaxed">
                          <div>
                            <span className="text-[10px] font-mono text-amber-700 uppercase font-bold block">H1-2 ({selectedRow.h1_2.length} chars, {selectedRow.h1_2.replace(/\s+/g, '').length} no spaces):</span>
                            <span className="select-all">{selectedRow.h1_2}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(selectedRow.h1_2, 'h1_2', 'H1-2')}
                            className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-200 transition-opacity"
                            title="Copy H1-2"
                          >
                            {copiedKeyId === 'h1_2' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs italic text-rose-600 bg-rose-50/60 p-2 rounded-lg border border-rose-200/60">No H1 tags detected</div>
                  )}
                </div>

                {/* H2 Headings */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">H2 Headings</span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold border ${
                      !selectedRow.h2_1 
                        ? 'bg-rose-50 text-rose-700 border-rose-200' 
                        : selectedRow.h2_2 
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {!selectedRow.h2_1 ? '0 H2 (Missing)' : selectedRow.h2_2 ? '2+ H2s' : '1 H2'}
                    </span>
                  </div>
                  {selectedRow.h2_1 ? (
                    <div className="space-y-1">
                      <div className="group/item flex items-start justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-semibold leading-relaxed">
                        <div>
                          <span className="text-[10px] font-mono text-indigo-600 uppercase font-bold block">H2-1 ({selectedRow.h2_1.length} chars, {selectedRow.h2_1.replace(/\s+/g, '').length} no spaces):</span>
                          <span className="select-all">{selectedRow.h2_1}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(selectedRow.h2_1, 'h2_1', 'H2-1')}
                          className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-200 transition-opacity"
                          title="Copy H2-1"
                        >
                          {copiedKeyId === 'h2_1' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                        </button>
                      </div>
                      {selectedRow.h2_2 && (
                        <div className="group/item flex items-start justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-semibold leading-relaxed">
                          <div>
                            <span className="text-[10px] font-mono text-indigo-600 uppercase font-bold block">H2-2 ({selectedRow.h2_2.length} chars, {selectedRow.h2_2.replace(/\s+/g, '').length} no spaces):</span>
                            <span className="select-all">{selectedRow.h2_2}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(selectedRow.h2_2, 'h2_2', 'H2-2')}
                            className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-200 transition-opacity"
                            title="Copy H2-2"
                          >
                            {copiedKeyId === 'h2_2' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs italic text-rose-600 bg-rose-50/60 p-2 rounded-lg border border-rose-200/60">No H2 tags detected</div>
                  )}
                </div>

                {/* Canonical URL Inspection */}
                <div className="space-y-1 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">Canonical Tag</span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold border ${
                      selectedRow.canonical_link_element_1 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {selectedRow.canonical_link_element_1 ? 'Declared' : 'Missing'}
                    </span>
                  </div>
                  {selectedRow.canonical_link_element_1 ? (
                    <div className="group/item flex items-start justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 leading-relaxed font-mono">
                      <span className="select-all break-all text-[11px]">{selectedRow.canonical_link_element_1}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(selectedRow.canonical_link_element_1, 'canonical_link', 'Canonical URL')}
                        className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-200 transition-opacity"
                        title="Copy Canonical"
                      >
                        {copiedKeyId === 'canonical_link' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs italic text-amber-700 bg-amber-50/60 p-2 rounded-lg border border-amber-200/60">No Canonical link element found</div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Inlink Sources (Discovered On) */}
            <motion.div variants={staggerItem}>
              <h4 className="mb-2.5 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Link2 size={13} className="text-indigo-600" /> Discovered On ({inlinks.length} Inlinks)
                </span>
                <span className="text-[9px] text-slate-400 font-normal">Internal crawl source</span>
              </h4>

              {isLoadingInlinks ? (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <Loader2 size={13} className="animate-spin text-indigo-600" /> Loading inlink source URLs...
                </div>
              ) : inlinks.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {inlinks.map((link, idx) => (
                    <div key={link.id || idx} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Source Page:</span>
                        <span className="font-mono text-[10px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          {link.is_follow ? 'Follow' : 'Nofollow'}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-900 break-all bg-white p-1.5 rounded border border-slate-200">
                        {link.source_url || `Page ID #${link.source_page_id}`}
                      </div>
                      {link.anchor_text && (
                        <div className="text-[11px] text-slate-600 pt-0.5 flex items-center gap-1">
                          <span className="text-slate-400 font-medium">Anchor:</span>
                          <span className="italic font-semibold text-slate-800 truncate" title={link.anchor_text}>
                            "{link.anchor_text}"
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 italic">
                  {selectedRow.crawl_depth === 0 ? 'Seed Homepage (Root Crawl URL)' : 'No internal inlinks recorded.'}
                </div>
              )}
            </motion.div>

            {/* Detailed Diagnostic Intelligence: What, Why True/False, Impact, and Resolution */}
            {selectedRow.audit_data && (() => {
              const allDiagnostics = [];
              Object.entries(selectedRow.audit_data).forEach(([category, data]) => {
                if (!data || typeof data !== 'object') return;
                Object.entries(data).forEach(([key, val]) => {
                  const detail = getDiagnosticDetail(category, key, val, selectedRow);
                  allDiagnostics.push({
                    id: `${category}-${key}`,
                    category,
                    key,
                    val,
                    ...detail
                  });
                });
              });

              const highList = allDiagnostics.filter(d => d.priority === 'High');
              const mediumList = allDiagnostics.filter(d => d.priority === 'Medium');
              const lowList = allDiagnostics.filter(d => d.priority === 'Low');
              const passedList = allDiagnostics.filter(d => !d.isIssue || d.priority === 'None');

              const displayedDiagnostics = inspectorFilter === 'high' 
                ? highList 
                : inspectorFilter === 'medium'
                ? mediumList
                : inspectorFilter === 'low'
                ? lowList
                : inspectorFilter === 'passed' 
                ? passedList 
                : allDiagnostics;

              const grouped = {};
              displayedDiagnostics.forEach(d => {
                if (!grouped[d.category]) grouped[d.category] = [];
                grouped[d.category].push(d);
              });

              return (
                <div className="space-y-4">
                  {/* Section Title & Filter Tabs */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <ChevronRight size={13} className="text-indigo-600" /> Technical & SEO Diagnostics
                      </h4>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {allDiagnostics.length} Checks
                      </span>
                    </div>

                    {/* Filter Pills - 3-Tier Priority Categorization */}
                    <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setInspectorFilter('all')}
                        className={`py-1 px-1.5 rounded-lg font-medium text-[10.5px] text-center transition-all ${
                          inspectorFilter === 'all'
                            ? 'bg-white text-slate-900 font-bold shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        All ({allDiagnostics.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorFilter('high')}
                        className={`py-1 px-1.5 rounded-lg font-medium text-[10.5px] flex items-center justify-center gap-1 transition-all ${
                          inspectorFilter === 'high'
                            ? 'bg-rose-600 text-white font-bold shadow-xs'
                            : 'text-rose-700 hover:bg-rose-50'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                        High ({highList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorFilter('medium')}
                        className={`py-1 px-1.5 rounded-lg font-medium text-[10.5px] flex items-center justify-center gap-1 transition-all ${
                          inspectorFilter === 'medium'
                            ? 'bg-amber-600 text-white font-bold shadow-xs'
                            : 'text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        Med ({mediumList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorFilter('low')}
                        className={`py-1 px-1.5 rounded-lg font-medium text-[10.5px] flex items-center justify-center gap-1 transition-all ${
                          inspectorFilter === 'low'
                            ? 'bg-blue-600 text-white font-bold shadow-xs'
                            : 'text-blue-700 hover:bg-blue-50'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        Low ({lowList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorFilter('passed')}
                        className={`py-1 px-1.5 rounded-lg font-medium text-[10.5px] flex items-center justify-center gap-1 transition-all ${
                          inspectorFilter === 'passed'
                            ? 'bg-emerald-600 text-white font-bold shadow-xs'
                            : 'text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        <CheckCircle size={10} className="shrink-0" />
                        Pass ({passedList.length})
                      </button>
                    </div>
                  </div>

                  {/* Render Categories and Diagnostic Cards */}
                  {Object.keys(grouped).length === 0 ? (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                      No checks match the active filter.
                    </div>
                  ) : (
                    Object.entries(grouped).map(([category, items]) => (
                      <motion.div key={category} variants={staggerItem} className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-1">
                          <span>{category.replace(/_/g, ' ')}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {items.filter(i => i.priority === 'High').length > 0 && (
                              <span className="text-rose-600 font-bold mr-1.5">
                                {items.filter(i => i.priority === 'High').length} High
                              </span>
                            )}
                            {items.filter(i => i.priority === 'Medium').length > 0 && (
                              <span className="text-amber-600 font-bold mr-1.5">
                                {items.filter(i => i.priority === 'Medium').length} Med
                              </span>
                            )}
                            {items.length} checks
                          </span>
                        </div>

                        <div className="space-y-2">
                          {items.map((item) => {
                            const isExpanded = expandedDiagnostics[item.id] !== undefined
                              ? expandedDiagnostics[item.id]
                              : item.isIssue;

                            const pMeta = getPriorityMeta(item.priority);

                            return (
                              <div
                                key={item.id}
                                className={`rounded-xl border transition-all ${
                                  item.priority === 'High'
                                    ? 'border-rose-200/90 bg-rose-50/20'
                                    : item.priority === 'Medium'
                                    ? 'border-amber-200/90 bg-amber-50/20'
                                    : item.priority === 'Low'
                                    ? 'border-blue-200/90 bg-blue-50/20'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                {/* Header / Summary Row */}
                                <div
                                  onClick={() => toggleDiagnosticExpanded(item.id)}
                                  className="p-3 flex items-start justify-between gap-2 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-slate-900 leading-tight">
                                        {item.label}
                                      </span>
                                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${pMeta.color}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${pMeta.dot} ${pMeta.pulse ? 'animate-pulse' : ''}`} />
                                        {pMeta.badge}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                                      {item.what}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    className="p-1 text-slate-400 hover:text-slate-700 shrink-0 mt-0.5"
                                  >
                                    <ChevronDown
                                      size={14}
                                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                </div>

                                {/* Expanded Diagnostic Detail */}
                                {isExpanded && (
                                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 text-xs space-y-2.5">
                                    {/* 1. What is it */}
                                    <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200/60">
                                      <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Condition & What It Evaluates:
                                      </span>
                                      <p className="text-slate-700 leading-relaxed text-[11px]">
                                        {item.what}
                                      </p>
                                    </div>

                                    {/* 2. Why True/False & Root Cause for this specific URL */}
                                    <div className={`p-2.5 rounded-lg border ${
                                      item.isIssue 
                                        ? 'bg-rose-50/60 border-rose-200 text-rose-950' 
                                        : 'bg-emerald-50/40 border-emerald-200 text-emerald-950'
                                    }`}>
                                      <span className={`font-mono text-[10px] font-bold uppercase tracking-wider block mb-1 flex items-center gap-1 ${
                                        item.isIssue ? 'text-rose-700' : 'text-emerald-700'
                                      }`}>
                                        <Info size={11} />
                                        Why {String(item.val)} on this URL (Root Cause):
                                      </span>
                                      <p className="leading-relaxed text-[11px] font-medium">
                                        {item.why}
                                      </p>
                                    </div>

                                    {/* 3. Search Engine / Business Impact */}
                                    {item.searchImpact && (
                                      <div className="p-2.5 rounded-lg bg-amber-50/40 border border-amber-200/80 text-amber-950">
                                        <span className="font-mono text-[10px] font-bold text-amber-800 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                          <AlertTriangle size={11} />
                                          Search Engine & Indexing Impact:
                                        </span>
                                        <p className="leading-relaxed text-[11px]">
                                          {item.searchImpact}
                                        </p>
                                      </div>
                                    )}

                                    {/* 4. Actionable How to Resolve */}
                                    {item.howToResolve && (
                                      <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-200 text-indigo-950 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="font-mono text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1">
                                            <Wrench size={11} />
                                            How to Resolve (Action Plan):
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyText(item.howToResolve, `fix-${item.id}`, 'Fix Guide');
                                            }}
                                            className="font-mono text-[10px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                                            title="Copy fix instructions"
                                          >
                                            {copiedKeyId === `fix-${item.id}` ? (
                                              <>
                                                <Check size={10} className="text-emerald-600" />
                                                <span>Copied</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy size={10} />
                                                <span>Copy Fix</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                        <p className="leading-relaxed text-[11px] text-slate-800 font-sans">
                                          {item.howToResolve}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              );
            })()}
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  );

  // -------------------------------------------------------------------------
  // Tab body — keyed so AnimatePresence can cross-fade between panels
  // -------------------------------------------------------------------------
  const renderTabBody = () => {
    if (activeTab === 'integrations') {
      return (
        <div className="h-full w-full overflow-hidden">
          <IntegrationsPanel 
            projectId={1} 
            crawlId={crawlId} 
            seedUrl={url} 
            onAuditProperty={(propUrl) => {
              if (!propUrl) return;
              let clean = propUrl.replace(/^sc-domain:/i, '').trim();
              if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
                clean = `https://${clean}`;
              }
              startAudit(null, clean);
            }}
          />
        </div>
      );
    }

    if (activeTab === 'naruto') {
      return (
        <NarutoSamplePanel onExit={() => setActiveTab('overview')} />
      );
    }

    if (activeTab === 'overview') {
      if (isAuditing || status === 'running') {
        return (
          <SpiderLiveProgressScreen
            url={url}
            progress={progress}
            pagesCrawled={pagesCrawled}
            pages={pages}
            crawlerSettings={crawlerSettings}
            onSwitchTab={(tab) => setActiveTab(tab)}
          />
        );
      }

      if (pages.length > 0) {
        return (
          <OverviewTab
            key={`overview-${crawlId || 'ready'}-${pages.length}`}
            pages={pages}
            onNavigateToExplorer={handleNavigateToExplorer}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        );
      }

      return (
        <motion.div
          variants={staggerContainer(0.06, 0.05)}
          initial="initial"
          animate="animate"
          className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 p-6 text-center backdrop-blur-xs"
        >
          <motion.div
            variants={staggerItem}
            animate={
              reduced ? undefined : { y: [0, -6, 0], transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } }
            }
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-xs"
          >
            <Search size={28} />
          </motion.div>
          <motion.h3 variants={staggerItem} className="mb-1 text-lg font-bold text-slate-900 dark:text-white">
            No Active Audit Session
          </motion.h3>
          <motion.p
            variants={staggerItem}
            className="mb-6 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400"
          >
            Enter a website URL in the address bar above to deploy the Screaming Frog 32-factor
            crawling engine.
          </motion.p>

          <motion.div
            variants={staggerContainer(0.05)}
            className="flex max-w-md flex-wrap items-center justify-center gap-2"
          >
            <motion.span variants={staggerItem} className="mb-1 w-full font-mono text-[11px] text-slate-400 dark:text-slate-500">
              Quick Launch Seed Targets:
            </motion.span>
            {QUICK_TARGETS.map((target) => (
              <motion.button
                key={target}
                variants={staggerItem}
                onClick={() => handleQuickLaunch(target)}
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={tapPress}
                transition={spring.press}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-700 dark:text-slate-200 shadow-xs transition-colors hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-slate-700 cursor-pointer"
              >
                {target.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </motion.button>
            ))}
          </motion.div>
        </motion.div>
      );
    }

    if (activeTab === 'issues') {
      return (
        <IssuesTab
          pages={pages}
          onIssueClick={(issue) =>
            handleNavigateToExplorer(issue.category, issue.name || 'Errors')
          }
          onSelectPage={(page) => setSelectedRow(page)}
        />
      );
    }

    if (activeTab === 'explorer') {
      return (
        <URLExplorerTab
          pages={pages}
          initialCategory={explorerCategory}
          initialView={explorerView}
          onRowClick={(row) => setSelectedRow(row)}
        />
      );
    }

    if (activeTab === 'performance') {
      return <PerformanceTab pages={pages} />;
    }

    return null;
  };

  return (
    <>
      {/* Boot overlay. Rendered above the app rather than instead of it, so the
          dashboard is already painted and settled when the loader lifts away.
          Loading owns its own GSAP fade-out and only calls back once it has
          finished, so no AnimatePresence wrapper is needed here. */}
      {isAppInitializing && (
        <Loading isBootloader onBootloaderComplete={() => setIsAppInitializing(false)} />
      )}

      <div className="relative flex h-screen h-[100dvh] w-full overflow-hidden bg-[#F8FAFC] dark:bg-[#090D16] font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <div className="ambient-bg" />

        {/* ---------------------------------------------------------------- */}
        {/* Sidebar — static on desktop, animated drawer on mobile            */}
        {/* ---------------------------------------------------------------- */}
        <div className="z-20 hidden w-[260px] shrink-0 md:block">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onOpenExport={() => setIsExportModalOpen(true)}
            onOpenExecutiveReport={() => setIsExecutiveReportOpen(true)}
            onOpenSettings={handleOpenSettings}
            pagesCount={pages.length}
            issuesCount={issuesReport.length}
          />
        </div>

        <AnimatePresence>
          {isMobileSidebarOpen && (
            <motion.div
              key="mobile-nav-scrim"
              variants={fade}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
            />
          )}
          {isMobileSidebarOpen && (
            <motion.div
              key="mobile-nav-panel"
              variants={reduced ? fade : slideOverLeft}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] will-change-transform md:hidden shadow-2xl bg-white dark:bg-slate-900"
            >
              <Sidebar
                activeTab={activeTab}
                setActiveTab={(tab) => {
                  setActiveTab(tab);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenExport={() => {
                  setIsExportModalOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenExecutiveReport={() => {
                  setIsExecutiveReportOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                onOpenSettings={(t) => {
                  handleOpenSettings(t);
                  setIsMobileSidebarOpen(false);
                }}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
                isMobile={true}
                pagesCount={pages.length}
                issuesCount={issuesReport.length}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------------------------------------------------------------- */}
        {/* Main column                                                      */}
        {/* ---------------------------------------------------------------- */}
        <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tween(duration.panel, ease.outQuint)}
            className="flex h-16 shrink-0 items-center justify-between gap-2.5 sm:gap-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-3 sm:px-6 shadow-xs backdrop-blur-md transition-colors"
          >
            <motion.button
              onClick={() => setIsMobileSidebarOpen(true)}
              whileTap={tapPress}
              transition={spring.press}
              className="flex items-center justify-center rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white md:hidden shrink-0"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </motion.button>

            <form
              onSubmit={startAudit}
              className="group relative flex w-full max-w-2xl flex-1 items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-1 pl-3 shadow-xs transition-all focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 sm:max-w-3xl"
            >
              <div className="pointer-events-none flex shrink-0 items-center text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors mr-2">
                <Globe size={16} />
              </div>
              <input
                type="url"
                className="w-full min-w-0 flex-1 bg-transparent py-1 font-mono text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none border-0 focus:outline-none focus:ring-0"
                placeholder="Enter seed URL to crawl (e.g. https://bloomxsolutions.com/)..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isAuditing}
              />
              {url && !isAuditing && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="p-1 mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  title="Clear input"
                >
                  <X size={14} />
                </button>
              )}
              <motion.button
                type="submit"
                disabled={isAuditing}
                whileTap={isAuditing ? undefined : tapPress}
                transition={spring.press}
                className="btn-primary ml-1 h-8 shrink-0 rounded-lg px-3.5 text-xs font-bold shadow-xs sm:px-4 cursor-pointer"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={isAuditing ? 'busy' : 'idle'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={tween(duration.micro, ease.outQuart)}
                    className="flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {isAuditing ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-emerald-400" />
                        <span className="hidden xs:inline">Crawling...</span>
                      </>
                    ) : (
                      'Run Audit'
                    )}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </form>

            <div className="flex shrink-0 items-center">
              <motion.button
                onClick={handleClearAudit}
                whileHover={{ scale: 1.02 }}
                whileTap={tapPress}
                transition={spring.press}
                disabled={isAuditing}
                className="btn-secondary h-8 px-3 text-xs font-bold gap-1.5 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800/60 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clear audit data from dashboard"
              >
                <Trash2 size={13} className="text-rose-500" />
                <span>Clear</span>
              </motion.button>
            </div>
          </motion.header>

          {/* Live crawl banner */}
          <AnimatePresence initial={false}>
            {isAuditing && (
              <motion.div
                key="crawl-banner"
                variants={bannerDrop}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ transformOrigin: 'top' }}
                className="shimmer-active shrink-0 border-b border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 to-emerald-50/80 dark:from-indigo-950/40 dark:to-emerald-950/40 px-4 sm:px-6 py-3 sm:py-3.5 shadow-xs"
              >
                <div className="mb-1.5 flex justify-between font-mono text-xs font-bold tracking-wide">
                  <span className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                    <Loader2 size={14} className="animate-spin text-indigo-600 dark:text-indigo-400" />
                    SCREAMING FROG SPIDER ACTIVE
                  </span>
                  <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                    {progress}% Complete
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full border border-slate-300/60 dark:border-slate-700 bg-slate-200 dark:bg-slate-800">
                  <motion.div
                    className="h-full origin-left rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 shadow-xs"
                    initial={false}
                    animate={{ scaleX: progress / 100 }}
                    transition={{ duration: 0.6, ease: ease.outQuart }}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  <span>
                    Status: <strong className="uppercase text-indigo-700 dark:text-indigo-400">{status}</strong>
                  </span>
                  <span>
                    URLs Extracted:{' '}
                    <strong className="font-bold tabular-nums text-slate-900 dark:text-white">{pagesCrawled}</strong>
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Completion banner */}
          <AnimatePresence>
            {showCompletionBanner && !isAuditing && pages.length > 0 && (
              <motion.div
                key="done-banner"
                variants={popIn}
                initial="initial"
                animate="animate"
                exit="exit"
                className="mx-3 sm:mx-6 mt-3 sm:mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-indigo-950/40 p-3.5 shadow-xs shrink-0"
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ ...spring.soft, delay: 0.1 }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-xs shrink-0"
                  >
                    <CheckCircle2 size={18} />
                  </motion.div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Technical Audit Successfully Generated
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      All 32 technical parameters, Core Web Vitals, AEO and GEO metrics are live.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <motion.button
                    onClick={() => setIsExportModalOpen(true)}
                    whileTap={tapPress}
                    transition={spring.press}
                    className="btn-primary gap-1.5 px-3 py-1.5 text-xs font-bold shadow-xs"
                  >
                    <FileSpreadsheet size={13} className="text-emerald-400" /> Export Data (CSV / XLS)
                  </motion.button>
                  <motion.button
                    onClick={() => setShowCompletionBanner(false)}
                    whileHover={{ rotate: 90, scale: 1.1 }}
                    whileTap={tapPress}
                    transition={spring.press}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab body */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${activeTab}-${pages.length > 0}`}
                variants={reduced ? fade : tabPanel}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full min-h-0"
              >
                {renderTabBody()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {renderDrawer()}

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          initialSettings={crawlerSettings}
          onSave={(newSettings) => {
            setCrawlerSettings(newSettings);
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('audit_crawler_settings', JSON.stringify(newSettings));
              } catch (e) {
                console.warn('Failed to persist crawler settings to localStorage', e);
              }
            }
            toast.success('Crawler settings updated and saved.');
          }}
          defaultTab={settingsTab}
        />

        <ExecutiveReportModal
          isOpen={isExecutiveReportOpen}
          onClose={() => setIsExecutiveReportOpen(false)}
          pages={pages}
          targetUrl={url}
        />

        <ExportAuditModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          pages={pages}
          targetUrl={url}
          onOpenPdfReport={() => {
            setIsExportModalOpen(false);
            setIsExecutiveReportOpen(true);
          }}
        />
      </div>
    </>
  );
}
