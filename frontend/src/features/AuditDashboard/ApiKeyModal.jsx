'use client';
import React, { useState } from 'react';
import { DialogTitle } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedModal from '@/components/ui/AnimatedModal';
import { spring, tapPress, tween, duration, ease } from '@/lib/motion';
import { X, Key, Check, Eye, EyeOff, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/api/client';

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

  if (!integration) return null;

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
      await axios.post(`${API_BASE_URL}/integrations/key`, {
        project_id: projectId,
        service: integration.id,
        service_name: integration.id,
        api_key: apiKey.trim()
      });
      setIsLoading(false);
      toast.success(`${integration.name} connected successfully!`, {
        description: 'Key saved and active for live audit enrichments.'
      });
      if (onSuccess) onSuccess(integration.id);
      if (onSaved) onSaved(integration.id);
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
    <AnimatedModal isOpen={isOpen} onClose={onClose} size="md">

              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                    <Key size={20} />
                  </div>
                  <div>
                    <DialogTitle as="h3" className="text-base font-bold text-slate-900">
                      {integration.name}
                    </DialogTitle>
                    <p className="text-xs text-slate-500">Configure key for live audit enrichments</p>
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

              {/* Modal Body */}
              <form onSubmit={handleSave} className="p-6 space-y-4 bg-white">
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

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Enter API Key
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
                      placeholder={integration.placeholder || 'sk-...'}
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
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Your key is securely stored per-project and used exclusively for live crawler enrichments.
                  </p>
                </div>

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
  );
}
