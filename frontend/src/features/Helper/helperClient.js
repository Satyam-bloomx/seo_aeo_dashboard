// AuditPro Helper: talks to the browser extension with Chrome extension messaging (extension/PROTOCOL.md).
// Only origins listed in the extension's manifest (externally_connectable) can reach it.

export const HELPER_EXTENSION_ID = process.env.NEXT_PUBLIC_HELPER_EXTENSION_ID || 'phncnhdoeonnplmhjghkdogejgeglmnd';
const KEEPALIVE_MS = 20000;
const REQUEST_TIMEOUT_MS = 15000;

function runtime() {
  if (typeof window === 'undefined') return null;
  const rt = window.chrome && window.chrome.runtime;
  return rt && typeof rt.sendMessage === 'function' ? rt : null;
}

/** One-shot detection: the helper's hello (version, capabilities) or null when it is not installed. */
export function detectHelper(timeoutMs = 1500) {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      rt.sendMessage(HELPER_EXTENSION_ID, { type: 'hello' }, (res) => {
        clearTimeout(timer);
        // Reading lastError marks it handled (otherwise Chrome logs "Unchecked runtime.lastError").
        if (rt.lastError || !res || res.extension !== 'auditpro-helper') finish(null);
        else finish(res);
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/** Compare dotted versions: negative when a < b. */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export class HelperError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/**
 * A long-lived port to the helper. Batches belong to the port that started them, so the dashboard keeps one
 * port open while it is visible. `on(type, fn)` receives pushed messages (result, progress, needs_verification,
 * batch_done, tab_captured, error without id); `request(msg)` resolves with the reply that echoes its id.
 */
export class HelperPort {
  constructor({ onDisconnect } = {}) {
    this.listeners = new Map();
    this.pending = new Map();
    this.nextId = 1;
    this.port = null;
    this.onDisconnect = onDisconnect;
    this.keepalive = null;
  }

  connect() {
    const rt = runtime();
    if (!rt || typeof rt.connect !== 'function') return false;
    try {
      this.port = rt.connect(HELPER_EXTENSION_ID);
    } catch {
      return false;
    }
    this.port.onMessage.addListener((msg) => this.handle(msg));
    this.port.onDisconnect.addListener(() => {
      void rt.lastError; // mark handled
      this.port = null;
      clearInterval(this.keepalive);
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new HelperError('disconnected', 'The helper disconnected.'));
      }
      this.pending.clear();
      if (this.onDisconnect) this.onDisconnect();
    });
    this.keepalive = setInterval(() => this.post({ type: 'ping' }), KEEPALIVE_MS);
    return true;
  }

  get connected() {
    return !!this.port;
  }

  handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject, timer } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.type === 'error') reject(new HelperError(msg.code, msg.message));
      else resolve(msg);
      return;
    }
    for (const fn of this.listeners.get(msg.type) || []) {
      try {
        fn(msg);
      } catch (e) {
        console.warn('Helper listener failed:', e);
      }
    }
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  post(msg) {
    if (!this.port) return false;
    try {
      this.port.postMessage(msg);
      return true;
    } catch {
      return false;
    }
  }

  /** Send a request and wait for its reply. `timeoutMs: 0` waits until the user finishes (permission window). */
  request(msg, timeoutMs = REQUEST_TIMEOUT_MS) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs ? setTimeout(() => {
        this.pending.delete(id);
        reject(new HelperError('timeout', 'The helper did not answer.'));
      }, timeoutMs) : null;
      this.pending.set(id, { resolve, reject, timer });
      if (!this.post({ ...msg, id })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new HelperError('disconnected', 'The helper is not connected.'));
      }
    });
  }

  close() {
    clearInterval(this.keepalive);
    if (this.port) {
      try {
        this.port.disconnect();
      } catch {
        /* already closed */
      }
    }
    this.port = null;
  }
}

/** Site origin for permissions: scheme + host of the audit's start URL. */
export function siteOf(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/** Same rule as the helper and the server: the host and its www./apex twin. */
export function sameSite(a, b) {
  try {
    const strip = (h) => h.toLowerCase().replace(/^www\./, '');
    return strip(new URL(a).hostname) === strip(new URL(b).hostname);
  } catch {
    return false;
  }
}
