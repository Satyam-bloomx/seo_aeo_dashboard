'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { duration, ease, spring, tween, tweenOut } from '@/lib/motion';

/**
 * CustomSelect
 * ------------
 * A bespoke, accessible, light-mode custom select dropdown component
 * designed specifically for AuditPro's design system.
 *
 * Replaces ugly native browser <select> elements with sleek, rounded,
 * spring-animated menus with optional quick-search filtering, active checkmarks,
 * custom color tokens, and keyboard accessibility.
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  label,
  placeholder = 'Select option...',
  valueClassName = 'text-indigo-600 font-bold',
  buttonClassName = '',
  menuClassName = '',
  formatLabel,
  showSearch,
  searchPlaceholder = 'Filter options...',
  disabled = false,
  align = 'left',
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);
  const reduced = useReducedMotion();

  // Normalize options to { value, label, badge, icon } objects
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'object' && opt !== null) {
        return {
          value: opt.value,
          label: opt.label ?? String(opt.value),
          badge: opt.badge,
          icon: opt.icon,
        };
      }
      return {
        value: opt,
        label: formatLabel ? formatLabel(opt) : String(opt).replace(/_/g, ' '),
      };
    });
  }, [options, formatLabel]);

  // Determine if search input should be visible
  const isSearchable = showSearch !== undefined ? showSearch : normalizedOptions.length > 8;

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase();
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        String(opt.value).toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchQuery]);

  // Current selected option object
  const selectedOption = useMemo(() => {
    return (
      normalizedOptions.find((opt) => String(opt.value) === String(value)) || {
        value,
        label: value ? (formatLabel ? formatLabel(value) : String(value).replace(/_/g, ' ')) : placeholder,
      }
    );
  }, [normalizedOptions, value, formatLabel, placeholder]);

  // Handle outside clicks to close the dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && isSearchable && searchInputRef.current) {
      // Small timeout to allow Framer Motion animation to start
      const t = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, isSearchable]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex].value);
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const handleSelect = (val) => {
    onChange?.(val);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  };

  // Menu motion variants
  const menuVariants = {
    initial: { opacity: 0, y: -4, scale: 0.98 },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: tween(duration.micro, ease.outQuart),
    },
    exit: {
      opacity: 0,
      y: -4,
      scale: 0.98,
      transition: tweenOut(duration.micro, ease.outQuart),
    },
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 bg-white border border-slate-200 hover:border-slate-300 p-1 rounded-xl shadow-xs transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-400 cursor-pointer ${
          isOpen ? 'ring-2 ring-indigo-500/15 border-indigo-400' : ''
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate flex-1 pl-1">
          {label && (
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 shrink-0">
              {label}
            </span>
          )}
          <span className={`text-xs truncate text-left ${valueClassName}`}>
            {selectedOption?.label || placeholder}
          </span>
        </div>

        <div className="pr-1.5 text-slate-400 flex items-center shrink-0">
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={spring.press}
          >
            <ChevronDown size={14} className="text-slate-400 hover:text-slate-600 transition-colors" />
          </motion.div>
        </div>
      </button>

      {/* Floating Popover Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={reduced ? undefined : menuVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`absolute top-full mt-1.5 z-50 min-w-[200px] w-full max-w-sm rounded-2xl bg-white/98 backdrop-blur-md border border-slate-200 shadow-xl ring-1 ring-slate-900/5 p-1.5 flex flex-col ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${menuClassName}`}
            role="listbox"
            tabIndex={-1}
          >
            {/* Quick Search Input (if list has many options) */}
            {isSearchable && (
              <div className="p-1 pb-1.5 border-b border-slate-100 mb-1">
                <div className="relative flex items-center">
                  <Search size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 placeholder-slate-400 text-xs font-medium pl-8 pr-7 py-1.5 rounded-lg border border-slate-200/80 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div
              ref={listRef}
              className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-0.5"
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt, index) => {
                  const isSelected = String(opt.value) === String(value);
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <button
                      key={`${opt.value}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(opt.value)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all duration-100 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/90 text-indigo-700 font-bold border border-indigo-100/80 shadow-xs'
                          : isHighlighted
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <span className="truncate">{opt.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {opt.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={spring.press}
                          >
                            <Check size={14} className="text-indigo-600 stroke-[2.5]" />
                          </motion.div>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-6 px-3 text-center text-xs text-slate-400">
                  <p className="font-semibold text-slate-600">No matching options</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different term</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
