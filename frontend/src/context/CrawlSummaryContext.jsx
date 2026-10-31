'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getCrawlSummary } from '@/api/client';

/**
 * Scores and per-rule results from the backend scoring engine (GET /crawls/{id}/summary).
 * This is the single source of truth for every score and issue count shown in the dashboard.
 */
const CrawlSummaryContext = createContext(null);

export const useCrawlSummary = () => useContext(CrawlSummaryContext);
export const CrawlSummaryProvider = CrawlSummaryContext.Provider;

const LIVE_REFRESH_MS = 10000;

/** Fetches the summary for a crawl: once when completed, and at most every 10 s while running. */
export function useCrawlSummaryFetch(crawlId, status, pagesCount) {
  // Stored with the crawl id it belongs to, so switching crawls never shows a stale summary.
  const [state, setState] = useState({ crawlId: null, data: null });
  const lastFetchRef = useRef({ key: null, at: 0 });

  useEffect(() => {
    if (!crawlId) return;
    if (!pagesCount && status !== 'completed') return;
    const key = `${crawlId}:${status}`;
    const now = Date.now();
    const sameState = lastFetchRef.current.key === key;
    if (sameState && (status !== 'running' || now - lastFetchRef.current.at < LIVE_REFRESH_MS)) return;
    const request = { key, at: now };
    lastFetchRef.current = request;

    // Not cancelled on re-render: pages arriving re-runs this effect, and cancelling here would drop
    // the only summary request for a completed crawl. A newer request supersedes this one instead.
    getCrawlSummary(crawlId)
      .then((data) => { if (lastFetchRef.current === request) setState({ crawlId, data }); })
      .catch((err) => console.warn('Could not load crawl summary:', err?.response?.status || err?.message));
  }, [crawlId, status, pagesCount]);


  return crawlId && state.crawlId === crawlId ? state.data : null;
}
