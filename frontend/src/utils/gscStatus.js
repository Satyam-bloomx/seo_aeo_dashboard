/**
 * Classify a page's Google index state from Search Console data.
 * Uses only what Google reported (URL Inspection verdict / coverage state) or the fact that the
 * page earned impressions. Anything else is 'unknown' — never inferred from missing data.
 * @returns {'indexed' | 'not_indexed' | 'unknown'}
 */
export function gscIndexState(gsc) {
  if (!gsc || !gsc.Is_Live_GSC) return 'unknown';
  const verdict = String(gsc.Google_Index_Status || '').toUpperCase();
  const coverage = String(gsc.Index_Coverage_State || '').toLowerCase();
  if (verdict === 'FAIL' || coverage.includes('not indexed') || coverage.includes('excluded')) return 'not_indexed';
  if (verdict === 'PASS' || verdict === 'INDEXED' || /\bindexed\b/.test(coverage)) return 'indexed';
  return 'unknown';
}
