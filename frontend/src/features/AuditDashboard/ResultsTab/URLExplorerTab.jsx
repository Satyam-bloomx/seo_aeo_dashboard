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
  ChevronRight,
  Copy,
  Check,
  TableProperties
} from 'lucide-react';

const CATEGORIES = [
  'Internal', 'External', 'Security', 'Response_Codes', 'URI', 'Page_Titles',
  'Meta_Description', 'Meta_Keywords', 'H1', 'H2', 'Content', 'Images',
  'Canonicals', 'Pagination', 'Directives', 'Hreflang', 'JavaScript', 'Links',
  'AMP', 'Structured_Data', 'Sitemaps', 'PageSpeed', 'AEO_Audit', 'GEO_Audit',
  'Google_Analytics', 'Search_Console', 'Mobile', 'Accessibility', 'Validation', 'Link_Metrics'
];

// Master 35+ column specification for full Excel/CSV technical site audit export
const MASTER_EXPORT_FIELDS = [
  { header: 'URL', getter: (p) => p.url },
  { header: 'Status Code', getter: (p) => p.status_code || 200 },
  { header: 'Status', getter: (p) => p.status_name || (p.status_code >= 400 ? 'Client Error' : p.status_code >= 300 ? 'Redirect' : 'OK') },
  { header: 'Indexability', getter: (p) => p.indexability || 'Indexable' },
  { header: 'Indexability Status', getter: (p) => p.indexability_status || 'None' },
  { header: 'Content Type', getter: (p) => p.content_type || 'text/html' },
  { header: 'Response Time (ms)', getter: (p) => p.response_time_ms || '' },
  { header: 'Size (Bytes)', getter: (p) => p.size_bytes || '' },
  { header: 'Word Count', getter: (p) => p.word_count ?? '' },
  { header: 'Text Ratio (%)', getter: (p) => p.text_to_html_ratio ? (p.text_to_html_ratio * 100).toFixed(1) : '' },
  { header: 'Crawl Depth', getter: (p) => p.crawl_depth ?? '' },
  { header: 'Title 1', getter: (p) => p.title_1 || '' },
  { header: 'Title 1 Length', getter: (p) => p.title_1_length || (p.title_1 ? p.title_1.length : '') },
  { header: 'Title 1 Pixel Width', getter: (p) => p.title_1_pixel_width || '' },
  { header: 'Meta Description 1', getter: (p) => p.meta_desc_1 || '' },
  { header: 'Meta Description 1 Length', getter: (p) => p.meta_desc_1_length || (p.meta_desc_1 ? p.meta_desc_1.length : '') },
  { header: 'Meta Keywords 1', getter: (p) => p.meta_keyword_1 || '' },
  { header: 'H1-1', getter: (p) => p.h1_1 || '' },
  { header: 'H1-1 Length', getter: (p) => p.h1_1_length || (p.h1_1 ? p.h1_1.length : '') },
  { header: 'H1-2', getter: (p) => p.h1_2 || '' },
  { header: 'H2-1', getter: (p) => p.h2_1 || '' },
  { header: 'H2-2', getter: (p) => p.h2_2 || '' },
  { header: 'Canonical Link Element 1', getter: (p) => p.canonical_link_element_1 || '' },
  { header: 'Meta Robots 1', getter: (p) => p.meta_robots_1 || '' },
  { header: 'Core Web Vitals - LCP', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.lcp || '' },
  { header: 'Core Web Vitals - CLS', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.cls || '' },
  { header: 'Core Web Vitals - INP', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.inp || '' },
  { header: 'Core Web Vitals - TTFB', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.ttfb || '' },
  { header: 'AEO Extractable Answer Score', getter: (p) => p.audit_data?.AEO_Audit?.aeo_score || '' },
  { header: 'GEO Local Score', getter: (p) => p.audit_data?.GEO_Audit?.geo_score || '' },
  { header: 'Multiple Head Tags', getter: (p) => p.audit_data?.Validation?.['Multiple <head> Tags'] ? 'TRUE' : 'FALSE' },
  { header: 'Multiple Body Tags', getter: (p) => p.audit_data?.Validation?.['Multiple <body> Tags'] ? 'TRUE' : 'FALSE' },
  { header: 'Duplicate Title', getter: (p) => p.audit_data?.Page_Titles?.['Duplicate'] ? 'TRUE' : 'FALSE' },
  { header: 'Duplicate H1', getter: (p) => p.audit_data?.H1?.['Duplicate'] ? 'TRUE' : 'FALSE' },
  { header: 'Duplicate Content', getter: (p) => p.audit_data?.Content?.['Exact Duplicates'] ? 'TRUE' : 'FALSE' },
  { header: 'Missing Alt Text', getter: (p) => p.audit_data?.Images?.['Missing Alt Text'] ? 'TRUE' : 'FALSE' }
];

export default function URLExplorerTab({ pages, initialCategory, initialView, onRowClick }) {
  const reduced = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState(initialCategory || 'Page_Titles');
  const [activeView, setActiveView] = useState(initialView || 'All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(null);

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

    for (const page of pages) {
      const catData = page.audit_data?.[activeCategory];
      if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        const keys = Object.keys(catData);
        if (keys.length > 0) return keys;
      }
    }

    return ['status_code', 'indexability', 'word_count'];
  }, [pages, activeCategory]);

  const availableViews = useMemo(() => {
    return ['All', 'Errors', ...dynamicColumns];
  }, [dynamicColumns]);

  const filteredPages = useMemo(() => {
    let result = pages || [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => (p.url || '').toLowerCase().includes(q) || (p.title_1 || '').toLowerCase().includes(q));
    }

    if (activeView === 'Errors') {
      result = result.filter(p => {
        const catData = p.audit_data?.[activeCategory];
        if (activeCategory === 'Response_Codes') {
          return p.status_code >= 400;
        }
        if (!catData) return false;
        return Object.values(catData).some(val => val === true);
      });
    } else if (activeView !== 'All') {
      // Sanitize activeView search query
      const cleanViewQuery = activeView.includes(':')
        ? activeView.split(':').slice(1).join(':').trim().toLowerCase()
        : activeView.toLowerCase();

      result = result.filter(p => {
        const catData = p.audit_data?.[activeCategory];
        if (!catData) {
          // Check top level page property
          const directVal = p[activeView];
          if (directVal !== undefined) return Boolean(directVal);
          return false;
        }
        
        // Exact key match
        if (catData[activeView] !== undefined) {
          const v = catData[activeView];
          if (v === true || v === 'true' || v === 'TRUE' || v === 'Verified') return true;
          if (v === false || v === 'false' || v === 'FALSE' || v === null || v === undefined) return false;
          return Boolean(v);
        }

        // Fuzzy key match on sanitized query
        return Object.entries(catData).some(([k, v]) => {
          const kLower = k.toLowerCase();
          const matchesKey = kLower.includes(cleanViewQuery) || cleanViewQuery.includes(kLower);
          if (!matchesKey) return false;
          if (v === true || v === 'true' || v === 'TRUE' || v === 'Verified') return true;
          if (v === false || v === 'false' || v === 'FALSE' || v === null || v === undefined) return false;
          return Boolean(v);
        });
      });
    }
    return result;
  }, [pages, searchQuery, activeCategory, activeView]);

  // Master Full Audit Exporter (Exports all 35+ parameters into formatted Excel/CSV)
  const exportFullAuditToCSV = () => {
    if (!pages || pages.length === 0) {
      toast.error('No crawl data available to export.');
      return;
    }

    const headers = MASTER_EXPORT_FIELDS.map(f => `"${f.header.replace(/"/g, '""')}"`);
    const rows = pages.map(page => {
      return MASTER_EXPORT_FIELDS.map(f => {
        try {
          const val = f.getter(page);
          if (val === null || val === undefined) return '""';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        } catch {
          return '""';
        }
      }).join(',');
    });

    // \uFEFF is UTF-8 Byte Order Mark (BOM) ensuring Microsoft Excel detects UTF-8 correctly
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `auditpro_master_site_audit_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Master Site Audit Exported', {
      description: `Exported ${pages.length} URLs across all 35+ technical parameters.`
    });
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
        const val = page.audit_data?.[activeCategory]?.[col] ?? page[col];
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

  const formatCellValue = (value, colKey) => {
    if (value === true || value === 'TRUE') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
          True
        </span>
      );
    }
    if (value === false || value === 'FALSE') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          False
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
          {/* Master Full Export Button */}
          <motion.button
            onClick={exportFullAuditToCSV}
            disabled={!pages || pages.length === 0}
            whileTap={tapPress}
            initial="rest"
            whileHover="hover"
            animate="rest"
            transition={spring.press}
            className="btn-primary py-2 px-3 sm:px-3.5 text-xs font-bold gap-1.5 sm:gap-2 disabled:opacity-50 shadow-xs"
            title="Export full 35+ parameters for all pages into Excel"
          >
            <Download size={14} className="text-emerald-400" />
            <span className="hidden xs:inline">Export Full Audit</span> (Excel)
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
            <FileSpreadsheet size={13} className="text-slate-600" />
            Filtered CSV
          </motion.button>
        </div>
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

        {/* Sub-view Selector */}
        <CustomSelect
          label="View Filter:"
          value={activeView}
          options={availableViews}
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

      {/* Main TanStack Data Grid */}
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
                {dynamicColumns.map(col => (
                  <th key={col} className="px-4 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider min-w-[140px] whitespace-nowrap">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence initial={false} mode="popLayout">
              {filteredPages.length > 0 ? (
                filteredPages.map((page, idx) => {
                  const statusCode = page.status_code || 200;
                  const catData = page.audit_data?.[activeCategory] || {};
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
                        <div className="flex items-center gap-2 truncate max-w-sm">
                          <ChevronRight size={13} className="text-slate-400 group-hover:text-indigo-600 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                          <span className="truncate" title={page.url}>{page.url}</span>
                          <button
                            onClick={(e) => handleCopy(page.url, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
                        const cellVal = catData[col] !== undefined ? catData[col] : page[col];
                        return (
                          <td key={col} className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                            {formatCellValue(cellVal, col)}
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
    </div>
  );
}
