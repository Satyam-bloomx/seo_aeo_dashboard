'use client';

import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { API_BASE_URL, authFetch } from '@/api/client';
import { sameSite } from './helperClient';

function shortUrl(u) {
  try {
    const x = new URL(u);
    return `${x.host}${x.pathname === '/' ? '' : x.pathname}`;
  } catch {
    return u;
  }
}

async function postJson(path, body) {
  const res = await authFetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new Error(data?.detail || `Server responded with ${res.status}`);
  return data;
}

/**
 * "Audit this tab": add the captured page to the crawl that is running for the same site, or audit it on its own.
 * `onAuditStarted(crawl)` lets the dashboard switch to the new single-page audit.
 */
export function useCaptureActions({ capture, clearCapture, crawlId, running, seedUrl, onAuditStarted }) {
  const [busy, setBusy] = useState(null); // 'add' | 'audit' | null
  const payload = useCallback((c) => ({
    url: c.url, final_url: c.final_url, title: c.title, html_gzip_b64: c.html_gzip_b64, captured_at: c.captured_at,
  }), []);

  const canAdd = !!(capture && crawlId && running && sameSite(capture.url, seedUrl));

  const add = useCallback(async () => {
    if (!capture || !crawlId) return;
    setBusy('add');
    try {
      await postJson(`/crawls/${crawlId}/helper/capture`, payload(capture));
      toast.success('Added to this audit', { description: `${shortUrl(capture.url)} will be checked before the audit finishes.` });
      clearCapture();
    } catch (e) {
      toast.error('Could not add the captured page', { description: e.message });
    } finally {
      setBusy(null);
    }
  }, [capture, crawlId, payload, clearCapture]);

  const audit = useCallback(async () => {
    if (!capture) return;
    setBusy('audit');
    try {
      const crawl = await postJson('/helper/capture-audit', payload(capture));
      toast.success('Auditing the captured page', { description: shortUrl(capture.url) });
      clearCapture();
      if (onAuditStarted) onAuditStarted(crawl);
    } catch (e) {
      toast.error('Could not audit the captured page', { description: e.message });
    } finally {
      setBusy(null);
    }
  }, [capture, payload, clearCapture, onAuditStarted]);

  return { canAdd, add, audit, dismiss: clearCapture, busy, running };
}

export default function CaptureActions({ capture, actions, compact = false }) {
  if (!capture || !actions) return null;
  const { canAdd, add, audit, dismiss, busy, running } = actions;
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] font-bold flex items-center gap-2"><Camera size={15} /> Page captured from your browser</p>
      <p className="text-xs text-slate-600 dark:text-slate-300 break-all">
        {capture.title ? <><strong>{capture.title}</strong><br /></> : null}
        {shortUrl(capture.url)}
      </p>
      {!compact && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          This is the page as your browser showed it (your session, scripts run). The report marks it as captured.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canAdd && (
          <button type="button" onClick={add} disabled={!!busy} className="btn-primary h-8 rounded-full px-3 text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy === 'add' && <Loader2 size={12} className="animate-spin" />} Add to this audit
          </button>
        )}
        <button
          type="button"
          onClick={audit}
          disabled={!!busy || running}
          title={running ? 'Wait for the current audit to finish first.' : undefined}
          className={`${canAdd ? 'btn-secondary' : 'btn-primary'} h-8 rounded-full px-3 text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60`}
        >
          {busy === 'audit' && <Loader2 size={12} className="animate-spin" />} Audit this page on its own
        </button>
        <button type="button" onClick={dismiss} disabled={!!busy} className="h-8 px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">
          Dismiss
        </button>
      </div>
    </div>
  );
}
