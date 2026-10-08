'use client';

import React from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import {
  LayoutDashboard,
  Globe,
  AlertTriangle,
  ListTree,
  Zap,
  Settings,
  BookOpen,
  FileText,
  FileSpreadsheet,
  Layers,
  Sparkles,
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
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserMenu from '@/features/Auth/UserMenu';

const NAV_ITEM_CLASS =
  'relative flex w-full cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs outline-none transition-colors duration-150';

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenExecutiveReport,
  onOpenExport,
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
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/60',
    },
    {
      id: 'explorer',
      label: 'URL Data Grid',
      icon: ListTree,
      badge: pagesCount > 0 ? `${pagesCount} URLs` : null,
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-[#CAE366]/10 dark:text-[#CAE366] dark:border-[#CAE366]/25',
    },
    { id: 'performance', label: 'Speed & Vitals', icon: Zap, badge: 'Lighthouse', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-[#4B88FF]/10 dark:text-[#4B88FF] dark:border-[#4B88FF]/25' },
    { id: 'integrations', label: 'API Integrations', icon: Layers, badge: 'SEO/AEO', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-[#4B88FF]/10 dark:text-[#4B88FF] dark:border-[#4B88FF]/25' },
    {
      id: 'naruto',
      label: 'Naruto Sample',
      icon: Sparkles,
      badge: 'Theme',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-[#FFDE59]/10 dark:text-[#FFDE59] dark:border-[#FFDE59]/25',
    },
  ];

  const indicatorTransition = reduced ? { duration: 0 } : spring.snap;

  return (
    <aside className="relative flex h-full w-full select-none flex-col border-r border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#07080B] px-3.5 py-5 shadow-sm overflow-y-auto custom-scrollbar transition-colors duration-200 font-sans">
      {/* ------------------------------------------------------------------ */}
      {/* Brand                                                              */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween(duration.panel, ease.outQuint)}
        className="mb-6 flex items-center justify-between px-1.5 shrink-0 min-w-0"
      >
        <motion.div
          className="group flex cursor-pointer items-center min-w-0 flex-1 mr-2"
          whileHover="hover"
          initial="rest"
          animate="rest"
        >
          <AuditProLogo size={36} animated={true} showText={true} />
        </motion.div>
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-[#121620] text-slate-500 dark:text-[#D6E5FC]/70 hover:bg-slate-200 dark:hover:bg-[#181d2a] hover:text-slate-900 dark:hover:text-white md:hidden shrink-0 transition-colors"
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
          className="mb-1 flex items-center justify-between px-3 font-sans text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#D6E5FC]/40"
        >
          <span>Navigation</span>
          <span className="text-[9px] font-normal text-[#CAE366]">v20.4</span>
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
                    : 'text-slate-700 dark:text-[#D6E5FC]/75 font-medium hover:bg-slate-100/80 dark:hover:bg-[#121620] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {/* Gliding filled pill indicator */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    transition={indicatorTransition}
                    className="absolute inset-0 rounded-xl bg-slate-900 dark:bg-[#121620] shadow-md ring-1 ring-slate-900/10 dark:ring-white/[0.08]"
                  />
                )}

                {/* Gliding BloomX lime edge bar */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-edge"
                    transition={indicatorTransition}
                    className="absolute bottom-2 left-0 top-2 w-1.5 rounded-r-full bg-[#CAE366] shadow-[0_0_12px_#CAE366] z-10"
                  />
                )}

                <span className="relative z-10 flex items-center gap-3">
                  <span
                    className={`flex transition-colors ${
                      isActive ? 'text-[#CAE366]' : 'text-slate-500 dark:text-[#D6E5FC]/50 group-hover:text-[#4B88FF]'
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
                      className={`relative z-10 rounded-md border px-2 py-0.5 font-sans text-[10px] font-semibold ${
                        isActive
                          ? 'border-[#CAE366]/30 bg-[#CAE366]/10 text-[#CAE366]'
                          : tab.badgeColor || 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#121620] text-slate-600 dark:text-[#D6E5FC]/70'
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
        className="mt-auto space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4"
      >
        <motion.button
          onClick={onOpenExport || onOpenExecutiveReport}
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
            <FileSpreadsheet size={15} />
          </span>
          <span className="relative">Export (CSV / XLS)</span>
        </motion.button>

        <motion.button
          onClick={() => onOpenSettings('presets')}
          whileTap={tapPressSoft}
          initial="rest"
          whileHover="hover"
          animate="rest"
          className="group relative flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent px-3.5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white"
        >
          <span className="flex items-center gap-2.5">
            <span className="flex text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              <Settings size={16} />
            </span>
            <span>Crawler Settings</span>
          </span>
          <span className="font-mono text-[10px] uppercase text-slate-400 dark:text-slate-500">Config</span>
        </motion.button>

        {/* Theme Preference Switcher in Sidebar Footer */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#121620] py-1.5 px-3 mb-2">
          <span className="text-[11px] font-medium text-slate-600 dark:text-[#D6E5FC]/70 flex items-center gap-1.5">
            <span>Theme Mode</span>
          </span>
          <ThemeToggle showLabel={false} />
        </div>

        {/* User Info Profile Tab */}
        <UserMenu />
      </motion.div>
    </aside>
  );
}
