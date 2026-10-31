'use client';

import React from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import {
  LayoutDashboard,
  AlertTriangle,
  ListTree,
  Zap,
  Settings,
  FileText,
  FileSpreadsheet,
  Layers,
  Sparkles,
  X,
  ListOrdered,
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

/*
 * Hierarchy: the audit pages first (where you are), then one-off tools (reports, exports), then setup.
 * Only counts get badges, so a badge always means "this many".
 */
const ROW_CLASS =
  'group relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] outline-none transition-colors duration-150';
const IDLE_ROW_CLASS =
  'text-slate-700 dark:text-[#D6E5FC]/75 font-medium hover:bg-slate-100/80 dark:hover:bg-[#121620] hover:text-slate-900 dark:hover:text-white';
const ICON_IDLE_CLASS = 'text-slate-500 dark:text-[#D6E5FC]/50 group-hover:text-[#4B88FF] dark:group-hover:text-[#4B88FF]';

function SectionLabel({ children }) {
  return (
    <motion.div
      variants={staggerItem}
      className="px-3 pb-1 pt-4 first:pt-0 font-sans text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#D6E5FC]/45"
    >
      {children}
    </motion.div>
  );
}

function NavTab({ tab, isActive, onSelect, indicatorTransition }) {
  const Icon = tab.icon;
  return (
    <motion.button
      variants={staggerItem}
      onClick={() => onSelect(tab.id)}
      whileTap={tapPressSoft}
      aria-current={isActive ? 'page' : undefined}
      className={`${ROW_CLASS} ${isActive ? 'text-white font-bold' : IDLE_ROW_CLASS}`}
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
          className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[#CAE366] shadow-[0_0_12px_#CAE366] z-10"
        />
      )}

      <span className="relative z-10 flex min-w-0 items-center gap-3">
        <span className={`flex shrink-0 transition-colors ${isActive ? 'text-[#CAE366]' : ICON_IDLE_CLASS}`}>
          <Icon size={17} />
        </span>
        <span className="truncate">{tab.label}</span>
      </span>

      <AnimatePresence mode="popLayout" initial={false}>
        {tab.count != null && (
          <motion.span
            key={String(tab.count)}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={spring.soft}
            title={tab.countTitle}
            className={`relative z-10 min-w-[1.5rem] shrink-0 rounded-md border px-1.5 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums ${
              isActive
                ? 'border-[#CAE366]/30 bg-[#CAE366]/10 text-[#CAE366]'
                : tab.countClass || 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#121620] text-slate-600 dark:text-[#D6E5FC]/70'
            }`}
          >
            {tab.count}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function ToolRow({ icon: Icon, label, hint, onClick }) {
  return (
    <motion.button variants={staggerItem} onClick={onClick} whileTap={tapPressSoft} title={hint} className={`${ROW_CLASS} ${IDLE_ROW_CLASS}`}>
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex shrink-0 transition-colors ${ICON_IDLE_CLASS}`}>
          <Icon size={17} />
        </span>
        <span className="truncate">{label}</span>
      </span>
    </motion.button>
  );
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenExecutiveReport,
  onOpenExport,
  onOpenSettings,
  onOpenAiAudit,
  pagesCount = 0,
  issuesCount = 0,
  onCloseMobile,
  isMobile = false,
}) {
  const reduced = useReducedMotion();
  const indicatorTransition = reduced ? { duration: 0 } : spring.snap;

  const auditTabs = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'issues', label: 'Issues & Diagnostics', icon: AlertTriangle,
      count: issuesCount > 0 ? issuesCount : null, countTitle: `${issuesCount} issues found`,
      countClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/60',
    },
    {
      id: 'explorer', label: 'URL Data Grid', icon: ListTree,
      count: pagesCount > 0 ? pagesCount : null, countTitle: `${pagesCount} URLs crawled`,
    },
    { id: 'performance', label: 'Speed & Vitals', icon: Zap },
    { id: 'keywords', label: 'Keywords & AI answers', icon: ListOrdered },
  ];
  const integrationsTab = { id: 'integrations', label: 'API Integrations', icon: Layers };

  return (
    <aside className="relative flex h-full w-full select-none flex-col border-r border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#07080B] px-3 py-5 shadow-sm overflow-y-auto custom-scrollbar transition-colors duration-200 font-sans">
      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween(duration.panel, ease.outQuint)}
        className="mb-5 flex items-center justify-between px-1.5 shrink-0 min-w-0"
      >
        <motion.div className="group flex cursor-pointer items-center min-w-0 flex-1 mr-2" whileHover="hover" initial="rest" animate="rest">
          <AuditProLogo size={36} animated={true} showText={true} />
        </motion.div>
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-[#121620] text-slate-500 dark:text-[#D6E5FC]/70 hover:bg-slate-200 dark:hover:bg-[#181d2a] hover:text-slate-900 dark:hover:text-white lg:hidden shrink-0 transition-colors"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        )}
      </motion.div>

      <motion.nav
        aria-label="Main"
        variants={staggerContainer(0.035, 0.06)}
        initial="initial"
        animate="animate"
        className="flex flex-1 flex-col gap-0.5"
      >
        <LayoutGroup id="sidebar-nav">
          <SectionLabel>Audit</SectionLabel>
          {auditTabs.map((tab) => (
            <NavTab key={tab.id} tab={tab} isActive={activeTab === tab.id} onSelect={setActiveTab} indicatorTransition={indicatorTransition} />
          ))}

          <SectionLabel>Reports &amp; tools</SectionLabel>
          {onOpenExecutiveReport && pagesCount > 0 && (
            <ToolRow icon={FileText} label="Client report" hint="Branded PDF report for the client" onClick={onOpenExecutiveReport} />
          )}
          {onOpenAiAudit && (
            <ToolRow icon={Sparkles} label="AI page audit" hint="AI review and copy rewrites for one page" onClick={onOpenAiAudit} />
          )}
          <ToolRow icon={FileSpreadsheet} label="Export data" hint="Download CSV or Excel" onClick={onOpenExport || onOpenExecutiveReport} />

          <SectionLabel>Setup</SectionLabel>
          <NavTab tab={integrationsTab} isActive={activeTab === integrationsTab.id} onSelect={setActiveTab} indicatorTransition={indicatorTransition} />
          <ToolRow icon={Settings} label="Crawler settings" hint="Crawl limits, rendering and exclusions" onClick={() => onOpenSettings('presets')} />
        </LayoutGroup>
      </motion.nav>

      {/* Account */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween(duration.panel, ease.outQuint)}
        className="mt-4 space-y-2 border-t border-slate-200 dark:border-white/[0.08] pt-3"
      >
        <div className="flex items-center justify-between px-3">
          <span className="text-[11px] font-medium text-slate-500 dark:text-[#D6E5FC]/55">Appearance</span>
          <ThemeToggle showLabel={false} />
        </div>
        <UserMenu />
      </motion.div>
    </aside>
  );
}
