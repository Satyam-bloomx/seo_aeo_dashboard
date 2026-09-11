'use client';
import React, { useState, useEffect } from 'react';
import { DialogTitle } from '@headlessui/react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import AnimatedModal from '@/components/ui/AnimatedModal';
import CustomSelect from '@/components/ui/CustomSelect';
import { spring, staggerContainer, staggerItem, tabPanel, tapPress } from '@/lib/motion';
import { X, Sliders, Gauge, Globe, Bot, Check, Sparkles } from 'lucide-react';

const PRESETS = [
  {
    id: 'standard',
    name: 'Standard Audit',
    badge: 'Recommended',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: 'Up to 500 pages, 4 levels deep. Fast & balanced.',
    settings: { maxPages: 500, maxDepth: 4, maxConcurrent: 5, stealthDelay: 0 }
  },
  {
    id: 'quick',
    name: 'Quick Scan',
    badge: 'Fastest',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    desc: '100 pages, 2 levels deep. Great for quick health checks.',
    settings: { maxPages: 100, maxDepth: 2, maxConcurrent: 5, stealthDelay: 0 }
  },
  {
    id: 'deep',
    name: 'Full Site Crawl',
    badge: 'Comprehensive',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    desc: '2,500 pages, 10 levels deep. Thorough site coverage.',
    settings: { maxPages: 2500, maxDepth: 10, maxConcurrent: 5, stealthDelay: 0.5 }
  },
  {
    id: 'stealth',
    name: 'Gentle / Stealth',
    badge: 'Low Load',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    desc: '500 pages with 1s pause between requests. Protects server.',
    settings: { maxPages: 500, maxDepth: 4, maxConcurrent: 2, stealthDelay: 1.0 }
  }
];

// Hoisted to module scope: defining it inside the component would create a new
// component type on every render, remounting the card and killing the tick
// animation each time a checkbox is toggled.
const CheckboxCard = ({ label, checked, onChange, description }) => (
  <motion.div
    onClick={() => onChange({ target: { checked: !checked } })}
    whileHover={{ y: -2 }}
    whileTap={{ scale: 0.99 }}
    transition={spring.press}
    role="checkbox"
    aria-checked={checked}
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onChange({ target: { checked: !checked } });
      }
    }}
    className={`p-4 rounded-xl border cursor-pointer flex items-start space-x-3.5 select-none ${
      checked
        ? 'bg-indigo-50/70 border-indigo-300 shadow-xs'
        : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
    }`}
  >
    <div className="pt-0.5">
      <motion.div
        animate={{
          backgroundColor: checked ? '#4F46E5' : '#FFFFFF',
          borderColor: checked ? '#4F46E5' : '#CBD5E1',
        }}
        transition={{ duration: 0.15 }}
        className="w-5 h-5 rounded-md border flex items-center justify-center text-white"
      >
        <AnimatePresence initial={false}>
          {checked && (
            <motion.span
              key="tick"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={spring.soft}
              className="flex"
            >
              <Check size={14} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
    <div className="flex-1">
      <span className="text-sm font-semibold text-slate-900 block">{label}</span>
      {description && <span className="text-xs text-slate-500 block mt-0.5 leading-relaxed">{description}</span>}
    </div>
  </motion.div>
);

export default function SettingsModal({ isOpen, onClose, initialSettings, onSave, defaultTab = 'presets' }) {
  const [settings, setSettings] = useState(initialSettings);
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (isOpen && initialSettings) {
      setSettings(initialSettings);
      setActiveTab(defaultTab || 'presets');
    }
  }, [isOpen, initialSettings, defaultTab]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const activePresetId = PRESETS.find(p =>
    p.settings.maxPages === settings?.maxPages &&
    p.settings.maxDepth === settings?.maxDepth &&
    p.settings.maxConcurrent === settings?.maxConcurrent &&
    p.settings.stealthDelay === settings?.stealthDelay
  )?.id || 'custom';

  const applyPreset = (preset) => {
    setSettings(prev => ({
      ...prev,
      ...preset.settings
    }));
  };

  const sidebarTabs = [
    { id: 'presets', label: 'Quick Presets', icon: <Sparkles size={16} />, desc: '1-click crawler profiles' },
    { id: 'limits', label: 'Limits & Speed', icon: <Gauge size={16} />, desc: 'Max pages, depth & threads' },
    { id: 'url', label: 'URL Rules', icon: <Globe size={16} />, desc: 'Exclusions & parameters' },
    { id: 'behavior', label: 'Spider Behavior', icon: <Bot size={16} />, desc: 'Robots.txt & JS rendering' },
  ];

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      panelClassName="h-[90vh] sm:h-[85vh] max-h-[800px]"
    >
      {/* Top Header */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs shrink-0">
            <Sliders size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle as="h2" className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Crawler Configuration Console
              </DialogTitle>
              {activePresetId !== 'custom' ? (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Mode: {PRESETS.find(p => p.id === activePresetId)?.name}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Mode: Custom Setup
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">Fine-tune crawling limits, speed, headers and robot behavior</p>
          </div>
        </div>
        <motion.button
          onClick={onClose}
          whileHover={{ rotate: 90, scale: 1.1 }}
          whileTap={tapPress}
          transition={spring.press}
          aria-label="Close settings"
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 shrink-0"
        >
          <X size={18} />
        </motion.button>
      </div>

      {/* Main Body: Left Vertical/Horizontal Sidebar + Right Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left Sidebar on desktop, horizontal tabs on mobile */}
        <div className="w-full md:w-60 bg-slate-50/70 border-b md:border-b-0 md:border-r border-slate-200 p-2 md:p-3 flex flex-row md:flex-col gap-1 shrink-0 overflow-x-auto md:overflow-y-auto custom-scrollbar">
          <div className="hidden md:block px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            Settings Menu
          </div>
          <LayoutGroup id="settings-nav">
            {sidebarTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  whileTap={{ scale: 0.985 }}
                  transition={spring.press}
                  aria-current={isActive ? 'true' : undefined}
                  className={`relative flex items-center md:items-start gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-xl text-left select-none outline-none shrink-0 whitespace-nowrap md:whitespace-normal ${
                    isActive ? 'text-white font-bold' : 'text-slate-600 font-semibold hover:bg-slate-100/80 transition-colors duration-150'
                  }`}
                >
                  {/* Shared-layout pill: glides between rows instead of cutting. */}
                  {isActive && (
                    <motion.span
                      layoutId="settings-active-pill"
                      transition={spring.snap}
                      className="absolute inset-0 -z-10 rounded-xl bg-slate-900 shadow-xs"
                    />
                  )}
                  <motion.div
                    animate={{ color: isActive ? '#818CF8' : '#94A3B8' }}
                    transition={spring.press}
                    className="shrink-0"
                  >
                    {tab.icon}
                  </motion.div>
                  <div>
                    <div className="text-xs leading-tight">{tab.label}</div>
                    <div className={`hidden md:block text-[10px] mt-0.5 ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                      {tab.desc}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </LayoutGroup>
        </div>

        {/* Right Main Content Panel - cross-faded on tab change */}
        <div className="flex-1 bg-white overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                  <AnimatePresence mode="wait" initial={false}>

                  {/* TAB 1: QUICK PRESETS */}
                  {activeTab === 'presets' && (
                    <motion.div key="presets" variants={tabPanel} initial="initial" animate="animate" exit="exit" className="space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider">Select Audit Profile</span>
                        <span className="text-xs text-slate-500">Click any mode to apply instantly</span>
                      </div>

                      <motion.div
                        variants={staggerContainer(0.05)}
                        initial="initial"
                        animate="animate"
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
                      >
                        {PRESETS.map((preset) => {
                          const isSelected = activePresetId === preset.id;
                          return (
                            <motion.div
                              key={preset.id}
                              variants={staggerItem}
                              onClick={() => applyPreset(preset)}
                              whileHover={{ y: -3 }}
                              whileTap={{ scale: 0.98 }}
                              transition={spring.press}
                              className={`p-4 rounded-xl border cursor-pointer relative flex flex-col justify-between transition-all ${
                                isSelected
                                  ? 'bg-indigo-50/80 border-indigo-500 shadow-xs ring-2 ring-indigo-500/25'
                                  : 'bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-sm">{preset.name}</span>
                                  {isSelected && (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-100/90 px-1.5 py-0.5 rounded-md border border-indigo-200">
                                      <Check size={11} strokeWidth={3} /> Active
                                    </span>
                                  )}
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${preset.badgeColor}`}>
                                  {preset.badge}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed mb-3">{preset.desc}</p>

                              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 font-mono font-medium">
                                <span>{preset.settings.maxPages} pages</span>
                                <span>Depth {preset.settings.maxDepth}</span>
                                <span>{preset.settings.stealthDelay === 0 ? 'Max Speed' : `${preset.settings.stealthDelay}s delay`}</span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    </motion.div>
                  )}

                  {/* TAB 2: LIMITS & SPEED */}
                  {activeTab === 'limits' && (
                    <motion.div key="limits" variants={tabPanel} initial="initial" animate="animate" exit="exit" className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Maximum Page Limit
                          </label>
                          <input
                            type="number"
                            min="1" max="10000"
                            value={settings?.maxPages ?? 500}
                            onChange={(e) => handleChange('maxPages', parseInt(e.target.value) || 1)}
                            className="w-full glass-input px-3.5 py-2.5 font-mono text-sm"
                          />
                          <span className="text-xs text-slate-500 mt-1 block">Maximum URLs saved during this audit run.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Crawl Depth (Click Distance)
                          </label>
                          <input
                            type="number"
                            min="1" max="100"
                            value={settings?.maxDepth ?? 4}
                            onChange={(e) => handleChange('maxDepth', parseInt(e.target.value) || 1)}
                            className="w-full glass-input px-3.5 py-2.5 font-mono text-sm"
                          />
                          <span className="text-xs text-slate-500 mt-1 block">How many link clicks deep from the homepage.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Parallel Worker Threads
                          </label>
                          <CustomSelect
                            value={settings?.maxConcurrent ?? 5}
                            onChange={(val) => handleChange('maxConcurrent', parseInt(val))}
                            options={[
                              { value: 1, label: '1 Worker (Slow & gentle)' },
                              { value: 3, label: '3 Workers (Moderate speed)' },
                              { value: 5, label: '5 Workers (Fast - Default)' },
                              { value: 8, label: '8 Workers (High throughput)' },
                              { value: 10, label: '10 Workers (Maximum speed)' },
                            ]}
                            buttonClassName="py-2 px-3"
                            valueClassName="text-slate-800 font-semibold font-mono text-xs"
                          />
                          <span className="text-xs text-slate-500 mt-1 block">Simultaneous crawler connections.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Request Delay (Stealth Mode)
                          </label>
                          <CustomSelect
                            value={settings?.stealthDelay ?? 0}
                            onChange={(val) => handleChange('stealthDelay', parseFloat(val))}
                            options={[
                              { value: 0, label: '0s (Fastest - Max throughput)' },
                              { value: 0.5, label: '0.5s pause (Light throttle)' },
                              { value: 1.0, label: '1.0s pause (Moderate stealth)' },
                              { value: 2.0, label: '2.0s pause (Polite delay)' },
                              { value: 5.0, label: '5.0s pause (Safest anti-blocking)' },
                            ]}
                            buttonClassName="py-2 px-3"
                            valueClassName="text-slate-800 font-semibold font-mono text-xs"
                          />
                          <span className="text-xs text-slate-500 mt-1 block">Pause between page downloads.</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: URL RULES */}
                  {activeTab === 'url' && (
                    <motion.div key="url" variants={tabPanel} initial="initial" animate="animate" exit="exit" className="space-y-4">
                      <CheckboxCard
                        label="Strip URL Query Parameters"
                        description="Automatically removes tracking parameters (e.g. ?sort=asc, ?utm=source) so duplicate URL variants aren't crawled."
                        checked={settings?.ignoreUrlParams ?? true}
                        onChange={(e) => handleChange('ignoreUrlParams', e.target.checked)}
                      />
                      <CheckboxCard
                        label="Check External Outbound Links"
                        description="Tests external outbound links for 404 broken links without recursively crawling the external sites."
                        checked={settings?.checkExternalLinks ?? false}
                        onChange={(e) => handleChange('checkExternalLinks', e.target.checked)}
                      />
                      <div className="pt-2">
                        <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Exclude Paths (One per line)
                        </label>
                        <textarea
                          value={settings?.excludePaths ?? ""}
                          onChange={(e) => handleChange('excludePaths', e.target.value)}
                          placeholder="/cart&#10;/checkout&#10;/wp-admin&#10;/search"
                          className="w-full h-24 glass-input px-3.5 py-2.5 font-mono text-xs resize-none"
                        />
                        <span className="text-xs text-slate-500 mt-1 block">URLs matching these patterns will be skipped.</span>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 4: SPIDER RULES */}
                  {activeTab === 'behavior' && (
                    <motion.div key="behavior" variants={tabPanel} initial="initial" animate="animate" exit="exit" className="space-y-4">
                      <CheckboxCard
                        label="Ignore robots.txt Restrictions"
                        description="Bypasses Disallow rules in robots.txt. Useful for staging audits."
                        checked={settings?.ignoreRobots ?? false}
                        onChange={(e) => handleChange('ignoreRobots', e.target.checked)}
                      />
                      <CheckboxCard
                        label="Enable JavaScript Rendering (Playwright)"
                        description="Renders client-side JS for Single Page Apps (React/Vue/Angular)."
                        checked={settings?.jsRendering ?? false}
                        onChange={(e) => handleChange('jsRendering', e.target.checked)}
                      />
                      <div className="pt-2">
                        <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          User-Agent Header
                        </label>
                        <CustomSelect
                          value={settings?.userAgent ?? "SEO-Spider-Bot"}
                          onChange={(val) => handleChange('userAgent', val)}
                          options={[
                            { value: "SEO-Spider-Bot", label: "Default Crawler (SEO-Spider-Bot)" },
                            { value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", label: "Standard Chrome Desktop" },
                            { value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", label: "Googlebot Desktop" },
                            { value: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", label: "Googlebot Mobile" },
                          ]}
                          buttonClassName="py-2 px-3"
                          valueClassName="text-slate-800 font-semibold font-mono text-xs"
                        />
                      </div>
                    </motion.div>
                  )}

                  </AnimatePresence>
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
                <motion.button
                  type="button"
                  onClick={onClose}
                  whileTap={tapPress}
                  transition={spring.press}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200/60 transition-colors"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleSave}
                  whileTap={tapPress}
                  transition={spring.press}
                  className="btn-primary py-2 px-5 text-xs font-bold gap-2 shadow-xs"
                >
                  <Check size={15} />
                  Save &amp; Apply Settings
                </motion.button>
              </div>

    </AnimatedModal>
  );
}
