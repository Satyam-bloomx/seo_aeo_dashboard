'use client';
import React, { useMemo } from 'react';
import { DialogTitle } from '@headlessui/react';
import { motion } from 'framer-motion';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { spring, staggerContainer, staggerItem, tapPress } from '@/lib/motion';
import {
  X,
  FileSpreadsheet,
  Download,
  FileText,
  TableProperties,
  ListOrdered,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Layers,
  ArrowDownToLine,
  ShieldCheck
} from 'lucide-react';
import {
  exportMasterAuditToExcel,
  exportMasterAuditToCSV,
  exportIssuesToCSV
} from '@/utils/exportUtils';
import { generateIssuesReport } from '@/utils/IssuesEngine';

export default function ExportAuditModal({
  isOpen,
  onClose,
  pages = [],
  targetUrl = '',
  onOpenPdfReport
}) {
  const issuesReport = useMemo(() => generateIssuesReport(pages), [pages]);
  const totalPages = pages.length;

  const handleExportExcel = () => {
    exportMasterAuditToExcel(pages, targetUrl, issuesReport);
  };

  const handleExportCsv = () => {
    exportMasterAuditToCSV(pages, targetUrl);
  };

  const handleExportIssuesCsv = () => {
    exportIssuesToCSV(issuesReport, targetUrl);
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} size="xl">
      {/* Modal Container */}
      <div className="flex flex-col bg-white overflow-hidden rounded-3xl">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 shadow-sm ring-1 ring-slate-900/10">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle as="h2" className="text-base font-bold tracking-tight text-slate-900">
                  Export Audit Data
                </DialogTitle>
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  v20.4 Engine
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Download structured crawl results, multi-sheet workbooks, or client reports
              </p>
            </div>
          </div>

          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.05 }}
            whileTap={tapPress}
            transition={spring.press}
            aria-label="Close export dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Modal Body */}
        <motion.div
          variants={staggerContainer(0.04, 0.06)}
          initial="initial"
          animate="animate"
          className="p-6 space-y-5"
        >
          {/* Target URL & Stats Strip */}
          <motion.div
            variants={staggerItem}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-2.5"
          >
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>Target Domain:</span>
              <strong className="font-mono font-bold text-slate-900 truncate max-w-xs sm:max-w-md">
                {targetUrl || 'Audited Website'}
              </strong>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-slate-500">
                Extracted URLs: <strong className="font-bold text-slate-900 tabular-nums">{totalPages}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">
                Issues Found: <strong className="font-bold text-amber-600 tabular-nums">{issuesReport.length}</strong>
              </span>
            </div>
          </motion.div>

          {/* HERO CARD: Master Excel Workbook (.xlsx) */}
          <motion.div
            variants={staggerItem}
            className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] p-5 text-white shadow-xl transition-all hover:border-slate-700 hover:shadow-2xl"
          >
            {/* Ambient Background Gradient Effect */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl group-hover:bg-emerald-500/15 transition-all" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl group-hover:bg-indigo-500/15 transition-all" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    <Sparkles size={11} className="text-emerald-400" />
                    Recommended Primary Format
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Microsoft Excel · Numbers · Google Sheets
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                    Master Multi-Sheet Audit Workbook
                    <span className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-400">
                      .XLSX
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">
                    Complete technical site audit formatted into a multi-tab professional workbook with automated data styling and issue remediation.
                  </p>
                </div>

                {/* Tab preview chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-200 font-mono">
                    <Layers size={12} className="text-emerald-400" />
                    <span>Sheet 1: Master URL Explorer (35+ Parameters)</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-200 font-mono">
                    <CheckCircle2 size={12} className="text-indigo-400" />
                    <span>Sheet 2: Issues & Fix Matrix</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-200 font-mono">
                    <ShieldCheck size={12} className="text-amber-400" />
                    <span>Sheet 3: Crawl Diagnostics</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="shrink-0">
                <motion.button
                  onClick={handleExportExcel}
                  disabled={totalPages === 0}
                  whileHover={{ scale: 1.02 }}
                  whileTap={tapPress}
                  transition={spring.press}
                  className="group/btn flex w-full md:w-auto items-center justify-center gap-2.5 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ArrowDownToLine size={16} className="text-slate-950 group-hover/btn:translate-y-0.5 transition-transform" />
                  <span>Download Excel Workbook</span>
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* SECONDARY FORMATS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            
            {/* 1. Master Screaming Frog CSV */}
            <motion.div
              variants={staggerItem}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <TableProperties size={16} />
                  </div>
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 uppercase">
                    .CSV
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Master Site Audit CSV
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Screaming Frog style dataset with all 35+ parameters encoded in universal UTF-8 BOM.
                  </p>
                </div>
              </div>

              <motion.button
                onClick={handleExportCsv}
                disabled={totalPages === 0}
                whileTap={tapPress}
                transition={spring.press}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Download size={13} className="text-indigo-600" />
                <span>Export Master CSV</span>
              </motion.button>
            </motion.div>

            {/* 2. Issues Roadmap CSV */}
            <motion.div
              variants={staggerItem}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
                    <ListOrdered size={16} />
                  </div>
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 uppercase">
                    .CSV
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Issues & Fix Roadmap
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Prioritized engineering backlog with severity scores and step-by-step remediation advice.
                  </p>
                </div>
              </div>

              <motion.button
                onClick={handleExportIssuesCsv}
                disabled={issuesReport.length === 0}
                whileTap={tapPress}
                transition={spring.press}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Download size={13} className="text-amber-600" />
                <span>Export Issues CSV</span>
              </motion.button>
            </motion.div>

            {/* 3. Executive PDF Report */}
            <motion.div
              variants={staggerItem}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                    <FileText size={16} />
                  </div>
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 uppercase">
                    .PDF
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Executive PDF Report
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Print-ready executive report with compliance spider radars, grade cards, and certification.
                  </p>
                </div>
              </div>

              <motion.button
                onClick={() => {
                  onClose();
                  if (onOpenPdfReport) onOpenPdfReport();
                }}
                whileTap={tapPress}
                transition={spring.press}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ExternalLink size={13} className="text-slate-600" />
                <span>Open PDF View</span>
              </motion.button>
            </motion.div>
          </div>

          {/* Subtle Encoding Guarantee Footnote */}
          <motion.div
            variants={staggerItem}
            className="flex items-center justify-center gap-2 pt-1 font-mono text-[11px] text-slate-400"
          >
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>Encodes with UTF-8 BOM · Zero server latency · 100% Client-Side Privacy</span>
          </motion.div>
        </motion.div>
      </div>
    </AnimatedModal>
  );
}
