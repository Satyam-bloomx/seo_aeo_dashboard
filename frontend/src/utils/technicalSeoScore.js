// View-model over the backend scoring engine (backend/app/services/scoring.py).
//
// Site Health is the Ahrefs Health Score: the share of crawled URLs with zero errors. An error is a Screaming Frog
// Issue of high or medium priority; warnings and opportunities are listed but never move the score. Single-page
// audits get a page check (error / warning counts) instead of a score. Checks that could not be evaluated are
// excluded, never counted as passes. No score is computed in the browser.
import { generateAllEvaluatedChecks } from './IssuesEngine';

const CATEGORY_GROUPS = {
  'Indexability': { id: 'indexability', categories: ['Response_Codes', 'Canonicals', 'Directives', 'Sitemaps'],
    summary: 'HTTP status, canonical tags, robots directives and sitemap consistency.' },
  'On-page': { id: 'onpage', categories: ['Page_Titles', 'Meta_Description', 'H1', 'H2', 'Images'],
    summary: 'Titles, meta descriptions, heading structure and image alt text.' },
  'Content': { id: 'content', categories: ['Content'],
    summary: 'Thin, duplicate, placeholder and hard-to-read content.' },
  'Links': { id: 'links', categories: ['Links'],
    summary: 'Internal links to broken or redirecting URLs, crawl depth and link equity.' },
  'Security': { id: 'security', categories: ['Security'],
    summary: 'HTTPS, mixed content and security response headers.' },
  'Structured data': { id: 'structured', categories: ['Structured_Data'],
    summary: 'Presence and validity of JSON-LD / microdata markup.' },
  'Technical': { id: 'technical', categories: ['Validation', 'JavaScript', 'PageSpeed'],
    summary: 'HTML validity, legacy crawling patterns and real-user Core Web Vitals.' },
};

const GRADES = {
  Excellent: { letter: 'A', label: 'Excellent', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  Good: { letter: 'B', label: 'Good', color: 'text-teal-700 bg-teal-50 border-teal-200' },
  Fair: { letter: 'C', label: 'Fair', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  Weak: { letter: 'D', label: 'Weak', color: 'text-rose-700 bg-rose-50 border-rose-200' },
};
const NO_GRADE = { letter: '—', label: 'Not scored yet', color: 'text-slate-600 bg-slate-50 border-slate-200' };

const byPriority = (a, b) => ({ High: 3, Medium: 2, Low: 1 }[b.priority] - { High: 3, Medium: 2, Low: 1 }[a.priority]) || b.count - a.count;

/**
 * @param {object[]} pages
 * @param {object[]} _issuesReport  unused, kept for call-site compatibility
 * @param {object|null} summary  backend /crawls/{id}/summary payload
 */
export function calculateTechnicalSeoScore(pages = [], _issuesReport = [], summary = null) {
  const sh = summary?.site_health;
  if (!sh) {
    return {
      score: null, siteHealthScore: null, technicalScore: null, grade: NO_GRADE, technicalGrade: NO_GRADE,
      pillars: [], checksSummary: { totalEvaluated: 0, passedCount: 0, issuesCount: 0, notEvaluatedCount: 0, allChecks: [] },
    };
  }

  const allChecks = generateAllEvaluatedChecks(pages, summary).filter(c => !c.integration);
  const evaluated = allChecks.filter(c => !c.notEvaluated);

  const pillars = Object.entries(CATEGORY_GROUPS).map(([name, cfg]) => {
    const cat = summary.categories?.[name] || {};
    const checks = allChecks.filter(c => cfg.categories.includes(c.category));
    const passed = checks.filter(c => c.isPassing);
    const flagged = checks.filter(c => c.status === 'Flagged').sort(byPriority);
    return {
      id: cfg.id,
      name,
      weight: null, // categories are a diagnostic breakdown; Site Health is not a weighted sum of them
      score: cat.score ?? null,
      band: cat.band ?? null,
      categories: cfg.categories,
      issuesCount: flagged.length,
      summary: cfg.summary,
      checks,
      passedChecks: passed,
      flaggedChecks: flagged,
      notEvaluatedChecks: checks.filter(c => c.notEvaluated),
      passedCount: passed.length,
      flaggedCount: flagged.length,
      totalCount: checks.length,
    };
  });

  const grade = GRADES[sh.band] || NO_GRADE;
  return {
    score: sh.score,
    siteHealthScore: sh.score,
    technicalScore: sh.score,
    pageScore: summary.page_score ?? null,
    mode: summary.mode,
    band: sh.band,
    grade,
    technicalGrade: grade,
    urlPassRate: sh.url_pass_rate,
    scoreReason: sh.reason ?? null,       // why there is no Site Health score (single page, small crawl)
    provisional: Boolean(sh.provisional),
    capped: Boolean(sh.capped),
    pageCheck: summary.page_check ?? null,
    technicalSeo: summary.technical_seo ?? null,  // average of the category scores below
    technicalSeoGrade: GRADES[summary.technical_seo?.band] || NO_GRADE,
    issues: summary.issues ?? null,
    lowConfidence: sh.low_confidence,
    scoringVersion: summary.scoring_version,
    pillars,
    checksSummary: {
      totalEvaluated: evaluated.length,
      totalChecks: allChecks.length,
      passedCount: evaluated.filter(c => c.isPassing).length,
      issuesCount: evaluated.filter(c => !c.isPassing).length,
      notEvaluatedCount: allChecks.length - evaluated.length,
      errorFreePages: (sh.urls_evaluated_for_critical ?? 0) - (sh.urls_with_critical_errors ?? 0),
      errorFreeRatio: sh.url_pass_rate,
      urlsWith: sh.urls_with,
      allChecks,
    },
  };
}
