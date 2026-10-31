'use client';
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Info, Copy } from 'lucide-react';
import { buildDuplicateGroups, DUPLICATE_KINDS, paginationLabel } from '@/utils/duplicateGroups';
import { exportDuplicateGroupsToCSV } from '@/utils/exportUtils';
import { copyToClipboard } from '@/utils/clipboard';

const URLS_SHOWN = 50;

const EXCLUSION_REASONS = [
  ['canonicalised', 'they canonicalise to another URL'],
  ['noindex', 'they are set to noindex'],
  ['non_200', 'they do not return 200 OK'],
];

export function duplicatesExcludedNotes(crawlSummary) {
  const ex = crawlSummary?.crawl?.duplicates_excluded ?? crawlSummary?.duplicates_excluded;
  if (!ex) return [];
  return EXCLUSION_REASONS
    .filter(([key]) => Number(ex[key]) > 0)
    .map(([key, reason]) => `${ex[key]} ${Number(ex[key]) === 1 ? 'page was' : 'pages were'} not checked for duplicates because ${reason} (standard SEO practice).`);
}

export default function DuplicateGroupsView({ pages, crawlSummary, targetUrl, initialCategory }) {
  const initialKind = DUPLICATE_KINDS.find((k) => k.category === initialCategory)?.key || 'title';
  const [kindKey, setKindKey] = useState(initialKind);
  const [expanded, setExpanded] = useState(() => new Set());
  const kind = DUPLICATE_KINDS.find((k) => k.key === kindKey) || DUPLICATE_KINDS[0];

  const groups = useMemo(() => buildDuplicateGroups(pages, kind), [pages, kind]);
  const notes = useMemo(() => duplicatesExcludedNotes(crawlSummary), [crawlSummary]);
  const affected = useMemo(() => groups.reduce((n, g) => n + g.count, 0), [groups]);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
          {DUPLICATE_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => { setKindKey(k.key); setExpanded(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                kindKey === k.key
                  ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 shadow-xs font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
          <span><strong className="text-slate-900 dark:text-white">{groups.length}</strong> groups · <strong className="text-slate-900 dark:text-white">{affected}</strong> URLs</span>
          <button
            type="button"
            disabled={groups.length === 0}
            onClick={() => exportDuplicateGroupsToCSV(groups, { targetUrl, kindLabel: kind.label, valueLabel: kind.valueLabel })}
            className="btn-secondary py-1.5 px-3 text-xs font-bold gap-1.5 disabled:opacity-50 flex items-center"
            title="Export value, count, URLs and page types as CSV"
          >
            <Download size={13} className="text-indigo-600 dark:text-indigo-400" />
            Export groups CSV
          </button>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20 text-[11px] text-amber-800 dark:text-amber-300 shrink-0 space-y-0.5">
          {notes.map((n) => (
            <p key={n} className="flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />{n}</p>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto custom-scrollbar">
        {groups.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-bold text-slate-900 dark:text-white text-sm">No duplicate {kind.label.toLowerCase()} found.</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Every checked page has a unique value in this scope.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {groups.map((g) => {
              const open = expanded.has(g.id);
              const label = paginationLabel(g);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => toggle(g.id)}
                    aria-expanded={open}
                    className="w-full flex items-start gap-2.5 px-3.5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    {open ? <ChevronDown size={14} className="mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 text-slate-400 shrink-0" />}
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
                      {g.count} URLs
                    </span>
                    <span className="flex-1 min-w-0 text-xs font-semibold text-slate-900 dark:text-slate-100 break-words">{g.value}</span>
                    <span className="shrink-0 flex flex-wrap items-center justify-end gap-1">
                      {label && (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50">
                          {label}
                        </span>
                      )}
                      {g.pageTypes.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{t}</span>
                      ))}
                    </span>
                  </button>
                  {open && (
                    <ul className="pb-3 pl-11 pr-4 space-y-1">
                      {g.urls.slice(0, URLS_SHOWN).map((u) => (
                        <li key={u} className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                          <span className="truncate" title={u}>{u}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(u, 'URL')}
                            className="p-0.5 text-slate-400 hover:text-indigo-600 shrink-0"
                            title="Copy URL"
                          >
                            <Copy size={10} />
                          </button>
                        </li>
                      ))}
                      {g.urls.length > URLS_SHOWN && (
                        <li className="text-[11px] text-slate-400">+ {g.urls.length - URLS_SHOWN} more (all included in the CSV export)</li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
