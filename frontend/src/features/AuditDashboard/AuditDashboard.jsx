'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import Sidebar from './Sidebar/Sidebar';
import OverviewTab from './ResultsTab/OverviewTab';
// Secondary tabs, modals and drawers load on first use instead of shipping in the initial bundle.
const IssuesTab = dynamic(() => import('./ResultsTab/IssuesTab'), { ssr: false });
const URLExplorerTab = dynamic(() => import('./ResultsTab/URLExplorerTab'), { ssr: false });
const PerformanceTab = dynamic(() => import('./ResultsTab/PerformanceTab'), { ssr: false });
const KeywordsTab = dynamic(() => import('./ResultsTab/KeywordsTab'), { ssr: false });
const ExecutiveReportModal = dynamic(() => import('./ExecutiveReportModal'), { ssr: false });
const ExportAuditModal = dynamic(() => import('./ExportAuditModal'), { ssr: false });
const AiAssistantDrawer = dynamic(() => import('./AiAssistantDrawer'), { ssr: false });
const SettingsModal = dynamic(() => import('./SettingsModal/SettingsModal'), { ssr: false });
const IntegrationsPanel = dynamic(() => import('./IntegrationsPanel'), { ssr: false });
import ErrorBoundary from '@/components/common/ErrorBoundary';
import SpiderLiveProgressScreen from './SpiderLiveProgressScreen';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { API_BASE_URL, authFetch } from '@/api/client';
import { generateIssuesReport } from '@/utils/IssuesEngine';
import { copyToClipboard } from '@/utils/clipboard';
import { getDiagnosticDetail, getPriorityMeta } from '@/utils/diagnosticDetails';
import { getPageDuplicateRelationships } from '@/utils/duplicateDetector';
import { CrawlSummaryProvider, useCrawlSummaryFetch } from '@/context/CrawlSummaryContext';
import useHelper from '@/features/Helper/useHelper';
import useHelperRelay from '@/features/Helper/useHelperRelay';
import HelperChip from '@/features/Helper/HelperChip';
import HelperPanel from '@/features/Helper/HelperPanel';
import HelperFloating from '@/features/Helper/HelperFloating';
import { useCaptureActions } from '@/features/Helper/CaptureActions';
import dynamic from 'next/dynamic';
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
  LayoutDashboard,
  ListTree,
  Zap,
  ListOrdered,
} from 'lucide-react';

const fireCelebrationCannons = async () => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const { default: confetti } = await import('canvas-confetti');

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

const SLUG_TO_TAB = {
  dashboard: 'overview',
  overview: 'overview',
  issues: 'issues',
  explorer: 'explorer',
  'url-grid': 'explorer',
  grid: 'explorer',
  performance: 'performance',
  'speed-vitals': 'performance',
  vitals: 'performance',
  keywords: 'keywords',
  integrations: 'integrations',
};

const TAB_TO_SLUG = {
  overview: 'dashboard',
  issues: 'issues',
  explorer: 'explorer',
  performance: 'performance',
  keywords: 'keywords',
  integrations: 'integrations',
};

const PAGE_BATCH = 1000;

/** Load pages with id > afterId in 1,000-row batches until exhausted. */
async function fetchPagesSince(crawlId, afterId = 0) {
  const all = [];
  let cursor = afterId;
  for (;;) {
    const res = await authFetch(`${API_BASE_URL}/crawls/${crawlId}/pages?limit=${PAGE_BATCH}&after_id=${cursor}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return all;
}

// Mount a lazily-loaded overlay on its first open and keep it mounted (preserves exit animations).
function useMountedOnceOpened(isOpen) {
  const [mounted, setMounted] = useState(isOpen);
  if (isOpen && !mounted) setMounted(true);
  return mounted;
}

// Crawl settings recorded by the backend (snake_case) in the shape the settings modal edits.
function settingsFromCrawl(s) {
  const out = {};
  if (Number.isFinite(s.max_pages)) out.maxPages = s.max_pages;
  if (Number.isFinite(s.max_depth)) out.maxDepth = s.max_depth;
  if (s.exclude_paths != null) out.excludePaths = Array.isArray(s.exclude_paths) ? s.exclude_paths.join('\n') : String(s.exclude_paths);
  for (const [from, to] of [['ignore_robots', 'ignoreRobots'], ['js_rendering', 'jsRendering'], ['ignore_url_params', 'ignoreUrlParams'],
    ['check_external_links', 'checkExternalLinks'], ['crawl_author_archives', 'crawlAuthorArchives'],
    ['stay_in_folder', 'stayInFolder']]) {
    if (typeof s[from] === 'boolean') out[to] = s[from];
  }
  if (s.user_agent) out.userAgent = s.user_agent;
  return out;
}

// "Whole site: example.com · 28 Oct" / "Page: example.com/about · 29 Oct" for the audit switcher.
function auditLabel(mode, crawl) {
  const target = (crawl?.seed_url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const when = crawl?.started_at ? new Date(crawl.started_at.endsWith('Z') ? crawl.started_at : `${crawl.started_at}Z`)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  const prefix = mode === 'site' ? 'Whole site' : 'Page';
  return `${prefix}: ${target}${when ? ` · ${when}` : ''}`;
}

export default function AuditDashboard({ initialTab, initialOpenSettings = false }) {
  const reduced = useReducedMotion();

  const [url, setUrl] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);

  // Initialize active tab from prop, pathname slug, or query param
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab && (SLUG_TO_TAB[initialTab] || initialTab)) {
      return SLUG_TO_TAB[initialTab] || initialTab;
    }
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (SLUG_TO_TAB[path]) return SLUG_TO_TAB[path];
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && SLUG_TO_TAB[tab]) return SLUG_TO_TAB[tab];
    }
    return 'overview';
  });

  // URL-synced tab changer: updates internal state AND changes browser URL slug
  const handleTabChange = useCallback((tabId, options = { updateUrl: true }) => {
    setActiveTab(tabId);
    if (options.updateUrl && typeof window !== 'undefined') {
      const slug = TAB_TO_SLUG[tabId] || tabId;
      const targetPath = `/${slug}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab: tabId }, '', targetPath);
      }
    }
  }, []);

  // Sync with browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = (e) => {
      if (typeof window !== 'undefined') {
        const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
        if (SLUG_TO_TAB[path]) {
          setActiveTab(SLUG_TO_TAB[path]);
        } else if (!path) {
          setActiveTab('overview');
        } else if (e.state?.tab && SLUG_TO_TAB[e.state.tab]) {
          setActiveTab(e.state.tab);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // A legacy ?tab= link: the tab state already came from it (useState initializer); tidy the URL to /slug.
  useEffect(() => {
    if (initialTab) return;
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (!(path && SLUG_TO_TAB[path]) && tabParam && SLUG_TO_TAB[tabParam]) {
      const targetTab = SLUG_TO_TAB[tabParam];
      window.history.replaceState({ tab: targetTab }, '', `/${TAB_TO_SLUG[targetTab] || targetTab}`);
    }
  }, [initialTab]);

  const [integrationsStatus, setIntegrationsStatus] = useState([]);

  const fetchIntegrationsStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/integrations/status/1`);
      if (res.ok) {
        const data = await res.json();
        setIntegrationsStatus(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Could not fetch integrations status:', err);
    }
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(initialOpenSettings);
  const [settingsTab, setSettingsTab] = useState('presets');
  // The [slug] page reuses this component across routes: follow its props when they change
  // (render-time update, React's pattern for state derived from props).
  const [routeProps, setRouteProps] = useState({ initialTab, initialOpenSettings });
  if (routeProps.initialTab !== initialTab || routeProps.initialOpenSettings !== initialOpenSettings) {
    setRouteProps({ initialTab, initialOpenSettings });
    if (initialTab) setActiveTab(SLUG_TO_TAB[initialTab] || initialTab);
    if (initialOpenSettings) setIsSettingsOpen(true);
  }
  const [isExecutiveReportOpen, setIsExecutiveReportOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);
  const [copilotInitialUrl, setCopilotInitialUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const hasFiredCompletion = useRef(false);
  // Set when the user starts an audit, so the background load of the last crawl can't overwrite it.
  const auditStartedRef = useRef(false);

  const handleOpenSettings = (tab = 'presets') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const DEFAULT_CRAWLER_SETTINGS = {
    maxPages: 500,
    maxDepth: 4,
    maxConcurrent: 10,
    stealthDelay: 0,
    ignoreUrlParams: true,
    checkExternalLinks: false,
    excludePaths: '',
    ignoreRobots: false,
    jsRendering: false,
    userAgent: 'SEO-Spider-Bot',
    crawlAuthorArchives: false,
    stayInFolder: true,
  };

  // Settings saved in this browser win; otherwise the settings of the account's last crawl are reused below.
  const [hasBrowserSettings] = useState(() => {
    try { return typeof window !== 'undefined' && Boolean(localStorage.getItem('audit_crawler_settings')); } catch { return false; }
  });
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
  // 'site' follows links across the website; 'page' audits just the entered URL.
  const [auditMode, setAuditMode] = useState(() => {
    if (typeof window === 'undefined') return 'site';
    try { return localStorage.getItem('audit_mode') === 'page' ? 'page' : 'site'; } catch { return 'site'; }
  });
  // Latest audit of each mode ({ id, seed_url, status, mode }), so both can be kept and switched between.
  const [latestByMode, setLatestByMode] = useState({ site: null, page: null });
  const [viewMode, setViewMode] = useState('site');
  const [progress, setProgress] = useState(0);
  const [pagesCrawled, setPagesCrawled] = useState(0);
  const [crawlPhase, setCrawlPhase] = useState('crawling');
  const [queuePosition, setQueuePosition] = useState(null);
  const [pages, setPages] = useState([]);
  // Opens the AI page audit on the audited site's first page (the drawer lets the user change it).
  const openAiAudit = () => {
    setCopilotInitialUrl(pages?.[0]?.url || url || '');
    setIsAiCopilotOpen(true);
  };
  const [selectedRow, setSelectedRow] = useState(null);
  // Inlinks of the selected row; { pageId, items } so a stale response is never shown for another row.
  const [inlinksState, setInlinksState] = useState({ pageId: null, items: [] });
  const selectedRowId = selectedRow?.id ?? null;
  const inlinks = selectedRowId && inlinksState.pageId === selectedRowId ? inlinksState.items : [];
  const isLoadingInlinks = Boolean(selectedRowId) && inlinksState.pageId !== selectedRowId;

  useEffect(() => {
    if (!selectedRowId) return undefined;
    let cancelled = false;
    authFetch(`${API_BASE_URL}/pages/${selectedRowId}/inlinks`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setInlinksState({ pageId: selectedRowId, items: Array.isArray(data) ? data : [] }); })
      .catch(err => {
        console.error("Failed to fetch inlinks:", err);
        if (!cancelled) setInlinksState({ pageId: selectedRowId, items: [] });
      });
    return () => { cancelled = true; };
  }, [selectedRowId]);

  // Auto-load latest crawl data and integrations status on mount
  useEffect(() => {
    const loadLatestCrawl = async () => {
      try {
        const fetchLatest = async (mode) => {
          const r = await authFetch(`${API_BASE_URL}/crawls/latest?mode=${mode}`);
          return r.ok ? r.json() : null;
        };
        const [site, page] = await Promise.all([fetchLatest('site'), fetchLatest('page')]);
        if (auditStartedRef.current) return;
        setLatestByMode({ site: site?.id ? site : null, page: page?.id ? page : null });
        const latest = [site, page].filter(c => c?.id).sort((a, b) => b.id - a.id)[0];
        if (latest) {
          setCrawlId(latest.id);
          setViewMode(latest.mode || 'site');
          setUrl(latest.seed_url || '');
          setStatus(latest.status || 'completed');
          const pagesData = await fetchPagesSince(latest.id);
          if (pagesData.length > 0) setPages(pagesData);
        }
      } catch (err) {
        console.warn('Could not auto-load latest crawl:', err);
      }
    };
    const loadIntegrations = async () => {
      await Promise.resolve(); // state is only ever set after the request, never during the effect
      await fetchIntegrationsStatus();
    };
    // Both requests start together.
    Promise.all([loadIntegrations(), loadLatestCrawl()]);
  }, [fetchIntegrationsStatus]);

  const mountSettingsModal = useMountedOnceOpened(isSettingsOpen);
  const mountExecutiveReportModal = useMountedOnceOpened(isExecutiveReportOpen);
  const mountExportAuditModal = useMountedOnceOpened(isExportModalOpen);
  const mountAiAssistantDrawer = useMountedOnceOpened(isAiCopilotOpen);

  // Scores and issue results from the backend scoring engine, shared with every tab and modal.
  // Bumped after a keyword check so the dashboard's keyword and AI-answer cards reload.
  const [summaryVersion, setSummaryVersion] = useState(0);
  const refreshSummary = useCallback(() => setSummaryVersion((v) => v + 1), []);
  const crawlSummary = useCrawlSummaryFetch(crawlId, status, pages.length, summaryVersion);

  // New browser or device: start from the settings the last whole-site crawl used, once.
  const lastCrawlSettings = crawlSummary?.crawl?.mode !== 'page' ? crawlSummary?.crawl?.settings : null;
  const [restoredSettingsFrom, setRestoredSettingsFrom] = useState(null);
  if (!hasBrowserSettings && lastCrawlSettings && restoredSettingsFrom === null) {
    setRestoredSettingsFrom(crawlSummary.crawl.id);
    setCrawlerSettings(prev => ({ ...prev, ...settingsFromCrawl(lastCrawlSettings) }));
  }
  const issuesReport = useMemo(() => generateIssuesReport(pages, crawlSummary), [pages, crawlSummary]);

  const [explorerCategory, setExplorerCategory] = useState('Page_Titles');
  const [explorerView, setExplorerView] = useState('All');

  const handleNavigateToExplorer = (category, view = 'All') => {
    if (category) setExplorerCategory(category);
    if (view) setExplorerView(view);
    handleTabChange('explorer');
  };

  const switchToAudit = async (mode) => {
    const target = latestByMode[mode];
    if (!target?.id || target.id === crawlId) return;
    setSelectedRow(null);
    setShowCompletionBanner(false);
    setViewMode(mode);
    setCrawlId(target.id);
    setUrl(target.seed_url || '');
    setStatus(target.status || 'completed');
    setPages([]);
    try {
      setPages(await fetchPagesSince(target.id));
    } catch (err) {
      toast.error('Could not load that audit.', { description: err.message });
    }
  };

  const chooseAuditMode = (mode) => {
    setAuditMode(mode);
    try { localStorage.setItem('audit_mode', mode); } catch {}
  };

  // AuditPro Helper (browser extension): detection, relay of blocked pages during a crawl, "Audit this tab".
  const helper = useHelper();
  const [isHelperOpen, setIsHelperOpen] = useState(false);
  const helperRelay = useHelperRelay({ helper, crawlId, running: status === 'running' });

  // A single-page audit started from a captured tab: show it like an audit started from the URL bar.
  const adoptCaptureAudit = (data) => {
    if (!data?.id) return;
    setUrl(data.seed_url);
    setIsAuditing(true);
    setStatus('running');
    setProgress(0);
    setCrawlPhase('queued');
    setPagesCrawled(0);
    setPages([]);
    handleTabChange('overview');
    setSelectedRow(null);
    setShowCompletionBanner(false);
    setQueuePosition(null);
    hasFiredCompletion.current = false;
    auditStartedRef.current = true;
    setIsHelperOpen(false);
    setCrawlId(data.id);
    setViewMode('page');
    setLatestByMode(prev => ({ ...prev, page: { id: data.id, seed_url: data.seed_url, status: 'running', mode: 'page' } }));
  };
  const captureActions = useCaptureActions({
    capture: helper.capture,
    clearCapture: helper.clearCapture,
    crawlId,
    running: status === 'running',
    seedUrl: url,
    onAuditStarted: adoptCaptureAudit,
  });

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
    setCrawlPhase('crawling');
    setPagesCrawled(0);
    setPages([]);
    handleTabChange('overview');
    setSelectedRow(null);
    setShowCompletionBanner(false);
    setQueuePosition(null);
    hasFiredCompletion.current = false;
    auditStartedRef.current = true;

    toast.info(auditMode === 'page' ? `Auditing page ${normalizedUrl}` : `Crawling ${normalizedUrl}`, {
      description: auditMode === 'page'
        ? 'Single-page audit: page-level checks only.'
        : `Up to ${crawlerSettings.maxPages} pages, depth ${crawlerSettings.maxDepth}.`,
    });

    try {
      const response = await authFetch(`${API_BASE_URL}/crawls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed_url: normalizedUrl,
          mode: auditMode,
          max_depth: crawlerSettings.maxDepth,
          max_concurrent: crawlerSettings.maxConcurrent,
          max_pages: Math.min(crawlerSettings.maxPages, 1000), // server limit (older saved settings may be higher)
          stealth_delay: crawlerSettings.stealthDelay,
          ignore_url_params: crawlerSettings.ignoreUrlParams,
          check_external_links: crawlerSettings.checkExternalLinks,
          exclude_paths: crawlerSettings.excludePaths,
          ignore_robots: crawlerSettings.ignoreRobots,
          js_rendering: crawlerSettings.jsRendering,
          user_agent: crawlerSettings.userAgent,
          crawl_author_archives: crawlerSettings.crawlAuthorArchives ?? false,
          stay_in_folder: crawlerSettings.stayInFolder ?? true,
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
      setViewMode(auditMode);
      setLatestByMode(prev => ({ ...prev, [auditMode]: { id: data.id, seed_url: normalizedUrl, status: 'running', mode: auditMode } }));
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

  // Destructive: deletes every audit in the workspace, so it needs explicit confirmation, and the
  // dashboard is only cleared after the server confirms the deletion.
  const performClearAudit = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/crawls`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    } catch (err) {
      toast.error('Could not delete audit data', { description: err.message || 'Please try again.' });
      return;
    }
    setIsAuditing(false);
    setStatus(null);
    setLatestByMode({ site: null, page: null });
    setProgress(0);
    setPagesCrawled(0);
    setPages([]);
    setUrl('');
    setCrawlId(null);
    setSelectedRow(null);
    setInlinksState({ pageId: null, items: [] });
    setShowCompletionBanner(false);
    toast.success('Audit data deleted', { description: 'All site and page audits in this workspace were removed.' });
  };

  const handleClearAudit = () => {
    toast.warning('Delete all audit data?', {
      description: 'This removes every site and single-page audit in your workspace. It cannot be undone.',
      duration: 10000,
      action: { label: 'Delete', onClick: performClearAudit },
      cancel: { label: 'Cancel', onClick: () => {} },
    });
  };

  // Incremental polling: each tick downloads only pages added since the last tick. Ticks never overlap
  // (setTimeout chain) and back off when the server is slow or unreachable.
  const lastPageIdRef = useRef(0);
  useEffect(() => { lastPageIdRef.current = 0; }, [crawlId]);

  const fetchNewPages = useCallback(async () => {
    if (!crawlId) return;
    const fresh = await fetchPagesSince(crawlId, lastPageIdRef.current);
    if (fresh.length === 0) return;
    const isFirstBatch = lastPageIdRef.current === 0;
    lastPageIdRef.current = fresh[fresh.length - 1].id;
    setPages(prev => (isFirstBatch ? fresh : [...prev, ...fresh]));
  }, [crawlId]);

  useEffect(() => {
    if (!crawlId || status !== 'running') return undefined;
    let cancelled = false;
    let timer;
    let delay = 2500;

    const tick = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/crawls/${crawlId}/status`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (cancelled || !data || typeof data !== 'object') return;

        setPagesCrawled(data.pages_crawled);
        setCrawlPhase(data.phase || 'crawling');
        setQueuePosition(data.status === 'queued' ? (data.queue_position ?? 1) : null);
        // A single-page audit has 1 page to fetch; a site crawl is measured against its page limit.
        const limit = data.mode === 'page' ? 1 : (crawlerSettings?.maxPages || 500);
        const fetched = Math.min(80, Math.floor(((data.pages_crawled || 0) / limit) * 80));
        const phaseFloor = { queued: 0, crawling: 0, helper: 80, analysing: 85, enriching: 92 }[data.phase] ?? 0;
        setProgress(Math.min(98, Math.max(fetched, phaseFloor)));
        if (data.pages_crawled > 0) await fetchNewPages();
        delay = 2500;

        if (data.status === 'completed') {
          if (!hasFiredCompletion.current) {
            hasFiredCompletion.current = true;
            setProgress(100);
            // Post-processing and enrichment rewrite every page at the end: reload the full set once.
            try {
              const finalPages = await fetchPagesSince(crawlId);
              lastPageIdRef.current = finalPages.length ? finalPages[finalPages.length - 1].id : 0;
              setPages(finalPages);
            } catch (e) {
              console.error('Failed to fetch final pages:', e);
            }
            setIsAuditing(false);
            setShowCompletionBanner(true);
            fireCelebrationCannons();
            toast.success('Audit completed', {
              description: `Analyzed ${data.pages_crawled || 'all'} URLs.`,
            });
          }
          // A completed crawl replaces the workspace's other stored crawl, so only this mode remains.
          const doneMode = data.mode === 'page' ? 'page' : 'site';
          setLatestByMode(prev => ({ site: null, page: null, [doneMode]: prev[doneMode] ? { ...prev[doneMode], status: 'completed' } : null }));
          setStatus('completed');
          return;
        }
        if (data.status === 'failed') {
          setIsAuditing(false);
          setStatus('failed');
          toast.error('The crawl stopped before finishing. Partial results are shown.');
          return;
        }
      } catch (error) {
        console.warn('Polling error:', error?.message || error);
        delay = Math.min(delay * 2, 20000);
      }
      if (!cancelled) timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [crawlId, status, fetchNewPages, crawlerSettings?.maxPages]);

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
        <motion.div
          key="url-inspector-scrim"
          variants={fade}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={() => setSelectedRow(null)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs 2xl:hidden"
        />
      )}
      {selectedRow && (
        <motion.aside
          key="url-inspector"
          variants={reduced ? fade : slideOverRight}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07090E] text-slate-900 dark:text-slate-100 shadow-[0_0_60px_-12px_rgba(15,23,42,0.25)] will-change-transform sm:w-[440px] 2xl:relative 2xl:w-[480px]"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F19] p-3.5 sm:p-4 shrink-0">
            <div className="min-w-0 flex-1 pr-2">
              <span className="mb-0.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                URL Specs Inspector
              </span>
              <div className="flex items-center gap-2">
                <h3 className="truncate text-xs font-bold text-slate-900 dark:text-slate-100" title={selectedRow.url}>
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
                <button
                  type="button"
                  onClick={() => {
                    setCopilotInitialUrl(selectedRow.url);
                    setIsAiCopilotOpen(true);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#CAE366]/20 text-slate-900 dark:text-[#CAE366] hover:bg-[#CAE366]/30 border border-[#CAE366]/40 transition-colors cursor-pointer shrink-0"
                  title="Audit this URL with AI (page audit)"
                >
                  <Sparkles size={11} className="text-[#CAE366]" />
                  <span>AI Audit</span>
                </button>
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
                    {selectedRow.status_code ?? 0}
                  </span>
                </div>
                {selectedRow.audit_data?.Fetch && selectedRow.audit_data.Fetch.outcome !== 'ok' && (
                  <div className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-500">Fetch result</span>
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${selectedRow.audit_data.Fetch.side === 'site'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {selectedRow.audit_data.Fetch.side === 'site' ? 'Site problem (counts)' : selectedRow.audit_data.Fetch.side === 'ours' ? 'Our side (not counted)' : 'Could not check (not counted)'}
                      </span>
                    </div>
                    {selectedRow.audit_data.Fetch.reason && (
                      <p className="mt-1 text-slate-600">
                        {selectedRow.audit_data.Fetch.reason}
                        {selectedRow.audit_data.Fetch.attempts > 1 ? ` (${selectedRow.audit_data.Fetch.attempts} attempts)` : ''}
                      </p>
                    )}
                  </div>
                )}
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
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
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
                              <span>&ldquo;{rel.sharedValue}&rdquo;</span>
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
                <span className="text-[10px] text-slate-400 font-normal">Exact text & character lengths</span>
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
                <span className="text-[10px] text-slate-400 font-normal">Internal crawl source</span>
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
                            &ldquo;{link.anchor_text}&rdquo;
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
                    <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setInspectorFilter('all')}
                        className={`py-1 px-1.5 rounded-lg font-medium text-[10.5px] text-center transition-all ${
                          inspectorFilter === 'all'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
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
                            : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
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
                            : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
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
                            : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
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
                            : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
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
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 px-1">
                          <span>{category.replace(/_/g, ' ')}</span>
                          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-400">
                            {items.filter(i => i.priority === 'High').length > 0 && (
                              <span className="text-rose-600 dark:text-rose-400 font-bold mr-1.5">
                                {items.filter(i => i.priority === 'High').length} High
                              </span>
                            )}
                            {items.filter(i => i.priority === 'Medium').length > 0 && (
                              <span className="text-amber-600 dark:text-amber-400 font-bold mr-1.5">
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
                                    ? 'border-rose-200/90 bg-rose-50/20 dark:border-rose-900/50 dark:bg-rose-950/20'
                                    : item.priority === 'Medium'
                                    ? 'border-amber-200/90 bg-amber-50/20 dark:border-amber-900/50 dark:bg-amber-950/20'
                                    : item.priority === 'Low'
                                    ? 'border-blue-200/90 bg-blue-50/20 dark:border-blue-900/50 dark:bg-blue-950/20'
                                    : 'border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/40'
                                }`}
                              >
                                {/* Header / Summary Row */}
                                <div
                                  onClick={() => toggleDiagnosticExpanded(item.id)}
                                  className="p-3 flex items-start justify-between gap-2 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors select-none"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                                        {item.label}
                                      </span>
                                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${pMeta.color}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${pMeta.dot} ${pMeta.pulse ? 'animate-pulse' : ''}`} />
                                        {pMeta.badge}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                      {item.why || item.what}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 shrink-0 mt-0.5"
                                  >
                                    <ChevronDown
                                      size={14}
                                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                </div>

                                {/* Expanded Diagnostic Detail */}
                                {isExpanded && (
                                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800/80 text-xs space-y-2.5">
                                    {/* 1. What is it */}
                                    <div className="p-2.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                                      <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                                        Condition & What It Evaluates:
                                      </span>
                                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                                        {item.what}
                                      </p>
                                    </div>

                                    {/* 2. Why True/False & Root Cause for this specific URL */}
                                    <div className={`p-2.5 rounded-lg border ${
                                      item.isIssue 
                                        ? 'bg-rose-50/60 border-rose-200 text-rose-950 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200' 
                                        : 'bg-emerald-50/40 border-emerald-200 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-900/60 dark:text-emerald-200'
                                    }`}>
                                      <span className={`font-mono text-[10px] font-bold uppercase tracking-wider block mb-1 flex items-center gap-1 ${
                                        item.isIssue ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                                      }`}>
                                        <Info size={11} />
                                        {item.isIssue ? 'Why Triggered on this URL (Root Cause):' : 'Evaluation Result:'}
                                      </span>
                                      <p className="leading-relaxed text-[11px] font-medium">
                                        {item.why}
                                      </p>
                                    </div>

                                    {/* 3. Search Engine / Business Impact */}
                                    {item.searchImpact && (
                                      <div className="p-2.5 rounded-lg bg-amber-50/40 border border-amber-200/80 text-amber-950 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-200">
                                        <span className="font-mono text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block mb-1 flex items-center gap-1">
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
                                      <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-200 text-indigo-950 dark:bg-blue-950/30 dark:border-blue-900/60 dark:text-blue-200 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="font-mono text-[10px] font-bold text-indigo-800 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1">
                                            <Wrench size={11} />
                                            How to Resolve (Action Plan):
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyText(item.howToResolve, `fix-${item.id}`, 'Fix Guide');
                                            }}
                                            className="font-mono text-[10px] font-bold text-indigo-700 dark:text-blue-300 hover:text-indigo-900 dark:hover:text-blue-100 flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-indigo-200 dark:border-blue-800 transition-colors"
                                            title="Copy fix instructions"
                                          >
                                            {copiedKeyId === `fix-${item.id}` ? (
                                              <>
                                                <Check size={10} className="text-emerald-600 dark:text-emerald-400" />
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
                                        <p className="leading-relaxed text-[11px] text-slate-800 dark:text-slate-200 font-sans">
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
          <ErrorBoundary
            title="Integrations Telemetry Encountered an Issue"
            onFallback={() => handleTabChange('overview')}
          >
            <Suspense fallback={
              <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center">
                <Loader2 className="animate-spin text-indigo-500 mb-3" size={32} />
                <p className="text-xs font-mono text-slate-400">Loading integrations telemetry...</p>
              </div>
            }>
              <IntegrationsPanel 
                projectId={1} 
                crawlId={crawlId} 
                seedUrl={url} 
                pages={pages}
                onAuditProperty={(propUrl) => {
                  if (!propUrl) return;
                  let clean = propUrl.replace(/^sc-domain:/i, '').trim();
                  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
                    clean = `https://${clean}`;
                  }
                  startAudit(null, clean);
                }}
              />
            </Suspense>
          </ErrorBoundary>
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
            phase={crawlPhase}
            queuePosition={queuePosition}
            mode={viewMode}
            onSwitchTab={(tab) => handleTabChange(tab)}
          />
        );
      }

      if (pages.length > 0) {
        return (
          <OverviewTab
            key={`overview-${crawlId || 'ready'}`}
            pages={pages}
            integrationsStatus={integrationsStatus}
            onNavigateToExplorer={handleNavigateToExplorer}
            onNavigateToTab={(tab) => handleTabChange(tab)}
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
            Enter a website address above to check it for broken pages, missing Google info,
            slow loading and more.
          </motion.p>

          <motion.div
            variants={staggerContainer(0.05)}
            className="flex max-w-md w-full flex-wrap items-center justify-center gap-2 px-2"
          >
            <motion.span variants={staggerItem} className="mb-1 w-full font-mono text-[11px] text-slate-400 dark:text-slate-400 text-center">
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
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-700 dark:text-slate-200 shadow-xs transition-colors hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-slate-700 cursor-pointer max-w-full truncate"
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
          onOpenAiCopilot={(targetUrl) => {
            setCopilotInitialUrl(targetUrl);
            setIsAiCopilotOpen(true);
          }}
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
          onOpenAiCopilot={(targetUrl) => {
            setCopilotInitialUrl(targetUrl);
            setIsAiCopilotOpen(true);
          }}
        />
      );
    }

    if (activeTab === 'performance') {
      return <PerformanceTab pages={pages} />;
    }

    if (activeTab === 'keywords') {
      return <KeywordsTab onNavigateToTab={(tab) => handleTabChange(tab)} onChecked={refreshSummary} />;
    }


    return null;
  };

  return (
    // reducedMotion="user": every Framer animation below follows the system "reduce motion" setting.
    <MotionConfig reducedMotion="user">
    <CrawlSummaryProvider value={crawlSummary}>
      <div className="relative flex h-screen h-[100dvh] w-full overflow-hidden bg-[#F8FAFC] dark:bg-[#050505] font-sans text-slate-900 dark:text-[#FFFFFF] transition-colors duration-200">
        <div className="ambient-bg" />

        {/* ---------------------------------------------------------------- */}
        {/* Sidebar — static on desktop, animated drawer on mobile            */}
        {/* ---------------------------------------------------------------- */}
        <div className="z-20 hidden w-[260px] shrink-0 lg:block">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            onOpenExport={() => setIsExportModalOpen(true)}
            onOpenExecutiveReport={() => setIsExecutiveReportOpen(true)}
            onOpenSettings={handleOpenSettings}
            onOpenAiAudit={openAiAudit}
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
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
            />
          )}
          {isMobileSidebarOpen && (
            <motion.div
              key="mobile-nav-panel"
              variants={reduced ? fade : slideOverLeft}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] will-change-transform lg:hidden shadow-2xl bg-white dark:bg-[#07080B]"
            >
              <Sidebar
                activeTab={activeTab}
                setActiveTab={(tab) => {
                  handleTabChange(tab);
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
                onOpenAiAudit={() => {
                  openAiAudit();
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
        <main className="@container relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tween(duration.panel, ease.outQuint)}
            className="flex h-16 shrink-0 items-center justify-between gap-2 sm:gap-3.5 border-b border-slate-200 dark:border-white/[0.08] bg-white/90 dark:bg-[#07080B]/90 px-2.5 sm:px-6 shadow-xs backdrop-blur-md transition-colors"
          >
            <motion.button
              onClick={() => setIsMobileSidebarOpen(true)}
              whileTap={tapPress}
              transition={spring.press}
              className="flex items-center justify-center rounded-xl p-2 text-slate-600 dark:text-[#D6E5FC]/70 hover:bg-slate-100 dark:hover:bg-[#121620] hover:text-slate-900 dark:hover:text-white lg:hidden shrink-0 touch-target"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </motion.button>

            <form
              onSubmit={startAudit}
              className="group relative flex w-full max-w-2xl flex-1 min-w-0 items-center rounded-full border border-slate-300 dark:border-white/[0.1] bg-white dark:bg-[#0D0F15] p-1 pl-3 sm:pl-4 shadow-xs transition-all focus-within:border-[#CAE366] focus-within:ring-2 focus-within:ring-[#CAE366]/20 sm:max-w-3xl"
            >
              <div className="pointer-events-none flex shrink-0 items-center text-slate-400 dark:text-[#D6E5FC]/50 group-focus-within:text-[#CAE366] transition-colors mr-1.5 sm:mr-2">
                <Globe size={15} />
              </div>
              <input
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                aria-label={auditMode === 'page' ? 'Page URL to audit' : 'Website URL to crawl'}
                className="w-full min-w-0 flex-1 bg-transparent py-1 font-sans text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#D6E5FC]/40 outline-none border-0 focus:outline-none focus:ring-0"
                placeholder={auditMode === 'page' ? 'Page URL (e.g. bloomxsolutions.com/about/)' : 'Website URL (e.g. bloomxsolutions.com)'}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isAuditing}
              />
              {url && !isAuditing && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="p-1 mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Clear input"
                >
                  <X size={14} />
                </button>
              )}
              <div role="group" aria-label="Audit scope" className="hidden @2xl:flex shrink-0 items-center rounded-full bg-slate-100 dark:bg-white/[0.06] p-0.5 mr-1 text-[11px] font-bold">
                {[{ id: 'page', label: 'Single page' }, { id: 'site', label: 'Whole site' }].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={auditMode === opt.id}
                    disabled={isAuditing}
                    onClick={() => chooseAuditMode(opt.id)}
                    className={`relative isolate rounded-full px-2.5 py-1 transition-colors duration-200 ${auditMode === opt.id
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-[#D6E5FC]/60 hover:text-slate-800 dark:hover:text-white'}`}
                  >
                    {/* One shared pill slides between the options instead of each restyling itself. */}
                    {auditMode === opt.id && (
                      <motion.span
                        layoutId="audit-scope-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 -z-10 rounded-full bg-white dark:bg-[#1A1F2B] shadow-sm dark:border dark:border-[#D3DD99]/20"
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
              <motion.button
                type="submit"
                disabled={isAuditing}
                whileTap={isAuditing ? undefined : tapPress}
                transition={spring.press}
                className="btn-primary ml-1 h-9 shrink-0 rounded-full px-3 sm:px-5 text-xs font-bold tracking-wide shadow-md cursor-pointer"
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
                        <Loader2 size={13} className="animate-spin text-[#CAE366]" />
                        <span className="hidden xs:inline">Crawling...</span>
                      </>
                    ) : (
                      <>
                        <span className="hidden @md:inline">Run </span>Audit
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </form>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <HelperChip helper={helper} onOpen={() => setIsHelperOpen(true)} />
              <motion.button
                onClick={handleClearAudit}
                whileHover={{ scale: 1.02 }}
                whileTap={tapPress}
                transition={spring.press}
                disabled={isAuditing}
                className="btn-secondary h-9 px-2 sm:px-3 text-xs font-bold gap-1.5 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800/60 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                title="Clear audit data from dashboard"
                aria-label="Clear audit data"
              >
                <Trash2 size={14} className="text-rose-500" />
                <span className="hidden @3xl:inline">Clear</span>
              </motion.button>
            </div>
          </motion.header>

          {/* Audit scope: mobile toggle + switcher between the kept single-page and whole-site audits */}
          {/* Always shown on mobile (toggle); on desktop only when there are two audits to switch between. */}
          <div className={`${latestByMode.site && latestByMode.page ? 'flex' : 'flex @2xl:hidden'} flex-wrap items-center gap-2 px-3 sm:px-5 pt-2 text-[11px]`}>
              <div role="group" aria-label="Audit scope" className="flex @2xl:hidden items-center rounded-full bg-slate-100 dark:bg-white/[0.06] p-0.5 font-bold">
                {[{ id: 'page', label: 'Single page' }, { id: 'site', label: 'Whole site' }].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={auditMode === opt.id}
                    disabled={isAuditing}
                    onClick={() => chooseAuditMode(opt.id)}
                    className={`rounded-full px-3 py-1.5 min-h-[28px] ${auditMode === opt.id ? 'bg-white dark:bg-[#1A1F2B] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#D6E5FC]/60'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {latestByMode.site && latestByMode.page && (
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">Viewing:</span>
                  {['site', 'page'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={viewMode === mode}
                      disabled={isAuditing}
                      onClick={() => {
                        if (viewMode === mode) return;
                        const target = latestByMode[mode];
                        // Switching replaces everything on screen, so say what it switches to first.
                        if (window.confirm(`Show the ${auditLabel(mode, target)} instead of the audit on screen now?`)) switchToAudit(mode);
                      }}
                      title={latestByMode[mode]?.seed_url}
                      className={`rounded-full border px-2.5 py-1 font-bold max-w-[220px] truncate ${viewMode === mode
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-white/10 hover:border-indigo-300'}`}
                    >
                      {auditLabel(mode, latestByMode[mode])}
                    </button>
                  ))}
                </div>
              )}
          </div>

          {/* Live crawl banner */}
          <AnimatePresence initial={false}>
            {isAuditing && activeTab !== 'overview' && (
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
                    CRAWL IN PROGRESS
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

          {/* Tab body with mobile safe area bottom clearance */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 pb-20 lg:pb-6">
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

        {/* ---------------------------------------------------------------- */}
        {/* Mobile Bottom Navigation Bar (Tier-1 Native App Experience)     */}
        {/* ---------------------------------------------------------------- */}
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 inset-x-0 z-30 lg:hidden flex items-center justify-around border-t border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-[#07080B]/95 backdrop-blur-xl px-1.5 py-1 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.65)]"
        >
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'issues', label: 'Issues', icon: AlertTriangle, badge: issuesReport.length },
            { id: 'explorer', label: 'URLs', icon: ListTree, badge: pages.length },
            { id: 'performance', label: 'Speed', icon: Zap },
            { id: 'keywords', label: 'Keywords', icon: ListOrdered },
            { id: 'integrations', label: 'APIs', icon: Layers },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <motion.button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                whileTap={tapPress}
                className={`relative flex flex-1 flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors cursor-pointer ${
                  isActive
                    ? 'text-indigo-600 dark:text-[#CAE366] font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <div className="relative">
                  <Icon size={18} className={isActive ? 'stroke-[2.5]' : 'stroke-2'} />
                  {tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold font-mono flex items-center justify-center leading-none">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
                {isActive ? (
                  <motion.div
                    layoutId="mobile-bottom-active-dot"
                    transition={spring.snap}
                    className="mt-0.5 w-1 h-1 rounded-full bg-indigo-600 dark:bg-[#CAE366]"
                  />
                ) : (
                  <div className="mt-0.5 w-1 h-1" />
                )}
              </motion.button>
            );
          })}
        </nav>

        {renderDrawer()}

        {mountSettingsModal && <SettingsModal
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
        />}

        {mountExecutiveReportModal && <ExecutiveReportModal
          isOpen={isExecutiveReportOpen}
          onClose={() => setIsExecutiveReportOpen(false)}
          pages={pages}
          targetUrl={url}
          crawlId={crawlId}
        />}

        {mountExportAuditModal && <ExportAuditModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          pages={pages}
          targetUrl={url}
          onOpenAiAudit={openAiAudit}
          onOpenPdfReport={() => {
            setIsExportModalOpen(false);
            setIsExecutiveReportOpen(true);
          }}
        />}

        {mountAiAssistantDrawer && <AiAssistantDrawer
          isOpen={isAiCopilotOpen}
          onClose={() => setIsAiCopilotOpen(false)}
          initialUrl={copilotInitialUrl || url}
          domain={url ? (url.replace(/^https?:\/\//, '').split('/')[0]) : ''}
          pages={pages}
        />}

        <HelperPanel
          isOpen={isHelperOpen}
          onClose={() => setIsHelperOpen(false)}
          helper={helper}
          siteUrl={url}
          captureActions={captureActions}
        />
        <HelperFloating
          relayApi={helperRelay}
          summary={helperRelay.summary}
          capture={helper.capture}
          captureActions={captureActions}
          hideCapture={isHelperOpen}
        />
      </div>
    </CrawlSummaryProvider>
    </MotionConfig>
  );
}
