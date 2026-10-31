'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { ListChecks, Copy, Check, ArrowRight } from 'lucide-react';

// Plain-language titles for the checks owners hit most; anything else falls back to the check name.
const PLAIN_TITLES = {
  'Response_Codes: Client Error (4xx)': 'Some pages are broken (404 or other errors)',
  'Response_Codes: Server Error (5xx)': 'Some pages fail with a server error',
  'Response_Codes: Blocked or Failed (No Response)': 'Some pages could not be loaded at all',
  'Response_Codes: Redirect Chain (2+ Hops)': 'Some links bounce through several redirects',
  'Response_Codes: Redirection (Meta Refresh)': 'Some pages redirect in a way Google trusts less',
  'Page_Titles: Missing': 'Some pages have no title in Google results',
  'Page_Titles: Duplicate': 'Several pages share the same Google title',
  'Page_Titles: Over 60 Characters': 'Some titles are too long and get cut off in Google',
  'Meta_Description: Missing': 'Some pages have no description for Google results',
  'Meta_Description: Duplicate': 'Several pages share the same Google description',
  'H1: Missing': 'Some pages have no main heading',
  'Images: Missing Alt Attribute': 'Some images have no description for screen readers and Google',
  'Images: Missing Alt Text': 'Some images have empty descriptions (fine only if decorative)',
  'Security: HTTP URLs': 'Some pages are not on secure HTTPS',
  'Security: Mixed Content': 'Secure pages load some files over insecure HTTP',
  'Canonicals: Missing': 'Pages do not say which URL is the main version',
  'Content: Low Content Pages': 'Some pages have very little text',
  'Content: Exact Duplicates': 'Some pages are exact copies of each other',
  'Structured Data: Missing Structured Data': 'Pages lack structured data that earns rich results',
  'Structured Data: Product Pages Missing Product Schema': 'Product pages are missing price and stock info for Google',
  'Pagination: Paginated Page Canonicalised To First Page': 'Listing pages 2, 3... tell Google to ignore them',
  'Pagination: Duplicate Title From Pagination': 'Listing pages 2, 3... repeat the page-1 title',
  'Page Titles: Missing': 'Some pages have no title in Google results',
  'Page Titles: Duplicate': 'Several pages share the same Google title',
  'Page Titles: Over 60 Characters': 'Some titles are too long and get cut off in Google',
  'Meta Description: Missing': 'Some pages have no description for Google results',
  'Meta Description: Duplicate': 'Several pages share the same Google description',
  'Response Codes: Client Error (4xx)': 'Some pages are broken (404 or other errors)',
  'Response Codes: Server Error (5xx)': 'Some pages fail with a server error',
  'Links: Internal Links To Broken Pages': 'Pages link to broken pages on your own site',
};

const PRIORITY_ORDER = { High: 3, Medium: 2, Low: 1 };
// Site-wide hardening headers matter, but rarely before content and crawl problems for a site owner.
const DEPRIORITISED_CATEGORIES = new Set(['Security']);

function plainTitle(issue) {
  return PLAIN_TITLES[issue.name] || issue.name.replace(/^[A-Za-z_]+:\s*/, '').replace(/_/g, ' ');
}

function firstSentence(text) {
  // A sentence ends at . ! ? followed by a capital or the end, so "e.g." and "(e.g. ?sort=)" do not cut it short.
  const m = String(text || '').match(/^.*?[.!?](?=\s+[A-Z]|\s*$)/);
  return (m ? m[0] : String(text || '')).trim();
}

export function pickTopFixes(issues, speed, limit = 3) {
  const fixes = [];
  // A failing mobile speed test is usually the biggest single problem, and it lives on another tab.
  if (speed?.score != null && speed.score < 50) {
    fixes.push({
      key: 'speed',
      title: `The site is slow on ${speed.strategy === 'Desktop' ? 'desktop' : 'phones'} (speed score ${speed.score}/100)`,
      why: `Slow pages lose visitors and rank lower.${speed.metrics?.lcp && speed.metrics.lcp !== 'N/A' ? ` The main content took ${speed.metrics.lcp} to appear in Google's test.` : ''}`,
      fix: speed.opportunities?.[0]?.title
        ? `Start with: ${speed.opportunities[0].title}. Compress images and remove unused scripts and styles.`
        : 'Compress images, remove unused scripts and styles, and use caching.',
      urls: speed.measuredUrl ? [speed.measuredUrl] : [],
      tab: 'performance',
    });
  }
  const ranked = [...(issues || [])]
    // Readability is a writing-style hint with no single fix to hand a developer.
    .filter(i => i.count > 0 && !/readability/i.test(i.name))
    .sort((a, b) =>
      (PRIORITY_ORDER[b.priority] || 1) - (PRIORITY_ORDER[a.priority] || 1)
      || Number(DEPRIORITISED_CATEGORIES.has(a.category)) - Number(DEPRIORITISED_CATEGORIES.has(b.category))
      || b.count - a.count);
  for (const issue of ranked) {
    if (fixes.length >= limit) break;
    fixes.push({
      key: issue.name,
      title: plainTitle(issue),
      why: firstSentence(issue.impact),
      fix: firstSentence(issue.fixGuide),
      count: issue.count,
      urls: (issue.affected_pages || []).slice(0, 3).map(p => p.url),
      issue,
    });
  }
  return fixes;
}

function developerBrief(fixes, siteLabel) {
  const lines = [`Website fixes for ${siteLabel || 'our site'} (from an AuditPro audit):`, ''];
  fixes.forEach((f, i) => {
    lines.push(`${i + 1}. ${f.title}`);
    if (f.why) lines.push(`   Why: ${f.why}`);
    if (f.fix) lines.push(`   What to do: ${f.fix}`);
    if (f.urls?.length) lines.push(`   Example pages: ${f.urls.join(', ')}${f.count > f.urls.length ? ` (+${f.count - f.urls.length} more)` : ''}`);
    lines.push('');
  });
  return lines.join('\n').trim();
}

export default function TopFixesCard({ issues, speed, siteLabel, onOpenIssue, onOpenSpeed }) {
  const [copied, setCopied] = useState(false);
  const fixes = pickTopFixes(issues, speed);
  if (fixes.length === 0) return null;

  const copyBrief = async () => {
    const text = developerBrief(fixes, siteLabel);
    // On phones, the system share sheet (WhatsApp, email...) is easier than the clipboard.
    if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: 'Website fixes', text });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied: paste it into an email or WhatsApp for your developer.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
    }
  };

  return (
    <section aria-labelledby="top-fixes-heading" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#CAE366]/20 border border-[#CAE366]/40 flex items-center justify-center text-slate-900 dark:text-[#CAE366]">
            <ListChecks size={16} />
          </div>
          <div>
            <h2 id="top-fixes-heading" className="text-base font-black text-slate-900 dark:text-white">Fix these first</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">The {fixes.length === 1 ? 'most important problem' : `${fixes.length} most important problems`}, in plain words</p>
          </div>
        </div>
        <button
          type="button"
          onClick={copyBrief}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          Copy for my developer
        </button>
      </div>
      <ol className="space-y-2.5">
        {fixes.map((f, i) => (
          <li key={f.key} className="flex gap-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 p-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 dark:bg-[#CAE366] text-white dark:text-slate-900 text-xs font-black flex items-center justify-center">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {f.title}{f.count ? <span className="font-medium text-slate-500 dark:text-slate-400"> · {f.count} page{f.count === 1 ? '' : 's'}</span> : null}
              </p>
              {f.why && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{f.why}</p>}
              {f.fix && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5"><span className="font-semibold">What to do:</span> {f.fix}</p>}
            </div>
            <button
              type="button"
              onClick={() => (f.tab === 'performance' ? onOpenSpeed?.() : onOpenIssue?.(f.issue))}
              className="self-center shrink-0 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              aria-label={`Details: ${f.title}`}
            >
              Details <ArrowRight size={12} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
