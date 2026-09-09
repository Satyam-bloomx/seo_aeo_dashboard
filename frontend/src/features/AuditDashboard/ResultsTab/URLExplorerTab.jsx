'use client';
import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { duration, ease, spring, tapPress, tween } from '@/lib/motion';
import { Filter, Search, LayoutPanelLeft, FileSpreadsheet, Download, ExternalLink, ChevronRight } from 'lucide-react';

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

  React.useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  React.useEffect(() => {
    if (initialView) {
      setActiveView(initialView);
    }
  }, [initialView]);

  const dynamicColumns = useMemo(() => {
    if (!pages || pages.length === 0) return [];

    for (const page of pages) {
      const catData = page.audit_data?.[activeCategory];
      if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        return Object.keys(catData);
      }
    }
    if (activeCategory === 'Internal') return ['status_code', 'indexability', 'content_type', 'word_count'];
    return [];
  }, [pages, activeCategory]);

  const availableViews = useMemo(() => {
    return ['All', 'Errors', ...dynamicColumns];
  }, [dynamicColumns]);

  const filteredPages = useMemo(() => {
    let result = pages || [];
    if (searchQuery) {
      result = result.filter(p => p.url.toLowerCase().includes(searchQuery.toLowerCase()));
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
      result = result.filter(p => {
        const catData = p.audit_data?.[activeCategory];
        if (!catData) return false;
        const directVal = catData[activeView];
        if (directVal !== undefined) return directVal === true;
        return Object.entries(catData).some(([k, v]) =>
          k.toLowerCase().includes(activeView.toLowerCase()) && v === true
        );
      });
    }
    return result;
  }, [pages, searchQuery, activeCategory, activeView]);

  const exportToCSV = () => {
    if (!filteredPages || filteredPages.length === 0) return;

    const headers = ['URL', ...dynamicColumns];
    const rows = filteredPages.map(page => {
      const pageUrl = `"${(page.url || '').replace(/"/g, '""')}"`;
      const colValues = dynamicColumns.map(col => {
        const val = page.audit_data?.[activeCategory]?.[col] ?? page[col];
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      return [pageUrl, ...colValues].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditpro_${activeCategory.toLowerCase()}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV Export Generated', {
      description: `Exported ${filteredPages.length} rows for ${activeCategory.replace(/_/g, ' ')}.`
    });
  };

  const formatCellValue = (value, colKey) => {
    if (value === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
          True
        </span>
      );
    }
    if (value === false) {
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

      {/* Top Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Screaming Frog URL Data Grid</h2>
          <p className="text-xs text-slate-500 mt-0.5">Explore full 32-parameter extracted data for all crawled website endpoints.</p>
        </div>

        <motion.button
          onClick={exportToCSV}
          disabled={!filteredPages || filteredPages.length === 0}
          whileTap={tapPress}
          initial="rest"
          whileHover="hover"
          animate="rest"
          transition={spring.press}
          className="btn-primary py-2 px-4 text-xs font-bold gap-2 shrink-0 self-start sm:self-auto disabled:opacity-50 shadow-xs"
        >
          <motion.span
            variants={{ rest: { y: 0 }, hover: { y: 2 } }}
            transition={spring.press}
            className="flex"
          >
            <Download size={14} className="text-emerald-400" />
          </motion.span>
          Export CSV
        </motion.button>
      </div>

      {/* Controls Bar: Category Picker + Sub-view filter + Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">

        {/* Category Selector */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-xs">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase px-2">Category:</span>
          <select
            value={activeCategory}
            onChange={(e) => {
              setActiveCategory(e.target.value);
              setActiveView('All');
              toast.info(`Switched category to ${e.target.value.replace(/_/g, ' ')}`);
            }}
            className="flex-1 bg-transparent text-xs font-bold text-indigo-600 outline-none cursor-pointer py-1.5"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat} className="text-slate-900 bg-white">
                {cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Sub-view Selector */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-xs">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase px-2">View Filter:</span>
          <select
            value={activeView}
            onChange={(e) => setActiveView(e.target.value)}
            className="flex-1 bg-transparent text-xs font-bold text-emerald-700 outline-none cursor-pointer py-1.5"
          >
            {availableViews.map(view => (
              <option key={view} value={view} className="text-slate-900 bg-white">
                {view.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Live Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search URLs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full glass-input pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 rounded-xl"
          />
        </div>
      </div>

      {/* Main TanStack Data Grid */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl relative overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-20 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider w-80 min-w-[280px]">
                  URL Endpoint
                </th>
                <th className="px-4 py-3.5 font-bold font-mono text-slate-500 uppercase tracking-wider w-24">
                  Status
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

                  return (
                    <motion.tr
                      key={page.id || page.url || idx}
                      layout={!reduced}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{
                        ...tween(duration.fast, ease.outQuart),
                        // Cap the cascade: on a 500-row grid an uncapped
                        // stagger would still be animating minutes later.
                        delay: Math.min(idx, 12) * 0.015,
                      }}
                      onClick={() => onRowClick && onRowClick(page)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        <div className="flex items-center gap-2 truncate max-w-sm">
                          <ChevronRight size={13} className="text-slate-400 group-hover:text-indigo-600 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                          <span className="truncate" title={page.url}>{page.url}</span>
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
                  <td colSpan={dynamicColumns.length + 2} className="px-6 py-16 text-center text-slate-400">
                    <p className="font-bold text-slate-900 text-sm">No URLs match the selected filter.</p>
                    <p className="text-xs text-slate-500 mt-1">Try switching category or resetting search query.</p>
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
          <span>Category: <strong className="text-indigo-600">{activeCategory}</strong></span>
        </div>
      </div>
    </div>
  );
}
