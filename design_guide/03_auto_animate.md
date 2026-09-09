# AutoAnimate (FormKit) — Complete Architecture & DOM Mutation Guide

## 1. Executive Overview & MutationObserver Architecture
**AutoAnimate** (created by FormKit) is a zero-configuration animation library that automatically smooths out DOM mutations (element addition, removal, reordering, and dimension resizing).

* **Primary Package**: `@formkit/auto-animate` (v0.8+).
* **Bundle Footprint**: ~2.3KB min/gzip. Microscopic overhead.
* **Core Philosophy**: Developers should not have to write custom CSS keyframes, wrap items in complex layout state trackers, or manually calculate heights just to animate a list or an accordion. AutoAnimate attaches a native JavaScript `MutationObserver` and `ResizeObserver` to a parent container; when children change, it applies the **FLIP (First, Last, Invert, Play)** technique seamlessly.

---

## 2. API & Hook Inventory

| API | Signature | Description |
|---|---|---|
| `useAutoAnimate` | `const [parentRef, enableAnimations] = useAutoAnimate(options)` | Official React hook returning a ref to attach to any container element. |
| `autoAnimate` | `autoAnimate(domNode, options)` | Vanilla DOM function for attaching to imperative elements or portals. |
| `AnimationController` | `enableAnimations(false / true)` | Programmatically pause or resume animations during bulk data operations. |

---

## 3. Configuration & Custom Plugin Functions

### A. Options Object
```javascript
const options = {
  // Duration in milliseconds (default: 250)
  duration: 250,
  
  // CSS Easing curve (default: 'ease-in-out')
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  
  // Disrespect user preference for reduced motion (default: false)
  disrespectUserMotionPreference: false
};
```

### B. Custom Transition Plugin
AutoAnimate allows customizing exact Keyframes for specific actions (`add`, `remove`, `remain`):

```javascript
const customPlugin = (el, action, oldCoords, newCoords) => {
  let keyframes;
  
  if (action === 'add') {
    keyframes = [
      { opacity: 0, transform: 'scale(0.92) translateY(-10px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' }
    ];
  }
  
  if (action === 'remove') {
    keyframes = [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.92) translateY(10px)' }
    ];
  }
  
  if (action === 'remain') {
    // FLIP calculation for reordered or shifting siblings
    const deltaX = oldCoords.left - newCoords.left;
    const deltaY = oldCoords.top - newCoords.top;
    keyframes = [
      { transform: `translate(${deltaX}px, ${deltaY}px)` },
      { transform: 'translate(0, 0)' }
    ];
  }
  
  return new KeyframeEffect(el, keyframes, {
    duration: 300,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
  });
};
```

---

## 4. Next.js 16 & React 19 Implementation Recipes

### Recipe A: Diagnostic Issues Accordion (`IssuesTab.jsx`)
```javascript
'use client';
import React, { useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { ChevronDown, AlertTriangle, CheckCircle } from 'lucide-react';

export function DiagnosticAccordion({ issues }) {
  const [parentRef] = useAutoAnimate({ duration: 250, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div ref={parentRef} className="space-y-2.5">
      {issues.map((issue) => {
        const isOpen = expandedId === issue.id;
        return (
          <div key={issue.id} className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
            <button
              onClick={() => setExpandedId(isOpen ? null : issue.id)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-500" />
                <span className="text-xs font-bold text-slate-900">{issue.title}</span>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* AutoAnimate automatically animates height from 0 to full! */}
            {isOpen && (
              <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-600 font-sans space-y-2">
                <p>{issue.remediation}</p>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-slate-800">
                  Target URLs affected: {issue.urlCount} pages
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### Recipe B: Dynamic Filterable Data Grid (`URLExplorerTab.jsx`)
```javascript
'use client';
import React from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';

export function FilterableGrid({ items, selectedFilter }) {
  const [listRef] = useAutoAnimate();

  const filteredItems = items.filter(item => 
    selectedFilter === 'All' ? true : item.status === selectedFilter
  );

  return (
    <tbody ref={listRef} className="divide-y divide-slate-200">
      {filteredItems.map((item) => (
        <tr key={item.url} className="hover:bg-slate-50 transition-colors">
          <td className="py-2.5 px-4 text-xs font-mono text-slate-900">{item.url}</td>
          <td className="py-2.5 px-4 text-xs font-mono text-slate-600">{item.status_code}</td>
          <td className="py-2.5 px-4 text-xs text-slate-600">{item.title}</td>
        </tr>
      ))}
    </tbody>
  );
}
```

---

## 5. AuditPro Component Mapping
1. **`IssuesTab.jsx`**: Auto-animates the accordion expansion and severity filter switching (All, Errors, Warnings, Opportunities).
2. **`URLExplorerTab.jsx`**: Smooth re-ordering and row inserts when filtering across 32 Screaming Frog categories.
3. **`SettingsModal.jsx`**: Fluid transition when switching between configuration tabs (Presets, Limits, Rules, Spider).
4. **`URL Inspector Drawer`**: Smooth height changes when expanding dynamic category data tables.
