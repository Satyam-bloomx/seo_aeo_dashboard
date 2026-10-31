'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { duration, ease, spring, tapPress, tween } from '@/lib/motion';
import CustomSelect from '@/components/ui/CustomSelect';
import {
  Filter,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  TableProperties,
  FolderTree,
  Layers,
  List,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Sparkles
} from 'lucide-react';
import URLTreeTable from './URLTreeTable';
import DuplicateGroupsView from './DuplicateGroupsView';
import { copyToClipboard } from '@/utils/clipboard';
import { getDiagnosticDetail } from '@/utils/diagnosticDetails';
import {
  MASTER_EXPORT_FIELDS,
  exportMasterAuditToExcel,
  exportMasterAuditToCSV,
  exportFilteredViewToCSV
} from '@/utils/exportUtils';
import { buildPageTypeScopes, PAGE_TYPE_SCOPES } from '@/utils/pageTypes';
import { generateIssuesReport } from '@/utils/IssuesEngine';
import { gscIndexState } from '@/utils/gscStatus';
import { useCrawlSummary } from '@/context/CrawlSummaryContext';

// "PageSpeed" holds the Core Web Vitals, so it is listed under the name users search for.
const CATEGORY_OPTIONS_LABELS = { PageSpeed: 'Core Web Vitals (PageSpeed)' };

const CATEGORIES = [
  'Internal', 'External', 'Security', 'Response_Codes', 'URI', 'Page_Titles',
  'Meta_Description', 'Meta_Keywords', 'H1', 'H2', 'Content', 'Images',
  'Canonicals', 'Pagination', 'Directives', 'Hreflang', 'JavaScript', 'Links',
  'AMP', 'Structured_Data', 'Sitemaps', 'PageSpeed', 'AEO_Audit', 'GEO_Audit',
  'Google_Analytics', 'Search_Console', 'Mobile', 'Accessibility', 'Validation', 'Link_Metrics'
];

export function getLengthNoSpaces(text) {
  if (!text) return 0;
  return String(text).replace(/\s+/g, '').length;
}

const CATEGORY_OPTIONS = CATEGORIES.map((c) => (CATEGORY_OPTIONS_LABELS[c] ? { value: c, label: CATEGORY_OPTIONS_LABELS[c] } : c));

// Keys that are internal plumbing, never useful as a column or a filter.
const INTERNAL_KEY_RE = /(^|_)(urls|count)$|^link_score$|^inlinks$|^outlinks$/i;
const isInternalKey = (k) => INTERNAL_KEY_RE.test(k) || /_urls$/i.test(k) || k === 'near_duplicate_urls';
const normKey = (k) => String(k).toLowerCase().replace(/[_\s]/g, '');

const CATEGORY_PRIMARY_COLUMNS = {
  PageSpeed: [
    { key: 'cwv_score', label: 'Performance Score' },
    { key: 'cwv_lcp', label: 'LCP' },
    { key: 'cwv_inp', label: 'INP' },
    { key: 'cwv_cls', label: 'CLS' },
    { key: 'cwv_ttfb', label: 'TTFB' },
  ],
  Page_Titles: [
    { key: 'title_1', label: 'Title 1' },
    { key: 'title_1_length', label: 'Length' },
    { key: 'title_1_pixel_width', label: 'Pixel Width' },
    { key: 'title_count', label: 'Occurrences' },
  ],
  Meta_Description: [
    { key: 'meta_desc_1', label: 'Meta Description 1' },
    { key: 'meta_desc_1_length', label: 'Length' },
    { key: 'meta_desc_1_pixel_width', label: 'Pixel Width' },
    { key: 'meta_desc_count', label: 'Occurrences' },
  ],
  H1: [
    { key: 'h1_1', label: 'H1-1' },
    { key: 'h1_1_length', label: 'H1-1 Length' },
    { key: 'h1_2', label: 'H1-2' },
    { key: 'h1_2_length', label: 'H1-2 Length' },
    { key: 'h1_count', label: 'H1 Count' },
  ],
  H2: [
    { key: 'h2_1', label: 'H2-1' },
    { key: 'h2_1_length', label: 'H2-1 Length' },
    { key: 'h2_2', label: 'H2-2' },
    { key: 'h2_2_length', label: 'H2-2 Length' },
    { key: 'h2_2_length_no_spaces', label: 'H2-2 (No Spaces)' },
    { key: 'h2_count', label: 'H2 Count' },
  ],
  Canonicals: [
    { key: 'canonical_link_element_1', label: 'Canonical Link Element 1' },
    { key: 'canonical_count', label: 'Occurrences' },
    { key: 'indexability', label: 'Indexability' },
    { key: 'indexability_status', label: 'Indexability Status' },
  ],
  Directives: [
    { key: 'meta_robots_1', label: 'Meta Robots 1' },
  ],
  Content: [
    { key: 'word_count', label: 'Word Count' },
  ],
  Internal: [
    { key: 'link_score', label: 'Link Score' },
    { key: 'status_code', label: 'Status Code' },
    { key: 'indexability', label: 'Indexability' },
    { key: 'inlinks', label: 'Inlinks' },
    { key: 'outlinks', label: 'Outlinks' },
    { key: 'crawl_depth', label: 'Crawl Depth' },
  ],
  Links: [
    { key: 'link_score', label: 'Link Score' },
    { key: 'inlinks', label: 'Inlinks' },
    { key: 'outlinks', label: 'Outlinks' },
    { key: 'crawl_depth', label: 'Crawl Depth' },
  ],
  Security: [
    { key: 'mixed_content', label: 'Mixed Content' },
    { key: 'hsts_header', label: 'HSTS' },
    { key: 'csp_header', label: 'CSP' },
    { key: 'x_content_type', label: 'X-Content-Type' },
    { key: 'x_frame_options', label: 'X-Frame-Options' },
  ],
  Sitemaps: [
    { key: 'in_sitemap', label: 'In Sitemap' },
    { key: 'non_indexable_sitemap', label: 'Non-Indexable' },
    { key: 'orphan_status', label: 'Orphan URL' },
  ],
  AEO_Audit: [
    { key: 'aeo_score', label: 'AEO Score' },
    { key: 'ai_engine_status', label: 'AI Engine Status' },
    { key: 'search_intent', label: 'Search Intent' },
    { key: 'llm_extractability', label: 'LLM Extractability' },
    { key: 'voice_search_readiness', label: 'Voice Readiness' },
    { key: 'ai_summary', label: 'AI Key Takeaway' },
  ],
};

const ON_PAGE_HTML_CATEGORIES = [
  'Page_Titles', 'Meta_Description', 'Meta_Keywords', 'H1', 'H2',
  'Content', 'Directives', 'Canonicals', 'Validation', 'Structured_Data',
  'AEO_Audit', 'GEO_Audit'
];

export function getPageCellValue(page, colKey, activeCategory) {
  if (!page) return '';
  const catData = page.audit_data?.[activeCategory] || {};

  // Exact Character count without spaces
  if (colKey === 'title_1_length_no_spaces') return getLengthNoSpaces(page.title_1);
  if (colKey === 'meta_desc_1_length_no_spaces') return getLengthNoSpaces(page.meta_desc_1);
  if (colKey === 'h1_1_length_no_spaces') return getLengthNoSpaces(page.h1_1);
  if (colKey === 'h1_2_length_no_spaces') return getLengthNoSpaces(page.h1_2);
  if (colKey === 'h2_1_length_no_spaces') return getLengthNoSpaces(page.h2_1);
  if (colKey === 'h2_2_length_no_spaces') return getLengthNoSpaces(page.h2_2);

  // Standard character count with spaces
  if (colKey === 'title_1_length') return page.title_1_length ?? (page.title_1 ? page.title_1.length : 0);
  if (colKey === 'meta_desc_1_length') return page.meta_desc_1_length ?? (page.meta_desc_1 ? page.meta_desc_1.length : 0);
  if (colKey === 'h1_1_length') return page.h1_1_length ?? (page.h1_1 ? page.h1_1.length : 0);
  if (colKey === 'h1_2_length') return page.h1_2_length ?? (page.h1_2 ? page.h1_2.length : 0);
  if (colKey === 'h2_1_length') return page.h2_1_length ?? (page.h2_1 ? page.h2_1.length : 0);
  if (colKey === 'h2_2_length') return page.h2_2_length ?? (page.h2_2 ? page.h2_2.length : 0);

  // Core Web Vitals (mobile lab data, falling back to desktop)
  if (colKey.startsWith('cwv_')) {
    const ps = page.audit_data?.PageSpeed;
    const m = ps?.mobile?.metrics || ps?.desktop?.metrics;
    if (colKey === 'cwv_score') return ps?.mobile?.performance_score ?? ps?.desktop?.performance_score ?? '';
    return m?.[colKey.slice(4)] ?? '';
  }

  // Page type & pagination
  if (colKey === 'Page_Type') return page.audit_data?.Page_Type?.Type || '';

  // Link Score & Graph
  if (colKey === 'link_score') {
    const score = page.audit_data?.Links?.Link_Score ?? page.audit_data?.Internal?.Link_Score;
    return score !== undefined ? score : '';
  }
  if (colKey === 'inlinks') {
    const inlinks = page.audit_data?.Links?.Inlinks ?? page.audit_data?.Internal?.Inlinks;
    return inlinks !== undefined ? inlinks : '';
  }
  if (colKey === 'outlinks') {
    const outlinks = page.audit_data?.Links?.Outlinks ?? page.audit_data?.Internal?.Outlinks;
    return outlinks !== undefined ? outlinks : '';
  }

  // Security Suite Columns
  if (colKey === 'mixed_content') return catData['Mixed Content'] ? 'Yes' : 'No';
  if (colKey === 'hsts_header') return catData['Missing HSTS Header'] ? 'Missing' : 'Present';
  if (colKey === 'csp_header') return catData['Missing Content-Security-Policy Header'] ? 'Missing' : 'Present';
  if (colKey === 'x_content_type') return catData['Missing X-Content-Type-Options Header'] ? 'Missing' : 'nosniff';
  if (colKey === 'x_frame_options') return catData['Missing X-Frame-Options Header'] ? 'Missing' : 'Present';

  // Sitemaps Reconciliation Columns
  if (colKey === 'in_sitemap') return catData['URLs In Sitemap'] ? 'Yes' : 'No';
  if (colKey === 'non_indexable_sitemap') return catData['Non-Indexable URLs in Sitemap'] ? 'Non-Indexable' : 'Indexable';
  if (colKey === 'orphan_status') return catData['Orphan URLs'] ? 'Yes' : 'No';

  // Occurrence Counts (0 for missing, 1, 2, etc.)
  if (colKey === 'title_count') return (page.title_1 && String(page.title_1).trim() !== '') ? 1 : 0;
  if (colKey === 'meta_desc_count') return (page.meta_desc_1 && String(page.meta_desc_1).trim() !== '') ? 1 : 0;
  if (colKey === 'canonical_count') return (page.canonical_link_element_1 && String(page.canonical_link_element_1).trim() !== '') ? 1 : 0;

  if (colKey === 'h1_count') {
    if (catData['Missing'] === true || !page.h1_1 || String(page.h1_1).trim() === '') return 0;
    if (page.h1_2 && String(page.h1_2).trim() !== '') return 2;
    if (catData['Multiple'] === true) return 2;
    return 1;
  }

  if (colKey === 'h2_count') {
    if (catData['Missing'] === true || !page.h2_1 || String(page.h2_1).trim() === '') return 0;
    if (page.h2_2 && String(page.h2_2).trim() !== '') return 2;
    if (catData['Multiple'] === true) return 2;
    return 1;
  }

  // AEO Audit Cell Values
  if (colKey === 'aeo_score') {
    const aeo = page.audit_data?.AEO_Audit;
    return aeo?.aeo_score ?? aeo?.Gemini_Synthesis_Score ?? aeo?.OpenAI_Synthesis_Score ?? '';
  }
  if (colKey === 'ai_engine_status') {
    const aeo = page.audit_data?.AEO_Audit;
    return aeo?.Gemini_Live_Status || aeo?.Perplexity_Citation_Status || aeo?.OpenAI_Live_Status || (aeo?.is_ai_connected ? 'Connected' : 'Offline');
  }
  if (colKey === 'search_intent') {
    const aeo = page.audit_data?.AEO_Audit;
    return aeo?.Gemini_Search_Intent || aeo?.Search_Intent || 'Informational';
  }
  if (colKey === 'llm_extractability') {
    const aeo = page.audit_data?.AEO_Audit;
    return aeo?.LLM_Extractability || aeo?.['LLM Extractability'] || 'High';
  }
  if (colKey === 'voice_search_readiness') {
    const aeo = page.audit_data?.AEO_Audit;
    return aeo?.Voice_Search_Readiness || aeo?.['Voice Search Readiness'] || 'Optimized';
  }
  if (colKey === 'ai_summary') {
    const aeo = page.audit_data?.AEO_Audit;
    return aeo?.Gemini_Key_Takeaway || aeo?.Perplexity_AI_Summary || '';
  }

  if (catData[colKey] !== undefined) return catData[colKey];
  if (page[colKey] !== undefined) return page[colKey];
  return undefined;
}

export function checkPageMatchesView(p, activeCategory, viewName) {
  if (!viewName || viewName === 'All') return true;

  if (activeCategory === 'Response_Codes') {
    if (viewName === 'Client Error (4xx)' || viewName === '4xx' || viewName === 'Errors') {
      return (p.status_code ?? 0) >= 400 && (p.status_code ?? 0) < 500;
    }
    if (viewName === 'Redirection (3xx)' || viewName === '3xx') {
      return (p.status_code ?? 0) >= 300 && (p.status_code ?? 0) < 400;
    }
    if (viewName === 'Server Error (5xx)' || viewName === '5xx') {
      return (p.status_code ?? 0) >= 500;
    }
    if (viewName === 'Success (2xx)' || viewName === '2xx') {
      return (p.status_code ?? 0) >= 200 && (p.status_code ?? 0) < 300;
    }
    if (viewName === 'Blocked') {
      return p.status_code === 0 || Boolean(p.audit_data?.Response_Codes?.Blocked);
    }
    if (viewName === 'Could not check') {
      const fetch = p.audit_data?.Fetch;
      return Boolean(fetch && fetch.outcome !== 'ok' && fetch.side !== 'site');
    }
    if (viewName === 'Redirection (Meta Refresh)') {
      return Boolean(p.audit_data?.Response_Codes?.['Redirection (Meta Refresh)']);
    }
    return true;
  }

  if (viewName === 'Zombie Pages (0 Visits)') {
    return p.audit_data?.Google_Analytics?.Is_Zombie_Page === true;
  }
  if (viewName === 'High Traffic at Risk') {
    return Boolean(p.audit_data?.Google_Analytics?.Revenue_At_Risk?.startsWith('High'));
  }
  if (viewName === 'Indexed & Rank Eligible') {
    return gscIndexState(p.audit_data?.Search_Console) === 'indexed';
  }
  if (viewName === 'Crawled - Not Indexed') {
    return gscIndexState(p.audit_data?.Search_Console) === 'not_indexed';
  }
  if (viewName === 'Excluded by Google') {
    const gsc = p.audit_data?.Search_Console;
    return Boolean(
      (gsc?.Google_Index_Status || '').toLowerCase().includes('excluded') ||
      (gsc?.Index_Coverage_State || '').toLowerCase().includes('excluded')
    );
  }
  if (viewName === 'Canonical Mismatches') {
    return p.audit_data?.Search_Console?.Canonical_Mismatch === true;
  }
  if (viewName === 'High Impressions Low CTR') {
    const gsc = p.audit_data?.Search_Console;
    if (!gsc) return false;
    const imp = gsc.Impressions_Num !== undefined 
      ? gsc.Impressions_Num 
      : parseInt(String(gsc.Search_Impressions || '0').replace(/,/g, ''), 10) || 0;
    const ctr = gsc.CTR_Num !== undefined 
      ? gsc.CTR_Num 
      : parseFloat(String(gsc.Average_CTR || '0').replace('%', '')) || 0;
    return imp >= 80 && ctr > 0 && ctr < 1.5;
  }
  if (viewName === 'Striking Distance (11-20)') {
    const gsc = p.audit_data?.Search_Console;
    if (!gsc) return false;
    const pos = gsc.Position_Num !== undefined 
      ? gsc.Position_Num 
      : parseFloat(String(gsc.Average_SERP_Position || '0')) || 0;
    return pos >= 10.5 && pos <= 20.4;
  }

  if (viewName === 'Missing') {
    const catData = p.audit_data?.[activeCategory];
    if (catData?.['Missing'] === true) return true;
    if (activeCategory === 'Page_Titles') return !p.title_1 || String(p.title_1).trim() === '';
    if (activeCategory === 'Meta_Description') return !p.meta_desc_1 || String(p.meta_desc_1).trim() === '';
    if (activeCategory === 'H1') return !p.h1_1 || String(p.h1_1).trim() === '';
    if (activeCategory === 'H2') return !p.h2_1 || String(p.h2_1).trim() === '';
    if (activeCategory === 'Canonicals') return !p.canonical_link_element_1 || String(p.canonical_link_element_1).trim() === '';
    return false;
  }

  if (viewName === 'Errors') {
    const catData = p.audit_data?.[activeCategory];
    if (activeCategory === 'Response_Codes') {
      return (p.status_code ?? 0) >= 400;
    }
    if (!catData) return false;
    // "Any issue": a real check failed (respects checks where true is the healthy state).
    return Object.entries(catData).some(([k, val]) => {
      if (isInternalKey(k) || k === 'Paginated') return false;
      if (val !== true && val !== 'true') return false;
      return getDiagnosticDetail(activeCategory, k, true, p).isIssue;
    });
  }

  const cleanViewQuery = viewName.includes(':')
    ? viewName.split(':').slice(1).join(':').trim().toLowerCase()
    : viewName.toLowerCase();

  const catData = p.audit_data?.[activeCategory];
  if (!catData) {
    const directVal = p[viewName];
    if (directVal !== undefined) return Boolean(directVal);
    return false;
  }

  if (catData[viewName] !== undefined) {
    const v = catData[viewName];
    if (v === true || v === 'true' || v === 'TRUE' || v === 'Verified') return true;
    if (v === false || v === 'false' || v === 'FALSE' || v === null || v === undefined) return false;
    return Boolean(v);
  }

  return Object.entries(catData).some(([k, v]) => {
    const kLower = k.toLowerCase();
    const matchesKey = kLower.includes(cleanViewQuery) || cleanViewQuery.includes(kLower);
    if (!matchesKey) return false;
    if (v === true || v === 'true' || v === 'TRUE' || v === 'Verified') return true;
    if (v === false || v === 'false' || v === 'FALSE' || v === null || v === undefined) return false;
    return Boolean(v);
  });
}

// Views passed from Issues may carry a prefix ("Validation: Multiple <body> Tags" -> "Multiple <body> Tags").
function cleanViewName(view) {
  return view.includes(':') ? view.split(':').slice(1).join(':').trim() : view;
}

function isArchiveUrl(p) {
  const u = (p.url || '').toLowerCase();
  return u.includes('/author/') || u.includes('/category/') || u.includes('/tag/') || Boolean(u.match(/\/page\/\d+/));
}

function pageMatchesScope(p, scope, hasPageTypes) {
  if (scope === 'all') return true;
  if (scope === 'errors') return (p.status_code ?? 0) >= 300;
  if (hasPageTypes) {
    const def = PAGE_TYPE_SCOPES.find((sc) => sc.key === scope);
    return Boolean(def) && def.types.includes(p.audit_data?.Page_Type?.Type);
  }
  if (scope === 'content') return !isArchiveUrl(p) && (p.status_code ?? 0) < 300;
  if (scope === 'archives') return isArchiveUrl(p);
  return true;
}

export default function URLExplorerTab({ pages, initialCategory, initialView, onRowClick, onOpenAiCopilot }) {
  const reduced = useReducedMotion();
  const crawlSummary = useCrawlSummary();
  const [activeCategory, setActiveCategory] = useState(initialCategory || 'Page_Titles');
  const [activeView, setActiveView] = useState(initialView ? cleanViewName(initialView) : 'All');
  const [pageScope, setPageScope] = useState('all'); // 'all' | 'errors' | page-type key | legacy 'content' | 'archives'
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'tree' | 'groups'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [copiedCellId, setCopiedCellId] = useState(null);
  const [isCompact, setIsCompact] = useState(false);

  const handleCopyTextCell = async (text, id, label = 'Text') => {
    const ok = await copyToClipboard(text, label);
    if (ok) {
      setCopiedCellId(id);
      setTimeout(() => setCopiedCellId(null), 1800);
    }
  };

  // Scopes: by Page_Type when the backend classified the crawl, else the URL-pattern fallback.
  const pageTypeScopes = useMemo(() => buildPageTypeScopes(pages), [pages]);
  const hasPageTypes = pageTypeScopes.length > 0;

  const scopeButtons = useMemo(() => {
    const list = pages || [];
    const errors = list.filter((p) => (p.status_code ?? 0) >= 300).length;
    const all = { key: 'all', label: 'All URLs', count: list.length, active: 'text-slate-900 dark:text-white' };
    const err = { key: 'errors', label: 'Errors & Redirects', count: errors, active: 'text-rose-700 dark:text-rose-400' };
    if (hasPageTypes) {
      return [all, ...pageTypeScopes.map((sc) => ({ key: sc.key, label: sc.label, count: sc.count, active: 'text-indigo-700 dark:text-indigo-400' })), err];
    }
    let content = 0;
    let archives = 0;
    for (const p of list) {
      if (isArchiveUrl(p)) archives++;
      else if ((p.status_code ?? 0) < 300) content++;
    }
    return [
      all,
      { key: 'content', label: 'Content Pages', count: content, active: 'text-indigo-700 dark:text-indigo-400' },
      { key: 'archives', label: 'Author & Archives', count: archives, active: 'text-amber-700 dark:text-amber-400' },
      err,
    ];
  }, [pages, hasPageTypes, pageTypeScopes]);

  // A saved scope that no longer exists in this crawl falls back to All.
  const effectiveScope = scopeButtons.some((b) => b.key === pageScope) ? pageScope : 'all';

  // Follow category/view requests from the parent (e.g. clicking an issue) during render.
  const [syncedInitial, setSyncedInitial] = useState({ initialCategory, initialView });
  if (syncedInitial.initialCategory !== initialCategory || syncedInitial.initialView !== initialView) {
    setSyncedInitial({ initialCategory, initialView });
    if (initialCategory && initialCategory !== syncedInitial.initialCategory) setActiveCategory(initialCategory);
    if (initialView && initialView !== syncedInitial.initialView) setActiveView(cleanViewName(initialView));
  }

  const dynamicColumns = useMemo(() => {
    if (!pages || pages.length === 0) return [];

    if (activeCategory === 'Internal') {
      return ['link_score', 'status_code', 'indexability', 'inlinks', 'outlinks', 'crawl_depth', 'content_type', 'word_count', 'title_1', 'h1_1', 'response_time_ms'];
    }

    const primary = CATEGORY_PRIMARY_COLUMNS[activeCategory] || [];
    const primaryKeys = primary.map(p => p.key);
    if (activeCategory === 'PageSpeed') return primaryKeys;

    let diagnosticKeys = [];
    for (const page of pages) {
      const catData = page.audit_data?.[activeCategory];
      if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        diagnosticKeys = Object.keys(catData);
        if (diagnosticKeys.length > 0) break;
      }
    }

    const primaryNorm = new Set(primaryKeys.map(normKey));
    const filteredDiagnostic = diagnosticKeys.filter(k => !primaryKeys.includes(k) && !isInternalKey(k) && !primaryNorm.has(normKey(k)));
    return [...primaryKeys, ...filteredDiagnostic];
  }, [pages, activeCategory]);

  const scopedAndCategoryPages = useMemo(() => {
    let result = pages || [];

    // 1. Page scope filter (page type, or content/archives/errors fallback)
    if (effectiveScope !== 'all') {
      result = result.filter(p => pageMatchesScope(p, effectiveScope, hasPageTypes));
    }

    // 2. Standard SEO practice: On-page SEO categories evaluate HTTP 200 text/html pages ONLY.
    if (ON_PAGE_HTML_CATEGORIES.includes(activeCategory)) {
      result = result.filter(p => {
        const code = p.status_code ?? 0;
        return code === 200 && (!p.content_type || p.content_type.includes('text/html'));
      });
    }

    return result;
  }, [pages, effectiveScope, hasPageTypes, activeCategory]);

  // Overall category health stats: Total Audited, Number of Missing, and Present
  const categoryStats = useMemo(() => {
    const total = scopedAndCategoryPages.length;
    let missing = 0;
    for (const p of scopedAndCategoryPages) {
      if (checkPageMatchesView(p, activeCategory, 'Missing')) {
        missing++;
      }
    }
    return {
      total,
      missing,
      present: Math.max(0, total - missing),
    };
  }, [scopedAndCategoryPages, activeCategory]);

  const rawAvailableViews = useMemo(() => {
    if (activeCategory === 'Response_Codes') {
      return ['All', 'Client Error (4xx)', 'Redirection (3xx)', 'Redirection (Meta Refresh)', 'Success (2xx)', 'Server Error (5xx)', 'Blocked', 'Could not check'];
    }

    let diagnosticKeys = [];
    for (const page of pages || []) {
      const catData = page.audit_data?.[activeCategory];
      if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        diagnosticKeys = Object.keys(catData);
        if (diagnosticKeys.length > 0) break;
      }
    }

    // Only true/false checks make a meaningful filter; skip internal and non-boolean keys.
    const booleanKeys = new Set();
    for (const page of pages || []) {
      const cd = page.audit_data?.[activeCategory];
      if (!cd || typeof cd !== 'object') continue;
      for (const k of diagnosticKeys) {
        if (booleanKeys.has(k)) continue;
        const v = cd[k];
        if (typeof v === 'boolean' || v === 'true' || v === 'false') booleanKeys.add(k);
      }
      if (booleanKeys.size === diagnosticKeys.length) break;
    }

    const base = ['All'];
    if (['Page_Titles', 'Meta_Description', 'H1', 'H2', 'Canonicals', 'Directives', 'Content'].includes(activeCategory) || diagnosticKeys.includes('Missing')) {
      base.push('Missing');
    }
    base.push('Errors');
    base.push(...diagnosticKeys.filter((k) => isInternalKey(k) ? false : booleanKeys.has(k)));

    if (activeCategory === 'Google_Analytics' || activeCategory === 'Internal') {
      base.push('Zombie Pages (0 Visits)');
      base.push('High Traffic at Risk');
    }
    if (activeCategory === 'Search_Console' || activeCategory === 'Internal') {
      base.push('Indexed & Rank Eligible');
      base.push('Crawled - Not Indexed');
      base.push('Excluded by Google');
      base.push('Canonical Mismatches');
      base.push('High Impressions Low CTR');
      base.push('Striking Distance (11-20)');
    }
    return Array.from(new Set(base));
  }, [pages, activeCategory]);

  // Enhanced view options with exact count badges for CustomSelect dropdown
  const availableViewsWithBadges = useMemo(() => {
    return rawAvailableViews.map((viewKey) => {
      let count = 0;
      for (const p of scopedAndCategoryPages) {
        if (checkPageMatchesView(p, activeCategory, viewKey)) {
          count++;
        }
      }
      return {
        value: viewKey,
        label: viewKey === 'Errors' ? 'Any issue' : viewKey.replace(/_/g, ' '),
        badge: String(count),
      };
    });
  }, [rawAvailableViews, scopedAndCategoryPages, activeCategory]);

  // Duplicate groups use the page scope only (not the category's HTML-200 filter, which the view applies itself).
  const scopedPagesForGroups = useMemo(
    () => (effectiveScope === 'all' ? (pages || []) : (pages || []).filter((p) => pageMatchesScope(p, effectiveScope, hasPageTypes))),
    [pages, effectiveScope, hasPageTypes]
  );

  const ROWS_PER_PAGE = 100;
  const [tablePage, setTablePage] = useState(0);

  const filteredPages = useMemo(() => {
    let result = scopedAndCategoryPages;

    // Search query filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => (p.url || '').toLowerCase().includes(q) || (p.title_1 || '').toLowerCase().includes(q));
    }

    // View filter
    if (activeView && activeView !== 'All') {
      result = result.filter(p => checkPageMatchesView(p, activeCategory, activeView));
    }

    return result;
  }, [scopedAndCategoryPages, searchQuery, activeCategory, activeView]);

  // Back to the first page whenever the filter or search changes (render-phase reset, no extra effect).
  const filterKey = `${activeCategory}|${activeView}|${searchQuery}`;
  const [pagedFilterKey, setPagedFilterKey] = useState(filterKey);
  if (pagedFilterKey !== filterKey) {
    setPagedFilterKey(filterKey);
    setTablePage(0);
  }
  const pageCount = Math.max(1, Math.ceil(filteredPages.length / ROWS_PER_PAGE));
  const safeTablePage = Math.min(tablePage, pageCount - 1);
  const visibleRows = useMemo(
    () => filteredPages.slice(safeTablePage * ROWS_PER_PAGE, (safeTablePage + 1) * ROWS_PER_PAGE),
    [filteredPages, safeTablePage]
  );

  // Master Full Audit Exporter (Excel .xlsx with multi-tab structure)
  const handleExportExcel = () => {
    if (!pages || pages.length === 0) {
      toast.error('No crawl data available to export.');
      return;
    }
    const issuesReport = generateIssuesReport(pages, crawlSummary);
    const targetUrl = pages[0]?.url || '';
    exportMasterAuditToExcel(pages, targetUrl, issuesReport);
  };

  // Master Full Audit CSV Exporter
  const handleExportMasterCSV = () => {
    if (!pages || pages.length === 0) {
      toast.error('No crawl data available to export.');
      return;
    }
    const targetUrl = pages[0]?.url || '';
    exportMasterAuditToCSV(pages, targetUrl);
  };

  // Export current filtered view with the same human labels and TRUE/FALSE style as the Master CSV.
  const exportCurrentViewToCSV = () => {
    if (!filteredPages || filteredPages.length === 0) {
      toast.error('No URLs match the current filter.');
      return;
    }
    const baseCols = [
      { header: 'URL', getter: (p) => p.url },
      { header: 'Status Code', getter: (p) => p.status_code ?? 0 },
      { header: 'Indexability', getter: (p) => p.indexability || 'Indexable' },
      { header: 'Content Type', getter: (p) => p.content_type || 'text/html' },
      { header: 'Word Count', getter: (p) => p.word_count ?? '' },
    ];
    const baseNorm = new Set(['url', 'statuscode', 'indexability', 'contenttype', 'wordcount']);
    const extraCols = dynamicColumns
      .filter((c) => !baseNorm.has(normKey(c)))
      .map((c) => ({ header: getColumnLabel(c), getter: (p) => getPageCellValue(p, c, activeCategory) }));
    exportFilteredViewToCSV(filteredPages, [...baseCols, ...extraCols], {
      targetUrl: pages?.[0]?.url || '',
      category: activeCategory,
      filter: activeView,
    });
  };

  const handleCopy = async (url, e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(url, 'URL');
    if (ok) {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  const getColumnLabel = (colKey) => {
    const primary = CATEGORY_PRIMARY_COLUMNS[activeCategory] || [];
    const found = primary.find(p => p.key === colKey);
    if (found) return found.label;
    return colKey.replace(/_/g, ' ');
  };

  const formatCellValue = (value, colKey, page) => {
    if (value === 'Not Connected' || value === 'Unverified (GBP Disconnected)' || value === 'Not Connected (Configure AI Engine)') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
          Not Connected
        </span>
      );
    }

    if (colKey === 'Is_Zombie_Page') {
      const ga4 = page?.audit_data?.Google_Analytics;
      if (ga4?.Sessions_30d === 'Not Connected' || ga4?.Live_GA4_Stream === 'Not Connected') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
            Not Connected
          </span>
        );
      }
      return value ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
          Zombie Page (0 Visits)
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50">
          Active Traffic
        </span>
      );
    }
    if (colKey === 'Revenue_At_Risk') {
      if (value === 'N/A' || !value) {
        return <span className="text-slate-400 dark:text-slate-500 font-mono">-</span>;
      }
      const isCritical = String(value).includes('P0');
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
          isCritical 
            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50 animate-pulse' 
            : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
        }`}>
          {value}
        </span>
      );
    }
    if (colKey === 'Google_Index_Status') {
      const isIndexed = String(value).includes('Indexed');
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
          isIndexed 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50' 
            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50'
        }`}>
          {value}
        </span>
      );
    }

    if (colKey === 'link_score' || colKey === 'Link_Score') {
      if (value === '' || value === undefined || value === null) {
        return <span className="text-slate-400 dark:text-slate-500 font-mono">-</span>;
      }
      const num = parseInt(value, 10) || 0;
      let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      if (num >= 70) badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50 font-bold';
      else if (num >= 35) badgeClass = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50 font-semibold';
      else badgeClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50';
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono border ${badgeClass}`}>
          {num}
        </span>
      );
    }

    // 1. Occurrence & Count Columns (0 Missing, 1, 2 Multiple)
    if (colKey.endsWith('_count') || colKey === 'Occurrences') {
      const count = typeof value === 'number' ? value : parseInt(value, 10) || 0;
      if (count === 0) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
            0 (Missing)
          </span>
        );
      }
      if (count === 1) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50">
            1
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
          {count} (Multiple)
        </span>
      );
    }

    // 2. Missing column (instead of True/False, show 0 Missing vs 1 Present)
    if (colKey === 'Missing') {
      const isMissing = value === true || value === 'true' || value === 'TRUE';
      return isMissing ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
          0 (Missing)
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50">
          1 (Present)
        </span>
      );
    }

    // 3. Primary Text Fields: exact readable text of H1, H2, Title, Meta Description with 1-click copy
    const textFields = ['title_1', 'meta_desc_1', 'h1_1', 'h1_2', 'h2_1', 'h2_2', 'canonical_link_element_1', 'meta_robots_1'];
    if (textFields.includes(colKey)) {
      if (value === null || value === undefined || String(value).trim() === '') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
            0 (Missing)
          </span>
        );
      }
      return (
        <div className="group/cell relative flex items-start justify-between gap-2 min-w-[260px] max-w-md xl:max-w-xl py-0.5">
          <span 
            className="font-sans text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug whitespace-normal break-words select-all" 
            title={String(value)}
          >
            {String(value)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const cellId = `${page?.url || ''}-${colKey}`;
              handleCopyTextCell(String(value), cellId, getColumnLabel(colKey));
            }}
            className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 rounded bg-slate-50 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700 opacity-0 group-hover/cell:opacity-100 transition-opacity"
            title={`Copy exact ${getColumnLabel(colKey)}`}
          >
            {copiedCellId === `${page?.url || ''}-${colKey}` ? (
              <Check size={11} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy size={11} />
            )}
          </button>
        </div>
      );
    }

    // 4. Length Without Spaces Dedicated Column
    if (colKey.endsWith('_length_no_spaces')) {
      if (value === null || value === undefined || value === '' || value === 0) {
        return <span className="text-slate-400 dark:text-slate-500 font-mono">-</span>;
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50" title="Character count without spaces">
          {value} chars
        </span>
      );
    }

    // 5. Standard Length columns: show length with spaces and sub-badge without spaces
    if (colKey.endsWith('_length') || colKey === 'word_count') {
      if (value === null || value === undefined || value === '' || value === 0) {
        return <span className="text-slate-400 dark:text-slate-500 font-mono">-</span>;
      }
      // Look up corresponding no-spaces length if applicable
      let noSpaces = undefined;
      if (page) {
        if (colKey === 'title_1_length' && page.title_1) noSpaces = getLengthNoSpaces(page.title_1);
        else if (colKey === 'meta_desc_1_length' && page.meta_desc_1) noSpaces = getLengthNoSpaces(page.meta_desc_1);
        else if (colKey === 'h1_1_length' && page.h1_1) noSpaces = getLengthNoSpaces(page.h1_1);
        else if (colKey === 'h1_2_length' && page.h1_2) noSpaces = getLengthNoSpaces(page.h1_2);
        else if (colKey === 'h2_1_length' && page.h2_1) noSpaces = getLengthNoSpaces(page.h2_1);
        else if (colKey === 'h2_2_length' && page.h2_2) noSpaces = getLengthNoSpaces(page.h2_2);
      }
      return (
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-200">{value}</span>
          {noSpaces !== undefined && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded whitespace-nowrap" title="Character count without spaces">
              ({noSpaces} no spaces)
            </span>
          )}
        </div>
      );
    }

    // 6. Pixel width columns
    if (colKey.endsWith('_pixel_width')) {
      if (value === null || value === undefined || value === 0 || value === '') {
        return <span className="text-slate-400 dark:text-slate-500 font-mono">-</span>;
      }
      const numVal = parseInt(value, 10);
      const isOver = (colKey.startsWith('title') && numVal > 561) || (colKey.startsWith('meta_desc') && numVal > 985);
      return (
        <span className={`font-mono text-xs ${isOver ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
          {numVal} px
        </span>
      );
    }

    // 7. Boolean Diagnostic Columns with Full Detail on What, Why True/False & How to Resolve
    if (value === true || value === 'TRUE' || value === 'true' || value === false || value === 'FALSE' || value === 'false') {
      const boolVal = (value === true || value === 'TRUE' || value === 'true');
      const diag = getDiagnosticDetail(activeCategory, colKey, boolVal, page);

      if (colKey === 'Multiple') {
        return boolVal ? (
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50 cursor-help"
            title={`${diag.label}: ${diag.why} - Click row to inspect fix`}
          >
            2+ (Multiple)
          </span>
        ) : (
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 cursor-help"
            title={`${diag.label}: ${diag.why}`}
          >
            Single
          </span>
        );
      }
      if (colKey === 'Duplicate') {
        return boolVal ? (
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50 cursor-help"
            title={`${diag.label}: ${diag.why} - Click row to inspect fix`}
          >
            Duplicate
          </span>
        ) : (
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50 cursor-help"
            title={`${diag.label}: ${diag.why}`}
          >
            Unique
          </span>
        );
      }

      if (diag.isIssue) {
        return (
          <span 
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-help border ${
              diag.severity === 'Issue' 
                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/60' 
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900/60'
            }`}
            title={`[${diag.label}]\n${diag.why}\n\nSearch Impact: ${diag.searchImpact}\n\nHow to Resolve: ${diag.howToResolve}\n(Click row to view full details in inspector)`}
          >
            <AlertCircle size={10} />
            {diag.severity === 'Issue' ? 'Issue' : 'Warning'}
          </span>
        );
      }

      return (
        <span 
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700 cursor-help hover:bg-slate-100 dark:hover:bg-slate-800"
          title={`[${diag.label}]\n${diag.why}`}
        >
          <CheckCircle size={10} className="text-emerald-600 dark:text-emerald-400" />
          Passed
        </span>
      );
    }

    if (value === null || value === undefined || value === '') {
      return <span className="text-slate-400 dark:text-slate-500 font-mono">-</span>;
    }
    if (typeof value === 'object') {
      return <span className="font-mono text-[10px] text-indigo-700 dark:text-indigo-400 truncate max-w-xs">{JSON.stringify(value)}</span>;
    }
    return <span className="truncate max-w-md text-slate-800 dark:text-slate-200">{String(value)}</span>;
  };

  return (
    <div className={`flex flex-col min-h-full md:h-full md:overflow-hidden ${isCompact ? 'space-y-0' : 'space-y-3'}`}>

      {/* Top Header Line & Dual Export Actions - Collapsed when isCompact is true */}
      <AnimatePresence initial={false}>
        {!isCompact && (
          <motion.div
            key="top-header-line"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0 overflow-hidden"
          >
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">URL Data Grid</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Explore full 32-parameter extracted data for all crawled website endpoints.</p>
            </div>

            {/* Toolbar: Table/Tree Switcher & Export Buttons in a clean swipeable rail on mobile */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-x-auto no-scrollbar max-w-full pb-0.5 flex-nowrap self-start sm:self-auto">
              {/* View switcher: Table, Tree, Duplicate groups */}
              <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 shadow-xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Flat Table View"
                >
                  <TableProperties size={13} />
                  <span className="hidden xs:inline">Table View</span>
                  <span className="xs:hidden">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('tree')}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    viewMode === 'tree'
                      ? 'bg-emerald-600 text-white shadow-xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Directory tree view"
                >
                  <FolderTree size={13} />
                  <span className="hidden xs:inline">Tree View</span>
                  <span className="xs:hidden">Tree</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('groups')}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    viewMode === 'groups'
                      ? 'bg-amber-600 text-white shadow-xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Duplicate titles, descriptions, H1s and content grouped by value"
                >
                  <Layers size={13} />
                  <span>Duplicate groups</span>
                </button>
              </div>

              {/* Master Full Export Button (.xlsx) */}
              <motion.button
                onClick={handleExportExcel}
                disabled={!pages || pages.length === 0}
                whileTap={tapPress}
                initial="rest"
                whileHover="hover"
                animate="rest"
                transition={spring.press}
                className="btn-primary py-1.5 sm:py-2 px-2.5 sm:px-3.5 text-xs font-bold gap-1.5 sm:gap-2 disabled:opacity-50 shadow-xs shrink-0 whitespace-nowrap"
                title="Export full 3-sheet Excel (.xlsx) workbook"
              >
                <FileSpreadsheet size={14} className="text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Excel (.xlsx)</span>
                <span className="sm:hidden">Excel</span>
              </motion.button>

              {/* Master Full CSV Button */}
              <motion.button
                onClick={handleExportMasterCSV}
                disabled={!pages || pages.length === 0}
                whileTap={tapPress}
                transition={spring.press}
                className="btn-secondary py-1.5 sm:py-2 px-2.5 sm:px-3 text-xs font-bold gap-1.5 disabled:opacity-50 shadow-xs shrink-0 whitespace-nowrap"
                title="Export 35+ technical parameters to universal CSV"
              >
                <Download size={13} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="hidden sm:inline">Master CSV</span>
                <span className="sm:hidden">CSV</span>
              </motion.button>

              {/* Current Filtered View Export */}
              <motion.button
                onClick={exportCurrentViewToCSV}
                disabled={!filteredPages || filteredPages.length === 0 || activeView === 'All'}
                whileTap={tapPress}
                transition={spring.press}
                className="btn-secondary py-1.5 sm:py-2 px-2 sm:px-3 text-xs font-bold gap-1.5 disabled:opacity-50 shadow-xs shrink-0 whitespace-nowrap"
                title={activeView === 'All' ? 'Pick a View Filter first (use Master CSV for everything)' : `Export only the ${filteredPages.length} rows matching ${activeCategory.replace(/_/g, ' ')}: ${activeView}`}
              >
                <Filter size={13} className="text-slate-600 dark:text-slate-400 shrink-0" />
                <span className="hidden sm:inline">Export filtered rows</span>
                <span className="sm:hidden">Filtered</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Controls & Category Metric Strip - Collapses cleanly when isCompact is true */}
      <AnimatePresence initial={false}>
        {!isCompact && (
          <motion.div
            key="top-controls-and-metrics"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="space-y-3 shrink-0 overflow-hidden"
          >
            {/* Scope Segment Control & compliance indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/50 dark:border-slate-800 rounded-xl w-full sm:w-fit text-xs font-semibold overflow-x-auto no-scrollbar flex-nowrap">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 pl-2 pr-1 shrink-0">Scope:</span>
                {scopeButtons.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setPageScope(b.key)}
                    className={`px-3 py-1.5 rounded-lg transition-all text-xs shrink-0 whitespace-nowrap ${
                      effectiveScope === b.key
                        ? `bg-white dark:bg-slate-800 ${b.active} shadow-xs font-bold`
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {b.label} ({b.count})
                  </button>
                ))}
              </div>

              {ON_PAGE_HTML_CATEGORIES.includes(activeCategory) && (
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-800 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>Standard SEO practice: 200 OK HTML pages</span>
                </div>
              )}
            </div>

            {/* Controls Bar: Category Picker + Sub-view filter + Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
              {/* Category Selector */}
              <CustomSelect
                label="Category:"
                value={activeCategory}
                options={CATEGORY_OPTIONS}
                onChange={(newCat) => {
                  setActiveCategory(newCat);
                  setActiveView('All');
                  toast.info(`Switched category to ${newCat.replace(/_/g, ' ')}`);
                }}
                valueClassName="text-indigo-600 dark:text-indigo-400 font-bold"
                searchPlaceholder="Search 30+ categories..."
                showSearch={true}
              />

              {/* Sub-view Selector with exact counts */}
              <CustomSelect
                label="View Filter:"
                value={activeView}
                options={availableViewsWithBadges}
                onChange={(newView) => setActiveView(newView)}
                valueClassName="text-emerald-700 dark:text-emerald-400 font-bold"
                searchPlaceholder="Filter views & columns..."
              />

              {/* Live Search */}
              <div className="relative sm:col-span-2 md:col-span-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search URLs or titles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full glass-input pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl"
                />
              </div>
            </div>

            {/* Category Metric Strip & Missing URLs Counter */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl text-xs shrink-0 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-400">
                  <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                    {ON_PAGE_HTML_CATEGORIES.includes(activeCategory) ? 'Audited HTML Pages:' : 'Audited URLs:'}
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {categoryStats.total}
                    {pages?.length && categoryStats.total !== pages.length ? (
                      <span className="text-slate-400 dark:text-slate-500 font-normal ml-1 text-[11px]">/ {pages.length} total crawled</span>
                    ) : null}
                  </span>
                </div>

                <div className="h-3 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

                {/* Explicit missing count counter with 1-click filter */}
                <button
                  type="button"
                  onClick={() => setActiveView(activeView === 'Missing' ? 'All' : 'Missing')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
                    categoryStats.missing > 0
                      ? activeView === 'Missing'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
                  }`}
                  title={categoryStats.missing > 0 ? "Click to view missing URLs" : "All URLs have this element"}
                >
                  {categoryStats.missing > 0 ? (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${activeView === 'Missing' ? 'bg-white' : 'bg-rose-600 animate-pulse'}`} />
                      <span>{categoryStats.missing} Missing {activeCategory.replace(/_/g, ' ')}</span>
                    </>
                  ) : (
                    <>
                      <Check size={12} className="stroke-[3]" />
                      <span>0 Missing (100% Present)</span>
                    </>
                  )}
                </button>

                <div className="h-3 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

                <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-400">
                  <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] uppercase tracking-wider">Present:</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{categoryStats.present}</span>
                </div>
              </div>

              {/* Active filter notification pill */}
              {activeView === 'Missing' && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-rose-700 dark:text-rose-300 font-bold bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50">
                  <span>Filter:</span>
                  <span>{filteredPages.length} {filteredPages.length === 1 ? 'URL' : 'URLs'}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main View: Tree Table vs Flat Data Grid */}
      {viewMode === 'groups' ? (
        <DuplicateGroupsView
          key={activeCategory}
          pages={scopedPagesForGroups}
          crawlSummary={crawlSummary}
          targetUrl={pages?.[0]?.url || ''}
          initialCategory={activeCategory}
        />
      ) : viewMode === 'tree' ? (
        <div className="flex-1 overflow-hidden min-h-0">
          <URLTreeTable
            pages={filteredPages}
            onRowClick={onRowClick}
            searchQuery={searchQuery}
            isCompact={isCompact}
            onToggleCompact={() => setIsCompact(prev => !prev)}
          />
        </div>
      ) : (
        <div className="flex-1 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden flex flex-col shadow-xs min-h-0">
          <div className="md:hidden flex items-center justify-between px-3 py-1.5 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-700 dark:text-indigo-300 font-medium shrink-0">
            <span>↔ Swipe horizontally for 32 parameters</span>
            <span className="text-[10px] font-mono text-indigo-500">Tap row to inspect</span>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full min-w-[700px] text-left text-xs text-slate-700 dark:text-slate-300 border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-950/80 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider w-80 min-w-[280px]">
                  <div className="flex items-center gap-2">
                    <span>URL Endpoint</span>
                    <motion.button
                      type="button"
                      onClick={() => setIsCompact(prev => !prev)}
                      whileTap={tapPress}
                      transition={spring.press}
                      className={`inline-flex items-center justify-center p-1 rounded-md border transition-all cursor-pointer ${
                        isCompact
                          ? 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-[#CAE366] hover:border-indigo-400'
                      }`}
                      title={isCompact ? "Restore full header & filters" : "Compact table (hide header & filters for full screen view)"}
                    >
                      {isCompact ? <Minimize2 size={12} className="text-white" /> : <Maximize2 size={12} />}
                    </motion.button>
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">
                  Status
                </th>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">
                  Indexability
                </th>
                {dynamicColumns.map(col => {
                  const isTextCol = ['title_1', 'meta_desc_1', 'h1_1', 'h1_2', 'h2_1', 'h2_2', 'canonical_link_element_1', 'meta_robots_1'].includes(col);
                  return (
                    <th 
                      key={col} 
                      className={`px-4 py-3.5 font-bold font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider ${
                        isTextCol ? 'min-w-[280px] max-w-md' : 'min-w-[120px] whitespace-nowrap'
                      }`}
                    >
                      {getColumnLabel(col)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredPages.length > 0 ? (
                visibleRows.map((page, idx) => {
                  const statusCode = page.status_code ?? 0;
                  const isCopied = copiedUrl === page.url;

                  return (
                    <tr
                      key={page.id || page.url || idx}
                      tabIndex={0}
                      aria-label={`Inspect ${page.url}`}
                      onClick={() => onRowClick && onRowClick(page)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                          e.preventDefault();
                          onRowClick && onRowClick(page);
                        }
                      }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:bg-indigo-50 dark:focus-visible:bg-indigo-950/40 focus-visible:outline-2 focus-visible:outline-indigo-500 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        <div className="flex items-center gap-1.5 truncate max-w-sm">
                          <ChevronRight size={13} className="text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                          <span className="truncate" title={page.url}>{page.url}</span>
                          {hasPageTypes && page.audit_data?.Page_Type?.Type && page.audit_data.Page_Type.Type !== 'Other' && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              {page.audit_data.Page_Type.Type}
                            </span>
                          )}
                          {!hasPageTypes && page.url?.includes('/author/') && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
                              Author
                            </span>
                          )}
                          {statusCode >= 400 && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
                              Broken Link
                            </span>
                          )}
                          {statusCode >= 300 && statusCode < 400 && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
                              Redirect
                            </span>
                          )}
                          <button
                            onClick={(e) => handleCopy(page.url, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Copy URL"
                          >
                            {isCopied ? <Check size={11} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={11} />}
                          </button>
                          {onOpenAiCopilot && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenAiCopilot(page.url);
                              }}
                              className="p-1 text-amber-500 hover:text-amber-600 dark:hover:text-[#CAE366] rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              title="Audit this URL with AI (page audit)"
                            >
                              <Sparkles size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          statusCode >= 400
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                            : statusCode >= 300
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
                        }`}>
                          {statusCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          page.indexability === 'Non-Indexable'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
                        }`}>
                          {page.indexability || 'Indexable'}
                        </span>
                      </td>
                      {dynamicColumns.map(col => {
                        const cellVal = getPageCellValue(page, col, activeCategory);
                        const isTextCol = ['title_1', 'meta_desc_1', 'h1_1', 'h1_2', 'h2_1', 'h2_2', 'canonical_link_element_1', 'meta_robots_1'].includes(col);
                        return (
                          <td 
                            key={col} 
                            className={`px-4 py-3 font-mono text-slate-600 dark:text-slate-300 ${
                              isTextCol ? 'min-w-[280px] max-w-md whitespace-normal' : 'whitespace-nowrap'
                            }`}
                          >
                            {formatCellValue(cellVal, col, page)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr key="empty">
                  <td colSpan={dynamicColumns.length + 3} className="px-6 py-16 text-center text-slate-400">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">No URLs match the selected filter ({activeCategory} : {activeView}).</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">Try switching category, resetting search query, or viewing all URLs.</p>
                    <button
                      onClick={() => {
                        setActiveView('All');
                        setSearchQuery('');
                      }}
                      className="btn-secondary px-3.5 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    >
                      Show All {pages?.length || 0} URLs
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <nav aria-label="URL table pages" className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => setTablePage(p => Math.max(0, p - 1))}
              disabled={safeTablePage === 0}
              className="btn-secondary px-3 py-1.5 font-bold disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono text-slate-600 dark:text-slate-300" aria-live="polite">
              Rows {safeTablePage * ROWS_PER_PAGE + 1}–{Math.min((safeTablePage + 1) * ROWS_PER_PAGE, filteredPages.length)} of {filteredPages.length}
            </span>
            <button
              type="button"
              onClick={() => setTablePage(p => Math.min(pageCount - 1, p + 1))}
              disabled={safeTablePage >= pageCount - 1}
              className="btn-secondary px-3 py-1.5 font-bold disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}

        {/* Footer Meta */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex flex-wrap justify-between items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Showing <strong className="text-slate-900 dark:text-white">{filteredPages.length}</strong> URLs {filteredPages.length !== (pages?.length || 0) && <span className="text-slate-400">({pages?.length || 0} total)</span>}
            </span>
            {isCompact && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Compact Mode
              </span>
            )}
            {/* Quick Actions in Compact Mode */}
            {isCompact && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'table' ? 'tree' : 'table')}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Switch View"
                >
                  {viewMode === 'table' ? <FolderTree size={11} className="text-emerald-500" /> : <TableProperties size={11} className="text-indigo-500" />}
                  <span>{viewMode === 'table' ? 'Tree' : 'Table'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="p-1 text-slate-500 hover:text-emerald-600 dark:hover:text-[#CAE366] transition-colors cursor-pointer"
                  title="Export Excel (.xlsx)"
                >
                  <FileSpreadsheet size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleExportMasterCSV}
                  className="p-1 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  title="Export Master CSV"
                >
                  <Download size={13} />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Category: <strong className="text-indigo-600 dark:text-indigo-400">{activeCategory.replace(/_/g, ' ')}</strong></span>
            <span>|</span>
            <span>View: <strong className="text-emerald-600 dark:text-emerald-400">{activeView}</strong></span>
            {searchQuery && (
              <>
                <span>|</span>
                <span>Search: <strong className="text-indigo-600 dark:text-indigo-400">&quot;{searchQuery}&quot;</strong></span>
              </>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
