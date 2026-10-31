// Numbers for the client report. Uses the same sources as the dashboard Overview tab (backend crawl
// summary, PageSpeed data on the crawled pages), so the report and the dashboard always agree.

const BAND_MEANING = {
  Excellent: 'Your site is in strong shape. What is left is fine-tuning.',
  Good: 'A solid foundation, with a few fixes worth making.',
  Fair: 'Several problems are likely holding back how well the site shows up in search.',
  Weak: 'Serious problems are limiting how well the site can show up in search.',
};

export const issueLevel = (issue) => issue?.priority || 'Low';

// Mirrors the dashboard's PageSpeed card: real Lighthouse run on the first page, else stored mobile data.
function readPageSpeed(pages) {
  const p0 = pages?.[0]?.audit_data || {};
  const seoPs = p0.seo_audit?.pagespeed;
  const desktop = seoPs?.desktop?.status === 'success' ? seoPs.desktop : null;
  const mobile = seoPs?.mobile?.status === 'success' ? seoPs.mobile : null;
  const real = desktop || mobile;
  if (real && real.performance_score !== undefined) {
    return { score: real.performance_score, strategy: desktop ? 'Desktop' : 'Mobile', metrics: real.metrics || {}, opportunities: real.opportunities || [] };
  }
  const ps = p0.PageSpeed?.mobile || p0.PageSpeed?.desktop;
  if (ps && ps.performance_score !== undefined) {
    return { score: ps.performance_score, strategy: 'Mobile', metrics: ps.metrics || {}, opportunities: ps.opportunities || [] };
  }
  return null;
}

// Mirrors the dashboard's Answer Readiness card, with the page-level AI result as a fallback.
function readAnswerReadiness(pages, crawlSummary) {
  const ar = crawlSummary?.integrations?.answer_readiness;
  if (ar?.status === 'ok' && typeof ar.score === 'number') return { score: ar.score, pagesAssessed: ar.pages_assessed ?? null };
  for (const p of pages || []) {
    const aeo = p.audit_data?.AEO_Audit;
    if (aeo?.is_ai_connected && typeof aeo.aeo_score === 'number') return { score: aeo.aeo_score, pagesAssessed: null };
  }
  return null;
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

function buildSpeed(pages, crawlSummary) {
  const lab = readPageSpeed(pages);
  const psSummary = crawlSummary?.integrations?.pagespeed;
  const cwv = psSummary?.core_web_vitals || null;
  const labScore = lab ? lab.score : (psSummary?.lab_score_mobile ?? null);

  let status = 'unknown';
  // passed is null when Google lacks enough visitor data: fall back to the lab score then.
  if (cwv?.passed === true) status = 'good';
  else if (cwv?.passed === false) status = 'poor';
  else if (typeof labScore === 'number') status = labScore >= 90 ? 'good' : labScore >= 50 ? 'warn' : 'poor';

  // Lab LCP over the "good" limit is worth saying even when real-user data passes.
  const labLcp = num(lab?.metrics?.lcp);
  const rows = [];
  if (cwv) {
    rows.push({ label: 'Real visitors: loading (LCP)', value: cwv.lcp_ms != null ? `${(cwv.lcp_ms / 1000).toFixed(1)} s` : 'n/a', ok: cwv.lcp_good, target: 'under 2.5 s' });
    rows.push({ label: 'Real visitors: responsiveness (INP)', value: cwv.inp_ms != null ? `${cwv.inp_ms} ms` : 'n/a', ok: cwv.inp_good, target: 'under 200 ms' });
    rows.push({ label: 'Real visitors: layout stability (CLS)', value: cwv.cls != null ? String(cwv.cls) : 'n/a', ok: cwv.cls_good, target: 'under 0.1' });
  }
  if (lab) {
    const m = lab.metrics;
    if (m.lcp && m.lcp !== 'N/A') rows.push({ label: `Lab test (${lab.strategy}): loading (LCP)`, value: String(m.lcp), ok: labLcp !== null ? labLcp < 2.5 : null, target: 'under 2.5 s' });
    if (m.cls && m.cls !== 'N/A') rows.push({ label: `Lab test (${lab.strategy}): layout stability (CLS)`, value: String(m.cls), ok: num(m.cls) !== null ? num(m.cls) < 0.1 : null, target: 'under 0.1' });
  }

  const headline = {
    good: 'Speed is good.',
    warn: 'Speed is acceptable but can be improved.',
    poor: 'Speed needs attention.',
    unknown: 'Speed was not measured for this audit.',
  }[status];

  const detail = status === 'unknown'
    ? 'Connect a PageSpeed Insights key and re-run the audit to include loading speed.'
    : [
        typeof labScore === 'number' ? `Lighthouse speed score: ${labScore}/100${lab ? ` (${lab.strategy.toLowerCase()}, measured on the first page)` : ''}.` : null,
        cwv && cwv.passed != null ? `Google's real-visitor Core Web Vitals check: ${cwv.passed ? 'passed' : 'failed'}.` : 'Google does not have enough real-visitor data for this site, so the lab test is used.',
      ].filter(Boolean).join(' ');

  const opportunities = (lab?.opportunities || [])
    .map((o) => ({
      title: o.title,
      savings: o.savingsMs > 0 ? `${(o.savingsMs / 1000).toFixed(1)} s` : (typeof o.savings === 'string' && !o.savings.startsWith('-') ? o.savings : null),
    }))
    .filter((o) => o.title && o.savings)
    .slice(0, 3);

  return { status, headline, detail, score: labScore, rows, opportunities };
}

function buildAiReadiness(pages, crawlSummary) {
  const ar = readAnswerReadiness(pages, crawlSummary);
  const crawlers = crawlSummary?.crawl?.ai_crawlers;
  const lines = [];
  if (ar) {
    lines.push(`Answer readiness: ${ar.score}/100${ar.pagesAssessed ? ` (${ar.pagesAssessed} page${ar.pagesAssessed === 1 ? '' : 's'} assessed)` : ''}. This shows how easily AI assistants can pull a clear answer from your pages.`);
  } else {
    lines.push('Answer readiness was not measured in this audit. Connect an AI provider and re-run the audit to include it.');
  }
  if (crawlers?.status === 'ok') {
    lines.push(crawlers.search_bots_allowed
      ? 'AI search crawlers (ChatGPT, Claude, Perplexity) are allowed to read the site.'
      : 'AI search crawlers (ChatGPT, Claude, Perplexity) are blocked from reading the site, so it cannot be quoted in their answers.');
    lines.push(`llms.txt guidance file: ${crawlers.llms_txt?.present ? 'present' : 'not found (optional)'}.`);
  }
  return { score: ar?.score ?? null, lines };
}

function sentenceTrim(text, max = 260) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}...`;
}

const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const toItem = (issue, total) => ({
  name: cleanName(issue.name),
  level: issueLevel(issue),
  count: issue.count ?? 0,
  percentage: issue.percentage ?? (total ? Math.round(100 * (issue.count || 0) / total) : null),
  // Checks without a written guide only carry generic placeholder text: a client report shows none rather than filler.
  why: issue.hasGuide === false ? '' : sentenceTrim(issue.impact || issue.rootCause || ''),
  cause: issue.hasGuide === false ? '' : sentenceTrim(issue.rootCause || '', 400),
  fix: issue.hasGuide === false ? '' : sentenceTrim(issue.fixGuide || '', 320),
});

/**
 * @returns the single data object both the on-screen report and the PDF render.
 */
export function buildReportData({ pages, crawlSummary, issuesReport, techResult, targetUrl }) {
  const total = pages?.length || 0;
  const items = (issuesReport || []).map((i) => toItem(i, total));
  const high = items.filter((i) => i.level === 'High').length;
  const medium = items.filter((i) => i.level === 'Medium').length;
  const low = items.filter((i) => i.level === 'Low').length;

  const score = techResult?.siteHealthScore ?? null;
  const band = techResult?.band || null;
  const speed = buildSpeed(pages, crawlSummary);
  const ai = buildAiReadiness(pages, crawlSummary);

  let meaning = score === null ? 'The score is not available yet for this audit.' : (BAND_MEANING[band] || 'This is the overall health score for the site.');
  if (score !== null && speed.status === 'poor') meaning += ' Page speed is a weak spot and is shown next to the score.';

  const indexable = (pages || []).filter((p) => p.indexability !== 'Non-Indexable').length;

  let host = targetUrl || '';
  try {
    host = new URL(String(host).startsWith('http') ? host : `https://${host || pages?.[0]?.url || ''}`).hostname;
  } catch {
    host = targetUrl || 'your website';
  }

  const crawl = crawlSummary?.crawl || {};
  const coverage = crawl.coverage || null;
  const skipped = coverage ? (coverage.not_crawled_page_limit || 0) + (coverage.not_crawled_depth_limit || 0) + (coverage.excluded_by_rules || 0) : 0;

  const speedWord = { good: 'loads well', warn: 'loads acceptably', poor: 'loads slowly and needs work', unknown: '' }[speed.status];
  const fallbackSummary = [
    `${host} scored ${score ?? 'n/a'} out of 100 for overall search health.`,
    `We checked ${total} page${total === 1 ? '' : 's'} and found ${items.length} thing${items.length === 1 ? '' : 's'} to improve, ${high} of them high priority.`,
    speedWord ? `The site ${speedWord}.` : '',
    items.length ? 'The three priorities below are the best place to start.' : '',
  ].filter(Boolean).join(' ');

  return {
    host,
    crawlId: pages?.[0]?.crawl_id ?? null,
    pagesCrawled: total,
    indexable,
    nonIndexable: total - indexable,
    score,
    band,
    gradeLabel: techResult?.grade?.label || null,
    meaning,
    counts: { total: items.length, high, medium, low },
    items,
    priorities: items.slice(0, 3),
    speed,
    ai,
    fallbackSummary,
    scoreExplanation: Array.isArray(crawl.score_explanation) ? crawl.score_explanation : [],
    coverage: coverage ? { crawled: coverage.crawled ?? total, skipped, note: skipped > 0 ? `${skipped} more URLs were found but not crawled (page limit, depth limit or your exclusion rules).` : null } : null,
  };
}

export function reportDateLabel(date = new Date()) {
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}
