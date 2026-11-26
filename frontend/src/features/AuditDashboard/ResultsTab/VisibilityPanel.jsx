'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, MinusCircle, RefreshCw, Search, Sparkles, XCircle } from 'lucide-react';
import { checkVisibility, getVisibility } from '@/api/client';

const POLL_MS = 5000;

/** The site's measured visibility (GET /visibility), polled while a measurement runs. */
export function useVisibility(enabled, initialData = null) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [settled, setSettled] = useState(Boolean(initialData));
  const [starting, setStarting] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await getVisibility());
      setError(null);
    } catch (err) {
      // 404 = no completed audit yet: nothing to measure
      setError(err?.response?.status === 404 ? null : (err?.response?.data?.detail || 'Could not load visibility.'));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getVisibility()
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(err => {
        if (!cancelled) setError(err?.response?.status === 404 ? null : (err?.response?.data?.detail || 'Could not load visibility.'));
      })
      .finally(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (data?.running) timer.current = setTimeout(load, POLL_MS);
    return () => clearTimeout(timer.current);
  }, [data, load]);

  const measure = useCallback(async () => {
    setStarting(true);
    try {
      setData(await checkVisibility(true));
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not start the measurement.');
    } finally {
      setStarting(false);
    }
  }, []);

  const loading = Boolean(enabled) && !settled;
  return { data, error, loading, measure, starting, reload: load };
}

/** Card props for one measured score (geo / aeo / seo): a score only when it was really measured. */
export function measuredCard(vis, key) {
  if (vis?.loading && !vis?.data) return { score: null, isDisconnected: true, statusText: 'Loading…' };
  const s = vis?.data?.last?.scores?.[key];
  if (vis?.data?.running && !s) return { score: null, isDisconnected: true, statusText: 'Measuring…' };
  if (!vis?.data) return { score: null, isDisconnected: true, statusText: 'Not measured yet' };
  if (!s) return { score: null, isDisconnected: true, statusText: vis.data.last_error || 'Not measured yet' };
  if (s.status !== 'ok') return { score: null, isDisconnected: true, statusText: `Not measured: ${s.reason}` };
  const range = s.interval ? ` · likely ${s.interval[0]}–${s.interval[1]}` : '';
  return { score: s.score, isDisconnected: false, statusText: `${s.label}${range}` };
}

function Yes({ on, children }) {
  return (
    <span className={`inline-flex items-center gap-1 ${on ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
      {on ? <CheckCircle2 size={12} /> : <MinusCircle size={12} />}{children}
    </span>
  );
}

function hostFromUrl(url, fallback) {
  if (!url) return fallback || '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return fallback || url; }
}

function SourceList({ items }) {
  return items.map((item, idx) => (
    <React.Fragment key={`${item.host}-${idx}`}>
      {idx > 0 ? ', ' : ''}
      {item.is_self ? (
        item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title={item.url}
            className="font-semibold text-emerald-600 dark:text-emerald-400 underline decoration-emerald-500/50 hover:decoration-emerald-400"
          >
            {item.position ? `#${item.position} ` : ''}{item.host} (you)
          </a>
        ) : (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {item.position ? `#${item.position} ` : ''}{item.host} (you)
          </span>
        )
      ) : (
        <span>{item.position ? `#${item.position} ` : ''}{item.host}</span>
      )}
    </React.Fragment>
  ));
}

function QuestionRow({ q, engines, siteDomain }) {
  const [open, setOpen] = useState(false);
  const g = q.google;
  const aio = g?.ai_overview || {};

  // Build ordered Google top results (including our own site at its exact rank).
  const topResults = (() => {
    if (g?.top_results?.length) return g.top_results;
    if (!g?.competitors?.length && !g?.rank) return [];
    const list = (g.competitors || []).map(host => ({ host, is_self: false }));
    if (g.rank && g.rank >= 1 && g.rank <= 5) {
      const selfHost = hostFromUrl(g.url, siteDomain);
      if (selfHost) {
        list.splice(g.rank - 1, 0, { host: selfHost, url: g.url, is_self: true });
      }
    }
    return list.slice(0, 5).map((item, i) => ({ ...item, position: i + 1 }));
  })();

  // Build ordered AI Overview sources (including our own site in its exact citation slot).
  const aioSources = (() => {
    if (aio.all_sources?.length) return aio.all_sources;
    const list = (aio.sources || []).map(host => ({ host, is_self: false }));
    if (aio.cited) {
      const selfHost = hostFromUrl(g?.url, siteDomain);
      if (selfHost && !list.some(s => s.host === selfHost)) {
        list.unshift({ host: selfHost, url: g?.url, is_self: true });
      }
    }
    return list;
  })();

  return (
    <li className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-start justify-between gap-3 text-left">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {q.text}
          <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {q.source === 'gsc' ? 'from gsc' : q.source === 'auto' ? 'generated' : 'yours'}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {q.target === 'ai' ? null : g ? (
          <>
            <span className="text-slate-600 dark:text-slate-300">Google: {g.rank ? <strong>#{g.rank}</strong> : 'not on page 1'}</span>
            <Yes on={aio.cited}>{aio.shown ? (aio.cited ? 'cited in AI Overview' : 'AI Overview, not cited') : 'no AI Overview'}</Yes>
            {g.featured_snippet ? <Yes on={g.featured_snippet_cited}>featured snippet</Yes> : null}
            {g.paa?.length ? <Yes on={g.paa_cited}>People Also Ask</Yes> : null}
          </>
        ) : <span className="text-slate-500">{q.google_error || 'Google not checked'}</span>}
        {q.target === 'ai' && !Object.keys(q.ai || {}).length && <span className="text-slate-500">No AI engine answered</span>}
        {Object.entries(q.ai || {}).map(([name, r]) => (
          <span key={name} className="text-slate-600 dark:text-slate-300">
            {engines?.[name]?.label || name}: {r.error ? r.error : <><strong>{(r.answers || []).filter(a => a.mentioned || a.cited).length} of {r.runs}</strong> answers mention or cite you</>}
          </span>
        ))}
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-200 dark:border-slate-800 pt-2 text-[11px] text-slate-600 dark:text-slate-300">
          {topResults.length ? <p><strong>Google top results:</strong> <SourceList items={topResults} /></p> : null}
          {aioSources.length ? <p><strong>AI Overview sources:</strong> <SourceList items={aioSources} /></p> : null}
          {Object.entries(q.ai || {}).map(([name, r]) => (r.answers || []).map((a, i) => (
            <div key={`${name}-${i}`} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2">
              <div className="mb-1 flex flex-wrap items-center gap-3 font-semibold">
                <span>{engines?.[name]?.label || name} · answer {i + 1}</span>
                <Yes on={a.mentioned}>mentions you</Yes><Yes on={a.cited}>cites your site</Yes>
              </div>
              {a.sources?.length ? <p className="mb-1"><strong>Cited instead:</strong> {a.sources.join(', ')}</p> : null}
              <p className="text-slate-500 dark:text-slate-400">{a.excerpt || '(no text)'}</p>
            </div>
          )))}
        </div>
      )}
    </li>
  );
}

const SETS = [
  { id: 'ai', title: 'Asked to AI engines', score: 'GEO score', hint: 'each asked once on every connected AI engine with live web search' },
  { id: 'google', title: 'Searched on Google', score: 'AEO score and Search visibility', hint: 'AI Overview, featured snippet, People Also Ask and page-1 ranking' },
];

function QuestionSets({ items, render }) {
  // Measurements from before the split have no set: one list, as they were measured.
  if (!items.some(q => q.target)) return <ul className="mt-4 space-y-2">{items.map(render)}</ul>;
  return (
    <div className="mt-4 space-y-4">
      {SETS.map(set => {
        const rows = items.filter(q => (q.target || 'ai') === set.id);
        return (
          <div key={set.id}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {set.title} <span className="font-semibold normal-case tracking-normal">· {set.score} · {set.hint}</span>
            </p>
            {rows.length ? <ul className="space-y-2">{rows.map(render)}</ul>
              : <p className="text-xs text-slate-500">No questions in this set yet.</p>}
          </div>
        );
      })}
    </div>
  );
}

/** The questions actually asked (3 to the AI engines, 3 different ones on Google), every answer, and what Google showed. */
export default function VisibilityPanel({ vis, onEditQuestions, onConnect }) {
  const { data, error, measure, starting } = vis;
  if (!data && !error) return null;
  const last = data?.last;
  const running = data?.running;
  const engines = data?.engines || {};
  const connected = Object.entries(engines).filter(([, e]) => e.connected);
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Sparkles size={16} className="text-purple-500" /> AI &amp; search visibility (measured)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {data?.questions_per_set || 3} questions asked to the AI engines (GEO) and {data?.questions_per_set || 3} different questions searched on Google (AEO and Search visibility).
            {last?.checked_at ? ` Last measured ${new Date(last.checked_at).toLocaleString()}.` : ' Not measured yet.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-mono font-bold">
            {Object.entries(engines).map(([name, e]) => (
              <span key={name} title={e.how} className={`rounded-full border px-2 py-0.5 ${e.connected ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300' : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}>
                {e.label}{e.connected ? '' : ' · not connected'}
              </span>
            ))}
            <span className={`rounded-full border px-2 py-0.5 ${data?.serp_connected ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300' : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}>
              <Search size={10} className="mr-1 inline" />Google (SerpAPI){data?.serp_connected ? '' : ' · not connected'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onEditQuestions} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            Edit questions
          </button>
          <button type="button" onClick={measure} disabled={running || starting || (!connected.length && !data?.serp_connected)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {running || starting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {running ? 'Measuring…' : 'Measure now'}
          </button>
        </div>
      </div>

      {(error || data?.last_error) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400"><XCircle size={13} />{error || data.last_error}</p>
      )}
      {!connected.length && !data?.serp_connected && (
        <p className="mt-3 text-xs text-slate-500">
          Nothing to measure with yet. <button type="button" onClick={onConnect} className="font-semibold text-indigo-600 underline">Connect Gemini, ChatGPT, Claude or SerpAPI</button>.
        </p>
      )}
      {last?.engines && Object.entries(last.engines).some(([, e]) => e.status === 'error' || (e.status === 'ok' && e.reason)) && (
        <ul className="mt-3 space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
          {Object.entries(last.engines).filter(([, e]) => e.reason && e.status !== 'not_connected').map(([name, e]) => (
            <li key={name}>{engines[name]?.label || name}: {e.reason}</li>
          ))}
        </ul>
      )}

      {last?.questions?.length ? (
        <QuestionSets items={last.questions} render={q => <QuestionRow key={q.id} q={q} engines={engines} siteDomain={data?.domain} />} />
      ) : data?.questions?.length ? (
        <QuestionSets items={data.questions} render={q => <li key={q.id} className="text-sm text-slate-700 dark:text-slate-200">• {q.text}</li>} />
      ) : (
        <p className="mt-4 text-xs text-slate-500">The questions are generated from the audited site on the first measurement; you can edit them in Keywords &amp; AI answers.</p>
      )}
    </section>
  );
}
