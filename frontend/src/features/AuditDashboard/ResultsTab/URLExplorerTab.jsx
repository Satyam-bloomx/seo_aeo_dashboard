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
  TableProperties
} from 'lucide-react';
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
    const base = ['All', 'Errors', ...dynamicColumns];
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
  }, [dynamicColumns, activeCategory]);

  const filteredPages = useMemo(() => {
    let result = pages || [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => (p.url || '').toLowerCase().includes(q) || (p.title_1 || '').toLowerCase().includes(q));
    }

    if (activeView === 'Zombie Pages (0 Visits)') {
      return result.filter(p => p.audit_data?.Google_Analytics?.Is_Zombie_Page === true);
    }
    if (activeView === 'High Traffic at Risk') {
      return result.filter(p => (p.status_code || 200) >= 400 && p.audit_data?.Google_Analytics?.Revenue_At_Risk?.includes('P0'));
    }
    if (activeView === 'Indexed & Rank Eligible') {
      return result.filter(p => p.audit_data?.Search_Console?.Google_Index_Status?.toLowerCase().includes('indexed'));
    }
    if (activeView === 'Crawled - Not Indexed') {
      return result.filter(p => p.audit_data?.Search_Console?.Index_Coverage_State?.toLowerCase().includes('not indexed'));
    }
    if (activeView === 'Excluded by Google') {
      return result.filter(p => {
        const gsc = p.audit_data?.Search_Console;
        return (gsc?.Google_Index_Status || '').toLowerCase().includes('excluded') || 
               (gsc?.Index_Coverage_State || '').toLowerCase().includes('excluded');
      });
    }
    if (activeView === 'Canonical Mismatches') {
      return result.filter(p => p.audit_data?.Search_Console?.Canonical_Mismatch === true);
    }
    if (activeView === 'High Impressions Low CTR') {
      return result.filter(p => {
        const gsc = p.audit_data?.Search_Console;
        if (!gsc) return false;
        const imp = gsc.Impressions_Num !== undefined 
          ? gsc.Impressions_Num 
          : parseInt(String(gsc.Search_Impressions || '0').replace(/,/g, ''), 10) || 0;
        const ctr = gsc.CTR_Num !== undefined 
          ? gsc.CTR_Num 
          : parseFloat(String(gsc.Average_CTR || '0').replace('%', '')) || 0;
        return imp >= 80 && ctr > 0 && ctr < 1.5;
      });
    }
    if (activeView === 'Striking Distance (11-20)') {
      return result.filter(p => {
        const gsc = p.audit_data?.Search_Console;
        if (!gsc) return false;
        const pos = gsc.Position_Num !== undefined 
          ? gsc.Position_Num 
          : parseFloat(String(gsc.Average_SERP_Position || '0')) || 0;
        return pos >= 10.5 && pos <= 20.4;
      });
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
    if (colKey === 'Is_Zombie_Page') {
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
