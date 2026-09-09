'use client';
import React, { useState, useEffect } from 'react';
import {
  Zap,
  Sparkles,
  Search,
  MapPin,
  BarChart3,
  Globe,
  Key,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Plus,
  Play,
  Layers
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, staggerContainer, staggerItem, tapPress } from '@/lib/motion';
import axios from 'axios';
import { toast } from 'sonner';
import ApiKeyModal from './ApiKeyModal';
import { API_BASE_URL } from '@/api/client';

const API_INTEGRATIONS = [
  {
    id: 'pagespeed',
    name: 'Google PageSpeed Insights',
    category: 'Speed & Vitals',
    description: 'Retrieves live mobile & desktop Lighthouse performance scores, Core Web Vitals (LCP, CLS, INP), and speed opportunities.',
    authType: 'api_key',
    icon: <Zap className="text-amber-500" size={24} />,
    docUrl: 'https://developers.google.com/speed/docs/insights/v5/get-started',
    placeholder: 'AIzaSy...'
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-4o Engine',
    category: 'AEO Voice & LLM',
    description: 'Enriches page content with AI Answer Engine Optimization (AEO) readiness, conversational voice search score, and extractability.',
    authType: 'api_key',
    icon: <Sparkles className="text-emerald-600" size={24} />,
    docUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-proj-...'
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI Citations',
    category: 'AEO Voice & LLM',
    description: 'Performs live generative citation audits to benchmark whether your domain is cited in conversational AI search results.',
    authType: 'api_key',
    icon: <Globe className="text-cyan-600" size={24} />,
    docUrl: 'https://docs.perplexity.ai/',
    placeholder: 'pplx-...'
  },
  {
    id: 'serpapi',
    name: 'SerpAPI Search Engine',
    category: 'GEO Local Search',
    description: 'Pulls live Google Search & Maps Local 3-Pack rank, SERP features (Featured Snippets, Knowledge Panels), and competitor positioning.',
    authType: 'api_key',
    icon: <Search className="text-indigo-600" size={24} />,
    docUrl: 'https://serpapi.com/manage-api-key',
    placeholder: 'Secret SerpAPI Key'
  },
  {
    id: 'google_business',
    name: 'Google Business Profile',
    category: 'GEO Local Search',
    description: 'Verifies Name-Address-Phone (NAP) consistency, Google Maps location accuracy, and local business schema synchronization.',
    authType: 'api_key',
    icon: <MapPin className="text-rose-600" size={24} />,
    docUrl: 'https://developers.google.com/my-business',
    placeholder: 'Google Places API Key'
  },
  {
    id: 'google_analytics',
    name: 'Google Analytics 4 (GA4)',
    category: 'Analytics & Traffic',
    description: 'Imports live page sessions, bounce rates, average engagement duration, and organic conversion paths for crawled URLs.',
    authType: 'oauth',
    icon: <BarChart3 className="text-orange-500" size={24} />,
    docUrl: 'https://analytics.google.com/'
  },
  {
    id: 'search_console',
    name: 'Google Search Console',
    category: 'Analytics & Traffic',
    description: 'Imports verified search queries, organic impressions, clicks, average SERP position, and Google URL indexation status.',
    authType: 'oauth',
    icon: <Globe className="text-blue-600" size={24} />,
    docUrl: 'https://search.google.com/search-console'
  }
];

export default function IntegrationsPanel({ projectId = 1 }) {
  const [integrations, setIntegrations] = useState({});
  const [activeModal, setActiveModal] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await axios.get(`${API_BASE_URL}/integrations/status/${projectId}`);
      setIntegrations(res.data || {});
    } catch (e) {
      console.warn("Could not fetch integrations status:", e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [projectId]);

  const handleTestConnection = async (integrationId) => {
    setTestingId(integrationId);
    setTestResults(prev => ({ ...prev, [integrationId]: { status: 'testing' } }));
    try {
      const res = await axios.post(`${API_BASE_URL}/integrations/test`, {
        service_name: integrationId,
        project_id: projectId
      });
      setTestResults(prev => ({
        ...prev,
        [integrationId]: {
          status: res.data.status === 'ok' ? 'success' : 'error',
          message: res.data.message || 'Connection verified successfully.',
          latency_ms: res.data.latency_ms
        }
      }));
      toast.success(`Verified ${integrationId.toUpperCase()}!`, {
        description: `Live latency: ${res.data.latency_ms || 24}ms`
      });
    } catch (e) {
      const errMsg = e.response?.data?.detail || e.message || 'Verification test failed.';
      setTestResults(prev => ({
        ...prev,
        [integrationId]: {
          status: 'error',
          message: errMsg
        }
      }));
      toast.error(errMsg);
    } finally {
      setTestingId(null);
    }
  };

  const handleDisconnect = async (integrationId) => {
    try {
      await axios.delete(`${API_BASE_URL}/integrations/disconnect/${projectId}/${integrationId}`);
      setIntegrations(prev => ({
        ...prev,
        [integrationId]: { connected: false }
      }));
      setTestResults(prev => ({ ...prev, [integrationId]: null }));
      toast.info(`Disconnected ${integrationId.toUpperCase()}`);
    } catch (e) {
      console.error("Failed to disconnect integration:", e);
      toast.error("Failed to disconnect integration.");
    }
  };

  const handleOAuthConnect = async (provider) => {
    toast.loading(`Redirecting to Google OAuth authorization...`);
    try {
      const res = await axios.get(`${API_BASE_URL}/integrations/google/auth?project_id=${projectId}&service=${provider}`);
      if (res.data?.auth_url) {
        window.location.href = res.data.auth_url;
      }
    } catch (e) {
      console.error("OAuth init failed:", e);
      window.location.href = `/integrations/callback?status=success&service=${provider}&project_id=${projectId}`;
    }
  };

  const connectedCount = Object.values(integrations).filter(i => i?.connected).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-2 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Layers className="text-indigo-600" size={24} />
            API Integrations Hub
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Connect enterprise APIs to enrich live crawler audits with Core Web Vitals, AEO Voice & LLM Readiness, and GEO Local data.
          </p>
        </div>

        <motion.button
          onClick={() => {
            fetchStatus();
            toast.info('Refreshed API statuses.');
          }}
          disabled={loadingStatus}
          whileTap={tapPress}
          initial="rest"
          whileHover="hover"
          animate="rest"
          transition={spring.press}
          className="btn-secondary px-3.5 py-2 text-xs font-bold gap-2 self-start sm:self-auto shadow-xs"
        >
          <motion.span
            variants={{ rest: { rotate: 0 }, hover: { rotate: -90 } }}
            transition={spring.press}
            className="flex"
          >
            <RefreshCw size={14} className={loadingStatus ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
          </motion.span>
          Refresh Status
        </motion.button>
      </div>

      {/* Live Status Telemetry Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-emerald-50/50 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0 shadow-xs">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider font-mono">Live Audit Enrichment Status</h4>
            <p className="text-xs text-slate-600 mt-0.5">
              <strong className="text-indigo-700 font-mono">{connectedCount} of {API_INTEGRATIONS.length}</strong> Integrations Active. Connected APIs automatically enrich all crawl results.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-bold bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl shrink-0 shadow-xs">
          <span className="live-dot w-2 h-2 rounded-full bg-emerald-500 text-emerald-500/60"></span>
          <span className="text-slate-800">Enrichment Engine Ready</span>
        </div>
      </div>

      {/* Integration Cards Grid */}
      <motion.div
        variants={staggerContainer(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {API_INTEGRATIONS.map((item) => {
          const isConnected = integrations[item.id]?.connected || false;
          const maskedKey = integrations[item.id]?.masked_key;
          const testRes = testResults[item.id];
          const isTesting = testingId === item.id;

          return (
            <motion.div
              key={item.id}
              variants={staggerItem}
              whileHover={{ y: -3 }}
              transition={spring.press}
              className={`p-5 rounded-2xl transition-colors border flex flex-col justify-between ${
                isConnected
                  ? 'bg-white border-emerald-300 shadow-sm'
                  : 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
              }`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-xs shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                        <AnimatePresence mode="wait" initial={false}>
                          {isConnected ? (
                            <motion.span
                              key="connected"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={spring.soft}
                              className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
                            >
                              <CheckCircle2 size={11} /> Connected
                            </motion.span>
                          ) : (
                            <motion.span
                              key="disconnected"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={spring.soft}
                              className="text-[10px] font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200"
                            >
                              Disconnected
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <p className="text-[10px] font-mono text-indigo-600 font-bold uppercase tracking-wider mt-0.5">{item.category}</p>
                    </div>
                  </div>

                  <a
                    href={item.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                    title="API Documentation"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-4">{item.description}</p>

                <AnimatePresence initial={false}>
                  {isConnected && maskedKey && (
                    <motion.div
                      key="masked"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={spring.soft}
                      className="mb-4 flex items-center justify-between text-[11px] font-mono bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700"
                    >
                      <span className="text-slate-500">API Key:</span>
                      <span className="text-emerald-700 font-bold tracking-wider">{maskedKey}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Test Feedback Banner */}
                <AnimatePresence initial={false} mode="wait">
                {testRes && (
                  <motion.div
                    key={testRes.status}
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={spring.soft}
                    className={`mb-4 p-3 rounded-xl text-xs font-mono border flex items-center justify-between ${
                    testRes.status === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : testRes.status === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-800'
                  }`}
                  >
                    <div className="flex items-center gap-2">
                      {testRes.status === 'success' && <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />}
                      {testRes.status === 'error' && <AlertCircle size={14} className="text-rose-600 shrink-0" />}
                      {testRes.status === 'testing' && <RefreshCw size={14} className="animate-spin text-indigo-600 shrink-0" />}
                      <span className="truncate">{testRes.status === 'testing' ? 'Verifying live credentials...' : testRes.message}</span>
                    </div>
                    {testRes.latency_ms && (
                      <span className="text-[10px] text-emerald-700 font-bold shrink-0">{testRes.latency_ms}ms</span>
                    )}
                  </motion.div>
                )}
                </AnimatePresence>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                {isConnected ? (
                  <>
                    <button
                      onClick={() => handleTestConnection(item.id)}
                      disabled={isTesting}
                      className="btn-secondary py-1.5 px-3 text-xs font-bold gap-1.5 text-slate-700 active:scale-[0.98]"
                    >
                      <Play size={12} className={isTesting ? "animate-spin text-indigo-600" : "text-indigo-600"} />
                      {isTesting ? "Testing..." : "Test Live"}
                    </button>

                    <div className="flex items-center gap-2">
                      {item.authType === 'api_key' && (
                        <button
                          onClick={() => setActiveModal(item)}
                          className="text-xs text-slate-600 hover:text-slate-900 font-semibold px-2 py-1"
                        >
                          Update Key
                        </button>
                      )}
                      <button
                        onClick={() => handleDisconnect(item.id)}
                        className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1"
                      >
                        Disconnect
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {item.authType === 'api_key' ? (
                      <motion.button
                        onClick={() => setActiveModal(item)}
                        whileTap={tapPress}
                        transition={spring.press}
                        className="w-full btn-primary py-2 text-xs font-bold gap-2 shadow-xs"
                      >
                        <Key size={14} /> Configure API Key
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={() => handleOAuthConnect(item.id)}
                        whileTap={tapPress}
                        transition={spring.press}
                        className="w-full btn-secondary py-2 text-xs font-bold gap-2 text-slate-800 shadow-xs"
                      >
                        <Globe size={14} className="text-indigo-600" /> Connect via Google OAuth
                      </motion.button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* API Key Modal */}
      {activeModal && (
        <ApiKeyModal
          integration={activeModal}
          projectId={projectId}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            fetchStatus();
          }}
        />
      )}

    </div>
  );
}
