'use client';

import React from 'react';
import { Puzzle, RefreshCw } from 'lucide-react';

/** Header chip: is the AuditPro Helper connected? Opens the helper panel. */
export default function HelperChip({ helper, onOpen }) {
  const { status, outdated } = helper;
  if (status === 'checking') return null;

  let label = 'Install helper';
  let dot = 'bg-slate-400';
  let title = 'The AuditPro Helper lets your browser fetch pages that block our server.';
  if (status === 'connected' && outdated) {
    label = 'Update helper';
    dot = 'bg-amber-500';
    title = `A newer helper is available (you have ${helper.version}, latest is ${helper.latest?.version}).`;
  } else if (status === 'connected') {
    label = 'Helper connected';
    dot = 'bg-emerald-500';
    title = `AuditPro Helper ${helper.version} is connected.`;
  } else if (status === 'disconnected') {
    label = 'Helper offline';
    dot = 'bg-amber-500';
    title = 'The helper stopped (browser restart or extension reload). Click to reconnect.';
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      aria-label={label}
      className="btn-secondary h-9 px-2 sm:px-3 text-xs font-bold gap-1.5 text-slate-700 dark:text-slate-200 shadow-xs cursor-pointer shrink-0 inline-flex items-center"
    >
      <span className="relative inline-flex">
        {status === 'connected' && outdated ? <RefreshCw size={14} /> : <Puzzle size={14} />}
        <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-[#07080B] ${dot}`} />
      </span>
      <span className="hidden @4xl:inline whitespace-nowrap">{label}</span>
    </button>
  );
}
