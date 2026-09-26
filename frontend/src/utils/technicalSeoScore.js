import { generateAllEvaluatedChecks } from './IssuesEngine.js';

/**
 * Industry-Standard Technical SEO Scoring Engine.
 * Replicates Ahrefs Health Score and Semrush Site Health standards.
 *
 * Requirements for Technical SEO Scoring:
 * 1. Error-Free Page Hygiene (Ahrefs Standard): Evaluates proportion of internal pages free of critical defects.
 * 2. Weighted Issue Severity (Semrush Standard): Errors (High) carry heavy penalties; Warnings (Medium) moderate; Opportunities (Low) negligible.
 * 3. Five Core Architectural Pillars (aggregating 61+ granular automated checks across 14 categories):
 *    - Pillar 1: Crawlability & HTTP Status (25% Weight)
 *    - Pillar 2: Indexability & Canonicalization (25% Weight)
 *    - Pillar 3: Architecture, Headings & HTML Validation (20% Weight)
 *    - Pillar 4: Content Quality, Duplication & Metadata (15% Weight)
 *    - Pillar 5: Security, Performance & Core Web Vitals (15% Weight)
 */

export function calculateTechnicalSeoScore(pages = [], issuesReport = []) {
  if (!pages || pages.length === 0) {
    return {
      score: 0,
      grade: { letter: 'N/A', label: 'No Crawl Data', color: 'text-slate-500 bg-slate-50 border-slate-200' },
      pillars: [],
      checksSummary: { totalEvaluated: 0, passedCount: 0, issuesCount: 0, errorFreePages: 0, errorFreeRatio: 0, allChecks: [] }
    };
  }

  const total = pages.length;

  // 1. Calculate Error-Free URLs (Ahrefs Health Score Standard)
  // A URL has an error if it returns 4xx/5xx or triggers any Critical (High priority) technical issue.
  const errorUrls = new Set();
  issuesReport.filter(i => i.priority === 'High' || i.type === 'Issue').forEach(issue => {
    (issue.affected_pages || []).forEach(p => {
      if (p.url) errorUrls.add(p.url);
    });
  });
  pages.filter(p => (p.status_code || 200) >= 400).forEach(p => {
    if (p.url) errorUrls.add(p.url);
  });

  const cleanCount = Math.max(0, total - errorUrls.size);
  const errorFreeRatio = total > 0 ? (cleanCount / total) * 100 : 0;

  // 2. Run all diagnostic checks to obtain granular telemetry (Passed vs Flagged)
  const allEvaluatedChecks = generateAllEvaluatedChecks(pages);

  // 3. Helper to calculate progressive deductions for a pillar
  const calcPillar = (categories, maxDeduction = 85) => {
    const relevant = issuesReport.filter(i => categories.includes(i.category));
    let totalDeductions = 0;

    relevant.forEach(issue => {
      const affected = issue.affected_pages?.length || issue.count || 0;
      const ratio = total > 0 ? affected / total : 0;

      let base = 0;
      let spread = 0;

      if (issue.priority === 'High' || issue.type === 'Issue') {
        // Critical Error: immediate template defect base + spread penalty across site
        base = 5.5;
        spread = 28;
      } else if (issue.priority === 'Medium' || issue.type === 'Warning') {
        // Medium Warning: moderate base + spread
        base = 2.0;
        spread = 12;
      } else {
        // Low Opportunity / Notice: minor cosmetic deduction
        base = 0.3;
        spread = 2.5;
      }

      totalDeductions += base + (ratio * spread);
    });

    const score = Math.max(0, Math.min(100, Math.round(100 - Math.min(maxDeduction, totalDeductions))));
    return { score, issuesCount: relevant.length, totalDeductions };
  };

  // -------------------------------------------------------------------------
  // Pillar 1: Crawlability & HTTP Status (25% Weight)
  // Categories: Response_Codes, JavaScript
  // -------------------------------------------------------------------------
  const p1Categories = ['Response_Codes', 'JavaScript'];
  const s500Count = pages.filter(p => (p.status_code || 200) >= 500).length;
  const s400Count = pages.filter(p => (p.status_code || 200) >= 400 && (p.status_code || 200) < 500).length;
  const s300Count = pages.filter(p => (p.status_code || 200) >= 300 && (p.status_code || 200) < 400).length;

  const p1Data = calcPillar(p1Categories);
  const s500Penalty = s500Count > 0 ? 25 + (s500Count / total) * 60 : 0;
  const s400Penalty = s400Count > 0 ? 15 + (s400Count / total) * 40 : 0;
  const redirectRatio = s300Count / total;
  const s300Penalty = redirectRatio > 0.15 ? (redirectRatio - 0.15) * 30 : 0;

  const pillar1Score = Math.max(0, Math.min(100, Math.round(100 - p1Data.totalDeductions - s500Penalty - s400Penalty - s300Penalty)));

  // -------------------------------------------------------------------------
  // Pillar 2: Indexability & Canonicalization (25% Weight)
  // Categories: Canonicals, Directives, Search_Console
  // -------------------------------------------------------------------------
  const p2Categories = ['Canonicals', 'Directives', 'Search_Console'];
  const p2Data = calcPillar(p2Categories);
  const pillar2Score = p2Data.score;

  // -------------------------------------------------------------------------
  // Pillar 3: Architecture, Headings & HTML Validation (20% Weight)
  // Categories: Page_Titles, H1, H2, Validation
  // -------------------------------------------------------------------------
  const p3Categories = ['Page_Titles', 'H1', 'H2', 'Validation'];
  const p3Data = calcPillar(p3Categories);
  const pillar3Score = p3Data.score;

  // -------------------------------------------------------------------------
  // Pillar 4: Content Quality, Duplication & Metadata (15% Weight)
  // Categories: Meta_Description, Content, Images
  // -------------------------------------------------------------------------
  const p4Categories = ['Meta_Description', 'Content', 'Images'];
  const p4Data = calcPillar(p4Categories);
  const pillar4Score = p4Data.score;

  // -------------------------------------------------------------------------
  // Pillar 5: Security, Performance & Core Web Vitals (15% Weight)
  // Categories: Security, PageSpeed, Google_Analytics
  // -------------------------------------------------------------------------
  const p5Categories = ['Security', 'PageSpeed', 'Google_Analytics'];
  const p5Data = calcPillar(p5Categories);
  const pillar5Score = p5Data.score;

  // -------------------------------------------------------------------------
  // Composite Weighted Technical SEO Score
  // Blends 75% 5-Pillar Architectural Hygiene + 25% Error-Free URL Health Ratio
  // -------------------------------------------------------------------------
  const pillarWeighted = (
    pillar1Score * 0.25 +
    pillar2Score * 0.25 +
    pillar3Score * 0.20 +
    pillar4Score * 0.15 +
    pillar5Score * 0.15
  );

  const compositeScore = Math.round(pillarWeighted * 0.75 + errorFreeRatio * 0.25);
  const finalScore = Math.max(5, Math.min(100, compositeScore));
  const technicalScore = Math.max(5, Math.min(100, Math.round(pillarWeighted)));

  const getGrade = (s) => {
    if (s >= 90) return { letter: 'A+', label: 'Elite Technical SEO', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (s >= 80) return { letter: 'A', label: 'Healthy Technical Health', color: 'text-teal-700 bg-teal-50 border-teal-200' };
    if (s >= 70) return { letter: 'B', label: 'Moderate (Action Recommended)', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
    if (s >= 55) return { letter: 'C', label: 'Sub-Optimal (Warning)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { letter: 'D', label: 'Critical Technical Debt', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  };

  // Helper to extract and bundle checks for each pillar
  const getPillarChecks = (categories) => {
    const checks = allEvaluatedChecks.filter(c => categories.includes(c.category));
    const passed = checks.filter(c => c.isPassing);
    const flagged = checks.filter(c => !c.isPassing).sort((a, b) => {
      const priorityRank = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const aRank = priorityRank[a.priority] || 1;
      const bRank = priorityRank[b.priority] || 1;
      if (aRank !== bRank) return bRank - aRank;
      return b.count - a.count;
    });

    return {
      all: checks,
      passed,
      flagged,
      totalCount: checks.length,
      passedCount: passed.length,
      flaggedCount: flagged.length
    };
  };

  const p1Checks = getPillarChecks(p1Categories);
  const p2Checks = getPillarChecks(p2Categories);
  const p3Checks = getPillarChecks(p3Categories);
  const p4Checks = getPillarChecks(p4Categories);
  const p5Checks = getPillarChecks(p5Categories);

  const pillars = [
    {
      id: 'crawlability',
      name: 'Crawlability & HTTP Status',
      weight: '25%',
      score: pillar1Score,
      categories: p1Categories,
      issuesCount: p1Data.issuesCount + (s400Count > 0 ? 1 : 0) + (s500Count > 0 ? 1 : 0),
      summary: `${pages.length - s400Count - s500Count}/${pages.length} URLs returned HTTP 200 OK. ${s400Count} 4xx client errors, ${s500Count} 5xx server errors.`,
      checks: p1Checks.all,
      passedChecks: p1Checks.passed,
      flaggedChecks: p1Checks.flagged,
      passedCount: p1Checks.passedCount,
      flaggedCount: p1Checks.flaggedCount,
      totalCount: p1Checks.totalCount
    },
    {
      id: 'indexability',
      name: 'Indexability & Canonicals',
      weight: '25%',
      score: pillar2Score,
      categories: p2Categories,
      issuesCount: p2Data.issuesCount,
      summary: `Canonical URL declared, directive hygiene (noindex/nofollow), and Search Console indexation health.`,
      checks: p2Checks.all,
      passedChecks: p2Checks.passed,
      flaggedChecks: p2Checks.flagged,
      passedCount: p2Checks.passedCount,
      flaggedCount: p2Checks.flaggedCount,
      totalCount: p2Checks.totalCount
    },
    {
      id: 'architecture',
      name: 'Architecture, Validation & Headings',
      weight: '20%',
      score: pillar3Score,
      categories: p3Categories,
      issuesCount: p3Data.issuesCount,
      summary: `Title tag compliance, H1/H2 hierarchy, and HTML5 DOM structure validity.`,
      checks: p3Checks.all,
      passedChecks: p3Checks.passed,
      flaggedChecks: p3Checks.flagged,
      passedCount: p3Checks.passedCount,
      flaggedCount: p3Checks.flaggedCount,
      totalCount: p3Checks.totalCount
    },
    {
      id: 'metadata',
      name: 'Content Quality & Metadata',
      weight: '15%',
      score: pillar4Score,
      categories: p4Categories,
      issuesCount: p4Data.issuesCount,
      summary: `Meta descriptions, content duplication, thin content detection, and image alt text attributes.`,
      checks: p4Checks.all,
      passedChecks: p4Checks.passed,
      flaggedChecks: p4Checks.flagged,
      passedCount: p4Checks.passedCount,
      flaggedCount: p4Checks.flaggedCount,
      totalCount: p4Checks.totalCount
    },
    {
      id: 'rendering',
      name: 'Security & Core Web Vitals',
      weight: '15%',
      score: pillar5Score,
      categories: p5Categories,
      issuesCount: p5Data.issuesCount,
      summary: `HTTPS enforcement, JavaScript execution stability, LCP (<2.5s) and CLS (<0.1) metrics.`,
      checks: p5Checks.all,
      passedChecks: p5Checks.passed,
      flaggedChecks: p5Checks.flagged,
      passedCount: p5Checks.passedCount,
      flaggedCount: p5Checks.flaggedCount,
      totalCount: p5Checks.totalCount
    }
  ];

  return {
    score: finalScore,
    siteHealthScore: finalScore,
    technicalScore: technicalScore,
    grade: getGrade(finalScore),
    technicalGrade: getGrade(technicalScore),
    pillars,
    checksSummary: {
      totalEvaluated: allEvaluatedChecks.length,
      passedCount: allEvaluatedChecks.filter(c => c.isPassing).length,
      issuesCount: allEvaluatedChecks.filter(c => !c.isPassing).length,
      errorFreePages: cleanCount,
      errorFreeRatio: Math.round(errorFreeRatio),
      allChecks: allEvaluatedChecks
    }
  };
}
