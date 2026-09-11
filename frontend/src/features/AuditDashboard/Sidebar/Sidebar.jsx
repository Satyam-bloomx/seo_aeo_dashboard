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
  X,
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

const NAV_ITEM_CLASS =
  'relative flex w-full cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs outline-none transition-colors duration-150';

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenExecutiveReport,
  onOpenSettings,
  pagesCount = 0,
  issuesCount = 0,
  onCloseMobile,
  isMobile = false,
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

  const indicatorTransition = reduced ? { duration: 0 } : spring.snap;

  return (
    <aside className="relative flex h-full w-full select-none flex-col border-r border-slate-200 bg-white px-3.5 py-5 shadow-sm overflow-y-auto custom-scrollbar">
      {/* ------------------------------------------------------------------ */}
      {/* Brand                                                              */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween(duration.panel, ease.outQuint)}
        className="mb-7 flex items-center justify-between px-2 shrink-0"
      >
        <motion.div
          className="group flex cursor-pointer items-center"
          whileHover="hover"
          initial="rest"
          animate="rest"
        >
          <AuditProLogo size={38} animated={true} showText={true} />
        </motion.div>
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        )}
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
          <span className="text-[9px] font-normal">v20.4</span>
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
                  isActive
                    ? 'text-white font-bold'
                    : 'text-slate-700 font-semibold hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                {/* Gliding filled pill indicator */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    transition={indicatorTransition}
                    className="absolute inset-0 rounded-xl bg-slate-900 shadow-md ring-1 ring-slate-900/10"
                  />
                )}

                {/* Gliding emerald edge bar */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-edge"
                    transition={indicatorTransition}
                    className="absolute bottom-2 left-0 top-2 w-1.5 rounded-r-full bg-emerald-400 shadow-[0_0_12px_#10B981] z-10"
                  />
                )}

                <span className="relative z-10 flex items-center gap-3">
                  <span
                    className={`flex transition-colors ${
                      isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-indigo-600'
                    }`}
                  >
                    <Icon size={18} />
                  </span>
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
                      className={`relative z-10 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
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
          <motion.span
            aria-hidden="true"
            variants={{ rest: { x: '-120%' }, hover: { x: '120%' } }}
            transition={{ duration: 0.7, ease: ease.outQuart }}
            className="pointer-events-none absolute inset-y-0 w-1/2 skew-x-[-20deg] bg-white/15"
          />
          <span className="relative flex text-emerald-400">
            <FileText size={15} />
          </span>
          <span className="relative">Executive PDF Report</span>
        </motion.button>

        <motion.button
          onClick={() => onOpenSettings('presets')}
          whileTap={tapPressSoft}
          initial="rest"
          whileHover="hover"
          animate="rest"
          className="group relative flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
        >
          <span className="flex items-center gap-2.5">
            <span className="flex text-slate-500 group-hover:text-indigo-600">
              <Settings size={16} />
            </span>
            <span>Crawler Settings</span>
          </span>
          <span className="font-mono text-[10px] uppercase text-slate-400">Config</span>
        </motion.button>
      </motion.div>
    </aside>
  );
}
