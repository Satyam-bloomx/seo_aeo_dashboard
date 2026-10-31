// Client-report branding, kept in this browser only.
export const REPORT_SETTINGS_KEY = 'audit_report_settings_v1';

export const DEFAULT_REPORT_SETTINGS = {
  agencyName: '',
  agencyLogo: '',
  clientName: '',
  preparedBy: '',
  accent: '#4f46e5',
};

export function loadReportSettings() {
  if (typeof window === 'undefined') return { ...DEFAULT_REPORT_SETTINGS };
  try {
    return { ...DEFAULT_REPORT_SETTINGS, ...JSON.parse(localStorage.getItem(REPORT_SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_REPORT_SETTINGS };
  }
}

// Returns false when the browser refused to store it (full or blocked storage).
export function saveReportSettings(settings) {
  try {
    localStorage.setItem(REPORT_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** Reads an image file and returns a small data URL (max 320x120 px) to keep storage and the PDF light. */
export function resizeLogoFile(file, maxW = 320, maxH = 120) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Please choose an image file (PNG, JPG or SVG).'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxW / img.width, maxH / img.height);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/png');
        if (out.length > 90000) {
          // Large PNG: flatten onto white and use JPEG.
          const ctx = canvas.getContext('2d');
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          out = canvas.toDataURL('image/jpeg', 0.82);
        }
        resolve({ dataUrl: out, width: w, height: h });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    img.src = url;
  });
}

export const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [79, 70, 229];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
