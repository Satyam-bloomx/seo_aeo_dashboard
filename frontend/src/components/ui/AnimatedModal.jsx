'use client';

import React from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { backdrop, modalPanel, respectMotion } from '@/lib/motion';

/**
 * AnimatedModal
 * -------------
 * Headless UI `Dialog` (focus trap, ESC, scroll lock, ARIA) driven by
 * Framer Motion so it animates on the way OUT as well as the way in.
 *
 * The critical detail: `Dialog` is rendered with `static` and kept inside an
 * `AnimatePresence`. Without `static`, Headless UI unmounts the tree the
 * instant `open` flips false and the exit animation never gets a chance to
 * play — which is exactly why the old modals popped out of existence.
 *
 * @param {boolean}  isOpen
 * @param {function} onClose
 * @param {'sm'|'md'|'lg'|'xl'|'full'} size
 * @param {string}   panelClassName  extra classes on the panel
 * @param {boolean}  blurBackdrop
 */

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export default function AnimatedModal({
  isOpen,
  onClose,
  children,
  size = 'md',
  panelClassName = '',
  blurBackdrop = true,
  initialFocus,
}) {
  const reduced = useReducedMotion();
  const backdropV = respectMotion(backdrop, reduced);
  const panelV = respectMotion(modalPanel, reduced);

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          static
          open={isOpen}
          onClose={onClose}
          initialFocus={initialFocus}
          className="relative z-50 font-sans"
        >
          {/* Backdrop */}
          <motion.div
            variants={backdropV}
            initial="initial"
            animate="animate"
            exit="exit"
            aria-hidden="true"
            className={`fixed inset-0 bg-slate-900/40 ${
              blurBackdrop ? 'backdrop-blur-[3px]' : ''
            }`}
          />

          {/* Panel container */}
          <div className="fixed inset-0 z-10 w-screen overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
            <DialogPanel
              as={motion.div}
              variants={panelV}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`relative w-full ${SIZES[size]} flex flex-col overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.28)] text-slate-900 will-change-transform ${panelClassName}`}
            >
              {children}
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
