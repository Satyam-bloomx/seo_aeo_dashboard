# Barba.js & View Transitions API — Complete Architecture & Page Transition Guide

## 1. Executive Overview & Page Transition Lifecycle
**Barba.js** and the modern **W3C View Transitions API** (`document.startViewTransition`) enable fluid, cinematic page-to-page transitions without full page reloads or jarring white flashes.

* **Ecosystem Shift**:
  * Traditional Multi-Page Applications (MPAs) historically used **Barba.js** to intercept `<a>` clicks, fetch the next HTML via `fetch()`, replace the `<main data-barba="container">` DOM node, and run enter/leave GSAP timelines.
  * In **Next.js App Router (15/16)**, Next.js natively manages client routing, and integrates seamlessly with the **View Transitions API** and **Next-View-Transitions** (`next-view-transitions`) or custom GSAP page wrappers.

---

## 2. Transition Lifecycle Architecture

```
                       [ Navigation Trigger ]
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     1. Leave Phase    │  (Fade out / scale down current view)
                     └───────────────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ 2. Fetch / Render Next│  (Async component mount in Next.js)
                     └───────────────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     3. Enter Phase    │  (Fade in / slide up next view)
                     └───────────────────────┘
```

---

## 3. Next.js 16 Implementation Recipes

### Recipe A: Native View Transitions Wrapper with GSAP (`layout.js`)
```javascript
'use client';
import React, { useRef } from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export function PageTransitionProvider({ children }) {
  const pathname = usePathname();
  const pageRef = useRef(null);

  useGSAP(() => {
    // Smooth page entrance transition on route change
    gsap.fromTo(
      pageRef.current,
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }
    );
  }, [pathname]);

  return (
    <div ref={pageRef} className="w-full h-full will-change-transform">
      {children}
    </div>
  );
}
```

### Recipe B: CSS View Transitions Primitives
```css
/* In globals.css */
@view-transition {
  navigation: auto;
}

::view-transition-old(root) {
  animation: 250ms cubic-bezier(0.4, 0, 1, 1) both fade-out;
}

::view-transition-new(root) {
  animation: 350ms cubic-bezier(0, 0, 0.2, 1) both fade-in;
}

@keyframes fade-out {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.98); }
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
```

---

## 4. AuditPro Component Mapping
1. **`src/app/layout.js`**: Page transition provider ensuring tab and route transitions between `/`, `/loading-demo`, and `/integrations/callback` never flash white.
