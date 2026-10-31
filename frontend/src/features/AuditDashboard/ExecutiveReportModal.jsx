'use client';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { DialogTitle } from '@headlessui/react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { spring, tapPress } from '@/lib/motion';
import {
  X,
  FileText,
  FileSpreadsheet,
  Download,
  ShieldCheck,
  Settings2,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { generateIssuesReport } from '@/utils/IssuesEngine';
import { calculateTechnicalSeoScore } from '@/utils/technicalSeoScore';
import { exportMasterAuditToExcel, exportMasterAuditToCSV } from '@/utils/exportUtils';
import { exportExecutiveReportToPDF } from '@/utils/pdfExport';
import { buildReportData } from '@/utils/reportMetrics';
import { loadReportSettings, saveReportSettings } from '@/utils/reportSettings';
import { getAiExecutiveSummary } from '@/api/client';
import { useCrawlSummary } from '@/context/CrawlSummaryContext';
import ReportDocument from './Report/ReportDocument';
import ReportSettingsPanel from './Report/ReportSettingsPanel';


export default function ExecutiveReportModal({ pages, targetUrl, crawlId, onClose, isOpen = true }) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(loadReportSettings);
  // Latest finished request: { key, round, data } (data is null when it failed).
  const [fetchedSummary, setFetchedSummary] = useState(null);
  const crawlSummary = useCrawlSummary();
  const issuesReport = useMemo(() => generateIssuesReport(pages, crawlSummary), [pages, crawlSummary]);

  // All scores come from the backend scoring engine so the report matches the dashboard exactly.
  const techResult = useMemo(() => calculateTechnicalSeoScore(pages, issuesReport, crawlSummary), [pages, issuesReport, crawlSummary]);
  const healthScore = techResult.siteHealthScore;

  // One data object feeds both the on-screen report and the PDF.
  const report = useMemo(
    () => buildReportData({ pages, crawlSummary, issuesReport, techResult, targetUrl }),
    [pages, crawlSummary, issuesReport, techResult, targetUrl]
  );

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (!saveReportSettings(next)) toast.error('Settings could not be saved in this browser', { description: 'They apply to this report only.' });
  };

  // The AI summary is a paid LLM call: the server stores it with the crawl, so it is generated once per crawl
  // and only again when Regenerate is pressed. Waits for the health score, which the request falls back on.
  const summaryKey = crawlId && pages && pages.length > 0 && healthScore != null ? String(crawlId) : null;
  const [regenerateCount, setRegenerateCount] = useState(0);
  const fetchedForKey = fetchedSummary?.key === summaryKey ? fetchedSummary : null;
  const aiSummary = fetchedForKey?.data || null;
  const wantsFetch = Boolean(isOpen && summaryKey);
  const loadingAiSummary = wantsFetch && fetchedForKey?.round !== regenerateCount;
  const summaryRequestKeyRef = useRef(null);
  const regenerateHandledRef = useRef(0);
  useEffect(() => {
    if (!wantsFetch) return;
    const requestKey = `${summaryKey}#${regenerateCount}`;
    if (summaryRequestKeyRef.current === requestKey) return;
    summaryRequestKeyRef.current = requestKey;
    const regenerate = regenerateCount > regenerateHandledRef.current;
    regenerateHandledRef.current = regenerateCount;
    // A response is applied only if it is still for the latest request. (Cancelling in the effect cleanup
    // left the spinner stuck when pages changed identity without a new key, since no retry followed.)
    const isCurrent = () => summaryRequestKeyRef.current === requestKey;
    const finish = (data) => {
      if (!isCurrent()) return;
      // A failed regenerate keeps the brief that was already showing.
      setFetchedSummary((prev) => ({
        key: summaryKey, round: regenerateCount,
        data: data || (prev?.key === summaryKey ? prev.data : null),
      }));
    };

    const fetchSummary = async () => {
      try {
        const topIssueNames = report.items.slice(0, 5).map(i => i.name);
        const pplxStatus = pages[0]?.audit_data?.AEO_Audit?.Perplexity_Citation_Status;
        const res = await getAiExecutiveSummary({
          crawl_id: Number(crawlId),
          regenerate,
          domain: targetUrl || (pages[0]?.url ? new URL(pages[0].url).hostname : 'Target Domain'),
          health_score: healthScore,
          critical_count: report.counts.high,
          warning_count: report.counts.medium,
          opportunity_count: report.counts.low,
          top_issues: topIssueNames,
          perplexity_citation_status: pplxStatus
        });
        finish(res?.data || null);
      } catch (e) {
        console.error('Failed to load AI executive summary:', e);
        finish(null);
      }
    };

    fetchSummary();
  }, [wantsFetch, summaryKey, regenerateCount, crawlId, pages, targetUrl, healthScore, report]);

  const summaryText = aiSummary?.executive_takeaway || '';

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    setPdfStatus('Starting...');
    try {
      await exportExecutiveReportToPDF(report, settings, summaryText, setPdfStatus);
    } finally {
      setIsGeneratingPdf(false);
      setPdfStatus('');
    }
  };

  if (!pages || pages.length === 0) {
    return (
      <AnimatedModal isOpen={isOpen} onClose={onClose} size="lg" panelClassName="max-h-[90vh]">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <FileText className="text-indigo-600 dark:text-indigo-400" size={20} />
            <DialogTitle as="h2" className="text-base font-bold text-slate-900 dark:text-white">
              Website Health Report
            </DialogTitle>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg" aria-label="Close report">
            <X size={18} />
          </button>
        </div>
        <div className="p-12 text-center space-y-4 bg-white dark:bg-slate-900">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
            <ShieldCheck size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No audit to report on yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            Enter a website address and run an audit. The client report is built from the results.
          </p>
          <button onClick={onClose} className="btn-primary px-4 py-2 text-xs font-bold">
            Close
          </button>
        </div>
      </AnimatedModal>
    );
  }

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} size="xl" panelClassName="max-h-[92vh]">

      {/* Top Modal Navigation Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/90 dark:bg-slate-900/90 no-print shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <DialogTitle as="h2" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Website Health Report
            </DialogTitle>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">A client-ready summary with your branding. Download it as a PDF.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto sm:ml-0">
          <motion.button
            onClick={() => setShowSettings((v) => !v)}
            whileTap={tapPress}
            transition={spring.press}
            aria-expanded={showSettings}
            className="btn-secondary h-8 px-3 text-xs font-bold gap-1.5 shadow-xs shrink-0"
          >
            <Settings2 size={14} /> <span>Branding</span>
          </motion.button>

          <motion.button
            onClick={() => exportMasterAuditToExcel(pages, targetUrl, issuesReport)}
            whileTap={tapPress}
            transition={spring.press}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/60 shrink-0"
          >
            <FileSpreadsheet size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>Excel (.xlsx)</span>
          </motion.button>

          <motion.button
            onClick={() => exportMasterAuditToCSV(pages, targetUrl)}
            whileTap={tapPress}
            transition={spring.press}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 shadow-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 shrink-0"
          >
            <Download size={14} className="text-indigo-600 dark:text-indigo-400" />
            <span>CSV</span>
          </motion.button>

          <motion.button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            whileTap={tapPress}
            transition={spring.press}
            className="btn-primary h-8 px-3 text-xs font-bold gap-1.5 shadow-xs shrink-0 disabled:opacity-60"
            title="Download the report as an A4 PDF"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 size={14} className="animate-spin text-emerald-400" />
                <span>{pdfStatus || 'Building PDF...'}</span>
              </>
            ) : (
              <>
                <Download size={14} className="text-emerald-400" />
                <span>Download PDF</span>
              </>
            )}
          </motion.button>

          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={tapPress}
            transition={spring.press}
            aria-label="Close report"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X size={18} />
          </motion.button>
        </div>
      </div>

      {showSettings && <ReportSettingsPanel settings={settings} onChange={updateSettings} />}

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 custom-scrollbar bg-slate-100 dark:bg-slate-950 space-y-3">
        <div className="flex items-center justify-end gap-3 text-[11px] text-slate-500 dark:text-slate-400 no-print">
          {loadingAiSummary ? (
            <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Writing summary...</span>
          ) : (
            <button
              type="button"
              onClick={() => setRegenerateCount((n) => n + 1)}
              disabled={!summaryKey}
              className="flex items-center gap-1.5 font-bold border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50"
              title="Write a new summary paragraph (uses one AI request)"
            >
              <RefreshCw size={12} /> {summaryText ? 'Regenerate summary' : 'Write summary with AI'}
            </button>
          )}
        </div>
        <ReportDocument report={report} settings={settings} summary={summaryText} summaryLoading={loadingAiSummary} />
      </div>
    </AnimatedModal>
  );
}
