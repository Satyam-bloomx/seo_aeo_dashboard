'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ExternalLink,
  Copy,
  Key,
  Trash2,
  Edit3,
  Sliders,
  FileText,
  RotateCw,
  Search,
  X
} from 'lucide-react';

import {
  BrushOrangeTabSVG,
  BrushOrangeBtnSVG,
  BrushGreenBannerSVG,
  BrushFilterPillSVG,
  ClawSlashSVG
} from './components/PureVectorBrushes';
import {
  SakuraBlossoms,
  BambooPagoda,
  PineBonsaiPurple,
  ToriiCranesIndigo
} from './components/CardFloralArt';
import { CornerBrackets } from './components/CornerHardware';
import { PineTreeSumiSVG } from './components/PineTreeSumiSVG';
import { ScrollBannerFrameSVG } from './components/ScrollBannerSVG';
import { EnsoBrandLogo } from './components/SidebarMotifs';

export default function NarutoSamplePanel({ onExit }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeFilter, setActiveFilter] = useState('all');
  const [copiedKey, setCopiedKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleTestLive = () => {
    setIsTesting(true);
    setTimeout(() => {
      setIsTesting(false);
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 3000);
    }, 1200);
  };

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (isActive) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill={isActive ? '#060a12' : 'none'} stroke={isActive ? '#060a12' : 'currentColor'} strokeWidth={isActive ? '1.5' : '2'}>
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>
      )
    },
    {
      id: 'issues',
      label: 'Issues & Diagnostics',
      icon: (isActive) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#060a12' : 'currentColor'} strokeWidth="2">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      )
    },
    {
      id: 'explorer',
      label: 'URL Data Grid',
      icon: (isActive) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#060a12' : 'currentColor'} strokeWidth="2">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="M3 9h18"/>
          <path d="M9 21V9"/>
        </svg>
      )
    },
    {
      id: 'performance',
      label: 'Speed & Vitals',
      pill: 'Lighthouse',
      icon: (isActive) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#060a12' : 'currentColor'} strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      )
    },
    {
      id: 'integrations',
      label: 'API Integrations',
      pill: 'SEO/AEO',
      icon: (isActive) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#060a12' : 'currentColor'} strokeWidth="2">
          <rect width="20" height="14" x="2" y="5" rx="2"/>
          <line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
      )
    }
  ];

  const filterTabs = [
    { id: 'all', label: 'All', count: 7, icon: null },
    { id: 'speed', label: 'Speed & Vitals', count: 1, icon: '⚡' },
    { id: 'aeo', label: 'AEO Voice & LLM', count: 2, icon: '🌀' },
    { id: 'geo', label: 'GEO Local Search', count: 2, icon: '📍' },
    { id: 'analytics', label: 'Analytics & Traffic', count: 2, icon: '📈' },
  ];

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen overflow-hidden bg-[#070b12] text-slate-100 font-sans select-none flex">
      
      {/* ------------------------------------------------------------------ */}
      {/* Google Fonts & Japanese Textures                                   */}
      {/* ------------------------------------------------------------------ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Sedgwick+Ave+Display&family=Yuji+Boku&family=Cinzel:wght@600;800&display=swap');
        
        .font-ink-title {
          font-family: 'Kaushan Script', 'Sedgwick Ave Display', cursive;
        }
        
        .font-kanji {
          font-family: 'Yuji Boku', serif;
        }

        /* Organic Washi Paper Textures for Cards */
        .washi-parchment-gold {
          background-color: #fdfaf3;
          background-image: 
            radial-gradient(#e4cfb2 0.75px, transparent 0.75px),
            radial-gradient(#eedcc2 0.75px, #fdfaf3 0.75px);
          background-size: 16px 16px;
          background-position: 0 0, 8px 8px;
        }

        .washi-parchment-cyan {
          background-color: #f4f9fd;
          background-image: 
            radial-gradient(#c8e2f4 0.75px, transparent 0.75px),
            radial-gradient(#dff0fc 0.75px, #f4f9fd 0.75px);
          background-size: 16px 16px;
          background-position: 0 0, 8px 8px;
        }

        .washi-parchment-purple {
          background-color: #faf6fd;
          background-image: 
            radial-gradient(#e2d2f5 0.75px, transparent 0.75px),
            radial-gradient(#eee2fc 0.75px, #faf6fd 0.75px);
          background-size: 16px 16px;
          background-position: 0 0, 8px 8px;
        }

        .washi-parchment-indigo {
          background-color: #f6f7fe;
          background-image: 
            radial-gradient(#d7dbfb 0.75px, transparent 0.75px),
            radial-gradient(#e5e8fd 0.75px, #f6f7fe 0.75px);
          background-size: 16px 16px;
          background-position: 0 0, 8px 8px;
        }
      `}</style>

      {/* ------------------------------------------------------------------ */}
      {/* Pristine Full-Screen Konoha Sunset Panorama Backdrop               */}
      {/* ------------------------------------------------------------------ */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 80% 25%, rgba(245, 130, 32, 0.22) 0%, transparent 65%),
            linear-gradient(to bottom, rgba(8, 12, 18, 0.75) 0%, rgba(6, 10, 16, 0.94) 100%),
            url('/naruto_assets/konoha_sunset_clean.jpg')
          `,
        }}
      />

      {/* =================================================================== */}
      {/* 1. LEFT SIDEBAR (Dark Sumi-e Translucent Glass + Pure SVG Tree)     */}
      {/* =================================================================== */}
      <aside className="relative z-20 w-64 h-full flex flex-col justify-between p-5 bg-[#060a12]/85 border-r border-amber-900/35 backdrop-blur-md shrink-0">
        
        <div className="relative z-10">
          {/* Brand Logo: Enso Circle with Mountain Silhouette */}
          <EnsoBrandLogo />

          {/* Navigation Links with Pure SVG Active Brush Stroke */}
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <div 
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="relative w-full h-11 flex items-center px-4 cursor-pointer select-none group transition-all"
                >
                  {isActive ? (
                    <>
                      <BrushOrangeTabSVG />
                      <div className="relative z-10 flex items-center justify-between w-full font-black text-sm text-[#060a12] drop-shadow-xs whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {item.icon(true)}
                          <span>{item.label}</span>
                        </div>
                        {item.pill && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-[#060a12]/20 text-[#060a12] border border-[#060a12]/30 shrink-0">
                            {item.pill}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full text-sm font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        {item.icon(false)}
                        <span>{item.label}</span>
                      </div>
                      {item.pill && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                          item.id === 'performance' 
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        }`}>
                          {item.pill}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer & Traditional Pine Tree Silhouette */}
        <div className="relative pt-4 border-t border-white/10 z-10">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/15 transition-colors shadow-sm mb-3 cursor-pointer">
            <FileText size={14} className="text-amber-400" />
            <span>Executive PDF Report</span>
          </button>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-2">
            <span className="flex items-center gap-1.5">
              <span>⚙️</span> Crawler Settings
            </span>
            <span className="font-mono text-amber-500 font-bold">CONFIG</span>
          </div>

          {/* 100% Pure SVG Sumi-e Japanese Pine Tree in Bottom Left */}
          <PineTreeSumiSVG />
        </div>
      </aside>

      {/* =================================================================== */}
      {/* 2. MAIN VIEWPORT (Top Search Bar, Scroll Banner, Cards Grid)        */}
      {/* =================================================================== */}
      <main className="relative z-10 flex-1 h-full overflow-y-auto p-6 md:p-8 flex flex-col justify-between">
        
        <div className="flex flex-col gap-5 max-w-6xl w-full mx-auto pb-4">
          
          {/* TOP COMMAND HEADER: Inked Search Bar + Pure SVG Dry-Brush Run Audit Button */}
          <header className="flex flex-wrap items-center gap-3">
            
            {/* Hand-Inked Search Bar */}
            <div className="flex-1 min-w-[340px] flex items-center bg-[#070d16f2] border-2 border-[#d49948]/60 rounded-full pl-4 pr-1.5 py-1 shadow-2xl backdrop-blur-md focus-within:border-[#f26a1b] focus-within:ring-2 focus-within:ring-[#f26a1b]/30 transition-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e59a38" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mr-2.5 shrink-0 opacity-90">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>

              <input
                type="text"
                defaultValue="https://bloomxsolutions.com/"
                placeholder="Enter seed URL to crawl (e.g. https://bloomxsolutions.com/)..."
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none border-none py-1.5 font-mono"
              />

              {/* Exact Pure SVG Orange Dry-Brush "Run Audit" Button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleTestLive}
                className="relative flex items-center justify-center px-8 py-2 cursor-pointer shrink-0 select-none group"
                style={{ minWidth: '150px', height: '40px' }}
              >
                <BrushOrangeBtnSVG />
                <span className="relative z-10 flex items-center gap-2 font-black text-[13px] text-[#060a12] drop-shadow-xs tracking-wide">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#060a12">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span>{isTesting ? 'AUDITING...' : 'Run Audit'}</span>
                </span>
              </motion.button>
            </div>

            {/* Intro Action Button */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleTestLive}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-white shadow-xl backdrop-blur-md cursor-pointer transition-all"
              style={{
                background: 'radial-gradient(ellipse at top, #1c2738 0%, #0a111b 100%)',
                border: '1.5px solid rgba(224, 164, 88, 0.45)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.15)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="#e59a38" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M3 3v5h5" stroke="#e59a38" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" stroke="#e59a38" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M21 21v-5h-5" stroke="#e59a38" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="tracking-wide text-slate-100">Intro</span>
            </motion.button>

            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-mono text-slate-300 bg-[#070d16ea] border border-[#d49948]/40 hover:border-[#f26a1b] hover:text-white backdrop-blur-md transition-all shadow-md cursor-pointer">
              <Sliders size={13} className="text-amber-400" />
              <span>Limit: <strong className="text-white">500</strong> | Depth: <strong className="text-white">4</strong></span>
            </button>

            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold text-slate-300 bg-[#070d16ea] border border-[#d49948]/40 hover:border-[#f26a1b] hover:text-white backdrop-blur-md transition-all shadow-md cursor-pointer">
              <FileText size={13} className="text-amber-400" />
              <span>PDF Report</span>
            </button>
          </header>

          {/* PAGE TITLE: Pure SVG Inked Claw Slash + Japanese Calligraphy */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3.5">
                <ClawSlashSVG size={34} />
                <h1 className="text-3xl md:text-4xl font-ink-title font-bold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] flex items-center">
                  API Integrations Hub
                </h1>
              </div>

              <p className="text-xs md:text-sm text-slate-400 mt-1 max-w-3xl">
                Connect enterprise APIs to enrich live crawler audits with Core Web Vitals, AEO Voice & LLM Readiness, and GEO Local data.
              </p>
            </div>

            <button 
              onClick={handleTestLive}
              className="self-start md:self-auto flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-slate-300 bg-[#070d16ea] border border-[#d49948]/40 hover:border-[#f26a1b] hover:text-white backdrop-blur-md transition-all shadow-md cursor-pointer"
            >
              <RotateCw size={13} className={`text-amber-400 ${isTesting ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>

          {/* =============================================================== */}
          {/* NINJA JUTSU SCROLL BANNER (100% Pure SVG Frame & Spools)        */}
          {/* =============================================================== */}
          <div 
            className="relative rounded-xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl overflow-hidden text-slate-800 min-h-[90px]"
            style={{
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            }}
          >
            {/* Pure SVG Scroll Frame */}
            <ScrollBannerFrameSVG />

            <div className="flex items-center gap-4 pl-3.5 z-10">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden shadow-md"
                style={{
                  background: 'radial-gradient(circle, #e03232 0%, #9e1b1b 85%, #6d0a0a 100%)',
                  border: '2px dashed #fca5a5',
                  boxShadow: '0 4px 12px rgba(158, 27, 27, 0.5)',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs md:text-sm font-black tracking-wider text-[#1e293b]">
                    LIVE AUDIT ENRICHMENT STATUS
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#faebd7] text-[#c25e19] border border-[#f2b88b]">
                    2 of 7 Active
                  </span>
                </div>
                <p className="text-[11px] md:text-xs text-slate-600 mt-0.5">
                  Active APIs automatically hook into the crawl pipeline to enrich URLs with AI benchmarks and real performance metrics.
                </p>
              </div>
            </div>

            {/* Pure SVG Green Dry-Brush "2 Engines Synchronized" Banner */}
            <div className="relative z-10 pr-2 shrink-0">
              <div 
                className="relative flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-black text-emerald-100 select-none"
                style={{ minWidth: '220px', height: '42px' }}
              >
                <BrushGreenBannerSVG />
                <span className="relative z-10 flex h-2.5 w-2.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                </span>
                <span className="relative z-10 tracking-wide font-extrabold text-white drop-shadow-xs">
                  2 Engines Synchronized
                </span>
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* FILTER TABS ROW: Interactive Pure SVG Orange Brush Pill         */}
          {/* =============================================================== */}
          <div className="flex flex-wrap items-center gap-3">
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer select-none ${
                    isActive
                      ? 'text-white'
                      : 'bg-[#070d16ea] text-slate-300 border border-[#d49948]/35 hover:border-[#f26a1b] hover:text-white'
                  }`}
                  style={isActive ? { minHeight: '36px' } : {}}
                >
                  {isActive && <BrushFilterPillSVG />}
                  
                  <span className={`relative z-10 flex items-center gap-2 ${isActive ? 'bg-[#080d16] rounded-full px-3 py-1.5 shadow-inner' : ''}`}>
                    {tab.icon && <span>{tab.icon}</span>}
                    <span className={isActive ? 'font-extrabold text-white' : ''}>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-[#1b2838] text-white font-black shadow-inner' : 'text-slate-400'
                    }`}>
                      {tab.count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* =============================================================== */}
          {/* THE 4 CARDS GRID (Pristine Washi Paper, Ornate Hardware Frames)  */}
          {/* 100% Pure SVG Japanese Floral & Botanical Watercolor Artwork     */}
          {/* =============================================================== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* CARD 1: Google PageSpeed Insights (Golden Scroll + Pure SVG Sakura) */}
            <motion.div 
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden washi-parchment-gold text-slate-800 border-2 border-[#caa062]"
              style={{
                boxShadow: 'inset 0 0 35px rgba(185, 120, 35, 0.22), 0 12px 36px rgba(0,0,0,0.6)',
              }}
            >
              {/* Pure SVG Ornate Brass Hardware Corner Brackets */}
              <CornerBrackets theme="gold" />

              {/* Inner Inking Line with Decorative Border */}
              <div className="absolute inset-2.5 rounded-xl border border-[#caa062]/45 pointer-events-none z-10" />

              {/* Pure SVG Hand-Crafted Japanese Sakura Branch & Petals */}
              <SakuraBlossoms />

              <div className="relative z-10">
                <div className="flex items-start gap-4 mb-3.5">
                  {/* Concentric Golden Lightning Medallion */}
                  <div 
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg relative bg-white"
                    style={{
                      border: '2.5px solid #e59a38',
                      background: 'radial-gradient(circle, #fde4cb 0%, #f6c093 70%, #d97706 100%)',
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#b45309" stroke="#78350f" strokeWidth="1.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-base text-[#0a0f18] tracking-tight">Google PageSpeed Insights</h3>
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#d1fae5] text-[#065f46] border border-[#a7f3d0]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Connected
                      </div>
                    </div>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider bg-[#faebd7] text-[#b45309] border border-[#fcd34d]">
                      SPEED & VITALS
                    </span>
                  </div>

                  <a href="#" className="text-slate-400 hover:text-slate-700">
                    <ExternalLink size={15} />
                  </a>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  Retrieves live mobile & desktop Lighthouse performance scores, Core Web Vitals (LCP, CLS, INP), and speed opportunities.
                </p>

                <div className="flex items-center justify-between bg-black/5 border border-dashed border-black/20 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 mb-4">
                  <span className="flex items-center gap-2">
                    <Key size={13} className="text-amber-700" />
                    API Key: <strong className="text-slate-900">AIza....DQ2Q</strong>
                  </span>
                  <button 
                    onClick={() => handleCopy('AIzaSyD92k1-DEMO-KEY')}
                    className="text-slate-500 hover:text-slate-800 text-xs font-sans flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>{copiedKey ? 'Copied!' : ''}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-black/10 relative z-10">
                <button 
                  onClick={handleTestLive}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold text-amber-950 bg-amber-200/90 hover:bg-amber-300 border border-amber-400 shadow-xs transition-all cursor-pointer"
                >
                  <span>▶</span>
                  <span>{testSuccess ? '✓ Validated' : 'Test Live'}</span>
                </button>

                <div className="flex items-center gap-3 text-xs font-semibold">
                  <button className="flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-pointer">
                    <Edit3 size={12} />
                    <span>Update</span>
                  </button>
                  <button className="flex items-center gap-1 text-rose-700 hover:text-rose-900 cursor-pointer">
                    <Trash2 size={12} />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            </motion.div>

            {/* CARD 2: OpenAI GPT-4o Engine (Cool Misty Azure + Pure SVG Bamboo) */}
            <motion.div 
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden washi-parchment-cyan text-slate-800 border-2 border-[#8ecae6]"
              style={{
                boxShadow: 'inset 0 0 35px rgba(35, 115, 185, 0.2), 0 12px 36px rgba(0,0,0,0.6)',
              }}
            >
              {/* Pure SVG Corner Hardware in Cool Steel Blue */}
              <CornerBrackets theme="cyan" />

              <div className="absolute inset-2.5 rounded-xl border border-[#8ecae6]/45 pointer-events-none z-10" />

              {/* Pure SVG Bamboo Stalks, Pagoda & Mist Watercolor */}
              <BambooPagoda />

              <div className="relative z-10">
                <div className="flex items-start gap-4 mb-3.5">
                  {/* 8-Point Compass Star Shuriken Medallion */}
                  <div 
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg relative bg-[#0284c7]"
                    style={{
                      border: '2.5px solid #38bdf8',
                      boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                    }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9 12 2"/>
                      <circle cx="12" cy="12" r="3" fill="#38bdf8"/>
                    </svg>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-base text-[#0a0f18] tracking-tight">OpenAI GPT-4o Engine</h3>
                      <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-600 border border-slate-300">
                        Disconnected
                      </div>
                    </div>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]">
                      AEO VOICE & LLM
                    </span>
                  </div>

                  <a href="#" className="text-slate-400 hover:text-slate-700">
                    <ExternalLink size={15} />
                  </a>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-6">
                  Enriches page content with AI Answer Engine Optimization (AEO) readiness, conversational voice search score, and extractability.
                </p>
              </div>

              <div className="pt-3 relative z-10">
                <button 
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-extrabold text-white shadow-xl transition-all hover:scale-[1.01] cursor-pointer"
                  style={{
                    background: 'linear-gradient(90deg, #090e18 0%, #172437 100%)',
                    boxShadow: '0 4px 14px rgba(9, 14, 24, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Key size={13} className="text-cyan-400" />
                  <span>Configure API Key</span>
                </button>
              </div>
            </motion.div>

            {/* CARD 3: Perplexity AI Citations (Purple Scroll + Pure SVG Bonsai Pine) */}
            <motion.div 
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden washi-parchment-purple text-slate-800 border-2 border-[#6d4ba8]"
              style={{
                boxShadow: 'inset 0 0 35px rgba(91, 62, 140, 0.22), 0 12px 36px rgba(0,0,0,0.6)',
              }}
            >
              {/* Pure SVG Ornate Purple Metallic Corner Brackets */}
              <CornerBrackets theme="purple" />

              <div className="absolute inset-2.5 rounded-xl border border-[#6d4ba8]/45 pointer-events-none z-10" />

              {/* Pure SVG Purple Watercolor Bonsai Pine Tree */}
              <PineBonsaiPurple />

              <div className="relative z-10">
                <div className="flex items-start gap-4 mb-3.5">
                  <div 
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg relative bg-white"
                    style={{
                      border: '2.5px solid #5f3e8f',
                      boxShadow: '0 4px 14px rgba(95, 62, 143, 0.35)',
                    }}
                  >
                    <div className="absolute inset-1 rounded-full border border-[#8b68c4]/40" />
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b2e75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                      <path d="M2 12h20"/>
                    </svg>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-base text-[#0a0f18] tracking-tight">Perplexity AI Citations</h3>
                      <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#edf2f7] text-[#4a5568] border border-slate-300">
                        Disconnected
                      </div>
                    </div>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider bg-[#ebf8ff] text-[#2b6cb0] border border-[#bee3f8]">
                      AEO VOICE & LLM
                    </span>
                  </div>

                  <a href="#" className="text-slate-400 hover:text-slate-700">
                    <ExternalLink size={15} />
                  </a>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed mb-6 max-w-sm">
                  Performs live generative citation audits to benchmark whether your domain is cited in conversational AI search results.
                </p>
              </div>

              <div className="pt-3 relative z-10">
                <button 
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-extrabold text-white shadow-xl transition-all hover:scale-[1.01] cursor-pointer"
                  style={{
                    background: 'linear-gradient(90deg, #090e18 0%, #172437 100%)',
                    boxShadow: '0 4px 14px rgba(9, 14, 24, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Key size={13} className="text-purple-400" />
                  <span>Configure API Key</span>
                </button>
              </div>
            </motion.div>

            {/* CARD 4: SerpAPI Search Engine (Pure SVG Torii Gate & Cranes) */}
            <motion.div 
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden washi-parchment-indigo text-slate-800 border-2 border-[#818cf8]"
              style={{
                boxShadow: 'inset 0 0 35px rgba(129, 140, 248, 0.22), 0 12px 36px rgba(0,0,0,0.6)',
              }}
            >
              {/* Pure SVG Ornate Indigo Corner Brackets */}
              <CornerBrackets theme="indigo" />

              <div className="absolute inset-2.5 rounded-xl border border-[#818cf8]/45 pointer-events-none z-10" />

              {/* Pure SVG Japanese Torii Gate, Flying Cranes & Misty Peaks */}
              <ToriiCranesIndigo />

              <div className="relative z-10">
                <div className="flex items-start gap-4 mb-3.5">
                  <div 
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-lg relative bg-white"
                    style={{
                      border: '2.5px solid #6366f1',
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                    }}
                  >
                    <div className="absolute inset-1 rounded-full border border-indigo-200/30" />
                    <Search size={24} className="text-[#4338ca]" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-base text-[#0a0f18] tracking-tight">SerpAPI Search Engine</h3>
                      <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#edf2f7] text-[#4a5568] border border-slate-300">
                        Disconnected
                      </div>
                    </div>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider bg-[#dcfce7] text-[#15803d] border border-[#bbf7d0]">
                      GEO LOCAL SEARCH
                    </span>
                  </div>

                  <a href="#" className="text-slate-400 hover:text-slate-700">
                    <ExternalLink size={15} />
                  </a>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed mb-6">
                  Pulls live Google Search & Maps Local 3-Pack rank, SERP features (Featured Snippets, Knowledge Panels), and competitor positioning.
                </p>
              </div>

              <div className="pt-3 relative z-10">
                <button 
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-extrabold text-white shadow-xl transition-all hover:scale-[1.01] cursor-pointer"
                  style={{
                    background: 'linear-gradient(90deg, #090e18 0%, #172437 100%)',
                    boxShadow: '0 4px 14px rgba(9, 14, 24, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Key size={13} className="text-indigo-400" />
                  <span>Configure API Key</span>
                </button>
              </div>
            </motion.div>

          </div>

          {/* FOOTER MOTIFS */}
          <footer className="mt-6 pt-4 border-t border-amber-500/25 flex items-center justify-center gap-10 text-[11px] font-extrabold tracking-widest text-slate-400">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-sm">☸</span>
              <span>BETTER INSIGHTS</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-sm">🪷</span>
              <span>HIGHER VISIBILITY</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-sm">⛩</span>
              <span>STRONGER GROWTH</span>
            </div>
          </footer>

        </div>
      </main>

      {/* Floating Exit / Switch Back Button */}
      <button
        onClick={onExit}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-slate-300 bg-black/80 border border-white/20 hover:text-white hover:bg-black transition-all shadow-2xl cursor-pointer"
      >
        <X size={14} />
        <span>Exit Full Naruto Theme</span>
      </button>

    </div>
  );
}
