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
import SettingsModal from './SettingsModal/SettingsModal';
import IntegrationsPanel from './IntegrationsPanel';
import SpiderLiveProgressScreen from './SpiderLiveProgressScreen';
import Loading from '../../app/loading';
import { API_BASE_URL } from '@/api/client';
import { generateIssuesReport } from '@/utils/IssuesEngine';
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
  ChevronRight,
  FileText,
  Globe,
  Sliders,
  Copy,
  Check,
  Menu,
  CheckCircle2,
  RefreshCw,
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('presets');
  const [isExecutiveReportOpen, setIsExecutiveReportOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);

  const handleOpenSettings = (tab = 'presets') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const [crawlerSettings, setCrawlerSettings] = useState({
    maxPages: 500,
    maxDepth: 4,
    maxConcurrent: 3,
    stealthDelay: 0,
    ignoreUrlParams: true,
    checkExternalLinks: false,
    excludePaths: '',
    ignoreRobots: false,
    jsRendering: false,
    userAgent: 'SEO-Spider-Bot',
  });

  const [crawlId, setCrawlId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [pagesCrawled, setPagesCrawled] = useState(0);
  const [pages, setPages] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);

  const issuesReport = useMemo(() => generateIssuesReport(pages), [pages]);

  const [explorerCategory, setExplorerCategory] = useState('Page_Titles');
  const [explorerView, setExplorerView] = useState('All');

  const handleNavigateToExplorer = (category, view = 'All') => {
    if (category) setExplorerCategory(category);
    if (view) setExplorerView(view);
    setActiveTab('explorer');
  };

  const startAudit = async (e) => {
    if (e) e.preventDefault();
    if (!url) return;

    setIsAuditing(true);
    setStatus('running');
    setProgress(0);
    setPagesCrawled(0);
    setPages([]);
    setActiveTab('overview');
    setSelectedRow(null);
    setShowCompletionBanner(false);

    toast.info(`Spider initiated on ${url}`, {
      description: `Max ${crawlerSettings.maxPages} pages & depth ${crawlerSettings.maxDepth}`,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/crawls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed_url: url,
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
        }),
      });

      const data = await response.json();
      setCrawlId(data.id);
    } catch (error) {
      console.error('Failed to start audit:', error);
      setStatus('failed');
      setIsAuditing(false);
      toast.error('Failed to start audit crawl', {
        description: 'Please check backend server connection.',
      });
    }
  };

  const handleQuickLaunch = (targetUrl) => {
    setUrl(targetUrl);
    toast.success(`Loaded seed URL: ${targetUrl}`);
  };

  const fetchResults = useCallback(async () => {
    if (!crawlId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/crawls/${crawlId}/pages`);
      setPages(await response.json());
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
        const data = await response.json();

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

  const handleCopyUrl = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(false), 2000);
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
          className="absolute right-0 top-0 bottom-0 z-50 flex h-full w-full flex-col border-l border-slate-200 bg-white text-slate-900 shadow-[0_0_60px_-12px_rgba(15,23,42,0.25)] will-change-transform md:relative md:w-[480px]"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4">
            <div className="max-w-[380px] truncate">
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
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
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
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
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

            {selectedRow.audit_data &&
              Object.entries(selectedRow.audit_data).map(([category, data]) => {
                if (!data || Object.keys(data).length === 0) return null;

                return (
                  <motion.div key={category} variants={staggerItem}>
                    <h4 className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      <ChevronRight size={13} className="text-indigo-600" />{' '}
                      {category.replace(/_/g, ' ')}
                    </h4>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <table className="w-full text-left text-xs">
                        <tbody className="divide-y divide-slate-200">
                          {Object.entries(data).map(([key, val]) => (
                            <tr key={key} className="transition-colors hover:bg-slate-100">
                              <td className="w-1/2 py-2.5 pl-3 pr-2 align-top text-[11px] font-medium text-slate-500">
                                {key}
                              </td>
                              <td className="w-1/2 break-all py-2.5 pr-3 text-right font-mono text-[11px] font-semibold text-slate-900">
                                {typeof val === 'boolean' ? (
                                  <span className={val ? 'font-bold text-rose-700' : 'font-bold text-emerald-700'}>
                                    {val ? 'True' : 'False'}
                                  </span>
                                ) : val === null || val === undefined ? (
                                  '-'
                                ) : Array.isArray(val) ? (
                                  val.join(', ')
                                ) : typeof val === 'object' ? (
                                  JSON.stringify(val)
                                ) : (
                                  String(val)
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                );
              })}
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
        <div className="custom-scrollbar h-full overflow-y-auto">
          <IntegrationsPanel />
        </div>
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
          />
        );
      }

      return (
        <motion.div
          variants={staggerContainer(0.06, 0.05)}
          initial="initial"
          animate="animate"
          className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6 text-center backdrop-blur-xs"
        >
          <motion.div
            variants={staggerItem}
            animate={
              reduced ? undefined : { y: [0, -6, 0], transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } }
            }
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600 shadow-xs"
          >
            <Search size={28} />
          </motion.div>
          <motion.h3 variants={staggerItem} className="mb-1 text-lg font-bold text-slate-900">
            No Active Audit Session
          </motion.h3>
          <motion.p
            variants={staggerItem}
            className="mb-6 max-w-sm text-xs leading-relaxed text-slate-500"
          >
            Enter a website URL in the address bar above to deploy the Screaming Frog 32-factor
            crawling engine.
          </motion.p>

          <motion.div
            variants={staggerContainer(0.05)}
            className="flex max-w-md flex-wrap items-center justify-center gap-2"
          >
            <motion.span variants={staggerItem} className="mb-1 w-full font-mono text-[11px] text-slate-400">
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-700 shadow-xs transition-colors hover:border-indigo-400 hover:bg-indigo-50/50"
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

      <div className="relative flex h-screen overflow-hidden bg-[#F8FAFC] font-sans text-slate-900">
        <div className="ambient-bg" />

        {/* ---------------------------------------------------------------- */}
        {/* Sidebar — static on desktop, animated drawer on mobile            */}
        {/* ---------------------------------------------------------------- */}
        <div className="z-20 hidden w-[260px] shrink-0 md:block">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
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
              className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px] md:hidden"
            />
          )}
          {isMobileSidebarOpen && (
            <motion.div
              key="mobile-nav-panel"
              variants={reduced ? fade : slideOverLeft}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-y-0 left-0 z-40 w-[260px] will-change-transform md:hidden"
            >
              <Sidebar
                activeTab={activeTab}
                setActiveTab={(tab) => {
                  setActiveTab(tab);
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
                pagesCount={pages.length}
                issuesCount={issuesReport.length}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------------------------------------------------------------- */}
        {/* Main column                                                      */}
        {/* ---------------------------------------------------------------- */}
        <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tween(duration.panel, ease.outQuint)}
            className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 shadow-xs backdrop-blur-md sm:px-6"
          >
            <motion.button
              onClick={() => setIsMobileSidebarOpen(true)}
              whileTap={tapPress}
              transition={spring.press}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </motion.button>

            <form onSubmit={startAudit} className="relative flex max-w-2xl flex-1 items-center">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Globe size={16} />
              </div>
              <input
                type="url"
                className="glass-input w-full border-slate-300 bg-white py-2 pl-10 pr-28 font-mono text-xs font-medium text-slate-900 placeholder-slate-400 shadow-xs sm:pr-36"
                placeholder="Enter seed URL to crawl (e.g. https://bloomxsolutions.com/)..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isAuditing}
              />
              <div className="absolute inset-y-0 right-1.5 flex items-center">
                <motion.button
                  type="submit"
                  disabled={isAuditing}
                  whileTap={isAuditing ? undefined : tapPress}
                  transition={spring.press}
                  className="btn-primary h-8 px-3.5 text-xs font-bold shadow-xs sm:px-4"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={isAuditing ? 'busy' : 'idle'}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={tween(duration.micro, ease.outQuart)}
                      className="flex items-center gap-1.5"
                    >
                      {isAuditing ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-emerald-400" />
                          Crawling...
                        </>
                      ) : (
                        'Run Audit'
                      )}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
            </form>

            <div className="flex shrink-0 items-center gap-2">
              <motion.button
                onClick={() => setIsAppInitializing(true)}
                title="Replay the boot sequence"
                whileHover={{ y: -1 }}
                whileTap={tapPress}
                transition={spring.press}
                className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-600 shadow-xs hover:border-slate-300 hover:text-slate-900 sm:flex"
              >
                <RefreshCw size={12} className="text-indigo-600" />
                <span>Intro</span>
              </motion.button>

              <motion.button
                onClick={() => handleOpenSettings('limits')}
                whileHover={{ y: -1 }}
                whileTap={tapPress}
                transition={spring.press}
                className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-600 shadow-xs hover:border-slate-300 hover:text-slate-900 lg:flex"
              >
                <Sliders size={13} className="text-indigo-600" />
                <span>
                  Limit: <strong className="text-slate-900">{crawlerSettings.maxPages}</strong> |
                  Depth: <strong className="text-slate-900">{crawlerSettings.maxDepth}</strong>
                </span>
              </motion.button>

              <motion.button
                onClick={() => setIsExecutiveReportOpen(true)}
                whileTap={tapPress}
                transition={spring.press}
                className="btn-secondary gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs"
              >
                <FileText size={14} className="text-indigo-600" />
                <span className="hidden sm:inline">PDF Report</span>
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
                className="shimmer-active shrink-0 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-emerald-50/80 px-6 py-3.5 shadow-xs"
              >
                <div className="mb-1.5 flex justify-between font-mono text-xs font-bold tracking-wide">
                  <span className="flex items-center gap-2 text-indigo-700">
                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                    SCREAMING FROG SPIDER ACTIVE
                  </span>
                  <span className="font-mono font-bold tabular-nums text-slate-900">
                    {progress}% Complete
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full border border-slate-300/60 bg-slate-200">
                  <motion.div
                    className="h-full origin-left rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 shadow-xs"
                    initial={false}
                    animate={{ scaleX: progress / 100 }}
                    transition={{ duration: 0.6, ease: ease.outQuart }}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-slate-600">
                  <span>
                    Status: <strong className="uppercase text-indigo-700">{status}</strong>
                  </span>
                  <span>
                    URLs Extracted:{' '}
                    <strong className="font-bold tabular-nums text-slate-900">{pagesCrawled}</strong>
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
                className="mx-6 mt-4 flex shrink-0 items-center justify-between rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 p-3.5 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ ...spring.soft, delay: 0.1 }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-xs"
                  >
                    <CheckCircle2 size={18} />
                  </motion.div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Technical Audit Successfully Generated
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      All 32 technical parameters, Core Web Vitals, AEO and GEO metrics are live.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => setIsExecutiveReportOpen(true)}
                    whileTap={tapPress}
                    transition={spring.press}
                    className="btn-primary gap-1 px-3 py-1.5 text-xs font-bold shadow-xs"
                  >
                    <FileText size={13} className="text-emerald-400" /> View PDF
                  </motion.button>
                  <motion.button
                    onClick={() => setShowCompletionBanner(false)}
                    whileHover={{ rotate: 90, scale: 1.1 }}
                    whileTap={tapPress}
                    transition={spring.press}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab body */}
          <div className="flex-1 overflow-hidden p-4 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${activeTab}-${pages.length > 0}`}
                variants={reduced ? fade : tabPanel}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
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
            toast.success('Crawler settings updated and applied.');
          }}
          defaultTab={settingsTab}
        />

        <ExecutiveReportModal
          isOpen={isExecutiveReportOpen}
          onClose={() => setIsExecutiveReportOpen(false)}
          pages={pages}
          targetUrl={url}
        />
      </div>
    </>
  );
}
