'use client';
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Search,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/utils/clipboard';

/**
 * Builds a hierarchical directory tree (Trie) from a flat list of crawled URLs.
 * Replicates Screaming Frog's "Select tree table view" architecture.
 */
function buildUrlTree(pages) {
  const root = {
    id: 'root',
    name: 'root',
    fullPath: '',
    isFolder: true,
    children: {},
    page: null,
    urlCount: 0,
  };

  for (const page of pages || []) {
    if (!page?.url) continue;
    try {
      const urlObj = new URL(page.url);
      const protocol = `${urlObj.protocol.replace(':', '')}/`; // 'https/' or 'http/'
      const host = `${urlObj.host}/`; // 'bloomxsolutions.com/'

      // Split path into clean segments
      const rawPath = urlObj.pathname.replace(/^\/+/, '');
      const rawSegments = rawPath ? rawPath.split('/') : [];

      const fullSegments = [protocol, host];
      rawSegments.forEach((seg, idx) => {
        if (!seg) return;
        const isLast = idx === rawSegments.length - 1;
        const hasTrailingSlash = urlObj.pathname.endsWith('/');
        if (isLast && !hasTrailingSlash) {
          const withQuery = urlObj.search ? `${seg}${urlObj.search}` : seg;
          fullSegments.push(withQuery);
        } else {
          fullSegments.push(`${seg}/`);
        }
      });

      let curr = root;
      curr.urlCount += 1;

      for (let i = 0; i < fullSegments.length; i++) {
        const seg = fullSegments[i];
        const isLeaf = i === fullSegments.length - 1;
        const subPath = fullSegments.slice(0, i + 1).join('');

        if (!curr.children[seg]) {
          curr.children[seg] = {
            id: subPath,
            name: seg,
            fullPath: subPath,
            isFolder: !isLeaf || seg.endsWith('/'),
            children: {},
            page: null,
            address: null,
            urlCount: 0,
          };
        }

        curr = curr.children[seg];
        curr.urlCount += 1;

        if (isLeaf) {
          curr.page = page;
          curr.address = page.url;
        }
      }
    } catch (e) {
      // Ignore unparseable URLs
    }
  }

  return root;
}

/**
 * Flattens the tree into visible rows based on expandedIds.
 */
function flattenTree(node, expandedIds, depth = 0, searchQuery = '', result = []) {
  if (!node || !node.children) return result;

  const entries = Object.values(node.children).sort((a, b) => {
    // Folders first, then alphabetically
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const child of entries) {
    const hasChildren = Object.keys(child.children).length > 0;
    const isExpanded = expandedIds.has(child.id);

    const matchesSearch = !searchQuery || 
      child.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (child.address && child.address.toLowerCase().includes(searchQuery.toLowerCase()));

    result.push({
      ...child,
      depth,
      hasChildren,
      isExpanded,
      matchesSearch,
    });

    if (hasChildren && (isExpanded || searchQuery)) {
      flattenTree(child, expandedIds, depth + 1, searchQuery, result);
    }
  }

  return result;
}

export default function URLTreeTable({ pages, onRowClick, searchQuery = '' }) {
  const [copiedUrl, setCopiedUrl] = useState(null);

  // Build the hierarchical tree
  const treeRoot = useMemo(() => buildUrlTree(pages), [pages]);

  // Initial expanded state: expand root, protocol, and domain levels
  const initialExpanded = useMemo(() => {
    const ids = new Set(['root']);
    Object.values(treeRoot.children || {}).forEach(protoNode => {
      ids.add(protoNode.id);
      Object.values(protoNode.children || {}).forEach(hostNode => {
        ids.add(hostNode.id);
      });
    });
    return ids;
  }, [treeRoot]);

  const [expandedIds, setExpandedIds] = useState(initialExpanded);

  // Toggle single folder
  const toggleExpand = (id, e) => {
    e?.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Expand All
  const handleExpandAll = () => {
    const allIds = new Set(['root']);
    function collect(node) {
      Object.values(node.children || {}).forEach(child => {
        allIds.add(child.id);
        collect(child);
      });
    }
    collect(treeRoot);
    setExpandedIds(allIds);
    toast.info('Expanded all directory folders');
  };

  // Collapse All
  const handleCollapseAll = () => {
    const minimal = new Set(['root']);
    setExpandedIds(minimal);
    toast.info('Collapsed all directory folders');
  };

  // Flatten tree for table view
  const visibleRows = useMemo(() => {
    return flattenTree(treeRoot, expandedIds, 0, searchQuery);
  }, [treeRoot, expandedIds, searchQuery]);

  const handleCopy = async (url, e) => {
    e.stopPropagation();
    if (!url) return;
    const ok = await copyToClipboard(url, 'URL');
    if (ok) {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden shadow-xs">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <FolderOpen size={14} className="text-emerald-600 dark:text-emerald-400" />
            Site Architecture Tree (Screaming Frog Directory Trie)
          </span>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
            {pages?.length || 0} Total Endpoints
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExpandAll}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs"
            title="Expand All Folders"
          >
            <Maximize2 size={11} className="text-indigo-600 dark:text-indigo-400" />
            <span>Expand All</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs"
            title="Collapse All Folders"
          >
            <Minimize2 size={11} className="text-slate-600 dark:text-slate-400" />
            <span>Collapse All</span>
          </button>
        </div>
      </div>

      {/* Tree Data Grid */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 border-collapse min-w-[760px]">
          <thead className="bg-slate-50 dark:bg-slate-950/80 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[420px] min-w-[320px]">
                Path Hierarchy
              </th>
              <th className="px-3 py-3 font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-20 text-center">
                URLs
              </th>
              <th className="px-4 py-3 font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[260px]">
                Address
              </th>
              <th className="px-3 py-3 font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24 text-center">
                Status
              </th>
              <th className="px-3 py-3 font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28 text-center">
                Indexability
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
            {visibleRows.length > 0 ? (
              visibleRows.map((row) => {
                const isClickable = Boolean(row.page);
                const statusCode = row.page?.status_code || (row.page ? 200 : null);
                const isCopied = copiedUrl === row.address;
                const isAuthor = row.name.includes('author') || row.fullPath.includes('/author/');
                const isAsset = row.name.endsWith('.js') || row.name.endsWith('.css') || row.name.endsWith('.png') || row.name.endsWith('.jpg');

                return (
                  <tr
                    key={row.id}
                    onClick={() => isClickable && onRowClick && onRowClick(row.page)}
                    className={`transition-colors select-none ${
                      isClickable
                        ? 'cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 group'
                        : 'bg-slate-50/40 dark:bg-slate-950/40 hover:bg-slate-100/40 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    {/* Path Column with Indentation & Collapse Icons */}
                    <td className="px-4 py-2.5 text-xs">
                      <div
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: `${row.depth * 18}px` }}
                      >
                        {row.hasChildren ? (
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(row.id, e)}
                            className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
                          >
                            {row.isExpanded ? (
                              <ChevronDown size={13} className="text-slate-600 dark:text-slate-400" />
                            ) : (
                              <ChevronRight size={13} className="text-slate-600 dark:text-slate-400" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}

                        {row.isFolder ? (
                          row.isExpanded ? (
                            <FolderOpen size={14} className="text-amber-500 shrink-0" />
                          ) : (
                            <Folder size={14} className="text-amber-500 shrink-0" />
                          )
                        ) : isAsset ? (
                          <FileCode size={14} className="text-sky-500 shrink-0" />
                        ) : (
                          <FileText size={14} className="text-slate-400 shrink-0" />
                        )}

                        <span
                          className={`truncate text-xs font-semibold ${
                            row.isFolder
                              ? 'text-slate-900 dark:text-white font-bold'
                              : isClickable
                              ? 'text-indigo-950 dark:text-indigo-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 font-semibold'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                          title={row.name}
                        >
                          {row.name}
                        </span>

                        {isAuthor && (
                          <span className="shrink-0 px-1 py-0.2 text-[9px] font-mono font-bold rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
                            Author
                          </span>
                        )}

                        {statusCode >= 400 && (
                          <span className="shrink-0 px-1 py-0.2 text-[9px] font-mono font-bold rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50">
                            404 Error
                          </span>
                        )}

                        {statusCode >= 300 && statusCode < 400 && (
                          <span className="shrink-0 px-1 py-0.2 text-[9px] font-mono font-bold rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
                            301 Redirect
                          </span>
                        )}
                      </div>
                    </td>

                    {/* URLs Count */}
                    <td className="px-3 py-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                      {row.urlCount}
                    </td>

                    {/* Full Address */}
                    <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300 max-w-sm truncate">
                      {row.address ? (
                        <div className="flex items-center gap-1.5 group/addr truncate">
                          <span className="truncate text-slate-700 dark:text-slate-300 font-medium" title={row.address}>
                            {row.address}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(row.address, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded opacity-0 group-hover/addr:opacity-100 transition-opacity shrink-0"
                            title="Copy URL"
                          >
                            {isCopied ? <Check size={11} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={11} />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>

                    {/* Status Code */}
                    <td className="px-3 py-2 text-center">
                      {statusCode ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            statusCode >= 400
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                              : statusCode >= 300
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
                          }`}
                        >
                          {statusCode}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>

                    {/* Indexability */}
                    <td className="px-3 py-2 text-center">
                      {row.page?.indexability ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            row.page.indexability === 'Non-Indexable'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
                          }`}
                        >
                          {row.page.indexability}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">No tree nodes found matching current query.</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Try clearing your search term.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex justify-between items-center shrink-0">
        <span>Showing <strong className="text-slate-900 dark:text-white">{visibleRows.length}</strong> directory nodes across <strong className="text-indigo-600 dark:text-indigo-400">{pages?.length || 0}</strong> crawled URLs</span>
        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Hierarchy Mode: Strict Screaming Frog Tree Table</span>
      </div>
    </div>
  );
}
