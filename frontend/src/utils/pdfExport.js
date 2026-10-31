import { toast } from 'sonner';
import { hexToRgb } from './reportSettings';
import { reportDateLabel } from './reportMetrics';

// Client report PDF, drawn directly with jsPDF (text and vector shapes). It does not capture the screen,
// so it works with any CSS colour syntax and the text stays selectable.

const INK = [30, 41, 59];
const MUTED = [100, 116, 139];
const RULE = [226, 232, 240];
const LEVEL_RGB = { High: [190, 18, 60], Medium: [180, 83, 9], Low: [29, 78, 216] };
const SPEED_RGB = { good: [4, 120, 87], warn: [180, 83, 9], poor: [190, 18, 60], unknown: MUTED };

// jsPDF's built-in fonts cover Latin-1 only; swap common symbols and drop the rest so nothing prints as junk.
const MAP = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '•': '-', '₹': 'Rs ', '→': '->', '✓': 'OK', '✗': 'X' };
const clean = (s) => String(s ?? '')
  .replace(/[‘’“”–—…•₹→✓✗]/g, (c) => MAP[c])
  .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const slugFor = (host) => String(host || 'website').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'website';

/**
 * @param {object} report    from buildReportData()
 * @param {object} settings  branding from the report settings
 * @param {string} summary   the one-paragraph summary shown on screen
 * @param {(msg: string) => void} [onProgress]
 */
export async function exportExecutiveReportToPDF(report, settings = {}, summary = '', onProgress) {
  const toastId = toast.loading('Building your PDF report...', { description: 'This takes a few seconds.' });
  const step = (msg) => {
    onProgress?.(msg);
    toast.loading(msg, { id: toastId });
  };

  try {
    step('Loading the PDF engine...');
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 48;
    const width = W - M * 2;
    const bottom = H - 56;
    const accent = hexToRgb(settings.accent);
    const dateLabel = reportDateLabel();
    const agency = clean(settings.agencyName);
    const client = clean(settings.clientName);
    const preparedBy = clean(settings.preparedBy);
    let y = M;

    const newPage = () => { doc.addPage(); y = M; };
    const ensure = (h) => { if (y + h > bottom) newPage(); };
    const setText = (size, style = 'normal', color = INK) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };
    const para = (text, { size = 10.5, style = 'normal', color = INK, gap = 6, x = M, w = width, lh = 1.4 } = {}) => {
      const t = clean(text);
      if (!t) return;
      setText(size, style, color);
      const lines = doc.splitTextToSize(t, w);
      lines.forEach((line) => {
        ensure(size * lh);
        doc.text(line, x, y + size);
        y += size * lh;
      });
      y += gap;
    };
    const heading = (text, size = 15) => {
      ensure(size + 40);
      y += 6;
      setText(size, 'bold', INK);
      doc.text(clean(text), M, y + size);
      y += size + 6;
      doc.setDrawColor(...accent);
      doc.setLineWidth(1.5);
      doc.line(M, y, M + 36, y);
      y += 12;
    };
    const pill = (text, x, yy, rgb) => {
      setText(8.5, 'bold', rgb);
      const t = clean(text);
      const tw = doc.getTextWidth(t) + 12;
      doc.setDrawColor(...rgb);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, yy - 9, tw, 15, 7, 7, 'S');
      doc.text(t, x + 6, yy + 1.5);
      return tw;
    };

    // ---- Cover ----
    step('Writing the cover page...');
    doc.setFillColor(...accent);
    doc.rect(0, 0, W, 10, 'F');
    y = 70;
    if (settings.agencyLogo) {
      try {
        const props = doc.getImageProperties(settings.agencyLogo);
        const ratio = Math.min(150 / props.width, 56 / props.height);
        const fmt = props.fileType === 'JPEG' ? 'JPEG' : 'PNG';
        doc.addImage(settings.agencyLogo, fmt, M, y, props.width * ratio, props.height * ratio);
        y += props.height * ratio + 14;
      } catch {
        // A logo that jsPDF cannot read is skipped; the agency name still prints.
      }
    }
    if (agency) {
      setText(13, 'bold', INK);
      doc.text(agency, M, y + 13);
      y += 22;
    }
    y = Math.max(y, 230);
    setText(11, 'bold', accent);
    doc.text('WEBSITE HEALTH REPORT', M, y);
    y += 14;
    setText(30, 'bold', INK);
    doc.splitTextToSize(client || report.host, width).slice(0, 2).forEach((l) => { doc.text(l, M, y + 30); y += 36; });
    y += 4;
    setText(13, 'normal', MUTED);
    doc.text(clean(report.host), M, y + 13);
    y += 40;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.8);
    doc.line(M, y, W - M, y);
    y += 22;
    const meta = [
      ['Date', dateLabel],
      ['Prepared for', client || report.host],
      preparedBy && ['Prepared by', preparedBy],
      agency && ['Agency', agency],
      ['Pages checked', String(report.pagesCrawled)],
      report.crawlId && ['Audit reference', `#${report.crawlId} (${dateLabel})`],
    ].filter(Boolean);
    meta.forEach(([k, v]) => {
      setText(10, 'bold', MUTED);
      doc.text(k, M, y + 10);
      setText(10.5, 'normal', INK);
      doc.text(clean(v), M + 110, y + 10);
      y += 20;
    });

    // ---- Summary, score, priorities ----
    step('Writing the summary and priorities...');
    newPage();
    heading('Summary');
    para(summary || report.fallbackSummary, { size: 11.5, lh: 1.5, gap: 14 });

    heading('Overall score');
    ensure(90);
    setText(44, 'bold', accent);
    const scoreText = report.score === null ? 'n/a' : String(report.score);
    doc.text(scoreText, M, y + 40);
    const sw = doc.getTextWidth(scoreText);
    setText(14, 'normal', MUTED);
    doc.text('/ 100', M + sw + 6, y + 40);
    let px = M + sw + 70;
    if (report.gradeLabel && report.score !== null) px += pill(report.gradeLabel, px, y + 20, accent) + 8;
    pill(`Speed: ${report.speed.status === 'unknown' ? 'not measured' : report.speed.status === 'good' ? 'good' : report.speed.status === 'warn' ? 'fair' : 'needs attention'}`, px, y + 20, SPEED_RGB[report.speed.status]);
    y += 54;
    para(report.meaning, { size: 11, gap: 8 });
    para(`${report.counts.total} items to improve in total: ${report.counts.high} high priority, ${report.counts.medium} medium, ${report.counts.low} low. ${report.pagesCrawled} pages checked.`, { size: 10, color: MUTED, gap: 8 });
    if (report.coverage?.note) para(report.coverage.note, { size: 9.5, color: MUTED, gap: 6 });
    if (report.scoreExplanation.length) {
      para('How the score is made up', { size: 10, style: 'bold', gap: 3 });
      report.scoreExplanation.forEach((e) => {
        para(`${e.label}${e.impact !== undefined && e.impact !== null ? ` (${e.impact})` : ''}${e.detail ? `: ${e.detail}` : ''}`, { size: 9.5, color: MUTED, gap: 2, x: M + 10, w: width - 10 });
      });
      y += 6;
    }

    heading('Your top 3 priorities');
    if (!report.priorities.length) {
      para('No issues were found. Nothing needs fixing right now.', { gap: 10 });
    }
    report.priorities.forEach((p, i) => {
      ensure(110);
      doc.setFillColor(...accent);
      doc.circle(M + 10, y + 11, 10, 'F');
      setText(11, 'bold', [255, 255, 255]);
      doc.text(String(i + 1), M + 10, y + 15, { align: 'center' });
      setText(12, 'bold', INK);
      doc.splitTextToSize(clean(p.name), width - 40).forEach((l) => { doc.text(l, M + 30, y + 15); y += 15; });
      y += 2;
      const where = `${p.level} priority${p.count ? ` | ${p.count} page${p.count === 1 ? '' : 's'} affected${p.percentage != null ? ` (${p.percentage}%)` : ''}` : ''}`;
      para(where, { size: 9, color: LEVEL_RGB[p.level] || MUTED, x: M + 30, w: width - 30, gap: 3 });
      if (p.why) para(`Why it matters: ${p.why}`, { size: 10, x: M + 30, w: width - 30, gap: 3 });
      if (p.fix) para(`What to do: ${p.fix}`, { size: 10, x: M + 30, w: width - 30, gap: 12 });
    });

    // ---- Speed and AI readiness ----
    step('Writing speed and AI-readiness...');
    heading('Speed');
    para(report.speed.headline, { size: 11, style: 'bold', color: SPEED_RGB[report.speed.status], gap: 3 });
    para(report.speed.detail, { gap: 6 });
    report.speed.rows.forEach((r) => {
      para(`${r.label}: ${r.value} (${r.ok === null ? 'n/a' : r.ok ? 'good' : 'needs work'}, target ${r.target})`, { size: 9.5, color: MUTED, gap: 2, x: M + 10, w: width - 10 });
    });
    if (report.speed.opportunities.length) {
      y += 4;
      para('Biggest speed wins', { size: 10, style: 'bold', gap: 3 });
      report.speed.opportunities.forEach((o) => para(`${o.title} (could save about ${o.savings})`, { size: 9.5, color: MUTED, gap: 2, x: M + 10, w: width - 10 }));
    }
    y += 8;

    heading('AI-readiness');
    report.ai.lines.forEach((l) => para(l, { gap: 4 }));

    // ---- Appendix ----
    step('Writing the full issue list...');
    newPage();
    heading(`Appendix: full issue list (${report.items.length})`);
    if (!report.items.length) para('No issues were found.');
    report.items.forEach((it, i) => {
      ensure(70);
      setText(10.5, 'bold', INK);
      const title = clean(`${i + 1}. ${it.name}`);
      const lines = doc.splitTextToSize(title, width - 120);
      lines.forEach((l, li) => { ensure(14); doc.text(l, M, y + 11); if (li === 0) pill(it.level, W - M - 60, y + 9, LEVEL_RGB[it.level] || MUTED); y += 14; });
      para(`${it.count} page${it.count === 1 ? '' : 's'} affected${it.percentage != null ? ` (${it.percentage}%)` : ''}`, { size: 9, color: MUTED, gap: 2 });
      if (it.why) para(`Why it matters: ${it.why}`, { size: 9.5, gap: 2 });
      if (it.fix) para(`What to do: ${it.fix}`, { size: 9.5, gap: 8 });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.5);
      doc.line(M, y - 3, W - M, y - 3);
      y += 4;
    });

    // ---- Footer on every page ----
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      setText(8.5, 'normal', MUTED);
      doc.text(clean([agency, client || report.host, dateLabel].filter(Boolean).join('  |  ')), M, H - 28);
      doc.text(`Page ${i} of ${pages}`, W - M, H - 28, { align: 'right' });
    }

    step('Saving...');
    doc.save(`website_health_report_${slugFor(report.host)}.pdf`);
    toast.success('PDF report downloaded', { id: toastId, description: `${pages} page${pages === 1 ? '' : 's'}, A4.` });
    return true;
  } catch (error) {
    console.error('PDF generation error:', error);
    toast.error('The PDF could not be created', {
      id: toastId,
      description: 'Try again, or use the Excel or CSV download instead. If it keeps failing, reload the page first.',
    });
    return false;
  }
}
