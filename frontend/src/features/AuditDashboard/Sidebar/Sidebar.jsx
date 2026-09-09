'use client';

import React from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import {
  LayoutDashboard,
  AlertTriangle,
  ListTree,
  Zap,
  Settings,
  BookOpen,
  FileText,
  Layers,
} from 'lucide-react';
import {
  duration,
  ease,
  spring,
  staggerContainer,
  staggerItem,
  tapPressSoft,
  tween,
} from '@/lib/motion';
import AuditProLogo from '@/components/ui/AuditProLogo';

/**
 * Sidebar
 * -------
 * The active-state indicator is a single `motion.div` shared across every nav
 * button via `layoutId`. React unmounts it from the old row and mounts it on
 * the new one; Framer Motion sees the same layoutId and physically glides the
 * element between the two positions instead of cutting. Same trick for the
 * emerald edge bar.
 *
 * Nav rows stagger in once, on mount, at 45ms apart.
 */

const NAV_ITEM_CLASS =
  'relative flex w-full cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs outline-none';

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenExecutiveReport,
  onOpenSettings,
  pagesCount = 0,
  issuesCount = 0,
}) {
  const reduced = useReducedMotion();

  const mainTabs = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, badge: null },
    {
      id: 'issues',
      label: 'Issues & Diagnostics',
      icon: AlertTriangle,
      badge: issuesCount > 0 ? issuesCount : null,
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      id: 'explorer',
      label: 'URL Data Grid',
      icon: ListTree,
      badge: pagesCount > 0 ? `${pagesCount} URLs` : null,
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    { id: 'performance', label: 'Speed & Vitals', icon: Zap, badge: 'Lighthouse' },
    { id: 'integrations', label: 'API Integrations', icon: Layers, badge: 'SEO/AEO' },
  ];

  // With reduced motion the indicator still moves, it just teleports.
  const indicatorTransition = reduced ? { duration: 0 } : spring.snap;

  return (
    <aside className="relative flex h-full w-full select-none flex-col border-r border-slate-200 bg-white/95 px-3.5 py-5 shadow-sm">
      {/* ------------------------------------------------------------------ */}
      {/* Brand                                                              */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween(duration.panel, ease.outQuint)}
        className="mb-7 px-2"
      >
        <motion.div
          className="group flex cursor-pointer items-center"
          whileHover="hover"
          initial="rest"
          animate="rest"
        >
          <AuditProLogo size={38} animated={true} showText={true} />
        </motion.div>
      </motion.div>

      {/* ------------------------------------------------------------------ */}
      {/* Navigation                                                         */}
      {/* ------------------------------------------------------------------ */}
      <motion.nav
        variants={staggerContainer(0.045, 0.08)}
        initial="initial"
        animate="animate"
        className="flex flex-1 flex-col gap-1.5"
      >
        <motion.div
          variants={staggerItem}
          className="mb-1 flex items-center justify-between px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400"
        >
          <span>Navigation</span>
          <span className="text-[9px] font-normal">v20.0</span>
        </motion.div>

        <LayoutGroup id="sidebar-nav">
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <motion.button
                key={tab.id}
                variants={staggerItem}
                onClick={() => setActiveTab(tab.id)}
                whileTap={tapPressSoft}
                initial="rest"
                animate={isActive ? 'active' : 'rest'}
                whileHover="hover"
                aria-current={isActive ? 'page' : undefined}
                className={`${NAV_ITEM_CLASS} ${
                  isActive ? 'font-bold text-white' : 'font-semibold text-slate-600'
                }`}
              >
                {/* Gliding filled pill — one element, shared across all rows. */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    transition={indicatorTransition}
                    className="absolute inset-0 -z-10 rounded-xl bg-slate-900 shadow-md"
                  />
                )}

                {/* Hover wash for inactive rows only. */}
                {!isActive && (
                  <motion.span
                    variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                    transition={tween(duration.micro, ease.outQuad)}
                    className="absolute inset-0 -z-10 rounded-xl bg-slate-100"
                  />
                )}

                {/* Gliding emerald edge bar. */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-edge"
                    transition={indicatorTransition}
                    className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-emerald-400 shadow-[0_0_10px_#10B981]"
                  />
                )}

                <span className="relative flex items-center gap-3">
                  <motion.span
                    variants={{
                      rest: { rotate: 0, scale: 1, color: '#94A3B8' },
                      hover: { rotate: 6, scale: 1.12, color: '#4F46E5' },
                      active: { rotate: 0, scale: 1.05, color: '#34D399' },
                    }}
                    transition={spring.press}
                    className="flex"
                  >
                    <Icon size={18} />
                  </motion.span>
                  <span className="truncate">{tab.label}</span>
                </span>

                <AnimatePresence mode="popLayout" initial={false}>
                  {tab.badge && (
                    <motion.span
                      key={String(tab.badge)}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={spring.soft}
                      className={`relative rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                        isActive
                          ? 'border-slate-700 bg-slate-800 text-emerald-300'
                          : tab.badgeColor || 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tab.badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </LayoutGroup>
      </motion.nav>

      {/* ------------------------------------------------------------------ */}
      {/* Footer actions                                                     */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween(duration.panel, ease.outQuint)}
        className="mt-auto space-y-2 border-t border-slate-200 pt-4"
      >
        <motion.button
          onClick={onOpenExecutiveReport}
          whileTap={tapPressSoft}
          initial="rest"
          whileHover="hover"
          animate="rest"
          className="btn-primary group relative w-full gap-2 overflow-hidden px-3 py-2.5 text-xs font-bold shadow-xs"
        >
          {/* Sheen that sweeps across the button on hover. */}
          <motion.span
            aria-hidden="true"
            variants={{ rest: { x: '-120%' }, hover: { x: '120%' } }}
            transition={{ duration: 0.7, ease: ease.outQuart }}
            className="pointer-events-none absolute inset-y-0 w-1/2 skew-x-[-20deg] bg-white/15"
          />
          <motion.span
            variants={{ rest: { rotate: 0, scale: 1 }, hover: { rotate: -8, scale: 1.12 } }}
            transition={spring.press}
            className="relative flex"
          >
            <FileText size={15} className="text-emerald-400" />
          </motion.span>
          <span className="relative">Executive PDF Report</span>
        </motion.button>

        <motion.button
          onClick={() => onOpenSettings('presets')}
          whileTap={tapPressSoft}
          initial="rest"
          whileHover="hover"
          animate="rest"
          className="group relative flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent px-3.5 py-2.5 text-xs font-semibold text-slate-600"
        >
          <motion.span
            variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
            transition={tween(duration.micro, ease.outQuad)}
            className="absolute inset-0 -z-10 rounded-xl border border-slate-200 bg-slate-100"
          />
          <span className="flex items-center gap-2.5">
            <motion.span
              variants={{ rest: { rotate: 0, color: '#94A3B8' }, hover: { rotate: 90, color: '#4F46E5' } }}
              transition={{ duration: 0.5, ease: ease.outQuint }}
              className="flex"
            >
              <Settings size={16} />
            </motion.span>
            <span className="group-hover:text-slate-900">Crawler Settings</span>
          </span>
          <span className="font-mono text-[10px] uppercase text-slate-400">Config</span>
        </motion.button>
      </motion.div>
    </aside>
  );
}
