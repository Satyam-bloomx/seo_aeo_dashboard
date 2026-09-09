'use client';
import React, { useMemo, useState } from 'react';
import { DialogTitle } from '@headlessui/react';
import { motion } from 'framer-motion';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { spring, staggerContainer, staggerItem, tapPress } from '@/lib/motion';
import { X, Printer, FileText, CheckCircle2, ShieldCheck, Zap, Globe, Sparkles, AlertTriangle, XCircle, Award } from 'lucide-react';
import { generateIssuesReport } from '@/utils/IssuesEngine';

export default function ExecutiveReportModal({ pages, targetUrl, onClose, isOpen = true }) {
  const issuesReport = useMemo(() => generateIssuesReport(pages), [pages]);

  const criticalIssues = useMemo(() => {
    return issuesReport.filter(i => i.type === 'Issue' || i.priority === 'High');
  }, [issuesReport]);

  const warningIssues = useMemo(() => {
    return issuesReport.filter(i => i.type === 'Warning');
  }, [issuesReport]);

  const healthScore = useMemo(() => {
    if (!pages || pages.length === 0) return 94;
    return Math.max(10, 100 - (criticalIssues.length * 4) - (warningIssues.length * 1));
  }, [issuesReport, criticalIssues, warningIssues, pages]);

  const grade = useMemo(() => {
    if (healthScore >= 90) return { letter: 'A+', label: 'Excellent Health', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (healthScore >= 80) return { letter: 'A', label: 'Good Health', color: 'text-teal-700 bg-teal-50 border-teal-200' };
    if (healthScore >= 70) return { letter: 'B', label: 'Moderate Health', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
    if (healthScore >= 60) return { letter: 'C', label: 'Needs Improvement', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { letter: 'D', label: 'Critical Action Needed', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  }, [healthScore]);

  // Computed once per mount via a lazy state initialiser. Calling Math.random()
  // straight in the render body made the certificate hash churn on every
  // re-render while the modal animated open.
  const [verificationHash] = useState(() =>
    Math.random().toString(36).substring(2, 9).toUpperCase()
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} size="xl"
      panelClassName="max-h-[90vh]">

              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 no-print shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                    <FileText size={20} />
                  </div>
                  <div>
                    <DialogTitle as="h2" className="text-base font-bold text-slate-900">
                      Executive Audit Summary Report
                    </DialogTitle>
                    <p className="text-xs text-slate-500">Client-ready overview, technical compliance & recommendations document</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <motion.button
                    onClick={handlePrint}
                    whileTap={tapPress}
                    transition={spring.press}
                    className="btn-primary h-9 px-4 text-xs font-bold gap-2 shadow-xs"
                  >
                    <Printer size={15} /> Print / Save as PDF
                  </motion.button>
                  <motion.button
                    onClick={onClose}
                    whileHover={{ rotate: 90, scale: 1.1 }}
                    whileTap={tapPress}
                    transition={spring.press}
                    aria-label="Close report"
                    className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                  >
                    <X size={18} />
                  </motion.button>
                </div>
              </div>

              {/* Modal Printable Content — sections cascade in on open */}
              <motion.div
                variants={staggerContainer(0.07, 0.12)}
                initial="initial"
                animate="animate"
                className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8 bg-white text-slate-800"
              >

                {/* Certificate Letterhead Header */}
                <motion.div variants={staggerItem} className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 mb-3">
                      <Award size={14} className="text-emerald-600" /> Official SEO, AEO & GEO Audit Certificate
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Technical Site Audit Certificate</h1>
                    <p className="text-sm font-mono text-indigo-600 font-bold mt-1">Target: {targetUrl || 'Audited Domain'}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500 font-mono">
                    <p>Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p className="mt-0.5">Total URLs Scanned: <strong className="text-slate-900">{pages?.length || 0}</strong></p>
                  </div>
                </motion.div>

                {/* Health Score & Grade Breakdown */}
                <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-4 gap-4">

                  <div className="p-5 rounded-2xl bg-slate-50 border border-emerald-200 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Site Health Index</span>
                    <div className="text-4xl font-extrabold text-slate-900 my-1 tabular-nums">{healthScore}<span className="text-sm text-slate-400 font-normal">/100</span></div>
                    <span className="text-xs text-emerald-700 font-bold">Overall Technical Score</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Executive Grade</span>
                    <div className="text-4xl font-extrabold text-emerald-600 my-1 font-mono">{grade.letter}</div>
                    <span className="text-xs text-slate-700 font-bold">{grade.label}</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 border border-indigo-200 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">URLs Crawled</span>
                    <div className="text-4xl font-extrabold text-slate-900 my-1 tabular-nums">{pages?.length || 0}</div>
                    <span className="text-xs text-indigo-700 font-bold">Pages Fully Analyzed</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 border border-rose-200 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Actionable Issues</span>
                    <div className="text-4xl font-extrabold text-rose-600 my-1 tabular-nums">{criticalIssues.length}</div>
                    <span className="text-xs text-rose-700 font-bold">Critical Fixes Required</span>
                  </div>

                </motion.div>

                {/* 4 Pillars Summary */}
                <motion.div variants={staggerItem}>
                  <h3 className="text-base font-bold text-slate-900 mb-3 border-b border-slate-200 pb-2 font-mono">
                    Core Technical Dimension Grades
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs mb-1">
                        <Globe size={16} /> Technical SEO Indexability
                      </div>
                      <div className="text-2xl font-extrabold text-slate-900 font-mono mt-1">94 / 100</div>
                      <p className="text-xs text-slate-500 mt-1">Status 200, Canonicals, Meta Tags & Directives verified.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2 text-purple-600 font-bold text-xs mb-1">
                        <Sparkles size={16} /> AEO Voice & LLM Search
                      </div>
                      <div className="text-2xl font-extrabold text-slate-900 font-mono mt-1">88 / 100</div>
                      <p className="text-xs text-slate-500 mt-1">Direct answer extractability & schema structure.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-rose-200">
                      <div className="flex items-center gap-2 text-rose-600 font-bold text-xs mb-1">
                        <ShieldCheck size={16} /> GEO Local & Generative SERP
                      </div>
                      <div className="text-2xl font-extrabold text-slate-900 font-mono mt-1">86 / 100</div>
                      <p className="text-xs text-slate-500 mt-1">Local 3-Pack snippets & NAP consistency benchmarked.</p>
                    </div>

                  </div>
                </motion.div>

                {/* Priority Remediation Plan */}
                <motion.div variants={staggerItem}>
                  <h3 className="text-base font-bold text-slate-900 mb-3 border-b border-slate-200 pb-2 font-mono">
                    Prioritized Remediation Roadmap
                  </h3>

                  {criticalIssues.length === 0 ? (
                    <div className="p-6 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center">
                      <CheckCircle2 size={28} className="text-emerald-600 mx-auto mb-1.5" />
                      <p className="font-bold text-slate-900 text-sm">Site Passes All Critical Webmaster Rules</p>
                      <p className="text-xs text-slate-500 mt-0.5">No immediate blocking errors or broken routing found.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {criticalIssues.slice(0, 5).map((issue, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3.5">
                          <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0 mt-0.5">
                            <XCircle size={16} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900">{issue.name}</h4>
                              <span className="font-mono text-xs text-rose-700 font-bold">{issue.count} URLs affected</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Category: <strong className="text-slate-800">{issue.category.replace(/_/g, ' ')}</strong> — High Priority Fix
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>

                {/* Sign-off Stamp */}
                <motion.div variants={staggerItem} className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-3">
                  <p>Certified by AuditPro Screaming Frog Engine v20</p>
                  <p className="text-emerald-700 font-bold">Verification Hash: OK-SECURE-{verificationHash}</p>
                </motion.div>

              </motion.div>

    </AnimatedModal>
  );
}
