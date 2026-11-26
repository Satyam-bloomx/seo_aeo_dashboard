'use client';
import React from 'react';
import { reportDateLabel } from '@/utils/reportMetrics';

// The on-screen client report. Always light (it is a document, not UI), and it mirrors the PDF structure:
// cover, summary, score, 3 priorities, speed and AI-readiness, appendix.

const LEVEL = {
  High: { bg: '#fff1f2', fg: '#be123c', bd: '#fecdd3' },
  Medium: { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  Low: { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
};
const SPEED = {
  good: { fg: '#047857', label: 'Speed: good' },
  warn: { fg: '#b45309', label: 'Speed: fair' },
  poor: { fg: '#be123c', label: 'Speed: needs attention' },
  unknown: { fg: '#64748b', label: 'Speed: not measured' },
};

function Section({ title, accent, children }) {
  return (
    <section className="space-y-3 break-inside-avoid-page">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <div className="h-0.5 w-9 mt-1.5 rounded" style={{ background: accent }} />
      </div>
      {children}
    </section>
  );
}

function LevelPill({ level }) {
  const c = LEVEL[level] || LEVEL.Low;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0" style={{ background: c.bg, color: c.fg, borderColor: c.bd }}>
      {level}
    </span>
  );
}

export default function ReportDocument({
  report,
  settings,
  summary,
  summaryLoading,
  sections = ['health', 'technical', 'speed', 'visibility', 'issues', 'urls'],
  reportTitle = 'FULL WEBSITE AUDIT REPORT',
}) {
  const accent = settings.accent || '#4f46e5';
  const client = settings.clientName?.trim();
  const dateLabel = reportDateLabel();
  const speed = SPEED[report.speed.status] || SPEED.unknown;
  const has = (id) => sections.includes(id);

  return (
    <div id="client-report" className="bg-white text-slate-800 rounded-2xl border border-slate-200 overflow-hidden">
      {/* Cover */}
      <div className="p-6 sm:p-10 border-b border-slate-200" style={{ borderTop: `6px solid ${accent}` }}>
        <div className="flex items-center gap-3 min-h-10">
          {settings.agencyLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.agencyLogo} alt={settings.agencyName || 'Agency logo'} className="max-h-14 max-w-[180px] object-contain" />
          )}
          {settings.agencyName && <span className="text-sm font-bold text-slate-900">{settings.agencyName}</span>}
        </div>
        <p className="mt-10 text-xs font-bold tracking-widest uppercase" style={{ color: accent }}>{reportTitle}</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-black text-slate-900 tracking-tight break-words">{client || report.host}</h1>
        <p className="mt-1 text-sm text-slate-500">{report.host}</p>
        <dl className="mt-8 grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
          <dt className="font-semibold text-slate-500">Date</dt><dd>{dateLabel}</dd>
          <dt className="font-semibold text-slate-500">Prepared for</dt><dd>{client || report.host}</dd>
          {settings.preparedBy?.trim() && (<><dt className="font-semibold text-slate-500">Prepared by</dt><dd>{settings.preparedBy}</dd></>)}
          <dt className="font-semibold text-slate-500">Pages checked</dt><dd>{report.pagesCrawled}</dd>
          {report.crawlId && (<><dt className="font-semibold text-slate-500">Audit reference</dt><dd>#{report.crawlId} ({dateLabel})</dd></>)}
        </dl>
      </div>

      <div className="p-6 sm:p-10 space-y-9">
        {has('health') && (
          <>
            <Section title="Summary" accent={accent}>
              <p className="text-[15px] leading-relaxed text-slate-700">
                {summaryLoading && !summary ? 'Writing your summary...' : (summary || report.fallbackSummary)}
              </p>
            </Section>

            <Section title="Overall score" accent={accent}>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div className="tabular-nums">
                  <span className="text-6xl font-black leading-none" style={{ color: accent }}>{report.score ?? 'n/a'}</span>
                  <span className="text-lg text-slate-400 ml-1">/ 100</span>
                </div>
                {report.gradeLabel && report.score !== null && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full border mb-1" style={{ color: accent, borderColor: accent }}>{report.gradeLabel}</span>
                )}
                <span className="text-xs font-bold px-2.5 py-1 rounded-full border mb-1" style={{ color: speed.fg, borderColor: speed.fg }}>{speed.label}</span>
              </div>
              <p className="text-sm text-slate-700">{report.meaning}</p>
              <p className="text-xs text-slate-500">
                {report.counts.total} items to improve in total: {report.counts.high} high priority, {report.counts.medium} medium, {report.counts.low} low. {report.pagesCrawled} pages checked.
              </p>
              {report.coverage?.note && <p className="text-xs text-slate-500">{report.coverage.note}</p>}
              {report.scoreExplanation.length > 0 && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
                  <p className="font-bold text-slate-700">How the score is made up</p>
                  {report.scoreExplanation.map((e, i) => (
                    <p key={i}><span className="font-semibold">{e.label}</span>{e.impact !== undefined && e.impact !== null ? ` (${e.impact})` : ''}{e.detail ? `: ${e.detail}` : ''}</p>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Your top 3 priorities" accent={accent}>
              {report.priorities.length === 0 ? (
                <p className="text-sm text-slate-700">No issues were found. Nothing needs fixing right now.</p>
              ) : (
                <ol className="space-y-3">
                  {report.priorities.map((p, i) => (
                    <li key={i} className="flex gap-3 rounded-xl border border-slate-200 p-4 break-inside-avoid">
                      <span className="w-7 h-7 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0" style={{ background: accent }}>{i + 1}</span>
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{p.name}</h3>
                          <LevelPill level={p.level} />
                        </div>
                        {p.count > 0 && <p className="text-xs text-slate-500">{p.count} page{p.count === 1 ? '' : 's'} affected{p.percentage != null ? ` (${p.percentage}%)` : ''}</p>}
                        {p.why && <p className="text-sm text-slate-700"><strong>Why it matters:</strong> {p.why}</p>}
                        {p.fix && <p className="text-sm text-slate-700"><strong>What to do:</strong> {p.fix}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </>
        )}

        {has('technical') && (
          <Section title="Technical SEO breakdown" accent={accent}>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-black tabular-nums" style={{ color: accent }}>
                {report.technical?.score ?? 'n/a'}<span className="text-sm font-normal text-slate-400"> / 100</span>
              </span>
              {report.technical?.band && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border" style={{ color: accent, borderColor: accent }}>{report.technical.band}</span>
              )}
              {report.technical?.weakest && (
                <span className="text-xs text-slate-500">Weakest category: <strong>{report.technical.weakest}</strong></span>
              )}
            </div>
            {report.technical?.pillars?.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3 font-bold">Category</th>
                      <th className="py-2.5 px-3 font-bold">Checks</th>
                      <th className="py-2.5 px-3 font-bold">Rating</th>
                      <th className="py-2.5 px-3 font-bold text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.technical.pillars.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[11px] text-slate-500">{p.summary}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{p.passedCount} passing / {p.flaggedCount} flagged</td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{p.band || 'Not evaluated'}</td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-900 whitespace-nowrap">{p.score != null ? `${p.score} / 100` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {has('speed') && (
          <Section title="Speed & Core Web Vitals" accent={accent}>
            <p className="text-sm font-bold" style={{ color: speed.fg }}>{report.speed.headline}</p>
            <p className="text-sm text-slate-700">{report.speed.detail}</p>
            {report.speed.rows.length > 0 && (
              <ul className="text-xs text-slate-600 space-y-1">
                {report.speed.rows.map((r, i) => (
                  <li key={i}>{r.label}: <strong>{r.value}</strong> ({r.ok === null ? 'n/a' : r.ok ? 'good' : 'needs work'}, target {r.target})</li>
                ))}
              </ul>
            )}
            {report.speed.opportunities.length > 0 && (
              <div className="text-xs text-slate-600">
                <p className="font-bold text-slate-700">Biggest speed wins</p>
                <ul className="space-y-0.5">
                  {report.speed.opportunities.map((o, i) => <li key={i}>{o.title} (could save about {o.savings})</li>)}
                </ul>
              </div>
            )}
          </Section>
        )}

        {has('visibility') && (
          <Section title="AI & search visibility" accent={accent}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'AEO Score', sub: 'Google AI Overviews, snippets, PAA', data: report.visibility?.aeo },
                { label: 'GEO Score', sub: 'Real AI assistant answers', data: report.visibility?.geo },
                { label: 'Search Visibility', sub: 'Google page-1 rankings', data: report.visibility?.seo },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/70">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{card.label}</div>
                  <div className="mt-1 text-2xl font-black tabular-nums" style={{ color: card.data?.score != null ? accent : '#94a3b8' }}>
                    {card.data?.score != null ? `${card.data.score} / 100` : 'n/a'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{card.data?.label || card.sub}</div>
                </div>
              ))}
            </div>

            {report.visibility?.questions?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700">Measured questions &amp; citations</p>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                  {report.visibility.questions.map((q, idx) => (
                    <div key={idx} className="p-3 text-xs space-y-1 break-inside-avoid">
                      <div className="font-bold text-slate-900">{q.text}</div>
                      {q.target === 'google' ? (
                        <div className="text-slate-600 space-y-0.5">
                          <div>
                            Google: <strong>{q.googleRank ? `#${q.googleRank}` : 'Not on page 1'}</strong>
                            {' · '}
                            AI Overview: <strong>{q.aioShown ? (q.aioCited ? 'Cited' : 'Shown, not cited') : 'None'}</strong>
                            {q.paa ? ' · People Also Ask present' : ''}
                          </div>
                          {q.topResults?.length > 0 && <div className="text-[11px] text-slate-500">Top results: {q.topResults.join(', ')}</div>}
                          {q.aioSources?.length > 0 && <div className="text-[11px] text-slate-500">AI Overview sources: {q.aioSources.join(', ')}</div>}
                        </div>
                      ) : (
                        <div className="text-slate-600">
                          {q.aiEntries?.length > 0
                            ? q.aiEntries.map((e) => `${e.engine}: ${e.error || `${e.hits} of ${e.runs} answers mention/cite you`}`).join(' · ')
                            : 'No AI engine answered'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1 pt-1">
              <p className="text-xs font-bold text-slate-700">AI crawler &amp; readiness checks</p>
              {report.ai.lines.map((l, i) => <p key={i} className="text-sm text-slate-700">{l}</p>)}
            </div>
          </Section>
        )}

        {has('issues') && (
          <Section title={`Appendix: full issue list (${report.items.length})`} accent={accent}>
            {report.items.length === 0 ? (
              <p className="text-sm text-slate-700">No issues were found.</p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                {report.items.map((it, i) => (
                  <div key={i} className="p-3.5 space-y-1 break-inside-avoid">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-900">{i + 1}. {it.name}</h3>
                      <LevelPill level={it.level} />
                    </div>
                    <p className="text-xs text-slate-500">{it.count} page{it.count === 1 ? '' : 's'} affected{it.percentage != null ? ` (${it.percentage}%)` : ''}</p>
                    {it.why && <p className="text-xs text-slate-700"><strong>Why it matters:</strong> {it.why}</p>}
                    {it.fix && <p className="text-xs text-slate-700"><strong>What to do:</strong> {it.fix}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {has('urls') && report.urls?.rows?.length > 0 && (
          <Section title={`Crawled URLs (${report.urls.shown}${report.urls.total > report.urls.shown ? ` of ${report.urls.total}` : ''})`} accent={accent}>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-3 font-bold">URL</th>
                    <th className="py-2 px-3 font-bold">Status</th>
                    <th className="py-2 px-3 font-bold">Indexability</th>
                    <th className="py-2 px-3 font-bold text-right">Words</th>
                    <th className="py-2 px-3 font-bold text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.urls.rows.map((u, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 break-all text-slate-800 max-w-[280px]">{u.url}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{u.status}</td>
                      <td className="py-2 px-3 text-slate-600">{u.indexability}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{u.words}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{u.responseMs != null ? `${u.responseMs} ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.urls.total > report.urls.shown && (
              <p className="text-[11px] text-slate-500">Showing first {report.urls.shown} of {report.urls.total} URLs. Use Excel (.xlsx) or CSV for the complete URL table.</p>
            )}
          </Section>
        )}

        <footer className="pt-4 border-t border-slate-200 text-[11px] text-slate-500 flex flex-wrap justify-between gap-2">
          <span>{[settings.agencyName, client || report.host, dateLabel].filter(Boolean).join('  |  ')}</span>
          {report.crawlId && <span>Audit #{report.crawlId}</span>}
        </footer>
      </div>
    </div>
  );
}
