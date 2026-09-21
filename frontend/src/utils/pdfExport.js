import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

/**
 * Generate and download a sharp, multi-page A4 PDF client-side
 * @param {HTMLElement|string} elementOrId - The DOM element or ID of the report
 * @param {string} targetUrl - The audited website URL for filename naming
 */
export async function exportExecutiveReportToPDF(elementOrId, targetUrl = '') {
  const toastId = toast.loading('Compiling high-DPI A4 PDF report...', {
    description: 'Rendering vector layouts and multi-page scorecards.'
  });

  try {
    const element = typeof elementOrId === 'string'
      ? document.getElementById(elementOrId)
      : elementOrId;

    if (!element) {
      toast.error('Could not locate report container to export.', { id: toastId });
      return;
    }

    // Capture element with html2canvas at 2x scale for crisp, readable text
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1100,
      onclone: (clonedDoc) => {
        // Fix for Tailwind CSS v4 / modern browsers using oklch/lab colors which crash html2canvas
        try {
          const styleTags = clonedDoc.querySelectorAll('style');
          styleTags.forEach(style => {
            if (style.innerHTML && (style.innerHTML.includes('lab(') || style.innerHTML.includes('oklch('))) {
              style.innerHTML = style.innerHTML
                .replace(/lab\([^)]+\)/g, '#64748b')
                .replace(/oklch\([^)]+\)/g, '#64748b');
            }
          });
        } catch (e) {
          console.warn('Style sanitization warning:', e);
        }

        // Ensure cloned canvas container has full height and no overflow clipping
        const clonedEl = clonedDoc.getElementById(typeof elementOrId === 'string' ? elementOrId : element.id);
        if (clonedEl) {
          clonedEl.style.overflow = 'visible';
          clonedEl.style.maxHeight = 'none';
          clonedEl.style.height = 'auto';
          clonedEl.style.width = '1000px';
          clonedEl.style.padding = '32px';
        }
      }
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = 297; // A4 height in mm
    const margin = 10;
    const contentWidth = pdfWidth - (margin * 2); // 190mm
    const contentHeight = (canvas.height * contentWidth) / canvas.width;

    const pageContentHeight = pdfHeight - (margin * 2); // 277mm usable per page
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    let heightLeft = contentHeight;
    let position = margin;
    let pageNum = 1;

    // First page
    pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight, '', 'FAST');
    heightLeft -= pageContentHeight;

    // Subsequent pages
    while (heightLeft > 0) {
      position = margin - (pageNum * pageContentHeight);
      pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight, '', 'FAST');
      pageNum++;
      heightLeft -= pageContentHeight;
    }

    // Domain name formatting for download
    let domainSlug = 'website';
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
        domainSlug = parsed.hostname.replace(/[^a-zA-Z0-9]/g, '_');
      } catch {
        domainSlug = targetUrl.replace(/[^a-zA-Z0-9]/g, '_');
      }
    }

    const filename = `auditpro_executive_report_${domainSlug}.pdf`;
    pdf.save(filename);

    toast.success('Executive PDF Report Downloaded', {
      id: toastId,
      description: `Saved ${pageNum} page(s) in formatted A4 portrait.`
    });
  } catch (error) {
    console.error('PDF Generation Error:', error);
    toast.info('Opening formatted A4 Print & Save view...', {
      id: toastId,
      description: 'Use Destination: "Save as PDF" in print preview.'
    });
    setTimeout(() => {
      window.print();
    }, 400);
  }
}
