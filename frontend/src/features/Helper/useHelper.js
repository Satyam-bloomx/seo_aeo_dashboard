'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, authFetch } from '@/api/client';
import { HelperPort, compareVersions, detectHelper } from './helperClient';

/**
 * Detects the AuditPro Helper and keeps one port open to it while the dashboard is open.
 *
 * status: 'checking' | 'missing' (not installed, or this site is not allowed to talk to it) | 'connected' | 'disconnected'
 */
export default function useHelper() {
  const [conn, setConn] = useState({ status: 'checking', hello: null });
  const [latest, setLatest] = useState(null); // { available, version, filename } from the server
  const [capture, setCapture] = useState(null); // last "Audit this tab" capture
  const [portVersion, setPortVersion] = useState(0); // changes whenever the port is replaced
  const portRef = useRef(null);

  const connect = useCallback(async () => {
    const hello = await detectHelper();
    if (!hello) {
      setConn({ status: 'missing', hello: null });
      return;
    }
    const port = new HelperPort({
      onDisconnect: () => {
        if (portRef.current !== port) return;
        portRef.current = null;
        setConn((c) => ({ ...c, status: 'disconnected' }));
        setPortVersion((v) => v + 1);
      },
    });
    if (!port.connect()) {
      setConn({ status: 'missing', hello: null });
      return;
    }
    if (portRef.current) portRef.current.close();
    portRef.current = port;
    port.on('hello', (h) => setConn({ status: 'connected', hello: h }));
    port.on('tab_captured', (m) => setCapture(m.capture || null));
    setConn({ status: 'connected', hello });
    setPortVersion((v) => v + 1);
    try {
      const res = await port.request({ type: 'get_capture' });
      if (res.capture) setCapture(res.capture);
    } catch {
      /* older helper or busy: the push still arrives */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await connect();
    };
    run();
    return () => {
      cancelled = true;
      if (portRef.current) portRef.current.close();
      portRef.current = null;
    };
  }, [connect]);

  // Installed it in another tab, or the helper restarted? Look again when the user comes back to this tab.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && !portRef.current) connect();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [connect]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/helper/info`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setLatest(data);
      } catch {
        /* offline: no update prompt */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPort = useCallback(() => portRef.current, []);

  const clearCapture = useCallback(async () => {
    setCapture(null);
    try {
      await portRef.current?.request({ type: 'clear_capture' });
    } catch {
      /* nothing to clear */
    }
  }, []);

  const version = conn.hello?.version || null;
  const outdated = !!(version && latest?.version && compareVersions(version, latest.version) < 0);

  return {
    status: conn.status,
    hello: conn.hello,
    version,
    latest,
    outdated,
    capture,
    clearCapture,
    getPort,
    portVersion,
    reconnect: connect,
  };
}

/** Download the helper zip (signed-in users only, so it goes through the authenticated API). */
export async function downloadHelperZip(latest) {
  const res = await authFetch(`${API_BASE_URL}/helper/download`);
  if (!res.ok) throw new Error(res.status === 404 ? 'The helper download is not available yet.' : `Download failed (${res.status}).`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = latest?.filename || 'auditpro-helper.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
