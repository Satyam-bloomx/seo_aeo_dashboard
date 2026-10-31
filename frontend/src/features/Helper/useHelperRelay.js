'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, authFetch } from '@/api/client';

const POLL_MS = 3000;
const FLUSH_MS = 1000;
const MAX_RESULTS_PER_POST = 10;
const MAX_POST_CHARS = 6 * 1024 * 1024; // html payloads per request (server accepts up to 24 MB)
const HEARTBEAT_MS = 10000;

const IDLE = { phase: 'idle' };

/**
 * Relays work between the crawler and the helper while a crawl runs:
 *   server batch (GET .../helper/batch) -> helper start_batch -> helper results -> POST .../helper/results.
 * The server stays in charge: if this tab closes or the helper goes quiet, the crawler stops waiting by itself.
 *
 * relay.phase: idle | needs_permission | starting | running | needs_verification | done | declined | failed
 */
export default function useHelperRelay({ helper, crawlId, running }) {
  const [relay, setRelay] = useState(IDLE);
  const [summary, setSummary] = useState(null); // Crawl.summary.helper: offered / rescued
  const handledRef = useRef(new Set()); // batch ids already acted on
  const pendingRef = useRef(null); // batch waiting for the user's permission
  const activeRef = useRef(null); // { batchId, site, buffer, progress, closed, sent, lastPost, chain }
  const connected = helper.status === 'connected';
  const { getPort, portVersion } = helper;

  const post = useCallback(async (batchId, body) => {
    const res = await authFetch(`${API_BASE_URL}/crawls/${crawlId}/helper/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: batchId, ...body }),
    });
    if (res.status === 409) return { closed: true };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [crawlId]);

  const stopActive = useCallback((reason, batch) => {
    const a = batch || activeRef.current;
    if (!a || a.closed) return;
    a.closed = true;
    if (activeRef.current === a) activeRef.current = null;
    getPort()?.post({ type: 'stop', crawl_id: a.batchId, id: `stop-${reason}` });
  }, [getPort]);

  // Send buffered results, at most MAX_RESULTS_PER_POST / MAX_POST_CHARS per request. Sends are chained so they
  // never overlap and a final state ("done") always goes out after the last results.
  const sendBuffered = useCallback(async (a, state) => {
    try {
      do {
        const chunk = [];
        let size = 0;
        while (a.buffer.length && chunk.length < MAX_RESULTS_PER_POST) {
          const len = (a.buffer[0].html_gzip_b64 || '').length;
          if (chunk.length && size + len > MAX_POST_CHARS) break;
          chunk.push(a.buffer.shift());
          size += len;
        }
        if (!chunk.length && !state && a.lastPost && Date.now() - a.lastPost < HEARTBEAT_MS) return;
        const body = { results: chunk, progress: a.progress || undefined };
        if (state && !a.buffer.length) body.state = state;
        const out = await post(a.batchId, body);
        a.lastPost = Date.now();
        if (out.closed) {
          // The server stopped waiting (time limit, crawl ended): stop the helper too.
          stopActive('closed', a);
          setRelay((r) => ({ ...r, phase: 'done' }));
          return;
        }
        a.sent += out.accepted || 0;
        setRelay((r) => ({ ...r, sent: a.sent }));
      } while (a.buffer.length && !a.closed);
    } catch (e) {
      console.warn('Could not send helper results:', e?.message || e);
    }
  }, [post, stopActive]);

  const flush = useCallback((state) => {
    const a = activeRef.current;
    if (!a) return Promise.resolve();
    a.chain = (a.chain || Promise.resolve()).then(() => sendBuffered(a, state));
    return a.chain;
  }, [sendBuffered]);

  const startBatch = useCallback(async (batch) => {
    const port = getPort();
    if (!port) return;
    setRelay({ phase: 'starting', site: batch.site, total: batch.urls.length, sent: 0, ok: 0 });
    try {
      const res = await port.request({
        type: 'start_batch',
        crawl_id: batch.batch_id,
        site: batch.site,
        owner_confirmed: true,
        urls: batch.urls,
        mode: { verification: true, respect_robots: true },
      });
      activeRef.current = { batchId: batch.batch_id, site: batch.site, buffer: [], progress: null, closed: false, sent: 0, lastPost: 0, chain: null };
      setRelay({ phase: 'running', site: batch.site, batchId: batch.batch_id, total: res.accepted, sent: 0, ok: 0 });
      await post(batch.batch_id, { state: 'running', results: [] });
      activeRef.current.lastPost = Date.now();
    } catch (e) {
      if (e?.code === 'no_permission') {
        pendingRef.current = batch;
        setRelay({ phase: 'needs_permission', site: batch.site, total: batch.urls.length });
        return;
      }
      setRelay({ phase: 'failed', site: batch.site, error: e?.message || 'The helper could not start.' });
      post(batch.batch_id, { state: 'failed', results: [] }).catch(() => {});
    }
  }, [getPort, post]);

  const offerBatch = useCallback(async (batch) => {
    const port = getPort();
    if (!port) return;
    try {
      const perm = await port.request({ type: 'check_permission', site: batch.site });
      if (perm.granted && perm.owner_confirmed) {
        await startBatch(batch);
        return;
      }
    } catch {
      return;
    }
    pendingRef.current = batch;
    setRelay({ phase: 'needs_permission', site: batch.site, total: batch.urls.length });
    post(batch.batch_id, { state: 'awaiting_permission', results: [] }).catch(() => {});
  }, [getPort, post, startBatch]);

  // Called from a click: Chrome only grants site access after a click inside the helper's own window.
  const allowSite = useCallback(async () => {
    const batch = pendingRef.current;
    const port = getPort();
    if (!batch || !port) return;
    setRelay((r) => ({ ...r, phase: 'starting' }));
    try {
      const res = await port.request({ type: 'request_permission', site: batch.site, owner_confirmed: true, verification: true }, 0);
      if (res.granted && res.owner_confirmed) {
        pendingRef.current = null;
        await startBatch(batch);
        return;
      }
    } catch {
      /* fall through */
    }
    pendingRef.current = null;
    setRelay((r) => ({ ...r, phase: 'declined' }));
    post(batch.batch_id, { state: 'declined', results: [] }).catch(() => {});
  }, [getPort, post, startBatch]);

  const skipSite = useCallback(() => {
    const batch = pendingRef.current;
    pendingRef.current = null;
    setRelay((r) => ({ ...r, phase: 'declined' }));
    if (batch) post(batch.batch_id, { state: 'declined', results: [] }).catch(() => {});
  }, [post]);

  // Human check done by the user in a normal tab: confirm ownership (sent as owner_confirmed), then resume.
  const continueAfterCheck = useCallback(async () => {
    const a = activeRef.current;
    const port = getPort();
    if (!a || !port) return;
    try {
      await port.request({ type: 'request_permission', site: a.site, owner_confirmed: true, verification: true }, 0);
      await port.request({ type: 'resume', crawl_id: a.batchId });
      setRelay((r) => ({ ...r, phase: 'running', verification: null }));
      await flush('running');
    } catch (e) {
      setRelay((r) => ({ ...r, error: e?.message || 'The helper could not continue.' }));
    }
  }, [getPort, flush]);

  const declineCheck = useCallback(async () => {
    const a = activeRef.current;
    const port = getPort();
    if (!a || !port) return;
    try {
      await port.request({ type: 'decline_verification', crawl_id: a.batchId });
    } catch {
      /* batch already over */
    }
    setRelay((r) => ({ ...r, phase: 'running', verification: null }));
    await flush('running');
  }, [getPort, flush]);

  // Messages pushed by the helper for the active batch.
  useEffect(() => {
    const port = getPort();
    if (!port) return undefined;
    let timer = null;
    const mine = (m) => activeRef.current && m.crawl_id === activeRef.current.batchId;
    const schedule = () => {
      if (!timer) timer = setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
    };
    const offs = [
      port.on('result', (m) => {
        if (!mine(m)) return;
        const { type: _type, crawl_id: _cid, ...result } = m;
        activeRef.current.buffer.push(result);
        if (activeRef.current.buffer.length >= MAX_RESULTS_PER_POST) flush();
        else schedule();
      }),
      port.on('progress', (m) => {
        if (!mine(m)) return;
        const { type: _t, crawl_id: _c, site: _s, ...progress } = m;
        activeRef.current.progress = progress;
        setRelay((r) => ({ ...r, ok: m.ok, done: m.done, total: m.total, paused: m.paused }));
      }),
      port.on('needs_verification', (m) => {
        if (!mine(m)) return;
        setRelay((r) => ({ ...r, phase: 'needs_verification', verification: { url: m.url, provider: m.provider, round: m.round, maxRounds: m.max_rounds } }));
        const a = activeRef.current;
        post(a.batchId, { state: 'needs_verification', results: [], progress: a.progress || undefined }).catch(() => {});
      }),
      port.on('batch_done', async (m) => {
        if (!mine(m)) return;
        const a = activeRef.current;
        await flush('done');
        if (activeRef.current === a) activeRef.current = null;
        setRelay((r) => ({ ...r, phase: 'done', verification: null }));
      }),
      port.on('error', async (m) => {
        if (!mine(m)) return;
        const a = activeRef.current;
        await flush('failed');
        if (activeRef.current === a) activeRef.current = null;
        setRelay((r) => ({ ...r, phase: 'failed', error: m.message }));
      }),
    ];
    return () => {
      clearTimeout(timer);
      offs.forEach((off) => off());
    };
  }, [getPort, portVersion, flush, post]);

  // Poll the server while the crawl runs: heartbeat (only with a connected helper) and new batches.
  useEffect(() => {
    // Only with a connected helper: without one there is nothing to relay and the crawler never waits.
    if (!crawlId || !running || !connected || !helper.version) return undefined;
    let cancelled = false;
    let timer;
    const version = helper.version;
    const tick = async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/crawls/${crawlId}/helper/batch?helper_version=${encodeURIComponent(version)}`);
        if (res.ok) {
          const body = await res.json();
          if (cancelled) return;
          setSummary(body.helper || null);
          const batch = body.batch;
          if (batch?.urls?.length && !handledRef.current.has(batch.batch_id)) {
            handledRef.current.add(batch.batch_id);
            offerBatch(batch);
          }
          if (activeRef.current) flush(); // sends anything buffered, or a heartbeat when quiet for 10 s
        }
      } catch {
        /* next tick */
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [crawlId, running, connected, helper.version, offerBatch, flush]);

  // Crawl finished, another crawl opened, or the page closes: stop any batch this tab started.
  useEffect(() => {
    if (!running) return undefined;
    const onUnload = () => stopActive('unload');
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      stopActive('ended');
    };
  }, [running, crawlId, stopActive]);

  const dismiss = useCallback(() => setRelay(IDLE), []);

  return { relay, summary, allowSite, skipSite, continueAfterCheck, declineCheck, dismiss };
}
