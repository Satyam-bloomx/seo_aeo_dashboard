# Headless UI & Dialog Motion — Complete Architecture & Modal Physics Guide

## 1. Executive Overview & Accessibility Foundation
**Headless UI** (developed by Tailwind Labs) provides unstyled, fully accessible UI primitives (modals, slide-over sheets, popovers, dropdown menus) paired with robust transition state controllers.

* **Primary Package**: `@headlessui/react` (v2.0+).
* **Core Strengths**:
  1. **Accessible DOM Portals**: Renders modal dialogs into a top-level React portal (`<div id="headlessui-portal-root">`) to prevent z-index clipping.
  2. **Automatic Focus Trapping**: Locks keyboard tab focus inside the active modal and restores previous focus on close.
  3. **Scroll Locking**: Prevents background body scrolling while a modal or drawer is open.
  4. **Smooth Coordinated Transitions**: Synchronizes backdrop fade-in with dialog panel scale-up and slide-in.

---

## 2. Component & Transition Primitive Inventory

| Component | Description | Accessibility & Motion Feature |
|---|---|---|
| `<Dialog>` | Root modal container. | Mounts into portal, traps focus, listens for `Escape` key, manages `open` state. |
| `<DialogBackdrop>` | Semi-transparent background overlay. | Independent opacity fade-in/out and backdrop blur transition. |
| `<DialogPanel>` | Main content card container. | Receives spring scale (`scale-95` $\rightarrow$ `scale-100`) and translation (`translate-y-4` $\rightarrow$ `translate-y-0`). |
| `<DialogTitle>` | Modal accessibility header. | Automatically binds `aria-labelledby` for screen readers. |
| `<Transition>` | Coordinated enter/leave state animator. | Exposes `enter`, `enterFrom`, `enterTo`, `leave`, `leaveFrom`, `leaveTo` props. |
| `<Popover>` / `<PopoverPanel>` | Floating non-modal dropdowns. | Physics-based micro-scale reveal anchored to button. |

---

## 3. Transition Prop Blueprint & Spring Physics Easing

```
           [ Enter Phase ]                             [ Leave Phase ]
   enterFrom            enterTo                leaveFrom            leaveTo
┌──────────────┐    ┌──────────────┐       ┌──────────────┐    ┌──────────────┐
│ opacity: 0   │ ──>│ opacity: 1   │       │ opacity: 1   │ ──>│ opacity: 0   │
│ scale: 0.95  │    │ scale: 1.0   │       │ scale: 1.0   │    │ scale: 0.95  │
│ translate-y:4│    │ translate-y:0│       │ translate-y:0│    │ translate-y:4│
└──────────────┘    └──────────────┘       └──────────────┘    └──────────────┘
  (duration: 300ms, ease-out)                (duration: 200ms, ease-in)
  cubic-bezier(0.16, 1, 0.3, 1)              cubic-bezier(0.4, 0, 1, 1)
```

---

## 4. Next.js 16 & React 19 Implementation Recipes

### Recipe A: Apple-Grade Modal Dialog (`SettingsModal.jsx` / `ApiKeyModal.jsx`)
```javascript
'use client';
import React, { Fragment } from 'react';
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop, Transition, TransitionChild } from '@headlessui/react';
import { X, Sliders } from 'lucide-react';

export function ModernSettingsDialog({ isOpen, onClose, title, children }) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50 font-sans" onClose={onClose}>
        
        {/* 1. Backdrop Fade Transition */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" />
        </TransitionChild>

        {/* 2. Dialog Panel Center Scale & Translation Transition */}
        <div className="fixed inset-0 z-10 w-screen overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <DialogPanel className="relative transform overflow-hidden rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Sliders size={18} />
                  </div>
                  <div>
                    <DialogTitle as="h3" className="text-base font-extrabold text-slate-900">
                      {title}
                    </DialogTitle>
                    <p className="text-xs text-slate-500">Configure technical crawler parameters</p>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4 text-xs text-slate-600">
                {children}
              </div>

            </DialogPanel>
          </TransitionChild>
        </div>

      </Dialog>
    </Transition>
  );
}
```

### Recipe B: Slide-Over Right Drawer (`URL Specs Inspector`)
```javascript
'use client';
import React, { Fragment } from 'react';
import { Dialog, DialogPanel, DialogBackdrop, Transition, TransitionChild } from '@headlessui/react';
import { X } from 'lucide-react';

export function SlideOverDrawer({ isOpen, onClose, children }) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50 font-sans" onClose={onClose}>
        
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <TransitionChild
                as={Fragment}
                enter="transform transition ease-out duration-400"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <DialogPanel className="pointer-events-auto w-screen max-w-md bg-white border-l border-slate-200 shadow-2xl p-6 flex flex-col justify-between">
                  {children}
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </div>

      </Dialog>
    </Transition>
  );
}
```

---

## 5. AuditPro Component Mapping
1. **`SettingsModal.jsx`**: Crawler presets, depth, rate limiting, and JS rendering modal.
2. **`ApiKeyModal.jsx`**: Google OAuth, PageSpeed, and OpenAI API credentials modal with live test verification.
3. **`ExecutiveReportModal.jsx`**: Printable client audit certificate modal.
4. **URL Specs Inspector**: Right-hand diagnostic drawer for deep URL parameter inspection.
