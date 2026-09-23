'use client';
import React, { useState, useMemo } from 'react';
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
  Copy,
  Check,
  TableProperties,
  FolderTree,
  List
} from 'lucide-react';
import URLTreeTable from './URLTreeTable';
import {
  MASTER_EXPORT_FIELDS,
  exportMasterAuditToExcel,
  exportMasterAuditToCSV
} from '@/utils/exportUtils';
import { generateIssuesReport } from '@/utils/IssuesEngine';

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

const CATEGORY_PRIMARY_COLUMNS = {
  Page_Titles: [
    { key: 'title_1', label: 'Title 1' },
    { key: 'title_1_length', label: 'Length' },
    { key: 'title_1_length_no_spaces', label: 'Length (No Spaces)' },
    { key: 'title_1_pixel_width', label: 'Pixel Width' },
    { key: 'title_count', label: 'Occurrences' },
  ],
  Meta_Description: [
    { key: 'meta_desc_1', label: 'Meta Description 1' },
    { key: 'meta_desc_1_length', label: 'Length' },
    { key: 'meta_desc_1_length_no_spaces', label: 'Length (No Spaces)' },
    { key: 'meta_desc_1_pixel_width', label: 'Pixel Width' },
    { key: 'meta_desc_count', label: 'Occurrences' },
  ],
  H1: [
    { key: 'h1_1', label: 'H1-1' },
    { key: 'h1_1_length', label: 'H1-1 Length' },
    { key: 'h1_1_length_no_spaces', label: 'H1-1 (No Spaces)' },
    { key: 'h1_2', label: 'H1-2' },
    { key: 'h1_2_length', label: 'H1-2 Length' },
    { key: 'h1_2_length_no_spaces', label: 'H1-2 (No Spaces)' },
    { key: 'h1_count', label: 'H1 Count' },
  ],
  H2: [
    { key: 'h2_1', label: 'H2-1' },
    { key: 'h2_1_length', label: 'H2-1 Length' },
    { key: 'h2_1_length_no_spaces', label: 'H2-1 (No Spaces)' },
    { key: 'h2_2', label: 'H2-2' },
    { key: 'h2_2_length', label: 'H2-2 Length' },
    { key: 'h2_2_length_no_spaces', label: 'H2-2 (No Spaces)' },
    { key: 'h2_count', label: 'H2 Count' },
  ],
  Canonicals: [
    { key: 'canonical_link_element_1', label: 'Canonical Link Element 1' },
    { key: 'canonical_count', label: 'Occurrences' },
  ],
  Directives: [
    { key: 'meta_robots_1', label: 'Meta Robots 1' },
  ],
  Content: [
    { key: 'word_count', label: 'Word Count' },
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

  // Screaming Frog Occurrence Counts (0 for missing, 1, 2, etc.)
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

  if (catData[colKey] !== undefined) return catData[colKey];
  if (page[colKey] !== undefined) return page[colKey];
  return undefined;
}

export function checkPageMatchesView(p, activeCategory, viewName) {
  if (!viewName || viewName === 'All') return true;

  if (activeCategory === 'Response_Codes') {
    if (viewName === 'Client Error (4xx)' || viewName === '4xx' || viewName === 'Errors') {
      return (p.status_code || 200) >= 400 && (p.status_code || 200) < 500;
    }
    if (viewName === 'Redirection (3xx)' || viewName === '3xx') {
      return (p.status_code || 200) >= 300 && (p.status_code || 200) < 400;
    }
    if (viewName === 'Server Error (5xx)' || viewName === '5xx') {
      return (p.status_code || 200) >= 500;
    }
    if (viewName === 'Success (2xx)' || viewName === '2xx') {
      return (p.status_code || 200) >= 200 && (p.status_code || 200) < 300;
    }
    if (viewName === 'Blocked') {
      return p.status_code === 0 || Boolean(p.audit_data?.Response_Codes?.Blocked);
    }
    return true;
  }

  if (viewName === 'Zombie Pages (0 Visits)') {
    return p.audit_data?.Google_Analytics?.Is_Zombie_Page === true;
  }
  if (viewName === 'High Traffic at Risk') {
    return (p.status_code || 200) >= 400 && Boolean(p.audit_data?.Google_Analytics?.Revenue_At_Risk?.includes('P0'));
  }
  if (viewName === 'Indexed & Rank Eligible') {
    return Boolean(p.audit_data?.Search_Console?.Google_Index_Status?.toLowerCase().includes('indexed'));
  }
  if (viewName === 'Crawled - Not Indexed') {
    return Boolean(p.audit_data?.Search_Console?.Index_Coverage_State?.toLowerCase().includes('not indexed'));
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
      return (p.status_code || 200) >= 400;
    }
    if (!catData) return false;
    return Object.values(catData).some(val => val === true);
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

export default function URLExplorerTab({ pages, initialCategory, initialView, onRowClick }) {
  const reduced = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState(initialCategory || 'Page_Titles');
  const [activeView, setActiveView] = useState(initialView || 'All');
  const [pageScope, setPageScope] = useState('all'); // 'all' | 'content' | 'archives' | 'errors'
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'tree'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(null);

  const scopeCounts = useMemo(() => {
    let contentCount = 0;
    let archivesCount = 0;
    let errorsCount = 0;
    for (const p of pages || []) {
      const u = (p.url || '').toLowerCase();
      const isArch = u.includes('/author/') || u.includes('/category/') || u.includes('/tag/') || Boolean(u.match(/\/page\/\d+/));
      const isErr = (p.status_code || 200) >= 300;
      if (isErr) errorsCount++;
      if (isArch) archivesCount++;
      if (!isArch && !isErr) contentCount++;
    }
    return {
      all: pages?.length || 0,
      content: contentCount,
      archives: archivesCount,
      errors: errorsCount,
    };
  }, [pages]);

  React.useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  React.useEffect(() => {
    if (initialView) {
      // Clean prefix if passed from issues (e.g. "Validation: Multiple <body> Tags" -> "Multiple <body> Tags")
      const cleanView = initialView.includes(':')
        ? initialView.split(':').slice(1).join(':').trim()
        : initialView;
      setActiveView(cleanView);
    }
  }, [initialView]);

  const dynamicColumns = useMemo(() => {
    if (!pages || pages.length === 0) return [];

    if (activeCategory === 'Internal') {
      return ['status_code', 'indexability', 'content_type', 'word_count', 'title_1', 'h1_1', 'response_time_ms'];
    }

    const primary = CATEGORY_PRIMARY_COLUMNS[activeCategory] || [];
    const primaryKeys = primary.map(p => p.key);

    let diagnosticKeys = [];
    for (const page of pages) {
      const catData = page.audit_data?.[activeCategory];
      if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        diagnosticKeys = Object.keys(catData);
        if (diagnosticKeys.length > 0) break;
      }
    }

    const filteredDiagnostic = diagnosticKeys.filter(k => !primaryKeys.includes(k));
    return [...primaryKeys, ...filteredDiagnostic];
  }, [pages, activeCategory]);

  const scopedAndCategoryPages = useMemo(() => {
    let result = pages || [];

    // 1. Page Scope Filter (Content Pages vs Archives vs Errors)
    if (pageScope === 'content') {
      result = result.filter(p => {
        const u = (p.url || '').toLowerCase();
        return !u.includes('/author/') && !u.includes('/category/') && !u.includes('/tag/') && !u.match(/\/page\/\d+/);
      });
    } else if (pageScope === 'archives') {
      result = result.filter(p => {
        const u = (p.url || '').toLowerCase();
        return u.includes('/author/') || u.includes('/category/') || u.includes('/tag/') || Boolean(u.match(/\/page\/\d+/));
      });
    } else if (pageScope === 'errors') {
      result = result.filter(p => (p.status_code || 200) >= 300);
    }

    // 2. Screaming Frog Standard: On-page SEO categories evaluate HTTP 200 text/html pages ONLY.
    if (ON_PAGE_HTML_CATEGORIES.includes(activeCategory)) {
      result = result.filter(p => {
        const code = p.status_code || 200;
        return code === 200 && (!p.content_type || p.content_type.includes('text/html'));
      });
    }

    return result;
  }, [pages, pageScope, activeCategory]);

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
      return ['All', 'Client Error (4xx)', 'Redirection (3xx)', 'Success (2xx)', 'Server Error (5xx)', 'Blocked'];
    }

    let diagnosticKeys = [];
    for (const page of pages || []) {
      const catData = page.audit_data?.[activeCategory];
      if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        diagnosticKeys = Object.keys(catData);
        if (diagnosticKeys.length > 0) break;
      }
    }

    const base = ['All'];
    if (['Page_Titles', 'Meta_Description', 'H1', 'H2', 'Canonicals', 'Directives', 'Content'].includes(activeCategory) || diagnosticKeys.includes('Missing')) {
      base.push('Missing');
    }
    base.push('Errors');
    base.push(...diagnosticKeys);

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
        label: viewKey,
        badge: String(count),
      };
    });
  }, [rawAvailableViews, scopedAndCategoryPages, activeCategory]);

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

  // Master Full Audit Exporter (Excel .xlsx with multi-tab structure)
  const handleExportExcel = () => {
    if (!pages || pages.length === 0) {
      toast.error('No crawl data available to export.');
      return;
    }
    const issuesReport = generateIssuesReport(pages);
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

  // Export current filtered view
  const exportCurrentViewToCSV = () => {
    if (!filteredPages || filteredPages.length === 0) {
      toast.error('No URLs match the current filter.');
      return;
    }

    const baseCols = ['URL', 'Status_Code', 'Indexability', 'Content_Type', 'Word_Count'];
    const extraCols = dynamicColumns.filter(c => !baseCols.map(b => b.toLowerCase()).includes(c.toLowerCase()));
    const allHeaders = [...baseCols, ...extraCols];

    const rows = filteredPages.map(page => {
      const pageUrl = `"${(page.url || '').replace(/"/g, '""')}"`;
      const statusCode = `"${page.status_code || 200}"`;
      const indexability = `"${page.indexability || 'Indexable'}"`;
      const contentType = `"${page.content_type || 'text/html'}"`;
      const wordCount = `"${page.word_count ?? ''}"`;

      const extraValues = extraCols.map(col => {
        const val = getPageCellValue(page, col, activeCategory);
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      });

      return [pageUrl, statusCode, indexability, contentType, wordCount, ...extraValues].join(',');
    });

    const csvContent = '\uFEFF' + [allHeaders.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `auditpro_${activeCategory.toLowerCase()}_view_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Filtered View Exported', {
      description: `Exported ${filteredPages.length} rows for category ${activeCategory.replace(/_/g, ' ')}.`
    });
  };

  const handleCopy = (url, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
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
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-500 border border-slate-200">
          Not Connected
        </span>
      );
    }

    if (colKey === 'Is_Zombie_Page') {
      const ga4 = page?.audit_data?.Google_Analytics;
      if (ga4?.Sessions_30d === 'Not Connected' || ga4?.Live_GA4_Stream === 'Not Connected') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-500 border border-slate-200">
            Not Connected
          </span>
        );
      }
      return value ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
          Zombie Page (0 Visits)
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Active Traffic
        </span>
      );
    }
    if (colKey === 'Revenue_At_Risk') {
      if (value === 'N/A' || !value) {
        return <span className="text-slate-400 font-mono">-</span>;
      }
      const isCritical = String(value).includes('P0');
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
          isCritical ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' : 'bg-slate-100 text-slate-700 border-slate-200'
        }`}>
          {value}
        </span>
      );
    }
    if (colKey === 'Google_Index_Status') {
      const isIndexed = String(value).includes('Indexed');
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
          isIndexed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {value}
        </span>
      );
    }

    // 1. Screaming Frog Occurrence & Count Columns (0 Missing, 1, 2 Multiple)
    if (colKey.endsWith('_count') || colKey === 'Occurrences') {
      const count = typeof value === 'number' ? value : parseInt(value, 10) || 0;
      if (count === 0) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
            0 (Missing)
          </span>
        );
      }
      if (count === 1) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            1
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
          {count} (Multiple)
        </span>
      );
    }

    // 2. Screaming Frog Missing column (instead of True/False, show 0 Missing vs 1 Present)
    if (colKey === 'Missing') {
      const isMissing = value === true || value === 'true' || value === 'TRUE';
      return isMissing ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
          0 (Missing)
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          1 (Present)
        </span>
      );
    }

    // 3. Primary Text Fields: exact readable text of H1, H2, Title, Meta Description with 1-click copy
    const textFields = ['title_1', 'meta_desc_1', 'h1_1', 'h1_2', 'h2_1', 'h2_2', 'canonical_link_element_1', 'meta_robots_1'];
    if (textFields.includes(colKey)) {
      if (value === null || value === undefined || String(value).trim() === '') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
            0 (Missing)
          </span>
        );
      }
      return (
        <div className="group/cell relative flex items-start justify-between gap-2 min-w-[260px] max-w-md xl:max-w-xl py-0.5">
          <span 
            className="font-sans text-xs font-semibold text-slate-900 leading-snug whitespace-normal break-words select-all" 
            title={String(value)}
          >
            {String(value)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(String(value));
              toast.success('Text copied to clipboard');
            }}
            className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 hover:bg-indigo-50 border border-slate-200/60 opacity-0 group-hover/cell:opacity-100 transition-opacity"
            title="Copy exact text"
          >
            <Copy size={11} />
          </button>
        </div>
      );
    }

    // 4. Length Without Spaces Dedicated Column
    if (colKey.endsWith('_length_no_spaces')) {
      if (value === null || value === undefined || value === '' || value === 0) {
        return <span className="text-slate-400 font-mono">-</span>;
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70" title="Character count without spaces">
          {value} chars
        </span>
      );
    }

    // 5. Standard Length columns: show length with spaces and sub-badge without spaces
    if (colKey.endsWith('_length') || colKey === 'word_count') {
      if (value === null || value === undefined || value === '' || value === 0) {
        return <span className="text-slate-400 font-mono">-</span>;
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
          <span className="font-bold text-slate-800">{value}</span>
          {noSpaces !== undefined && (
            <span className="text-[10px] text-slate-500 font-normal bg-slate-100 px-1 py-0.5 rounded whitespace-nowrap" title="Character count without spaces">
              ({noSpaces} no spaces)
            </span>
          )}
        </div>
      );
    }

    // 6. Pixel width columns
    if (colKey.endsWith('_pixel_width')) {
      if (value === null || value === undefined || value === 0 || value === '') {
        return <span className="text-slate-400 font-mono">-</span>;
      }
      const numVal = parseInt(value, 10);
      const isOver = (colKey.startsWith('title') && numVal > 561) || (colKey.startsWith('meta_desc') && numVal > 985);
      return (
        <span className={`font-mono text-xs ${isOver ? 'text-amber-600 font-bold' : 'text-slate-700'}`}>
          {numVal} px
        </span>
      );
    }

    // 7. Other boolean columns (e.g. Multiple, Duplicate, Over 70 Characters)
    if (value === true || value === 'TRUE' || value === 'true') {
      if (colKey === 'Multiple') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
            2+ (Multiple)
          </span>
        );
      }
      if (colKey === 'Duplicate') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
            Duplicate
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
          Issue
        </span>
      );
    }
    if (value === false || value === 'FALSE' || value === 'false') {
      if (colKey === 'Multiple') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Single
          </span>
        );
      }
      if (colKey === 'Duplicate') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Unique
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-50 text-slate-500 border border-slate-200">
          Passed
        </span>
      );
    }

    if (value === null || value === undefined || value === '') {
      return <span className="text-slate-400 font-mono">-</span>;
    }
    if (typeof value === 'object') {
      return <span className="font-mono text-[10px] text-indigo-700 truncate max-w-xs">{JSON.stringify(value)}</span>;
    }
    return <span className="truncate max-w-md">{String(value)}</span>;
  };

  return (
    <div className="flex flex-col h-full space-y-3 overflow-hidden">

      {/* Top Header & Dual Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Screaming Frog URL Data Grid</h2>
          <p className="text-xs text-slate-500 mt-0.5">Explore full 32-parameter extracted data for all crawled website endpoints.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
          {/* Screaming Frog View Switcher: Table View vs Tree View */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Flat Table View"
            >
              <TableProperties size={13} />
              <span>Table View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'tree'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Select tree table view (Screaming Frog Directory Trie)"
            >
              <FolderTree size={13} />
              <span>Tree View</span>
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
            className="btn-primary py-2 px-3 sm:px-3.5 text-xs font-bold gap-1.5 sm:gap-2 disabled:opacity-50 shadow-xs"
            title="Export full 3-sheet Excel (.xlsx) workbook"
          >
            <FileSpreadsheet size={14} className="text-emerald-400" />
            <span>Excel (.xlsx)</span>
          </motion.button>

          {/* Master Full CSV Button */}
          <motion.button
            onClick={handleExportMasterCSV}
            disabled={!pages || pages.length === 0}
            whileTap={tapPress}
            transition={spring.press}
            className="btn-secondary py-2 px-2.5 sm:px-3 text-xs font-bold gap-1.5 disabled:opacity-50 shadow-xs"
            title="Export 35+ technical parameters to universal CSV"
          >
            <Download size={13} className="text-indigo-600" />
            <span>Master CSV</span>
          </motion.button>

          {/* Current Filtered View Export */}
          <motion.button
            onClick={exportCurrentViewToCSV}
            disabled={!filteredPages || filteredPages.length === 0}
            whileTap={tapPress}
            transition={spring.press}
            className="btn-secondary py-2 px-2.5 sm:px-3 text-xs font-bold gap-1.5 disabled:opacity-50 shadow-xs"
            title="Export only currently filtered rows"
          >
            <Filter size={13} className="text-slate-600" />
            <span>Filtered View</span>
          </motion.button>
        </div>
      </div>

      {/* Scope Segment Control & Screaming Frog Compliance Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl w-fit text-xs font-semibold">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 pl-2 pr-1">Scope:</span>
          <button
            type="button"
            onClick={() => setPageScope('all')}
            className={`px-3 py-1.5 rounded-lg transition-all text-xs ${
              pageScope === 'all'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Crawled URLs ({scopeCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setPageScope('content')}
            className={`px-3 py-1.5 rounded-lg transition-all text-xs ${
              pageScope === 'content'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Content Pages Only ({scopeCounts.content})
          </button>
          <button
            type="button"
            onClick={() => setPageScope('archives')}
            className={`px-3 py-1.5 rounded-lg transition-all text-xs ${
              pageScope === 'archives'
                ? 'bg-white text-amber-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Author & Archives ({scopeCounts.archives})
          </button>
          <button
            type="button"
            onClick={() => setPageScope('errors')}
            className={`px-3 py-1.5 rounded-lg transition-all text-xs ${
              pageScope === 'errors'
                ? 'bg-white text-rose-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Errors & Redirects ({scopeCounts.errors})
          </button>
        </div>

        {ON_PAGE_HTML_CATEGORIES.includes(activeCategory) && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/80">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>Screaming Frog standard: 200 OK HTML pages evaluated</span>
          </div>
        )}
      </div>

      {/* Controls Bar: Category Picker + Sub-view filter + Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3 shrink-0">

        {/* Category Selector */}
        <CustomSelect
          label="Category:"
          value={activeCategory}
          options={CATEGORIES}
          onChange={(newCat) => {
            setActiveCategory(newCat);
            setActiveView('All');
            toast.info(`Switched category to ${newCat.replace(/_/g, ' ')}`);
          }}
          valueClassName="text-indigo-600 font-bold"
          searchPlaceholder="Search 30+ categories..."
          showSearch={true}
        />

        {/* Sub-view Selector with exact counts */}
        <CustomSelect
          label="View Filter:"
          value={activeView}
          options={availableViewsWithBadges}
          onChange={(newView) => setActiveView(newView)}
          valueClassName="text-emerald-700 font-bold"
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
            className="w-full glass-input pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 rounded-xl"
          />
        </div>
      </div>

      {/* Category Metric Strip & Missing URLs Counter */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs shrink-0 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">Audited URLs:</span>
            <span className="font-mono font-bold text-slate-900">{categoryStats.total}</span>
          </div>

          <div className="h-3 w-px bg-slate-200 hidden sm:block" />

          {/* Explicit missing count counter with 1-click filter */}
          <button
            type="button"
            onClick={() => setActiveView(activeView === 'Missing' ? 'All' : 'Missing')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
              categoryStats.missing > 0
                ? activeView === 'Missing'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
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

          <div className="h-3 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">Present:</span>
            <span className="font-mono font-bold text-emerald-700">{categoryStats.present}</span>
          </div>
        </div>

        {/* Active filter notification pill */}
        {activeView === 'Missing' && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
            <span>Filter Active:</span>
            <span>Showing {filteredPages.length} {filteredPages.length === 1 ? 'URL' : 'URLs'} with Missing {activeCategory.replace(/_/g, ' ')}</span>
          </div>
        )}
      </div>

      {/* Main View: Tree Table vs Flat Data Grid */}
      {viewMode === 'tree' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <URLTreeTable
            pages={filteredPages}
            onRowClick={onRowClick}
            searchQuery={searchQuery}
          />
        </div>
      ) : (
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl relative overflow-hidden flex flex-col shadow-xs">
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full min-w-[700px] text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-20 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider w-80 min-w-[280px]">
                  URL Endpoint
                </th>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider w-24">
                  Status
                </th>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider w-28">
                  Indexability
                </th>
                {dynamicColumns.map(col => {
                  const isTextCol = ['title_1', 'meta_desc_1', 'h1_1', 'h1_2', 'h2_1', 'h2_2', 'canonical_link_element_1', 'meta_robots_1'].includes(col);
                  return (
                    <th 
                      key={col} 
                      className={`px-4 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider ${
                        isTextCol ? 'min-w-[280px] max-w-md' : 'min-w-[120px] whitespace-nowrap'
                      }`}
                    >
                      {getColumnLabel(col)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence initial={false} mode="popLayout">
              {filteredPages.length > 0 ? (
                filteredPages.map((page, idx) => {
                  const statusCode = page.status_code || 200;
                  const isCopied = copiedUrl === page.url;

                  return (
                    <motion.tr
                      key={page.id || page.url || idx}
                      layout={!reduced}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{
                        ...tween(duration.fast, ease.outQuart),
                        delay: Math.min(idx, 12) * 0.015,
                      }}
                      onClick={() => onRowClick && onRowClick(page)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        <div className="flex items-center gap-1.5 truncate max-w-sm">
                          <ChevronRight size={13} className="text-slate-400 group-hover:text-indigo-600 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                          <span className="truncate" title={page.url}>{page.url}</span>
                          {page.url?.includes('/author/') && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Author
                            </span>
                          )}
                          {statusCode >= 400 && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-rose-50 text-rose-700 border border-rose-200">
                              Broken Link
                            </span>
                          )}
                          {statusCode >= 300 && statusCode < 400 && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Redirect
                            </span>
                          )}
                          <button
                            onClick={(e) => handleCopy(page.url, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Copy URL"
                          >
                            {isCopied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          statusCode >= 400
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : statusCode >= 300
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {statusCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          page.indexability === 'Non-Indexable'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
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
                            className={`px-4 py-3 font-mono text-slate-600 ${
                              isTextCol ? 'min-w-[280px] max-w-md whitespace-normal' : 'whitespace-nowrap'
                            }`}
                          >
                            {formatCellValue(cellVal, col, page)}
                          </td>
                        );
                      })}
                    </motion.tr>
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
                  <td colSpan={dynamicColumns.length + 3} className="px-6 py-16 text-center text-slate-400">
                    <p className="font-bold text-slate-900 text-sm">No URLs match the selected filter ({activeCategory} : {activeView}).</p>
                    <p className="text-xs text-slate-500 mt-1 mb-3">Try switching category, resetting search query, or viewing all URLs.</p>
                    <button
                      onClick={() => {
                        setActiveView('All');
                        setSearchQuery('');
                      }}
                      className="btn-secondary px-3.5 py-1.5 text-xs font-bold text-indigo-600 border border-indigo-200 hover:bg-indigo-50"
                    >
                      Show All {pages?.length || 0} URLs
                    </button>
                  </td>
                </motion.tr>
              )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Footer Meta */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] font-mono text-slate-500 flex justify-between items-center shrink-0">
          <span>Showing <strong className="text-slate-900">{filteredPages.length}</strong> of <strong className="text-slate-900">{pages?.length || 0}</strong> URLs</span>
          <span>Category: <strong className="text-indigo-600">{activeCategory}</strong> | View: <strong className="text-emerald-600">{activeView}</strong></span>
        </div>
      </div>
      )}
    </div>
  );
}
