'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { spring, tapPress } from '@/lib/motion';

/**
 * ThemeToggle
 * -----------
 * High-performance, anti-AI-slop theme switcher component.
 * Features spring-physics icon flipping, tactile feedback, and
 * full support for Light, Dark, and System preference.
 */
export default function ThemeToggle({
  showLabel = false,
  variant = 'button', // 'button' | 'segmented' | 'menu'
  className = '',
}) {
  const { theme, resolvedTheme, setTheme, toggleTheme, initTheme, mounted } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  const isDark = mounted ? resolvedTheme === 'dark' : false;

  // Segmented Pill Variant (great for modals or settings)
  if (variant === 'segmented') {
    return (
      <div className={`inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 ${className}`}>
        {[
          { key: 'light', label: 'Light', icon: Sun },
          { key: 'dark', label: 'Dark', icon: Moon },
          { key: 'system', label: 'System', icon: Laptop },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = theme === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTheme(item.key)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                isActive
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="segmented-theme-pill"
                  transition={spring.snap}
                  className="absolute inset-0 rounded-lg bg-white dark:bg-slate-700 shadow-xs ring-1 ring-slate-900/5 dark:ring-white/10"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={14} className={isActive ? (item.key === 'dark' ? 'text-indigo-500 dark:text-indigo-400' : item.key === 'light' ? 'text-amber-500' : 'text-slate-600 dark:text-slate-300') : ''} />
                <span>{item.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Quick Action Button Variant with Optional Dropdown on Long Click / Context
  return (
    <div className={`relative inline-flex items-center ${className}`} ref={menuRef}>
      <motion.button
        type="button"
        onClick={toggleTheme}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        whileTap={tapPress}
        whileHover={{ scale: 1.04 }}
        transition={spring.press}
        className={`group relative flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
          isDark
            ? 'border-slate-700/80 bg-slate-800/90 text-slate-200 hover:border-slate-600 hover:bg-slate-700/90 hover:text-white shadow-xs'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs'
        }`}
        title={`Current: ${theme.toUpperCase()} (${isDark ? 'Dark' : 'Light'}). Click to toggle, right-click for options.`}
        aria-label={`Toggle theme (currently ${isDark ? 'Dark' : 'Light'})`}
      >
        <div className="relative flex h-4 w-4 items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {isDark ? (
              <motion.div
                key="moon-icon"
                initial={{ rotate: -90, scale: 0.2, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 90, scale: 0.2, opacity: 0 }}
                transition={spring.soft}
                className="flex items-center justify-center text-indigo-400"
              >
                <Moon size={15} className="fill-indigo-400/20 text-indigo-400" />
              </motion.div>
            ) : (
              <motion.div
                key="sun-icon"
                initial={{ rotate: 90, scale: 0.2, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: -90, scale: 0.2, opacity: 0 }}
                transition={spring.soft}
                className="flex items-center justify-center text-amber-500"
              >
                <Sun size={15} className="fill-amber-500/20 text-amber-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {showLabel && (
          <span className="font-mono text-[11px] font-bold capitalize">
            {isDark ? 'Dark' : 'Light'}
          </span>
        )}

        {/* Small theme mode indicator badge if set to 'system' */}
        {theme === 'system' && (
          <span className="rounded bg-indigo-500/10 dark:bg-indigo-400/15 px-1 py-0.2 text-[9px] font-mono text-indigo-600 dark:text-indigo-400">
            AUTO
          </span>
        )}
      </motion.button>

      {/* Quick Option Dropdown (triggered via right-click or expanded state) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={spring.soft}
            className="absolute right-0 top-full mt-2 z-50 min-w-[150px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 p-1.5 shadow-xl backdrop-blur-md"
          >
            <div className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Appearance
            </div>
            {[
              { key: 'light', label: 'Light', icon: Sun },
              { key: 'dark', label: 'Dark', icon: Moon },
              { key: 'system', label: 'System (Auto)', icon: Laptop },
            ].map((opt) => {
              const Icon = opt.icon;
              const isSelected = theme === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setTheme(opt.key);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={14} className={isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
                    <span>{opt.label}</span>
                  </span>
                  {isSelected && <Check size={13} className="text-indigo-600 dark:text-indigo-400" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
