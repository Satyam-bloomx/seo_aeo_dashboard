import { toast } from 'sonner';

/**
 * Robust clipboard copy utility with automatic fallback for non-secure contexts,
 * iframe restrictions, or unsupported browsers.
 *
 * @param {string} text - The raw text to copy
 * @param {string} [label] - Optional friendly label for toast notification (e.g. "URL", "Title 1")
 * @returns {Promise<boolean>} - Resolves to true if copied successfully, false otherwise
 */
export async function copyToClipboard(text, label = 'Text') {
  if (text === null || text === undefined) {
    toast.error('Nothing to copy (empty value)');
    return false;
  }

  const cleanText = String(text).trim();
  if (!cleanText) {
    toast.error('Nothing to copy (empty text)');
    return false;
  }

  let success = false;

  // 1. Try Modern Async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(cleanText);
      success = true;
    } catch (err) {
      console.warn('Modern navigator.clipboard.writeText failed, attempting execCommand fallback:', err);
    }
  }

  // 2. Fallback using temporary textarea element for HTTP / older browsers / iframe contexts
  if (!success && typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = cleanText;
      // Ensure element is off-screen and invisible to avoid UI jumps
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);

      textArea.select();
      textArea.setSelectionRange(0, 99999); // Mobile Safari support

      success = document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch (fallbackErr) {
      console.error('execCommand copy fallback failed:', fallbackErr);
      success = false;
    }
  }

  if (success) {
    const preview = cleanText.length > 40 ? `${cleanText.slice(0, 37)}...` : cleanText;
    toast.success(`${label} copied to clipboard`, {
      description: preview,
      duration: 2200,
    });
    return true;
  } else {
    toast.error(`Unable to copy ${label} to clipboard. Please copy manually.`);
    return false;
  }
}
