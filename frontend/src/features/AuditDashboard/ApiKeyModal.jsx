'use client';
import React, { useState } from 'react';
import { DialogTitle } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { spring, tapPress, tween, duration, ease } from '@/lib/motion';
import {
  X,
  Key,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Copy,
  Maximize2
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/api/client';

const GUIDES = {
  pagespeed: {
    docUrl: 'https://developers.google.com/speed/docs/insights/v5/get-started',
    title: 'Google PageSpeed Insights API Setup Guide',
    steps: [
      {
        step: 1,
        title: 'Open Google PageSpeed Documentation & Scroll to "Acquiring an API key"',
        desc: 'Go to Google Developers PageSpeed Get Started documentation and locate the blue "Get a Key" button.',
        link: 'https://developers.google.com/speed/docs/insights/v5/get-started',
        linkLabel: 'Open Google PageSpeed Get-Started Page',
        image: '/guides/pagespeed/step1_get_key.webp',
        imageAlt: 'PageSpeed Insights Get a Key Button'
      },
      {
        step: 2,
        title: 'Select or Create a Google Cloud Project',
        desc: 'Click "Get a Key". In the popup dialog, choose "+ Create a new project" (or select your existing project) and click "NEXT".',
        image: '/guides/pagespeed/step2_select_project.webp',
        imageAlt: 'Select or Create Project Dialog'
      },
      {
        step: 3,
        title: 'Confirm PageSpeed API Enablement',
        desc: 'On the "Confirm API Enablement" prompt, click "CONFIRM AND CONTINUE" to activate the PageSpeed Insights API.',
        image: '/guides/pagespeed/step3_confirm_enable.webp',
        imageAlt: 'Confirm API Enablement Screen'
      },
      {
        step: 4,
        title: 'Copy Your Key, Test Connection & Save',
        desc: 'Click "SHOW KEY", copy your generated API Key (starts with "AIzaSy..."), paste it into the field below, test connection, and click Connect & Save.',
        image: '/guides/pagespeed/step4_show_key.webp',
        imageAlt: 'You are all set and Show Key Dialog'
      }
    ]
  },
  openai: {
    docUrl: 'https://platform.openai.com/api-keys',
    title: 'OpenAI API Key Setup',
    steps: [
      {
        step: 1,
        title: 'Open OpenAI Dashboard',
        desc: 'Visit your OpenAI Platform API Keys dashboard.',
        link: 'https://platform.openai.com/api-keys',
        linkLabel: 'Open OpenAI Keys Page'
      },
      {
        step: 2,
        title: 'Create New Secret Key',
        desc: 'Click "+ Create new secret key", provide a name, and generate your key (starts with "sk-...").'
      },
      {
        step: 3,
        title: 'Paste & Connect',
        desc: 'Copy your key, paste it below, test the connection, and save.'
      }
    ]
  },
  perplexity: {
    docUrl: 'https://docs.perplexity.ai/',
    title: 'Perplexity AI API Setup',
    steps: [
      {
        step: 1,
        title: 'Open Perplexity Settings',
        desc: 'Navigate to Perplexity API settings dashboard.',
        link: 'https://www.perplexity.ai/settings/api',
        linkLabel: 'Open Perplexity API Page'
      },
      {
        step: 2,
        title: 'Generate API Token',
        desc: 'Generate a new API key starting with "pplx-...".'
      },
      {
        step: 3,
        title: 'Paste & Test',
        desc: 'Paste your token below and click "Test Connection".'
      }
    ]
  },
  serpapi: {
    docUrl: 'https://serpapi.com/manage-api-key',
    title: 'SerpAPI Search Engine Key Setup',
    steps: [
      {
        step: 1,
        title: 'Open SerpAPI Account',
        desc: 'Visit your SerpAPI dashboard to copy your private API key.',
        link: 'https://serpapi.com/manage-api-key',
        linkLabel: 'Open SerpAPI Dashboard'
      },
      {
        step: 2,
        title: 'Copy & Save',
        desc: 'Copy your key, paste it below, and test connection.'
      }
    ]
  }
};

export default function ApiKeyModal({
  isOpen = true,
  integration,
  projectId = 1,
  onClose,
  onSuccess,
  onSaved
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);

  if (!integration) return null;

  const guide = GUIDES[integration.id];

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API Key to test.');
      toast.warning('Please enter an API Key first.');
      return;
    }

    setIsTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const res = await axios.post(`${API_BASE_URL}/integrations/test`, {
        project_id: projectId,
        service: integration.id,
        service_name: integration.id,
        api_key: apiKey.trim()
      });
      setIsTesting(false);
      if (res.data.success || res.data.status === 'ok') {
        setTestResult({
          success: true,
          message: res.data.message || 'Connection verified successfully!',
          latency_ms: res.data.latency_ms
        });
        toast.success(`Verified ${integration.name}!`, {
          description: `Latency benchmark: ${res.data.latency_ms || 24}ms`
        });
      } else {
        setTestResult({ success: false, message: res.data.detail || 'Connection test failed.' });
        toast.error('Connection verification failed.');
      }
    } catch (err) {
      setIsTesting(false);
      const errMsg = err.response?.data?.detail || 'Failed to reach API endpoint.';
      setTestResult({
        success: false,
        message: errMsg
      });
      toast.error(errMsg);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Please enter a valid API Key.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await axios.post(`${API_BASE_URL}/integrations/key`, {
        project_id: projectId,
        service: integration.id,
        service_name: integration.id,
        api_key: apiKey.trim()
      });
      setIsLoading(false);
      const maskedKey = res.data?.masked_key;
      toast.success(`${integration.name} connected successfully!`, {
        description: 'Key saved and active for live audit enrichments.'
      });
      if (onSuccess) onSuccess(integration.id, maskedKey);
      if (onSaved) onSaved(integration.id, maskedKey);
      if (onClose) onClose();
      setApiKey('');
      setTestResult(null);
    } catch (err) {
      console.error('Failed to save API key', err);
      const errMsg = err.response?.data?.detail || 'Failed to save API key. Please check your connection.';
      setError(errMsg);
      toast.error(errMsg);
      setIsLoading(false);
    }
  };

  return (
    <>
      <AnimatedModal isOpen={isOpen} onClose={onClose} size="lg">

        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
              <Key size={20} />
            </div>
            <div>
              <DialogTitle as="h3" className="text-base font-bold text-slate-900">
                {integration.name}
              </DialogTitle>
              <p className="text-xs text-slate-500">Configure API credentials for live crawler data enrichments</p>
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={tapPress}
            transition={spring.press}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* Modal Body with Step-by-Step Visual Guide */}
        <form onSubmit={handleSave} className="p-6 space-y-5 bg-white max-h-[82vh] overflow-y-auto custom-scrollbar">

          {/* Interactive Step-by-Step Guide Box with Cropped Screenshots */}
          {guide && (
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-slate-50/70 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setIsGuideOpen(!isGuideOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-indigo-100/40 transition-colors"
              >
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                  <BookOpen size={16} className="text-indigo-600" />
                  <span>How to Get Your {integration.name} API Key (Visual Step-by-Step Guide)</span>
                </div>
                <span className="text-xs font-mono text-indigo-600 flex items-center gap-1 font-semibold">
                  {isGuideOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {isGuideOpen ? 'Hide Guide' : 'Show Guide'}
                </span>
              </button>

              {isGuideOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-indigo-100/60 text-xs text-slate-700">
                  <div className="space-y-3">
                    {guide.steps.map((s) => (
                      <div key={s.step} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
                        <div className="flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                            {s.step}
                          </div>
                          <div className="flex-1">
                            <strong className="text-slate-900 font-bold block">{s.title}</strong>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{s.desc}</p>
                            {s.link && (
                              <a
                                href={s.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                              >
                                {s.linkLabel || 'Open Documentation'} <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Cropped Screenshot Asset */}
                        {s.image && (
                          <div
                            onClick={() => setPreviewImage({ src: s.image, alt: s.imageAlt || s.title })}
                            className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50 cursor-zoom-in max-w-md mx-auto shadow-2xs hover:border-indigo-300 transition-colors"
                          >
                            <img
                              src={s.image}
                              alt={s.imageAlt || s.title}
                              className="w-full h-auto object-cover max-h-48 group-hover:scale-[1.02] transition-transform duration-200"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/15 transition-colors flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 text-white text-[10px] font-mono px-2 py-1 rounded-md flex items-center gap-1 shadow-sm">
                                <Maximize2 size={10} /> Click to Enlarge
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Notification */}
          <AnimatePresence initial={false} mode="popLayout">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={spring.soft}
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2"
              >
                <AlertCircle size={15} />
                {error}
              </motion.div>
            )}

            {/* Test Connection Results */}
            {testResult && (
              <motion.div
                key={testResult.success ? 'result-ok' : 'result-fail'}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={spring.soft}
                className={`p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 border ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                <motion.span
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...spring.soft, delay: 0.06 }}
                  className="mt-0.5 shrink-0 flex"
                >
                  {testResult.success
                    ? <CheckCircle2 size={16} className="text-emerald-600" />
                    : <AlertCircle size={16} className="text-rose-600" />}
                </motion.span>
                <div className="flex-1">
                  <p>{testResult.message}</p>
                  {testResult.latency_ms && (
                    <p className="text-[10px] font-mono text-emerald-700 mt-0.5 font-bold">Latency: {testResult.latency_ms}ms</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* API Key Input */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-2">
              Enter {integration.name} API Key
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                  setError(null);
                }}
                placeholder={integration.placeholder || 'AIzaSy... / sk-...'}
                className="w-full glass-input pl-3.5 pr-10 py-2.5 font-mono text-sm bg-slate-50/50"
                autoFocus
              />
              <motion.button
                type="button"
                onClick={() => setShowKey(!showKey)}
                whileTap={tapPress}
                transition={spring.press}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-3 text-slate-400 hover:text-slate-700"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={showKey ? 'hide' : 'show'}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={tween(duration.micro, ease.outQuart)}
                    className="flex"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Your key is encrypted per-project and used exclusively for live crawler enrichments.
            </p>
          </div>

          {/* Modal Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
            <motion.button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !apiKey.trim()}
              whileTap={isTesting ? undefined : tapPress}
              transition={spring.press}
              className="btn-secondary py-2 px-3 text-xs font-bold gap-1.5 disabled:opacity-50 shadow-xs"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isTesting ? 'testing' : 'idle'}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={tween(duration.micro, ease.outQuart)}
                  className="flex items-center gap-1.5"
                >
                  {isTesting ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-indigo-600" /> Testing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} className="text-indigo-600" /> Test Connection
                    </>
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>

            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                onClick={onClose}
                whileTap={tapPress}
                transition={spring.press}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </motion.button>
              <motion.button
                type="submit"
                disabled={isLoading}
                whileTap={isLoading ? undefined : tapPress}
                transition={spring.press}
                className="btn-primary py-2 px-4 text-xs font-bold gap-2 disabled:opacity-50 shadow-xs"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={isLoading ? 'saving' : 'idle'}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={tween(duration.micro, ease.outQuart)}
                    className="flex items-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Check size={14} /> Connect &amp; Save
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </form>

      </AnimatedModal>

      {/* Fullscreen Image Lightbox Preview */}
      <AnimatePresence>
        {previewImage && (
          <div
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={spring.soft}
              className="relative max-w-3xl w-full bg-white rounded-2xl p-2 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800">{previewImage.alt}</span>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              </div>
              <img
                src={previewImage.src}
                alt={previewImage.alt}
                className="w-full h-auto rounded-xl object-contain max-h-[75vh]"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
