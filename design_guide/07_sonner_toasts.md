# Sonner Toast Notifications — Complete Architecture & Toast Guide

## 1. Executive Overview & Notification Architecture
**Sonner** (created by Emil Kowalski) is an opinionated, physics-driven toast notification component for React.

* **Primary Package**: `sonner` (v1.7+ / v2.0+).
* **Bundle Footprint**: ~3.2KB min/gzip.
* **Core Strengths**:
  1. **Physics-Based Card Stacking**: Notifications smoothly stack behind one another and expand on hover or drag.
  2. **Swipe-to-Dismiss Gestures**: Interactive touch and mouse drag dismiss physics.
  3. **Zero Layout Reflow**: Floating layer architecture that renders over top of application content without causing layout shifts.
  4. **Promise-Driven Toasts**: `toast.promise()` seamlessly handles loading $\rightarrow$ success / error transitions with zero manual boolean state.

---

## 2. API & Method Inventory

| Method | Signature | Description |
|---|---|---|
| `<Toaster />` | `<Toaster position="top-right" richColors expand={false} />` | Root container placed in `layout.js`. |
| `toast()` | `toast('Message', { description: '...' })` | Default neutral notification. |
| `toast.success()` | `toast.success('Title', { ... })` | Emerald status notification with checkmark icon. |
| `toast.error()` | `toast.error('Title', { ... })` | Rose status notification with error icon. |
| `toast.info()` | `toast.info('Title', { ... })` | Indigo status notification for system alerts. |
| `toast.loading()` | `const id = toast.loading('Loading...')` | Persistent spinner toast (dismissible via `toast.dismiss(id)`). |
| `toast.promise()` | `toast.promise(promiseFn, { loading, success, error })` | Dynamic async state handler. |
| `toast.dismiss()` | `toast.dismiss(id)` | Dismisses a specific toast or all toasts if called without arguments. |

---

## 3. Configuration & Options Blueprint

### `<Toaster>` Component Props
```javascript
<Toaster
  position="top-right"        // 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  expand={false}              // If true, expands the stack by default
  richColors={true}           // Applies emerald/rose/indigo/amber backgrounds
  closeButton={true}          // Displays interactive close 'x' icon
  duration={4000}             // Auto-dismiss timeout in ms
  visibleToasts={4}           // Maximum number of visible stacked toasts
  theme="light"               // 'light' | 'dark' | 'system'
  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
/>
```

---

## 4. Next.js 16 & React 19 Implementation Recipes

### Recipe A: Asynchronous Crawl Initiation & Status Updates (`AuditDashboard.jsx`)
```javascript
'use client';
import { toast } from 'sonner';

export const triggerCrawlWithToast = async (seedUrl, settings) => {
  // 1. Interactive Loading Toast
  const toastId = toast.loading(`Initializing spider on ${seedUrl}...`, {
    description: `Configuring ${settings.maxPages} max pages and depth ${settings.maxDepth}`
  });

  try {
    const res = await fetch('http://localhost:8000/api/crawls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed_url: seedUrl, ...settings })
    });

    const data = await res.json();

    // 2. Transition Toast to Success
    toast.success('Spider Engine Active', {
      id: toastId,
      description: `Crawl ID: ${data.id}. Extracting 32 technical parameters...`
    });

    return data.id;
  } catch (err) {
    // 3. Transition Toast to Error
    toast.error('Crawl Initialization Failed', {
      id: toastId,
      description: 'Unable to reach backend API. Please check server status.'
    });
    throw err;
  }
};
```

### Recipe B: Real-Time API Connection Latency Test (`IntegrationsPanel.jsx`)
```javascript
'use client';
import { toast } from 'sonner';

export const testApiConnection = async (integrationName) => {
  const toastId = toast.loading(`Benchmarking ${integrationName} latency...`);

  const startTime = performance.now();
  try {
    const res = await fetch(`http://localhost:8000/api/integrations/test/${integrationName}`);
    const data = await res.json();
    const latency = Math.round(performance.now() - startTime);

    toast.success(`${integrationName} Connected (${latency}ms)`, {
      id: toastId,
      description: 'API handshake successful. Live data enabled in audit reports.'
    });
  } catch (err) {
    toast.error(`${integrationName} Handshake Failed`, {
      id: toastId,
      description: 'Invalid API key or network timeout. Please verify credentials.'
    });
  }
};
```

---

## 5. AuditPro Component Mapping
1. **`src/app/layout.js`**: Global `<Toaster position="top-right" richColors />` wrapper.
2. **`AuditDashboard.jsx`**: Spider initiation, crawl progress notifications, copy URL alerts, and crawl completion toasts.
3. **`IntegrationsPanel.jsx`**: Real-time latency benchmark testing for Google Search Console, PageSpeed, and OpenAI.
4. **`URLExplorerTab.jsx`**: CSV export and URL filter toasts.
