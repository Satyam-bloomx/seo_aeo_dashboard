'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Check, Download, Loader2, Puzzle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { downloadHelperZip } from './useHelper';
import { siteOf } from './helperClient';
import CaptureActions from './CaptureActions';

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-[#CAE366] dark:text-slate-900">{n}</span>
      <span className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{children}</span>
    </li>
  );
}

/** Install / update guide, per-site access and the last captured tab. */
export default function HelperPanel({ isOpen, onClose, helper, siteUrl, captureActions }) {
  const capture = helper.capture;
  const [downloading, setDownloading] = useState(false);
  const [ownerOk, setOwnerOk] = useState(false);
  const [asking, setAsking] = useState(false);
  const connected = helper.status === 'connected';
  const site = siteOf(siteUrl);
  const host = site ? new URL(site).host : '';
  const available = helper.latest?.available !== false;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadHelperZip(helper.latest);
    } catch (e) {
      toast.error('Could not download the helper', { description: e.message });
    } finally {
      setDownloading(false);
    }
  };

  const allowSite = async () => {
    const port = helper.getPort();
    if (!port || !site) return;
    setAsking(true);
    try {
      const res = await port.request({ type: 'request_permission', site, owner_confirmed: true, verification: false }, 0);
      if (res.granted) toast.success(`The helper may now fetch pages of ${host}.`);
      else toast.info('Access was not granted. You can try again at any time.');
    } catch (e) {
      toast.error('The helper could not ask for access', { description: e.message });
    } finally {
      setAsking(false);
    }
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#CAE366]/30 text-slate-900 dark:text-[#CAE366]"><Puzzle size={20} /></span>
          <div>
            <h2 className="text-base font-bold">AuditPro Helper</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {connected
                ? `Connected (version ${helper.version}).`
                : helper.status === 'disconnected' ? 'Installed, but not connected right now.' : 'Not installed in this browser.'}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
      </div>

      <div className="space-y-5 overflow-y-auto p-5 max-h-[70vh]">
        <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
          Some websites block automated crawlers. The helper is a small browser extension that fetches those pages
          from <strong>your</strong> browser instead, only for sites you allow, and sends them to AuditPro to be
          checked exactly like the others. It never uses your logins or cookies, never solves bot checks for you,
          and respects robots.txt.
        </p>

        {helper.status === 'disconnected' && (
          <button type="button" onClick={helper.reconnect} className="btn-secondary h-9 px-3 text-xs font-bold gap-1.5 inline-flex items-center">
            <RefreshCw size={14} /> Reconnect
          </button>
        )}

        {connected && helper.outdated && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-bold mb-2">A newer helper is available ({helper.latest?.version}).</p>
            <ol className="space-y-2">
              <Step n={1}>Download the new version below.</Step>
              <Step n={2}>Unzip it <strong>over the same folder</strong> you installed it from (replace all files).</Step>
              <Step n={3}>Open <code>chrome://extensions</code> and click the reload icon on AuditPro Helper. Your allowed sites are kept.</Step>
            </ol>
          </div>
        )}

        {(!connected || helper.outdated) && (
          <div className="space-y-4">
            {!connected && (
              <ol className="space-y-3">
                <Step n={1}>Download the helper and unzip it into a folder you will keep, for example <code>Documents\AuditPro Helper</code>.</Step>
                <Step n={2}>Open <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>), turn on <strong>Developer mode</strong>, click <strong>Load unpacked</strong> and choose that folder.</Step>
                <Step n={3}>Come back to this tab. AuditPro connects to the helper by itself.</Step>
              </ol>
            )}
            <button
              type="button"
              onClick={download}
              disabled={downloading || !available}
              className="btn-primary h-10 rounded-full px-5 text-xs font-bold inline-flex items-center gap-2 disabled:opacity-60"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {available ? `Download helper${helper.latest?.version ? ` ${helper.latest.version}` : ''}` : 'Download not available yet'}
            </button>
          </div>
        )}

        {connected && site && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <p className="text-[13px] font-bold flex items-center gap-2"><ShieldCheck size={15} /> Let the helper fetch pages of {host}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">The helper asks you once per site, in a small window. You can remove sites any time in the helper&apos;s settings.</p>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-0.5" checked={ownerOk} onChange={(e) => setOwnerOk(e.target.checked)} />
              <span>I own this site or have permission to audit it.</span>
            </label>
            <button
              type="button"
              onClick={allowSite}
              disabled={!ownerOk || asking}
              className="btn-secondary h-9 px-3 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {asking ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Allow {host}
            </button>
          </div>
        )}

        {capture && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <CaptureActions capture={capture} actions={captureActions} />
          </div>
        )}

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Tip: pin the helper (puzzle icon in the browser toolbar) and use <strong>Audit this tab</strong> to send the
          page you have open, exactly as your browser shows it.
        </p>
      </div>
    </AnimatedModal>
  );
}
