'use client';
import React, { useRef } from 'react';
import { toast } from 'sonner';
import { Upload, Trash2 } from 'lucide-react';
import { resizeLogoFile } from '@/utils/reportSettings';

const FIELD = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export default function ReportSettingsPanel({ settings, onChange }) {
  const fileRef = useRef(null);

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { dataUrl } = await resizeLogoFile(file);
      onChange({ agencyLogo: dataUrl });
    } catch (err) {
      toast.error('Logo not added', { description: err.message });
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 no-print">
      <Field label="Agency name">
        <input className={FIELD} value={settings.agencyName} onChange={(e) => onChange({ agencyName: e.target.value })} placeholder="Your agency" />
      </Field>
      <Field label="Client name">
        <input className={FIELD} value={settings.clientName} onChange={(e) => onChange({ clientName: e.target.value })} placeholder="Client or company" />
      </Field>
      <Field label="Prepared by">
        <input className={FIELD} value={settings.preparedBy} onChange={(e) => onChange({ preparedBy: e.target.value })} placeholder="Your name" />
      </Field>
      <Field label="Accent colour">
        <div className="flex items-center gap-2">
          <input type="color" value={settings.accent} onChange={(e) => onChange({ accent: e.target.value })} className="h-8 w-10 rounded border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer" aria-label="Accent colour" />
          <span className="text-xs font-mono text-slate-500">{settings.accent}</span>
        </div>
      </Field>
      <div className="space-y-1 sm:col-span-1 lg:col-span-2">
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Agency logo (resized and kept in this browser)</span>
        <div className="flex items-center gap-2">
          {settings.agencyLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.agencyLogo} alt="Logo preview" className="h-8 max-w-[120px] object-contain rounded border border-slate-200 bg-white p-0.5" />
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary h-8 px-3 text-xs font-bold gap-1.5">
            <Upload size={13} /> {settings.agencyLogo ? 'Replace' : 'Upload logo'}
          </button>
          {settings.agencyLogo && (
            <button type="button" onClick={() => onChange({ agencyLogo: '' })} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg" aria-label="Remove logo">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
