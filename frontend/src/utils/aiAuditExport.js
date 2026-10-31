// Downloads for the AI page audit (AI Copilot drawer): a text PDF and a Markdown file.
// Built from the API result rather than a screenshot, so the text is selectable and theme-independent.

const safeName = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';
  } catch {
    return 'page';
  }
};

const dateStamp = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

function triggerDownload(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function sections(result, url) {
  const data = result?.data || {};
  const out = [];
  out.push({ h: 'Summary', lines: [
    `URL: ${url}`,
    `Generated: ${dateStamp(result?.generated_at)}${providerName(result) ? ` with ${providerName(result)}` : ''}`,
    `Page score: ${typeof data.composite_score === 'number' ? `${data.composite_score}/100` : 'not scored'}`,
    result?.platform?.name ? `Platform: ${result.platform.name}` : null,
    data.search_intent ? `Search intent: ${data.search_intent}` : null,
    data.verdict ? `Verdict: ${data.verdict}` : null,
  ].filter(Boolean) });

  const breakdown = Object.entries(data.score_breakdown || {});
  if (breakdown.length) {
    out.push({ h: 'Scores by category', lines: breakdown.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v?.score ?? '-'} (${v?.status || 'n/a'})`) });
  }

  const rewrites = (data.content_rewrites || []).filter((r) => r.proposed || r.issues?.length);
  if (rewrites.length) {
    const lines = [];
    rewrites.forEach((r) => {
      lines.push(`## ${r.label}${r.status === 'fix' ? ' (needs fixing)' : ''}`);
      lines.push(`Current (${r.current_length} chars): ${r.current || '(missing)'}`);
      if (r.issues?.length) lines.push(`Issues: ${r.issues.join(', ')}`);
      if (r.proposed) {
        const [lo, hi] = r.recommended_range || [];
        const note = r.proposed_in_range ? '' : r.proposed_length > hi ? ` (too long: recommended ${lo}-${hi}, edit before using)` : ` (short: recommended ${lo}-${hi})`;
        lines.push(`Proposed (${r.proposed_length} chars${note}): ${r.proposed}`);
      }
      else if (r.keep_current) lines.push('Proposed: keep the current copy');
      if (r.reason) lines.push(`Why: ${r.reason}`);
      lines.push('');
    });
    out.push({ h: 'Ready-to-use copy', lines });
  }

  if (data.critical_findings?.length) out.push({ h: 'Findings', lines: data.critical_findings.map((f) => `- ${f}`) });
  if (data.production_code_fix) out.push({ h: 'Recommended fix', code: data.production_code_fix });
  if (data.aeo_direct_answer_block) out.push({ h: 'Answer block for AI search (proposed copy)', lines: [data.aeo_direct_answer_block] });
  if (data.strategic_advice) out.push({ h: 'Next priority', lines: [data.strategic_advice] });
  return out;
}

// Client-facing name of the AI provider only ("Google Gemini"): no model ids or fallback notes.
export function providerName(result) {
  return result?.ai_provider?.label || String(result?.powered_by || '').split(' (')[0].split(',')[0].trim() || '';
}

export function exportAiAuditMarkdown(result, url) {
  const md = [`# AI page audit: ${url}`, ''];
  sections(result, url).forEach((s) => {
    md.push(`## ${s.h}`, '');
    if (s.code) md.push('```', s.code, '```');
    (s.lines || []).forEach((l) => md.push(l.startsWith('## ') ? `#${l}` : l));
    md.push('');
  });
  triggerDownload(new Blob([md.join('\n')], { type: 'text/markdown;charset=utf-8' }),
    `ai-audit-${safeName(url)}-${dateStamp(result?.generated_at)}.md`);
}

export async function exportAiAuditPDF(result, url) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;

  const write = (text, { size = 10, style = 'normal', font = 'helvetica', gap = 4, color = [30, 41, 59] } = {}) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lineHeight = size * 1.35;
    doc.splitTextToSize(String(text), width).forEach((line) => {
      if (y + lineHeight > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });
    y += gap;
  };

  write('AI page audit', { size: 18, style: 'bold', gap: 2 });
  write(url, { size: 10, color: [79, 70, 229], gap: 12 });

  sections(result, url).forEach((s) => {
    y += 6;
    write(s.h, { size: 13, style: 'bold', gap: 6 });
    if (s.code) write(s.code, { size: 8.5, font: 'courier', gap: 6, color: [51, 65, 85] });
    (s.lines || []).forEach((l) => {
      if (!l) { y += 4; return; }
      if (l.startsWith('## ')) write(l.slice(3), { size: 11, style: 'bold', gap: 2 });
      else write(l, { gap: 2 });
    });
  });

  doc.save(`ai-audit-${safeName(url)}-${dateStamp(result?.generated_at)}.pdf`);
}
