'use client';

import React, { useState } from 'react';
import { AlertTriangle, CircleCheck, ExternalLink, Loader2, Puzzle, ShieldCheck, X } from 'lucide-react';
import CaptureActions from './CaptureActions';

function hostOf(site) {
  try {
    return new URL(site).host;
  } catch {
    return site || 'this site';
  }
}

function Card({ children, onClose }) {
  return (
    <div className="pointer-events-auto relative w-full rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#0D0F15]/95">
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
          <X size={14} />
        </button>
      )}
      {children}
    </div>
  );
}

function OwnerCheck({ checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-[12px] text-slate-700 dark:text-slate-200">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>I own or may audit this site.</span>
    </label>
  );
}

/** Small cards in the corner: what the helper needs from the user, its progress, and a captured tab. */
export default function HelperFloating({ relayApi, summary, captureActions, capture, hideCapture }) {
  const { relay, allowSite, skipSite, continueAfterCheck, declineCheck, dismiss } = relayApi;
  const [ownerOk, setOwnerOk] = useState(false);
  const [checkOk, setCheckOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const host = hostOf(relay.site);
  const rescued = summary?.rescued ?? 0;

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  let relayCard = null;
  if (relay.phase === 'needs_permission') {
    relayCard = (
      <Card onClose={skipSite}>
        <p className="pr-5 text-[13px] font-bold flex items-center gap-2"><ShieldCheck size={15} /> Your browser can try {relay.total} more page{relay.total === 1 ? '' : 's'}</p>
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
          {host} blocked our server for {relay.total === 1 ? 'one page' : 'some pages'}. The helper can fetch {relay.total === 1 ? 'it' : 'them'} from your browser. It asks you once for this site.
        </p>
        <div className="mt-3 space-y-2.5">
          <OwnerCheck checked={ownerOk} onChange={setOwnerOk} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!ownerOk || busy} onClick={() => run(allowSite)} className="btn-primary h-8 rounded-full px-3 text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Let the helper fetch them
            </button>
            <button type="button" onClick={skipSite} className="h-8 px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">Not now</button>
          </div>
        </div>
      </Card>
    );
  } else if (relay.phase === 'needs_verification') {
    const v = relay.verification || {};
    relayCard = (
      <Card>
        <p className="text-[13px] font-bold flex items-center gap-2"><AlertTriangle size={15} className="text-amber-500" /> This site asks for a human check</p>
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
          Open it, complete the check, then click Continue. The helper pauses until then.
        </p>
        {v.url && (
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 dark:text-[#CAE366] break-all">
            Open {hostOf(v.url)} <ExternalLink size={12} />
          </a>
        )}
        <div className="mt-3 space-y-2.5">
          <OwnerCheck checked={checkOk} onChange={setCheckOk} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!checkOk || busy} onClick={() => run(continueAfterCheck)} className="btn-primary h-8 rounded-full px-3 text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Continue
            </button>
            <button type="button" disabled={busy} onClick={() => run(declineCheck)} className="h-8 px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">Skip the check</button>
          </div>
          {relay.error && <p className="text-[11px] text-rose-600">{relay.error}</p>}
        </div>
      </Card>
    );
  } else if (relay.phase === 'starting' || relay.phase === 'running') {
    const done = relay.done ?? relay.sent ?? 0;
    const total = relay.total || 0;
    relayCard = (
      <Card>
        <p className="text-[13px] font-bold flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Your browser is fetching blocked pages</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {relay.phase === 'starting' ? 'Starting the helper...' : `${done} of ${total} tried${relay.paused ? ' (paused, the site is busy)' : ''}. Keep this tab open.`}
        </p>
        {total > 0 && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-[#CAE366] transition-all" style={{ width: `${Math.min(100, Math.round((done / total) * 100))}%` }} />
          </div>
        )}
      </Card>
    );
  } else if (relay.phase === 'done' || relay.phase === 'failed' || relay.phase === 'declined') {
    relayCard = (
      <Card onClose={dismiss}>
        <p className="pr-5 text-[13px] font-bold flex items-center gap-2">
          {relay.phase === 'done' ? <CircleCheck size={15} className="text-emerald-500" /> : <Puzzle size={15} />}
          {relay.phase === 'done' ? `The helper rescued ${rescued} page${rescued === 1 ? '' : 's'}` : 'The helper did not fetch these pages'}
        </p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {relay.phase === 'failed' && relay.error ? `${relay.error} ` : ''}
          Pages it could not get keep the result from our server and are listed as not counted in the score.
        </p>
      </Card>
    );
  }

  const showCapture = capture && !hideCapture;
  if (!relayCard && !showCapture) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-40 flex w-[min(360px,calc(100vw-24px))] flex-col gap-2 md:bottom-4 md:right-4">
      {relayCard}
      {showCapture && (
        <Card onClose={captureActions.dismiss}>
          <CaptureActions capture={capture} actions={captureActions} compact />
        </Card>
      )}
    </div>
  );
}
