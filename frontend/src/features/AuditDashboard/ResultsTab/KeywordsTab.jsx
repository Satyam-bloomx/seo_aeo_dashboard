'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Sparkles, Loader2, Plus, Trash2, Search, MapPin, Bot, ListOrdered, HelpCircle, ExternalLink, Save, Play, AlertTriangle,
} from 'lucide-react';
import { getKeywords, saveKeywords, suggestKeywords, checkKeywords, searchKeywordLocations, getKeywordIdeas } from '@/api/client';

/**
 * Keywords & AI answers: an AI-suggested list of keywords and customer questions, checked on Google (via SerpAPI)
 * for organic position, AI Overview citations, People Also Ask and the local map pack.
 */
const INTENTS = [
  { id: 'service', label: 'Service' },
  { id: 'problem', label: 'Problem / how-to' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'local', label: 'Local' },
  { id: 'brand', label: 'Brand' },
];
const POLL_MS = 4000;

const errorText = (err, fallback) => err?.response?.data?.detail || fallback;

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function ScoreTile({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        <Icon size={13} aria-hidden="true" /> {label}
      </div>
      <div className="mt-1 text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
        {value == null ? '—' : `${value}`}{value == null ? '' : <span className="text-sm text-slate-500">/100</span>}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function RankCell({ r }) {
  if (r.status === 'not_measured') {
    return <span className="text-xs text-slate-500 dark:text-slate-400">{r.kind === 'question' ? 'Needs Search Console' : 'Needs Search Console (or SerpAPI)'}</span>;
  }
  if (r.status !== 'ok') return <span className="text-xs text-amber-700 dark:text-amber-300">{r.error || 'Not checked'}</span>;
  const live = r.position_source === 'google_live';
  if (r.position == null) {
    if (!r.position_source) return <span className="text-xs text-slate-400">No position source</span>;
    return <span className="text-xs text-slate-500 dark:text-slate-400">{live ? 'Not in top 30' : 'Not shown in 28 days'}</span>;
  }
  const p = r.position;
  const tone = p <= 3 ? 'text-emerald-700 dark:text-emerald-400' : p <= 10 ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300';
  const url = r.position_url;
  return (
    <div className="min-w-0">
      <span className={`font-mono font-black ${tone}`} title={live ? 'Live Google result (SerpAPI)' : 'Search Console average, last 28 days'}>
        #{live ? p : p.toFixed(1)}
      </span>
      {!live && r.gsc && <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400">{r.gsc.impressions.toLocaleString()} impr.</span>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-slate-500 hover:text-indigo-600 dark:text-slate-400 max-w-[200px] truncate">
          {url.replace(/^https?:\/\/(www\.)?/, '')} <ExternalLink size={10} className="inline" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function AiCell({ r }) {
  if (r.status !== 'ok') return null;
  const g = r.gemini;
  const aio = r.ai_overview;
  if (!g?.runs && !r.serp_checked) {
    return <span className="text-xs text-slate-400">{r.kind === 'question' && !r.branded ? 'Not asked' : '—'}</span>;
  }
  return (
    <div className="space-y-0.5 text-xs">
      {g?.runs > 0 && (
        <div className={g.cited ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'font-bold text-rose-700 dark:text-rose-400'}
          title={`Gemini with Google Search, asked ${g.runs} times. Mentioned by name ${g.mentioned} of ${g.runs}.${g.sources?.length ? ` Cited instead: ${g.sources.join(', ')}` : ''}`}>
          Gemini: cited {g.cited} of {g.runs}
        </div>
      )}
      {r.serp_checked && (
        <div className={aio?.shown ? (aio.cited ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400') : 'text-slate-500 dark:text-slate-400'}
          title={aio?.sources?.length ? `Cited instead: ${aio.sources.join(', ')}` : undefined}>
          AI Overview: {aio?.shown ? (aio.cited ? 'cited' : 'not cited') : 'none shown'}
        </div>
      )}
    </div>
  );
}

const COMPETITION = {
  hard: { label: 'Hard', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  winnable: { label: 'Winnable', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
};

const IDEA_SOURCES = {
  search_console: 'Search Console',
  autocomplete: 'Google Autocomplete',
  related_search: 'Related search',
  people_also_ask: 'People Also Ask',
};

const IDEA_TYPES = {
  quick_win: { label: 'Quick win', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  ranking_low: { label: 'Ranking low', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  winning: { label: 'Top 3 already', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  new: { label: 'New', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
};

function IdeaProof({ idea }) {
  const g = idea.gsc;
  return (
    <div className="flex flex-wrap gap-1">
      {idea.sources.map((s) => (
        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          title={idea.seed && s !== 'search_console' ? `From “${idea.seed}”` : undefined}>
          {s === 'search_console' && g
            ? `Search Console: ${g.impressions.toLocaleString()} impressions · #${Math.round(g.position)}`
            : IDEA_SOURCES[s] || s}
        </span>
      ))}
    </div>
  );
}

function LocalCell({ r }) {
  if (r.status !== 'ok' || !r.local || !r.serp_checked) return <span className="text-xs text-slate-400">—</span>;
  if (r.local_rank) return <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">#{r.local_rank}</span>;
  return <span className="text-xs text-slate-500 dark:text-slate-400" title={r.local_pack?.length ? `Map pack: ${r.local_pack.join(', ')}` : undefined}>{r.local_pack?.length ? 'Not in map pack' : 'No map pack'}</span>;
}

export default function KeywordsTab({ onNavigateToTab, onChecked }) {
  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState({ items: [], location: '', business_name: '' });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null); // 'save' | 'suggest' | 'check'
  const [newText, setNewText] = useState('');
  const [locQuery, setLocQuery] = useState('');
  const [locOptions, setLocOptions] = useState([]);
  const [useAutocomplete, setUseAutocomplete] = useState(false);
  const [checkOpts, setCheckOpts] = useState({ search_console: true, ai_answers: true, serp: false });
  const wasRunning = useRef(false);

  const applyView = useCallback((v) => {
    setView(v);
    setDraft({ items: v.items || [], location: v.location || '', business_name: v.business_name || '' });
    setDirty(false);
  }, []);

  useEffect(() => {
    getKeywords().then(applyView).catch((err) => setLoadError(errorText(err, 'Could not load keywords.')));
  }, [applyView]);

  // While a check runs, poll until it finishes; then refresh the dashboard cards.
  const running = !!view?.running;
  useEffect(() => {
    if (!running) {
      if (wasRunning.current) {
        wasRunning.current = false;
        onChecked?.();
      }
      return undefined;
    }
    wasRunning.current = true;
    const timer = setTimeout(() => {
      getKeywords().then((v) => {
        // Keep unsaved edits while polling; only the run state and results change.
        setView(v);
        if (!v.running) {
          if (v.last_check?.stopped_reason) toast.warning(`Check stopped early: ${v.last_check.stopped_reason}`);
          else if (v.last_error) toast.error(v.last_error);
          else toast.success('Rankings checked.');
        }
      }).catch(() => {});
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, view, onChecked]);

  // Location suggestions from SerpAPI's free locations list.
  useEffect(() => {
    const q = locQuery.trim();
    if (q.length < 2) return undefined;
    const timer = setTimeout(() => {
      searchKeywordLocations(q).then((d) => setLocOptions(d.locations || [])).catch(() => setLocOptions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [locQuery]);

  const edit = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const editItem = (idx, patch) => edit({ items: draft.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  const save = async () => {
    setBusy('save');
    try {
      applyView(await saveKeywords(draft));
      toast.success('Saved.');
      return true;
    } catch (err) {
      toast.error(errorText(err, 'Could not save.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    if (draft.items.length && !window.confirm('Replace the current list with new suggestions? (You can edit them before checking.)')) return;
    setBusy('suggest');
    try {
      const out = await suggestKeywords({ location: draft.location });
      if (!out.items?.length) {
        toast.error('No suggestions could be made from this crawl. Add searches manually.');
        return;
      }
      setDraft((d) => ({ ...d, items: out.items, business_name: d.business_name || out.business_name || '' }));
      setDirty(true);
      toast[out.ai ? 'success' : 'info'](out.ai
        ? `${out.items.length} suggestions from ${out.powered_by}. Review them, then save.`
        : 'No AI provider answered: suggestions are page headings. Review them, then save.');
    } catch (err) {
      toast.error(errorText(err, 'Could not get suggestions.'));
    } finally {
      setBusy(null);
    }
  };

  const runCheck = async () => {
    const est = view?.estimate;
    const opts = {
      search_console: checkOpts.search_console && view.gsc_connected,
      ai_answers: checkOpts.ai_answers && view.gemini_connected,
      serp: checkOpts.serp && view.serp_connected,
    };
    if (!opts.search_console && !opts.ai_answers && !opts.serp) {
      toast.error('Pick at least one source that is connected.');
      return;
    }
    if (opts.serp && !window.confirm(`Also check live Google results? This uses about ${est?.min}–${est?.max} SerpAPI searches from your plan.`)) return;
    if (dirty && !(await save())) return;
    setBusy('check');
    try {
      setView(await checkKeywords(opts));
    } catch (err) {
      toast.error(errorText(err, 'Could not start the check.'));
    } finally {
      setBusy(null);
    }
  };

  const findIdeas = async () => {
    const auto = useAutocomplete && view?.serp_connected;
    if (auto && !window.confirm(`Find keyword ideas? Google Autocomplete uses up to ${view.autocomplete_seeds_max} SerpAPI searches.`)) return;
    setBusy('ideas');
    try {
      const v = await getKeywordIdeas({ autocomplete: !!auto });
      setView(v);
      const n = v.ideas?.items?.length || 0;
      toast[n ? 'success' : 'info'](n ? `${n} keyword ideas found.` : 'No new ideas found. Connect Search Console or run a check first.');
    } catch (err) {
      toast.error(errorText(err, 'Could not find keyword ideas.'));
    } finally {
      setBusy(null);
    }
  };

  const trackIdea = (idea) => {
    if (draft.items.length >= (view?.max_items || 30)) {
      toast.error('The list is full. Remove a search first.');
      return;
    }
    const local = idea.intent === 'local';
    edit({ items: [...draft.items, {
      text: idea.text, kind: idea.kind, local, branded: !!idea.branded,
      intent: idea.branded ? 'brand' : local ? 'local' : idea.intent === 'compare' ? 'comparison' : idea.intent === 'learn' ? 'problem' : 'service',
    }] });
  };

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    edit({ items: [...draft.items, { text, kind: text.endsWith('?') ? 'question' : 'keyword', intent: 'service', local: false, branded: false }] });
    setNewText('');
  };

  const check = view?.last_check;
  const scores = check?.scores;
  const resultsById = useMemo(() => Object.fromEntries((check?.results || []).map((r) => [r.id, r])), [check]);
  const results = check?.results || [];
  const missed = results.filter((r) => r.status === 'ok' && !r.branded && r.position_source && (r.position == null || r.position > 10));

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] p-6 text-sm text-slate-700 dark:text-slate-300">{loadError}</div>
      </div>
    );
  }
  if (!view) {
    return <div className="flex items-center justify-center p-10 text-slate-500"><Loader2 className="animate-spin" size={20} aria-label="Loading" /></div>;
  }

  const atMax = draft.items.length >= (view.max_items || 30);
  const tracked = new Set(draft.items.map((i) => i.text.trim().toLowerCase()));
  const ideas = view.ideas;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Keywords & AI answers</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Where <span className="font-semibold">{view.domain}</span> shows up on Google, in AI Overviews, People Also Ask and the map pack.
          </p>
        </div>
        {check?.checked_at && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last checked {timeAgo(check.checked_at)}{check.location ? ` · ${check.location}` : ''} · {check.searches_used} searches used
          </p>
        )}
      </header>

      {(!view.gsc_connected || !view.gemini_connected) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            {!view.gsc_connected && 'Connect Search Console for free Google positions. '}
            {!view.gemini_connected && 'Connect Gemini to check whether AI answers cite you. '}
            You can build the list now.
          </span>
          <button type="button" onClick={() => onNavigateToTab?.('integrations')} className="rounded-full border border-amber-300 px-3 py-1 text-xs font-bold hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40">Open Integrations</button>
        </div>
      )}

      {scores && (
        <section aria-label="Scores" className="space-y-2">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <ScoreTile label="Overall" icon={Sparkles} value={scores.combined} detail={`From ${scores.scored_items} non-branded searches`} />
            <ScoreTile label="Google" icon={ListOrdered} value={scores.google}
              detail={scores.positioned_items ? `Top 3: ${scores.top3} · top 10: ${scores.top10} of ${scores.positioned_items}` : 'Connect Search Console'} />
            <ScoreTile label="AI answers" icon={Bot} value={scores.ai}
              detail={[
                scores.ai_questions ? `Gemini cites you in ${scores.ai_cited_questions} of ${scores.ai_questions} questions` : null,
                scores.aio_shown ? `AI Overview: ${scores.aio_cited} of ${scores.aio_shown}` : null,
              ].filter(Boolean).join(' · ') || 'No questions asked'} />
            <ScoreTile label="People Also Ask" icon={HelpCircle} value={scores.paa} detail="Your pages used as answers" />
            <ScoreTile label="Local" icon={MapPin} value={scores.local} detail={scores.local_items ? `Map pack top 3: ${scores.local_top3} of ${scores.local_items}` : 'No local searches'} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Directional: positions are Search Console 28-day averages{check.sources?.serp ? ' or live Google results' : ''}; AI answers are Gemini with Google Search, 3 runs per question. Searches with your brand name ({scores.branded_items}) are shown but not scored.
            {check.stopped_reason ? ` Stopped early: ${check.stopped_reason}` : ''}
          </p>
        </section>
      )}

      {/* The list */}
      <section aria-labelledby="kw-list-heading" className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="kw-list-heading" className="text-base font-black text-slate-900 dark:text-white">Searches to check ({draft.items.length})</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={suggest} disabled={!!busy || running}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
              {busy === 'suggest' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {view.ai_provider ? `Suggest with ${view.ai_provider.label}` : 'Suggest from page headings'}
            </button>
            <button type="button" onClick={save} disabled={!dirty || !!busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
            <button type="button" onClick={runCheck} disabled={!(view.gsc_connected || view.gemini_connected || view.serp_connected) || !draft.items.length || !!busy || running}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy === 'check' || running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {running ? 'Checking…' : 'Check rankings'}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Location for searches
            <input
              list="kw-locations"
              value={draft.location}
              onChange={(e) => { edit({ location: e.target.value }); setLocQuery(e.target.value); }}
              placeholder="e.g. Pune, Maharashtra, India (leave empty for all of India)"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <datalist id="kw-locations">
              {locOptions.map((l) => <option key={l.name} value={l.name}>{l.type}</option>)}
            </datalist>
          </label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Business name (finds you in the map pack)
            <input
              value={draft.business_name}
              onChange={(e) => edit({ business_name: e.target.value })}
              placeholder="As shown on Google Maps"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
        </div>

        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
          <legend className="sr-only">What to check</legend>
          {[
            { id: 'search_console', label: 'Google positions (Search Console, free)', ok: view.gsc_connected },
            { id: 'ai_answers', label: `AI answers (Gemini + Google Search, ${view.estimate?.ai_calls || 0} calls)`, ok: view.gemini_connected },
            { id: 'serp', label: `Live Google results: People Also Ask, map pack, AI Overview (SerpAPI, ~${view.estimate?.min}–${view.estimate?.max} searches)`, ok: view.serp_connected },
          ].map((o) => (
            <label key={o.id} className={`flex items-center gap-1 ${o.ok ? '' : 'opacity-50'}`} title={o.ok ? undefined : 'Not connected'}>
              <input type="checkbox" disabled={!o.ok} checked={o.ok && checkOpts[o.id]}
                onChange={(e) => setCheckOpts((c) => ({ ...c, [o.id]: e.target.checked }))} />
              {o.label}{o.ok ? '' : ' (not connected)'}
            </label>
          ))}
        </fieldset>

        {running && (
          <p className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
            <Loader2 size={13} className="animate-spin" /> Checking {view.items.length} searches. This takes a minute or two; you can leave this page.
          </p>
        )}

        {draft.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600 dark:border-white/10 dark:text-slate-400">
            No searches yet. Use <span className="font-semibold">Suggest</span> to build a list from your site, or add your own below.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  <th className="py-2 pr-2 font-bold">Search</th>
                  <th className="py-2 pr-2 font-bold">Type</th>
                  <th className="py-2 pr-2 font-bold">Google position</th>
                  <th className="py-2 pr-2 font-bold">AI answers</th>
                  <th className="py-2 pr-2 font-bold">Map pack</th>
                  <th className="py-2 pr-2 font-bold">Top competitors</th>
                  <th className="py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map((it, idx) => {
                  const r = it.id ? resultsById[it.id] : null;
                  return (
                    <tr key={it.id || `new-${idx}`} className="border-b border-slate-100 align-top dark:border-white/[0.06]">
                      <td className="py-2 pr-2">
                        <input
                          value={it.text}
                          onChange={(e) => editItem(idx, { text: e.target.value })}
                          aria-label="Search text"
                          className="w-full min-w-[220px] rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-900 hover:border-slate-200 focus:border-indigo-300 dark:text-white dark:hover:border-slate-700"
                        />
                        <div className="flex flex-wrap gap-1 px-1.5">
                          <button type="button" onClick={() => editItem(idx, { kind: it.kind === 'question' ? 'keyword' : 'question' })}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {it.kind === 'question' ? 'Question' : 'Keyword'}
                          </button>
                          {it.branded && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Brand (not scored)</span>}
                          {r?.paa?.length > 0 && (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" title={r.paa.join('\n')}>
                              {r.paa.length} People Also Ask{r.paa_cited ? ' · you answer one' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <select value={it.intent} onChange={(e) => editItem(idx, { intent: e.target.value, local: e.target.value === 'local' ? true : it.local, branded: e.target.value === 'brand' })}
                          aria-label="Search type"
                          className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          {INTENTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                          <input type="checkbox" checked={!!it.local} onChange={(e) => editItem(idx, { local: e.target.checked })} /> Local
                        </label>
                      </td>
                      <td className="py-2 pr-2">
                        {r ? <RankCell r={r} /> : <span className="text-xs text-slate-400">Not checked</span>}
                        {r?.competition && (
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${COMPETITION[r.competition.level]?.cls}`}
                            title={r.competition.big_sites?.length ? `Big sites in the top 5: ${r.competition.big_sites.join(', ')}` : 'No marketplaces or big publishers in the top 5'}>
                            {COMPETITION[r.competition.level]?.label}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2">{r && <AiCell r={r} />}</td>
                      <td className="py-2 pr-2">{r && <LocalCell r={r} />}</td>
                      <td className="py-2 pr-2 text-xs text-slate-600 dark:text-slate-400">{r?.competitors?.slice(0, 3).join(', ')}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => edit({ items: draft.items.filter((_, i) => i !== idx) })}
                          aria-label={`Remove ${it.text}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="flex gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            disabled={atMax}
            placeholder={atMax ? `Maximum ${view.max_items} searches` : 'Add a keyword or a question…'}
            maxLength={120}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button type="submit" disabled={!newText.trim() || atMax}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <Plus size={14} /> Add
          </button>
        </form>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Google positions come free from Search Console. AI answers ask Gemini (with Google Search) each question 3 times.
          Live Google results via SerpAPI are optional. Nothing is checked until you click <span className="font-semibold">Check rankings</span>.
          {dirty ? ' You have unsaved changes.' : ''}
        </p>
      </section>

      {/* Keyword ideas: only searches Google itself shows, with the proof for each */}
      <section aria-labelledby="kw-ideas-heading" className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="kw-ideas-heading" className="text-base font-black text-slate-900 dark:text-white">Keyword ideas</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              From your Search Console queries, Google Autocomplete, and the related searches and People Also Ask in your last check.
              {view.ai_provider ? ` ${view.ai_provider.label} picks the page for each and drops ideas your site doesn't offer; it never adds ideas.` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view.serp_connected && (
              <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={useAutocomplete} onChange={(e) => setUseAutocomplete(e.target.checked)} />
                Google Autocomplete (up to {view.autocomplete_seeds_max} searches)
              </label>
            )}
            <button type="button" onClick={findIdeas} disabled={!!busy || running}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy === 'ideas' ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              {ideas ? 'Refresh ideas' : 'Find keyword ideas'}
            </button>
          </div>
        </div>

        {ideas && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Found {timeAgo(ideas.generated_at)} · {ideas.sources?.search_console || 0} Search Console queries · {ideas.sources?.autocomplete || 0} autocomplete suggestions
              {ideas.searches_used ? ` · ${ideas.searches_used} searches used` : ''}
              {ideas.reviewed_by ? ` · reviewed by ${ideas.reviewed_by}` : ' · pages matched by shared words (no AI review)'}
              {ideas.notes?.length ? ` · ${ideas.notes.join(' ')}` : ''}
            </p>
            {ideas.items?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                      <th className="py-2 pr-2 font-bold">Idea</th>
                      <th className="py-2 pr-2 font-bold">Proof</th>
                      <th className="py-2 pr-2 font-bold">Page to rank</th>
                      <th className="py-2 pr-2 font-bold">What to do</th>
                      <th className="py-2"><span className="sr-only">Track</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ideas.items.map((idea) => {
                      const t = IDEA_TYPES[idea.type] || IDEA_TYPES.new;
                      const isTracked = tracked.has(idea.text.trim().toLowerCase());
                      return (
                        <tr key={idea.text} className="border-b border-slate-100 align-top dark:border-white/[0.06]">
                          <td className="py-2 pr-2">
                            <div className="font-semibold text-slate-900 dark:text-white">{idea.text}</div>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.cls}`}>{t.label}</span>
                              {idea.intent && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">{idea.intent}</span>}
                              {idea.branded && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Brand</span>}
                            </div>
                          </td>
                          <td className="py-2 pr-2"><IdeaProof idea={idea} /></td>
                          <td className="py-2 pr-2 text-xs">
                            {idea.target_url
                              ? <a href={idea.target_url} target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:underline dark:text-indigo-300 break-all">{idea.target_url.replace(/^https?:\/\/(www\.)?/, '')}</a>
                              : <span className="text-slate-500 dark:text-slate-400">No page yet</span>}
                          </td>
                          <td className="py-2 pr-2 text-xs text-slate-700 dark:text-slate-300">{idea.action}</td>
                          <td className="py-2">
                            <button type="button" onClick={() => trackIdea(idea)} disabled={isTracked}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                              {isTracked ? 'Tracked' : <><Plus size={12} /> Track</>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">No new ideas. Connect Search Console, turn on Autocomplete, or run a check first.</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search volume isn&apos;t shown: Google doesn&apos;t publish it. Search Console impressions and Autocomplete are the proof that people search for these. Tracked ideas are added to the list above; save, then check them.
            </p>
          </>
        )}
      </section>

      {(missed.length > 0 || scores?.competitors?.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {missed.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] p-4">
              <h2 className="flex items-center gap-1.5 text-base font-black text-slate-900 dark:text-white"><AlertTriangle size={15} className="text-amber-600" aria-hidden="true" /> Not on page 1 ({missed.length})</h2>
              <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">Searches where others win. A page that answers each one directly is the usual fix.</p>
              <ul className="space-y-1.5">
                {missed.slice(0, 10).map((r) => (
                  <li key={r.id} className="text-sm text-slate-800 dark:text-slate-200">
                    <span className="font-semibold">{r.text}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400"> · {r.position != null ? `#${Math.round(r.position)}` : r.position_source === 'google_live' ? 'not in top 30' : 'not shown in 28 days'}{r.competitors?.[0] ? ` · #1 is ${r.competitors[0]}` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {scores?.competitors?.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D111A] p-4">
              <h2 className="flex items-center gap-1.5 text-base font-black text-slate-900 dark:text-white"><Search size={15} aria-hidden="true" /> Who shows up most</h2>
              <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">Sites in the top 5 results or cited in AI Overviews for these searches.</p>
              <ul className="space-y-1.5">
                {scores.competitors.map((c) => (
                  <li key={c.host} className="flex justify-between gap-2 text-sm text-slate-800 dark:text-slate-200">
                    <span className="truncate">{c.host}</span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{c.organic} in top 5 · {c.ai} AI citations</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
