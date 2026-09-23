import * as XLSX from 'xlsx';
import { toast } from 'sonner';

export const MASTER_EXPORT_FIELDS = [
  { header: 'URL', getter: (p) => p.url },
  { header: 'Status Code', getter: (p) => p.status_code || 200 },
  { header: 'Status', getter: (p) => p.status_name || (p.status_code >= 400 ? 'Client Error' : p.status_code >= 300 ? 'Redirect' : 'OK') },
  { header: 'Indexability', getter: (p) => p.indexability || 'Indexable' },
  { header: 'Indexability Status', getter: (p) => p.indexability_status || 'None' },
  { header: 'Content Type', getter: (p) => p.content_type || 'text/html' },
  { header: 'Response Time (ms)', getter: (p) => p.response_time_ms || '' },
  { header: 'Size (Bytes)', getter: (p) => p.size_bytes || '' },
  { header: 'Word Count', getter: (p) => p.word_count ?? '' },
  { header: 'Text Ratio (%)', getter: (p) => p.text_to_html_ratio ? (p.text_to_html_ratio * 100).toFixed(1) : '' },
  { header: 'Crawl Depth', getter: (p) => p.crawl_depth ?? '' },
  { header: 'Title 1', getter: (p) => p.title_1 || '' },
  { header: 'Title 1 Length', getter: (p) => p.title_1_length ?? (p.title_1 ? p.title_1.length : 0) },
  { header: 'Title 1 Length (No Spaces)', getter: (p) => p.title_1 ? p.title_1.replace(/\s+/g, '').length : 0 },
  { header: 'Title 1 Pixel Width', getter: (p) => p.title_1_pixel_width || '' },
  { header: 'Title 1 Occurrences', getter: (p) => (p.title_1 && p.title_1.trim() !== '') ? 1 : 0 },
  { header: 'Meta Description 1', getter: (p) => p.meta_desc_1 || '' },
  { header: 'Meta Description 1 Length', getter: (p) => p.meta_desc_1_length ?? (p.meta_desc_1 ? p.meta_desc_1.length : 0) },
  { header: 'Meta Description 1 Length (No Spaces)', getter: (p) => p.meta_desc_1 ? p.meta_desc_1.replace(/\s+/g, '').length : 0 },
  { header: 'Meta Description 1 Pixel Width', getter: (p) => p.meta_desc_1_pixel_width || '' },
  { header: 'Meta Description 1 Occurrences', getter: (p) => (p.meta_desc_1 && p.meta_desc_1.trim() !== '') ? 1 : 0 },
  { header: 'Meta Keywords 1', getter: (p) => p.meta_keyword_1 || '' },
  { header: 'H1-1', getter: (p) => p.h1_1 || '' },
  { header: 'H1-1 Length', getter: (p) => p.h1_1_length ?? (p.h1_1 ? p.h1_1.length : 0) },
  { header: 'H1-1 Length (No Spaces)', getter: (p) => p.h1_1 ? p.h1_1.replace(/\s+/g, '').length : 0 },
  { header: 'H1-2', getter: (p) => p.h1_2 || '' },
  { header: 'H1-2 Length', getter: (p) => p.h1_2_length ?? (p.h1_2 ? p.h1_2.length : 0) },
  { header: 'H1-2 Length (No Spaces)', getter: (p) => p.h1_2 ? p.h1_2.replace(/\s+/g, '').length : 0 },
  { header: 'H1 Count', getter: (p) => !p.h1_1 || p.h1_1.trim() === '' ? 0 : (p.h1_2 && p.h1_2.trim() !== '' ? 2 : 1) },
  { header: 'H2-1', getter: (p) => p.h2_1 || '' },
  { header: 'H2-1 Length', getter: (p) => p.h2_1_length ?? (p.h2_1 ? p.h2_1.length : 0) },
  { header: 'H2-1 Length (No Spaces)', getter: (p) => p.h2_1 ? p.h2_1.replace(/\s+/g, '').length : 0 },
  { header: 'H2-2', getter: (p) => p.h2_2 || '' },
  { header: 'H2-2 Length', getter: (p) => p.h2_2_length ?? (p.h2_2 ? p.h2_2.length : 0) },
  { header: 'H2-2 Length (No Spaces)', getter: (p) => p.h2_2 ? p.h2_2.replace(/\s+/g, '').length : 0 },
  { header: 'H2 Count', getter: (p) => !p.h2_1 || p.h2_1.trim() === '' ? 0 : (p.h2_2 && p.h2_2.trim() !== '' ? 2 : 1) },
  { header: 'Canonical Link Element 1', getter: (p) => p.canonical_link_element_1 || '' },
  { header: 'Meta Robots 1', getter: (p) => p.meta_robots_1 || '' },
  { header: 'Core Web Vitals - LCP', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.lcp || '' },
  { header: 'Core Web Vitals - CLS', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.cls || '' },
  { header: 'Core Web Vitals - INP', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.inp || '' },
  { header: 'Core Web Vitals - TTFB', getter: (p) => p.audit_data?.PageSpeed?.mobile?.metrics?.ttfb || '' },
  { header: 'AEO Extractable Answer Score', getter: (p) => p.audit_data?.AEO_Audit?.aeo_score || p.audit_data?.AEO_Audit?.AEO_Readability_Score || '' },
  { header: 'Perplexity Citation Status', getter: (p) => p.audit_data?.AEO_Audit?.Perplexity_Citation_Status || '' },
  { header: 'Perplexity AI Citation Win', getter: (p) => p.audit_data?.AEO_Audit?.Perplexity_Citation_Win ? 'TRUE' : 'FALSE' },
  { header: 'OpenAI Synthesis Score', getter: (p) => p.audit_data?.AEO_Audit?.OpenAI_Synthesis_Score || '' },
  { header: 'Google Index Status', getter: (p) => p.audit_data?.Search_Console?.Google_Index_Status || '' },
  { header: 'Google Index Coverage', getter: (p) => p.audit_data?.Search_Console?.Index_Coverage_State || '' },
  { header: 'GSC Organic Clicks (30d)', getter: (p) => p.audit_data?.Search_Console?.Organic_Clicks_30d || '' },
  { header: 'GSC Impressions', getter: (p) => p.audit_data?.Search_Console?.Search_Impressions || '' },
  { header: 'GSC Average SERP Position', getter: (p) => p.audit_data?.Search_Console?.Average_SERP_Position || '' },
  { header: 'GA4 Organic Sessions (30d)', getter: (p) => p.audit_data?.Google_Analytics?.Sessions_30d || '' },
  { header: 'GA4 Bounce Rate', getter: (p) => p.audit_data?.Google_Analytics?.Bounce_Rate || '' },
  { header: 'Zombie Page Flag', getter: (p) => p.audit_data?.Google_Analytics?.Is_Zombie_Page ? 'TRUE' : 'FALSE' },
  { header: 'Zombie Pruning Action', getter: (p) => p.audit_data?.Google_Analytics?.Zombie_Recommended_Action || '' },
  { header: 'Revenue At Risk', getter: (p) => p.audit_data?.Google_Analytics?.Revenue_At_Risk || '' },
  { header: 'Google AI Overview Featured', getter: (p) => p.audit_data?.SERP_Data?.has_ai_overview ? 'TRUE' : 'FALSE' },
  { header: 'GEO Local Score', getter: (p) => p.audit_data?.GEO_Audit?.geo_score || '' },
  { header: 'Multiple Head Tags', getter: (p) => p.audit_data?.Validation?.['Multiple <head> Tags'] ? 'TRUE' : 'FALSE' },
  { header: 'Multiple Body Tags', getter: (p) => p.audit_data?.Validation?.['Multiple <body> Tags'] ? 'TRUE' : 'FALSE' },
  { header: 'Duplicate Title', getter: (p) => p.audit_data?.Page_Titles?.['Duplicate'] ? 'TRUE' : 'FALSE' },
  { header: 'Duplicate H1', getter: (p) => p.audit_data?.H1?.['Duplicate'] ? 'TRUE' : 'FALSE' },
  { header: 'Duplicate Content', getter: (p) => p.audit_data?.Content?.['Exact Duplicates'] ? 'TRUE' : 'FALSE' },
  { header: 'Missing Alt Text', getter: (p) => p.audit_data?.Images?.['Missing Alt Text'] ? 'TRUE' : 'FALSE' }
];

export function getCleanDomain(url) {
  if (!url) return 'site';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/[^a-zA-Z0-9]/g, '_');
  } catch {
    return 'site';
  }
}

/**
 * Export full 35+ column technical site audit to CSV
 */
export function exportMasterAuditToCSV(pages, targetUrl = '') {
  if (!pages || pages.length === 0) {
    toast.error('No crawl data available to export.');
    return;
  }

  const headers = MASTER_EXPORT_FIELDS.map(f => `"${f.header.replace(/"/g, '""')}"`);
  const rows = pages.map(page => {
    return MASTER_EXPORT_FIELDS.map(f => {
      try {
        const val = f.getter(page);
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      } catch {
        return '""';
      }
    }).join(',');
  });

  const domain = getCleanDomain(targetUrl);
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${domain}_technical_site_audit.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast.success('Technical Audit Exported to CSV', {
    description: `Exported ${pages.length} URLs across all 35+ audit parameters.`
  });
}

/**
 * Export multi-tab Excel Workbook (.xlsx) with Master URLs, Issues, and Summary
 */
export function exportMasterAuditToExcel(pages, targetUrl = '', issuesReport = []) {
  if (!pages || pages.length === 0) {
    toast.error('No crawl data available to export.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // 1. Sheet 1: Master Site Audit
  const masterData = pages.map(page => {
    const row = {};
    MASTER_EXPORT_FIELDS.forEach(f => {
      try {
        const val = f.getter(page);
        row[f.header] = val !== null && val !== undefined ? val : '';
      } catch {
        row[f.header] = '';
      }
    });
    return row;
  });
  const wsMaster = XLSX.utils.json_to_sheet(masterData);
  XLSX.utils.book_append_sheet(wb, wsMaster, 'Master Site Audit');

  // 2. Sheet 2: Issues & Diagnostics
  if (issuesReport && issuesReport.length > 0) {
    const issuesData = issuesReport.map(i => ({
      'Issue Name': i.name,
      'Category': i.category,
      'Type': i.type,
      'Priority': i.priority,
      'Affected URLs Count': i.count || i.affected_pages?.length || 0,
      'Percentage (%)': i.percentage || 0,
      'Root Cause': i.rootCause || '',
      'Impact': i.impact || '',
      'How to Fix': i.fixGuide || ''
    }));
    const wsIssues = XLSX.utils.json_to_sheet(issuesData);
    XLSX.utils.book_append_sheet(wb, wsIssues, 'Issues & Remediation');
  }

  // 3. Sheet 3: Crawl Summary
  const indexable = pages.filter(p => p.indexability !== 'Non-Indexable').length;
  const nonIndexable = pages.length - indexable;
  const status200 = pages.filter(p => (p.status_code || 200) === 200).length;
  const status3xx = pages.filter(p => p.status_code >= 300 && p.status_code < 400).length;
  const status4xx = pages.filter(p => p.status_code >= 400 && p.status_code < 500).length;
  const status5xx = pages.filter(p => p.status_code >= 500).length;

  const summaryData = [
    { 'Metric': 'Audited Domain', 'Value': targetUrl || 'N/A' },
    { 'Metric': 'Total Crawled URLs', 'Value': pages.length },
    { 'Metric': 'Indexable URLs', 'Value': indexable },
    { 'Metric': 'Non-Indexable URLs', 'Value': nonIndexable },
    { 'Metric': '200 OK URLs', 'Value': status200 },
    { 'Metric': '3xx Redirect URLs', 'Value': status3xx },
    { 'Metric': '4xx Client Error URLs', 'Value': status4xx },
    { 'Metric': '5xx Server Error URLs', 'Value': status5xx },
    { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Audit Summary');

  const domain = getCleanDomain(targetUrl);
  XLSX.writeFile(wb, `${domain}_technical_site_audit.xlsx`);

  toast.success('Technical Audit Exported to Excel (.xlsx)', {
    description: `Exported ${pages.length} URLs, Issues, and Summary across 3 workbooks.`
  });
}

/**
 * Export Issues list to CSV
 */
export function exportIssuesToCSV(issuesReport, targetUrl = '') {
  if (!issuesReport || issuesReport.length === 0) {
    toast.error('No issues detected to export.');
    return;
  }

  const headers = ['"Issue Name"', '"Category"', '"Type"', '"Priority"', '"Affected Count"', '"Percentage (%)"', '"Root Cause"', '"Fix Guide"'];
  const rows = issuesReport.map(i => [
    `"${(i.name || '').replace(/"/g, '""')}"`,
    `"${(i.category || '').replace(/"/g, '""')}"`,
    `"${(i.type || '').replace(/"/g, '""')}"`,
    `"${(i.priority || '').replace(/"/g, '""')}"`,
    `"${i.count || 0}"`,
    `"${i.percentage || 0}"`,
    `"${(i.rootCause || '').replace(/"/g, '""')}"`,
    `"${(i.fixGuide || '').replace(/"/g, '""')}"`
  ].join(','));

  const domain = getCleanDomain(targetUrl);
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${domain}_issues_remediation_roadmap.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast.success('Issues Roadmap Exported to CSV');
}
