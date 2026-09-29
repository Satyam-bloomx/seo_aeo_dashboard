'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Play,
  Layers,
  Check,
  Copy,
  Trash2,
  Edit3,
  Sliders
} from 'lucide-react';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import { spring, staggerContainer, staggerItem, tapPress } from '@/lib/motion';
import axios from 'axios';
import { toast } from 'sonner';
import ApiKeyModal from './ApiKeyModal';
import IntegrationsWorkspace from './IntegrationsWorkspace';
import { API_BASE_URL } from '@/api/client';
import { copyToClipboard } from '@/utils/clipboard';

const API_INTEGRATIONS = [
  {
    id: 'pagespeed',
    name: 'Google PageSpeed Insights',
    category: 'Speed & Vitals',
    categoryColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
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
    categoryColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
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
    categoryColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
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
    categoryColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50',
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
    categoryColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50',
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
    categoryColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
    description: 'Imports live page sessions, bounce rates, average engagement duration, and organic conversion paths for crawled URLs.',
    authType: 'oauth',
    icon: <BarChart3 className="text-orange-500" size={24} />,
    docUrl: 'https://analytics.google.com/',
    placeholder: 'ya29.a0A... (Google OAuth Bearer Access Token)'
  },
  {
    id: 'search_console',
    name: 'Google Search Console',
    category: 'Analytics & Traffic',
    categoryColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
    description: 'Imports verified search queries, organic impressions, clicks, average SERP position, and Google URL indexation status.',
    authType: 'oauth',
    icon: <Globe className="text-blue-600" size={24} />,
    docUrl: 'https://search.google.com/search-console',
    placeholder: 'ya29.a0A... (Google OAuth Bearer Access Token)'
  }
];

const CATEGORIES = ['All', 'Speed & Vitals', 'AEO Voice & LLM', 'GEO Local Search', 'Analytics & Traffic'];

export default function IntegrationsPanel({ projectId = 1, crawlId = null, seedUrl = null, onAuditProperty = null }) {
  const [integrations, setIntegrations] = useState({});
  const [activeModal, setActiveModal] = useState(null);
  const [modalInitialTab, setModalInitialTab] = useState('one_click');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'workspace'
  const [workspaceService, setWorkspaceService] = useState('search_console');
  const [gscProperties, setGscProperties] = useState([]);
  const [selectedGscProperty, setSelectedGscProperty] = useState('');
  const [loadingProperties, setLoadingProperties] = useState(false);

  // Connection / OAuth Error State
  const [serviceErrors, setServiceErrors] = useState({});

  // GA4 Properties & Manual Override State
  const [ga4Properties, setGa4Properties] = useState([]);
  const [selectedGa4Property, setSelectedGa4Property] = useState('');
  const [manualGa4PropertyId, setManualGa4PropertyId] = useState('');
  const [loadingGa4Properties, setLoadingGa4Properties] = useState(false);
  const [isSavingGa4Property, setIsSavingGa4Property] = useState(false);

  const handleDismissError = async (serviceId) => {
    setServiceErrors(prev => {
      const copy = { ...prev };
      delete copy[serviceId];
      return copy;
    });
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('last_integration_error');
      }
      await axios.post(`${API_BASE_URL}/integrations/clear-error/${projectId}/${serviceId}`);
    } catch {}
  };

  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const res = await axios.get(`${API_BASE_URL}/integrations/status/${projectId}`);
      const data = res.data;
      const map = {};
      const errMap = {};
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (item && item.id) {
            map[item.id] = item;
            if (item.auth_error) {
              errMap[item.id] = item.auth_error;
            }
          }
        });
      } else if (data && typeof data === 'object') {
        Object.assign(map, data);
      }
      setIntegrations(map);
      if (Object.keys(errMap).length > 0) {
        setServiceErrors(prev => ({ ...prev, ...errMap }));
      }
      
      // Sync selected properties from DB status
      if (map['search_console']?.selected_property) {
        setSelectedGscProperty(map['search_console'].selected_property);
      }
      if (map['google_analytics']?.selected_property) {
        setSelectedGa4Property(map['google_analytics'].selected_property);
        setManualGa4PropertyId(map['google_analytics'].selected_property.replace(/^properties\//, ''));
      }
    } catch (e) {
      console.warn("Could not fetch integrations status:", e);
    } finally {
      setLoadingStatus(false);
    }
  }, [projectId]);

  const fetchGscProperties = useCallback(async () => {
    try {
      setLoadingProperties(true);
      const res = await axios.get(`${API_BASE_URL}/integrations/google/properties/${projectId}`);
      if (res.data?.properties) {
        setGscProperties(res.data.properties);
        if (res.data.selected_property) {
          setSelectedGscProperty(res.data.selected_property);
        } else if (res.data.properties.length > 0) {
          setSelectedGscProperty(res.data.properties[0].siteUrl);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch GSC properties:', err);
    } finally {
      setLoadingProperties(false);
    }
  }, [projectId]);

  const fetchGa4Properties = useCallback(async () => {
    try {
      setLoadingGa4Properties(true);
      const res = await axios.get(`${API_BASE_URL}/integrations/google/properties/${projectId}?service=google_analytics`);
      if (res.data?.properties) {
        setGa4Properties(res.data.properties);
      }
      if (res.data?.selected_property) {
        setSelectedGa4Property(res.data.selected_property);
        setManualGa4PropertyId(res.data.selected_property.replace(/^properties\//, ''));
      }
    } catch (err) {
      console.warn('Failed to fetch GA4 properties:', err);
    } finally {
      setLoadingGa4Properties(false);
    }
  }, [projectId]);

  // Initial status fetch on mount or projectId change
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Fetch properties when services are connected
  const isGscConnected = Boolean(integrations['search_console']?.connected);
  useEffect(() => {
    if (isGscConnected) {
      fetchGscProperties();
    }
  }, [isGscConnected, fetchGscProperties]);

  const isGa4Connected = Boolean(integrations['google_analytics']?.connected);
  useEffect(() => {
    if (isGa4Connected) {
      fetchGa4Properties();
    }
  }, [isGa4Connected, fetchGa4Properties]);

  // Listen for OAuth error, warning, or success in URL search params or sessionStorage
  useEffect(() => {
    let urlOauthError = null;
    let urlWarning = null;
    let urlAccount = null;
    let urlService = null;
    let urlOpenModal = null;
    let urlTabType = null;
    let urlConnected = null;

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      urlOauthError = searchParams.get('oauth_error');
      urlWarning = searchParams.get('warning');
      urlAccount = searchParams.get('account');
      urlService = searchParams.get('service');
      urlOpenModal = searchParams.get('open_modal');
      urlTabType = searchParams.get('tab_type');
      urlConnected = searchParams.get('connected');
    }

    if (urlWarning === 'no_properties') {
      fetchStatus();
      if (urlService === 'search_console') fetchGscProperties();
      if (urlService === 'google_analytics') fetchGa4Properties();
      const serviceName = urlService === 'google_analytics'
        ? 'Google Analytics 4'
        : urlService === 'search_console'
        ? 'Google Search Console'
        : 'Google Service';
      toast.warning(`Signed in as ${urlAccount || 'Google User'}, but NO active ${serviceName} properties were found.`, {
        description: 'This account lacks property permissions. See the diagnostic instructions on the card below.',
        duration: 9000
      });
      try {
        const cleanUrl = window.location.pathname + (urlService ? `?tab=integrations&service=${urlService}` : '?tab=integrations');
        window.history.replaceState({}, document.title, cleanUrl);
      } catch {}
    } else if (urlConnected === 'true') {
      fetchStatus();
      const serviceName = urlService === 'google_analytics' 
        ? 'Google Analytics 4' 
        : urlService === 'search_console' 
        ? 'Google Search Console' 
        : 'Google Service';
      toast.success(`${serviceName} connected successfully!`, {
        description: 'Live telemetry is active and synchronized.',
        duration: 7000
      });
      try {
        const cleanUrl = window.location.pathname + (urlService ? `?tab=integrations&service=${urlService}` : '?tab=integrations');
        window.history.replaceState({}, document.title, cleanUrl);
      } catch {}
    }

    if (urlOauthError) {
      const decoded = decodeURIComponent(urlOauthError);
      const targetSvc = urlService || 'google_analytics';
      setServiceErrors(prev => ({ ...prev, [targetSvc]: decoded }));
      toast.error(`Authentication Failed: ${decoded.slice(0, 100)}`, {
        description: 'See the diagnostic details on the service card below.',
        duration: 9000
      });
    }

    if (urlOpenModal) {
      const targetItem = API_INTEGRATIONS.find(i => i.id === urlOpenModal);
      if (targetItem) {
        setModalInitialTab(urlTabType || 'direct_token');
        setActiveModal(targetItem);
      }
    }

    // Also check sessionStorage for last error
    try {
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('last_integration_error');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.service && parsed?.error && (Date.now() - (parsed.timestamp || 0) < 3600000)) {
            setServiceErrors(prev => ({ ...prev, [parsed.service]: parsed.error }));
          }
        }
      }
    } catch {}
  }, [fetchStatus, fetchGscProperties, fetchGa4Properties]);

  const handleSelectGa4Property = async (propId) => {
    if (!propId || !propId.trim()) {
      toast.warning('Please enter a valid GA4 Property ID (numeric)');
      return;
    }
    const cleanId = propId.trim().startsWith('properties/') ? propId.trim() : `properties/${propId.trim()}`;
    setSelectedGa4Property(cleanId);
    setManualGa4PropertyId(cleanId.replace(/^properties\//, ''));
    setIsSavingGa4Property(true);
    try {
      await axios.post(`${API_BASE_URL}/integrations/google/select-property`, {
        project_id: projectId,
        service: 'google_analytics',
        property_url: cleanId
      });
      toast.success('GA4 Property Saved & Synchronized', {
        description: `Active Property: ${cleanId}`
      });
      fetchStatus();
    } catch (e) {
      toast.error('Failed to save selected GA4 property');
    } finally {
      setIsSavingGa4Property(false);
    }
  };

  const handleSelectProperty = async (propertyUrl) => {
    setSelectedGscProperty(propertyUrl);
    try {
      await axios.post(`${API_BASE_URL}/integrations/google/select-property`, {
        project_id: projectId,
        service: 'search_console',
        property_url: propertyUrl
      });
      toast.success('GSC Property Saved', {
        description: `Targeting property: ${propertyUrl}`
      });
      fetchStatus();
    } catch (e) {
      toast.error('Failed to save selected property');
    }
  };

  const handleTestConnection = async (integrationId) => {
    setTestingId(integrationId);
    setTestResults(prev => ({ ...prev, [integrationId]: { status: 'testing' } }));
    try {
      const res = await axios.post(`${API_BASE_URL}/integrations/test`, {
        service: integrationId,
        service_name: integrationId,
        project_id: projectId
      });
      const isSuccess = res.data.success || res.data.status === 'ok';
      const isWarning = res.data.status === 'warning';
      const displayMessage = res.data.message || res.data.detail || (isSuccess ? 'Connection verified successfully.' : 'Verification failed.');
      setTestResults(prev => ({
        ...prev,
        [integrationId]: {
          status: isSuccess ? 'success' : isWarning ? 'warning' : 'error',
          message: displayMessage,
          detail: res.data.detail,
          account_email: res.data.account_email,
          latency_ms: res.data.latency_ms
        }
      }));
      if (isSuccess) {
        toast.success(`Verified ${integrationId.replace(/_/g, ' ').toUpperCase()}!`, {
          description: `Live latency: ${res.data.latency_ms || 24}ms`
        });
      } else if (isWarning) {
        toast.warning(displayMessage, {
          description: 'Account lacks permissions. See instructions on the card below.',
          duration: 9000
        });
      } else {
        toast.error(displayMessage, {
          duration: 8000
        });
      }
    } catch (e) {
      const errMsg = e.response?.data?.detail || e.message || 'Verification test failed.';
      setTestResults(prev => ({
        ...prev,
        [integrationId]: {
          status: 'error',
          message: errMsg,
          detail: errMsg
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
        [integrationId]: { id: integrationId, connected: false, has_key: false, masked_key: null }
      }));
      setTestResults(prev => ({ ...prev, [integrationId]: null }));
      toast.info(`Disconnected ${integrationId.replace(/_/g, ' ').toUpperCase()}`);
    } catch (e) {
      console.warn("Delete disconnect failed, trying post fallback:", e);
      try {
        await axios.post(`${API_BASE_URL}/integrations/disconnect`, {
          project_id: projectId,
          service: integrationId
        });
        setIntegrations(prev => ({
          ...prev,
          [integrationId]: { id: integrationId, connected: false, has_key: false, masked_key: null }
        }));
        setTestResults(prev => ({ ...prev, [integrationId]: null }));
        toast.info(`Disconnected ${integrationId.replace(/_/g, ' ').toUpperCase()}`);
      } catch (postErr) {
        console.error("Failed to disconnect integration:", postErr);
        toast.error("Failed to disconnect integration.");
      }
    }
  };

  const handleOAuthConnect = async (provider) => {
    const providerTitle = provider === 'search_console' ? 'Google Search Console' : 'Google Analytics 4';
    toast.loading(`Connecting to ${providerTitle}...`, { id: 'oauth-toast' });
    try {
      const redirectUri = window.location.origin;
      const res = await axios.get(
        `${API_BASE_URL}/integrations/google/auth?project_id=${projectId}&service=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}`
      );
      toast.dismiss('oauth-toast');
      
      if (res.data?.configured && res.data?.auth_url) {
        window.location.href = res.data.auth_url;
      } else if (res.data?.status === 'missing_credentials' || res.data?.configured === false) {
        toast.warning(`Google OAuth Client ID not configured in .env`, {
          description: `Please add GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET to backend/.env, or enter your Access Token (ya29...) below.`,
          duration: 7000
        });
        const targetItem = API_INTEGRATIONS.find(i => i.id === provider);
        if (targetItem) {
          setActiveModal(targetItem);
        }
      } else if (res.data?.auth_url) {
        window.location.href = res.data.auth_url;
      }
    } catch (e) {
      toast.dismiss('oauth-toast');
      toast.error(`Failed to connect to ${providerTitle}.`);
    }
  };

  const handleCopyKey = async (keyId, text) => {
    if (!text) return;
    const ok = await copyToClipboard(text, "Key reference");
    if (ok) {
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    }
  };

  const connectedCount = useMemo(() => {
    return Object.values(integrations).filter(i => Boolean(i?.connected || i?.selected_property || i?.has_telemetry)).length;
  }, [integrations]);

  const filteredIntegrations = useMemo(() => {
    if (selectedCategory === 'All') return API_INTEGRATIONS;
    return API_INTEGRATIONS.filter(item => item.category === selectedCategory);
  }, [selectedCategory]);

  if (viewMode === 'workspace') {
    return (
      <IntegrationsWorkspace
        projectId={projectId}
        crawlId={crawlId}
        initialService={workspaceService}
        onBackToGrid={() => setViewMode('grid')}
        integrationsStatus={integrations}
        onOpenModal={(item) => setActiveModal(item)}
        onOAuthConnect={(svc) => handleOAuthConnect(svc)}
        onRefreshStatus={fetchStatus}
        onAuditProperty={onAuditProperty}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-2 gap-5 pb-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Layers className="text-indigo-600 dark:text-indigo-400" size={24} />
            API Integrations Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Connect enterprise APIs to enrich live crawler audits with Core Web Vitals, AEO Voice & LLM Readiness, and GEO Local data.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Layers size={13} />
              Connections
            </button>
            <button
              onClick={() => setViewMode('workspace')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'workspace' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <BarChart3 size={13} />
              Live Workspace
              {connectedCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                  {connectedCount}
                </span>
              )}
            </button>
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
            className="btn-secondary px-3.5 py-2 text-xs font-bold gap-2 shadow-xs"
          >
            <motion.span
              variants={{ rest: { rotate: 0 }, hover: { rotate: -90 } }}
              transition={spring.press}
              className="flex"
            >
              <RefreshCw size={14} className={loadingStatus ? 'animate-spin text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'} />
            </motion.span>
            Refresh Status
          </motion.button>
        </div>
      </div>

      {/* Live Status Telemetry Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/30 to-emerald-50/70 dark:from-indigo-950/40 dark:via-slate-900/60 dark:to-emerald-950/30 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-xs">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider font-mono">Live Audit Enrichment Status</h4>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300">
                {connectedCount} of {API_INTEGRATIONS.length} Active
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Active APIs automatically hook into the crawl pipeline to enrich URLs with AI benchmarks and real performance metrics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs font-mono font-bold bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl shrink-0 shadow-xs">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-slate-800 dark:text-slate-200">
            {connectedCount > 0 ? `${connectedCount} Engines Synchronized` : 'Enrichment Engine Ready'}
          </span>
        </div>
      </div>

      {/* Active Service Error Summary Banner */}
      {Object.keys(serviceErrors).length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 flex items-start justify-between gap-3 text-rose-900 dark:text-rose-200 shadow-xs shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/60 border border-rose-300 dark:border-rose-700 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-rose-950 dark:text-rose-100 uppercase tracking-wider font-mono">
                Google Authentication Notice
              </h4>
              <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5 leading-relaxed">
                Google rejected authorization for {Object.keys(serviceErrors).map(s => s.replace(/_/g, ' ').toUpperCase()).join(', ')}. Review the diagnostic error details on the card below or connect directly using a Service Account JSON.
              </p>
            </div>
          </div>
          <button
            onClick={() => setServiceErrors({})}
            className="text-xs text-rose-700 dark:text-rose-400 hover:underline font-bold px-2 py-1 cursor-pointer shrink-0"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Category Filter Navigation Bar */}
      <div className="shrink-0 flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
        <LayoutGroup id="integrations-category-filter">
          {CATEGORIES.map(category => {
            const isSelected = selectedCategory === category;
            const count = category === 'All'
              ? API_INTEGRATIONS.length
              : API_INTEGRATIONS.filter(item => item.category === category).length;

            return (
              <motion.button
                key={category}
                onClick={() => setSelectedCategory(category)}
                whileTap={tapPress}
                transition={spring.press}
                className={`relative px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-2 cursor-pointer select-none ${
                  isSelected
                    ? 'text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 shadow-xs'
                }`}
              >
                {/* Gliding active indicator pill */}
                {isSelected && (
                  <motion.span
                    layoutId="active-integration-category"
                    transition={spring.snap}
                    className="absolute inset-0 -z-10 rounded-xl bg-slate-900 dark:bg-indigo-600 shadow-xs"
                  />
                )}
                <span>{category}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {count}
                </span>
              </motion.button>
            );
          })}
        </LayoutGroup>
      </div>

      {/* Integration Cards Grid */}
      <motion.div
        variants={staggerContainer(0.05, 0.04)}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {filteredIntegrations.map((item) => {
          const integrationState = integrations[item.id];
          const isConnected = Boolean(integrationState?.connected || integrationState?.selected_property || integrationState?.has_telemetry);
          const hasConfiguredApp = Boolean(integrationState?.has_configured_app);
          const maskedKey = integrationState?.masked_key;
          const testRes = testResults[item.id];
          const isTesting = testingId === item.id;
          const activeError = serviceErrors[item.id] || integrationState?.auth_error;
          const hasError = Boolean(activeError);
          const hasNoProperties = Boolean(
            integrationState?.has_no_properties ||
            (isConnected && !integrationState?.selected_property && item.id === 'search_console' && gscProperties.length === 0 && !loadingProperties) ||
            (isConnected && !integrationState?.selected_property && item.id === 'google_analytics' && ga4Properties.length === 0 && !loadingGa4Properties && !manualGa4PropertyId)
          );
          const accountEmail = integrationState?.account_email;
          const noPropertiesWarning = integrationState?.no_properties_warning || (hasNoProperties ? `Signed in as '${accountEmail || 'Google User'}', but no active properties were found.` : null);
          const diagnosticHelp = integrationState?.diagnostic_help;

          return (
            <motion.div
              key={item.id}
              variants={staggerItem}
              whileHover={{ y: -2 }}
              transition={spring.press}
              className={`p-5 rounded-2xl transition-all border flex flex-col justify-between ${
                hasError && !isConnected
                  ? 'bg-white dark:bg-slate-900/90 border-rose-400 dark:border-rose-600/80 shadow-xs ring-2 ring-rose-500/20'
                  : hasNoProperties
                  ? 'bg-white dark:bg-slate-900/90 border-amber-400 dark:border-amber-600/80 shadow-xs ring-1 ring-amber-400/25'
                  : isConnected
                  ? 'bg-white dark:bg-slate-900/90 border-emerald-400/80 dark:border-emerald-500/60 shadow-xs ring-1 ring-emerald-400/20'
                  : hasConfiguredApp
                  ? 'bg-white dark:bg-slate-900/90 border-amber-300 dark:border-amber-800/80 shadow-xs ring-1 ring-amber-400/20'
                  : 'bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-xs shrink-0 border ${
                      hasError && !isConnected
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60' 
                        : hasNoProperties
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60'
                        : isConnected 
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60' 
                        : hasConfiguredApp
                        ? 'bg-amber-50/60 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60'
                    }`}>
                      {item.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</h3>
                        <AnimatePresence mode="wait" initial={false}>
                          {hasError && !isConnected ? (
                            <motion.span
                              key="error"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={spring.soft}
                              className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-300/80 dark:border-rose-700/60 px-2.5 py-0.5 rounded-full shadow-2xs"
                            >
                              <AlertTriangle size={11} className="text-rose-600 dark:text-rose-400" />
                              OAuth Failed
                            </motion.span>
                          ) : hasNoProperties ? (
                            <motion.span
                              key="no-properties"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={spring.soft}
                              className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-300/80 dark:border-amber-700/60 px-2.5 py-0.5 rounded-full shadow-2xs"
                            >
                              <AlertTriangle size={11} className="text-amber-600 dark:text-amber-400" />
                              No Active Properties
                            </motion.span>
                          ) : isConnected ? (
                            <motion.span
                              key="connected"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={spring.soft}
                              className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300/80 dark:border-emerald-700/60 px-2.5 py-0.5 rounded-full shadow-2xs"
                            >
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              Connected
                            </motion.span>
                          ) : hasConfiguredApp ? (
                            <motion.span
                              key="configured"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={spring.soft}
                              className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-300/80 dark:border-amber-700/60 px-2.5 py-0.5 rounded-full shadow-2xs"
                            >
                              <Sliders size={11} className="text-amber-600 dark:text-amber-400" />
                              App Configured • Sign-In Required
                            </motion.span>
                          ) : (
                            <motion.span
                              key="disconnected"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={spring.soft}
                              className="text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700"
                            >
                              Disconnected
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <span className={`inline-block text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border mt-1 ${item.categoryColor}`}>
                        {item.category}
                      </span>
                    </div>
                  </div>

                  <a
                    href={item.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                    title="API Documentation"
                  >
                    <ExternalLink size={15} />
                  </a>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{item.description}</p>

                {/* OAuth / Connection Error Banner */}
                {hasError && !isConnected && (
                  <div className="mb-4 p-3.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-rose-950 dark:text-rose-100">
                        <AlertTriangle size={15} className="text-rose-600 dark:text-rose-400 shrink-0" />
                        <span>OAuth Authorization Failed</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDismissError(item.id)}
                        className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                    <div className="p-2 rounded-lg bg-black/50 border border-rose-800/40 text-[11px] font-mono text-rose-300 select-all break-all leading-tight">
                      {activeError}
                    </div>
                    {/* Actionable diagnosis */}
                    {activeError.toLowerCase().includes('access_denied') && (
                      <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-tight">
                        👉 <strong>Diagnosis:</strong> Google Cloud project is in <em>Testing</em> mode. Add your Google email to <strong>OAuth consent screen &gt; Test users</strong> in Google Cloud Console, OR bypass this by using a Service Account JSON.
                      </p>
                    )}
                    {activeError.toLowerCase().includes('redirect_uri_mismatch') && (
                      <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-tight">
                        👉 <strong>Diagnosis:</strong> Authorized redirect URI mismatch. Add <code>{typeof window !== 'undefined' ? `${window.location.origin}/integrations/callback` : 'your callback URL'}</code> to Authorized redirect URIs in Google Cloud Credentials.
                      </p>
                    )}
                    {activeError.toLowerCase().includes('permission not granted') && (
                      <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-tight">
                        👉 <strong>Diagnosis:</strong> You must check the permission box on Google's authorization screen to allow data access.
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setModalInitialTab('direct_token');
                          setActiveModal(item);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                      >
                        <Key size={11} />
                        <span>Bypass with Service Account JSON</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOAuthConnect(item.id)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                      >
                        <RefreshCw size={11} />
                        <span>Retry Google Sign-In</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Masked Key Display for Connected API Keys */}
                <AnimatePresence initial={false}>
                  {isConnected && (
                    <motion.div
                      key="masked"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={spring.soft}
                      className="mb-4 flex items-center justify-between text-[11px] font-mono bg-slate-50/90 dark:bg-slate-800/70 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Key size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-slate-500 dark:text-slate-400">{item.authType === 'oauth' ? 'OAuth Token:' : 'API Key:'}</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold tracking-wider truncate">
                          {maskedKey || (item.authType === 'oauth' ? 'Verified OAuth 2.0 Session' : '••••••••••••••••')}
                        </span>
                      </div>
                      {maskedKey && (
                        <button
                          onClick={() => handleCopyKey(item.id, maskedKey)}
                          title="Copy masked reference"
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 shrink-0 transition-colors cursor-pointer"
                        >
                          {copiedKeyId === item.id ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Account Email Badge */}
                {accountEmail && isConnected && (
                  <div className={`mb-3 flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded-xl border ${
                    hasNoProperties
                      ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                      : 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50 text-blue-950 dark:text-blue-200'
                  }`}>
                    <div className="flex items-center gap-1.5 truncate">
                      <Globe size={12} className={hasNoProperties ? "text-amber-600 dark:text-amber-400 shrink-0" : "text-blue-600 dark:text-blue-400 shrink-0"} />
                      <span className="text-slate-500 dark:text-slate-400">Account:</span>
                      <span className="font-bold truncate">{accountEmail}</span>
                    </div>
                    <span className={`text-[10px] font-bold shrink-0 ${hasNoProperties ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {hasNoProperties ? "0 Properties Found" : "Authorized"}
                    </span>
                  </div>
                )}

                {/* Diagnostic Warning Callout for Accounts with 0 Properties */}
                {hasNoProperties && isConnected && (
                  <div className="mb-4 p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 text-amber-900 dark:text-amber-200 text-xs space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-100">
                      <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{accountEmail ? `Signed in as ${accountEmail}` : 'Google Account Connected'} — No Active Properties</span>
                    </div>

                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed font-mono bg-black/30 p-2.5 rounded-lg border border-amber-600/30">
                      {noPropertiesWarning || (item.id === 'search_console' 
                        ? `This Google account is authenticated, but has NO verified site properties in Google Search Console.` 
                        : `This Google account is authenticated, but has NO accessible Google Analytics 4 properties.`
                      )}
                    </p>

                    <div className="text-[11px] text-amber-900 dark:text-amber-200/90 space-y-1">
                      <p className="font-semibold">How to resolve this:</p>
                      <ul className="list-disc pl-4 space-y-1 text-[10.5px]">
                        <li>
                          {item.id === 'search_console' ? (
                            <span>Add <strong>{accountEmail || 'your email'}</strong> in <a href="https://search.google.com/search-console/users" target="_blank" rel="noreferrer" className="underline font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-0.5">Search Console &gt; Settings &gt; Users &amp; Permissions <ExternalLink size={10} /></a> as an Owner or Full User.</span>
                          ) : (
                            <span>Add <strong>{accountEmail || 'your email'}</strong> in <a href="https://analytics.google.com/" target="_blank" rel="noreferrer" className="underline font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-0.5">GA4 Admin &gt; Property Access Management <ExternalLink size={10} /></a> with Viewer or Editor access.</span>
                          )}
                        </li>
                        <li>
                          Or click <strong>"Switch Google Account"</strong> below to select the Google account that actually manages your website.
                        </li>
                      </ul>
                    </div>

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleOAuthConnect(item.id)}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                      >
                        <RefreshCw size={12} />
                        <span>Switch Google Account</span>
                      </button>
                      <a
                        href={item.id === 'search_console' ? 'https://search.google.com/search-console' : 'https://analytics.google.com/'}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink size={12} />
                        <span>Open {item.name}</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Permission Error Callout */}
                {item.permission_error && isConnected && (
                  <div className="mb-3 p-3 rounded-xl text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertCircle size={14} className="text-amber-600 shrink-0" />
                      <span>Google API Permission Notice</span>
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed font-mono">
                      {item.permission_error}
                    </p>
                    {item.permission_error.includes('analyticsdata') && (
                      <a
                        href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-700 dark:text-indigo-400 font-bold hover:underline"
                      >
                        Enable Google Analytics Data API in Cloud Console <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                )}

                {/* Screaming Frog Standard: Verified Google Property Selector */}
                {item.id === 'search_console' && isConnected && (
                  <div className="mb-4 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Globe size={13} className="text-blue-600 dark:text-blue-400" />
                        Selected Search Console Property
                      </span>
                      {loadingProperties && <RefreshCw size={12} className="animate-spin text-blue-600 dark:text-blue-400" />}
                    </div>
                    {gscProperties.length > 0 ? (
                      <select
                        value={selectedGscProperty}
                        onChange={(e) => handleSelectProperty(e.target.value)}
                        className="w-full text-xs font-mono bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs"
                      >
                        {gscProperties.map((p) => (
                          <option key={p.siteUrl} value={p.siteUrl}>
                            {p.siteUrl} ({p.permissionLevel || 'Verified'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                        <span>{loadingProperties ? 'Querying verified web properties...' : hasNoProperties ? 'No verified sites found for this Google account.' : 'Using default seed URL domain.'}</span>
                        <button
                          onClick={fetchGscProperties}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold underline cursor-pointer"
                        >
                          Refresh
                        </button>
                      </div>
                    )}
                    {onAuditProperty && selectedGscProperty && (
                      <div className="mt-2 pt-2 border-t border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between">
                        <span className="text-[10px] text-blue-700 dark:text-blue-300 font-mono truncate max-w-[180px]">
                          Target: {selectedGscProperty}
                        </span>
                        <button
                          onClick={() => onAuditProperty(selectedGscProperty)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                        >
                          <Zap size={11} />
                          <span>Audit This Property</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Screaming Frog Standard: Verified GA4 Property Selector & Manual Override */}
                {item.id === 'google_analytics' && isConnected && (
                  <div className="mb-4 p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <BarChart3 size={13} className="text-orange-600 dark:text-orange-400" />
                        Target GA4 Property
                      </span>
                      <div className="flex items-center gap-2">
                        {loadingGa4Properties && <RefreshCw size={12} className="animate-spin text-orange-600 dark:text-orange-400" />}
                        <button
                          type="button"
                          onClick={fetchGa4Properties}
                          title="Refresh GA4 properties"
                          className="text-[10px] text-orange-700 dark:text-orange-300 hover:underline font-bold cursor-pointer"
                        >
                          Refresh
                        </button>
                      </div>
                    </div>

                    {ga4Properties.length > 0 ? (
                      <select
                        value={selectedGa4Property || item.selected_property || ''}
                        onChange={(e) => handleSelectGa4Property(e.target.value)}
                        className="w-full text-xs font-mono bg-white dark:bg-slate-900 border border-orange-300 dark:border-orange-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 shadow-2xs"
                      >
                        <option value="">-- Choose GA4 Property --</option>
                        {ga4Properties.map((p) => (
                          <option key={p.name || p.propertyId} value={p.name || `properties/${p.propertyId}`}>
                            {p.displayName || p.name} ({p.propertyId || p.name})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={manualGa4PropertyId}
                            onChange={(e) => setManualGa4PropertyId(e.target.value)}
                            placeholder="GA4 Property ID (e.g. 349182749)"
                            className="flex-1 text-xs font-mono bg-white dark:bg-slate-900 border border-orange-300 dark:border-orange-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleSelectGa4Property(manualGa4PropertyId)}
                            disabled={isSavingGa4Property || !manualGa4PropertyId.trim()}
                            className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
                          >
                            {isSavingGa4Property ? 'Saving...' : 'Set & Sync'}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          Find your numeric Property ID in GA4 &gt; Admin &gt; Property Settings.
                        </p>
                      </div>
                    )}

                    {(selectedGa4Property || item.selected_property) && (
                      <div className="flex items-center justify-between text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800">
                        <span className="truncate">Active: {selectedGa4Property || item.selected_property}</span>
                        <Check size={11} className="shrink-0" />
                      </div>
                    )}
                  </div>
                )}

                {/* Test Feedback Banner */}
                <AnimatePresence initial={false} mode="wait">
                  {testRes && (
                    <motion.div
                      key={testRes.status}
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={spring.soft}
                      className={`mb-4 p-3 rounded-xl text-xs font-mono border flex items-center justify-between gap-2 ${
                        testRes.status === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                          : testRes.status === 'warning'
                          ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                          : testRes.status === 'error'
                          ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                          : 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300'
                      }`}
                    >
                      <div className="flex items-start gap-2 max-w-[85%]">
                        {testRes.status === 'success' && <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
                        {testRes.status === 'warning' && <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
                        {testRes.status === 'error' && <AlertCircle size={15} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />}
                        {testRes.status === 'testing' && <RefreshCw size={14} className="animate-spin text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />}
                        <div className="leading-snug break-words">
                          <span>{testRes.status === 'testing' ? 'Verifying live credentials...' : (testRes.detail || testRes.message)}</span>
                          {testRes.status === 'warning' && (
                            <button
                              type="button"
                              onClick={() => handleOAuthConnect(item.id)}
                              className="ml-2 font-bold underline text-amber-700 dark:text-amber-300 hover:text-amber-900 cursor-pointer"
                            >
                              Switch Account ↗
                            </button>
                          )}
                        </div>
                      </div>
                      {testRes.latency_ms && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md font-bold shrink-0 self-start">
                          {testRes.latency_ms}ms
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                {isConnected ? (
                  <>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <motion.button
                        onClick={() => {
                          setWorkspaceService(item.id);
                          setViewMode('workspace');
                        }}
                        whileTap={tapPress}
                        transition={spring.press}
                        className="btn-primary py-1.5 px-2.5 text-xs font-bold gap-1 shadow-xs cursor-pointer"
                        title="Open live telemetry and database reports"
                      >
                        <BarChart3 size={12} />
                        View Reports ↗
                      </motion.button>

                      {hasNoProperties && (
                        <motion.button
                          onClick={() => handleOAuthConnect(item.id)}
                          whileTap={tapPress}
                          transition={spring.press}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                          title="Switch to another Google Account"
                        >
                          <RefreshCw size={12} />
                          Switch Account
                        </motion.button>
                      )}

                      <motion.button
                        onClick={() => handleTestConnection(item.id)}
                        disabled={isTesting}
                        whileTap={tapPress}
                        transition={spring.press}
                        className="btn-secondary py-1.5 px-2.5 text-xs font-bold gap-1.5 text-slate-700 dark:text-slate-200 shadow-2xs"
                      >
                        <Play size={12} className={isTesting ? "animate-spin text-indigo-600 dark:text-indigo-400" : "text-indigo-600 dark:text-indigo-400"} />
                        {isTesting ? "Testing..." : "Test"}
                      </motion.button>
                      <motion.button
                        onClick={() => setActiveModal(item)}
                        whileTap={tapPress}
                        transition={spring.press}
                        className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit3 size={12} />
                        Update
                      </motion.button>
                      <motion.button
                        onClick={() => handleDisconnect(item.id)}
                        whileTap={tapPress}
                        transition={spring.press}
                        className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold px-2.5 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} />
                        Disconnect
                      </motion.button>
                    </div>
                  </>
                ) : (
                  <>
                    {item.authType === 'api_key' ? (
                      <motion.button
                        onClick={() => setActiveModal(item)}
                        whileTap={tapPress}
                        transition={spring.press}
                        className="w-full btn-primary py-2 text-xs font-bold gap-2 shadow-xs cursor-pointer"
                      >
                        <Key size={14} /> Configure API Key
                      </motion.button>
                    ) : (
                      <div className="w-full space-y-2">
                        {hasConfiguredApp && !hasError && (
                          <div className="p-2.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/50 space-y-1 text-[11px] text-indigo-900 dark:text-indigo-200">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                                Google Cloud App Linked
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setModalInitialTab('custom_app');
                                  setActiveModal(item);
                                }}
                                className="font-bold underline cursor-pointer shrink-0 ml-1.5 hover:text-indigo-950 dark:hover:text-white"
                              >
                                Edit App
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                              Click below to authorize account access, or use a Service Account JSON.
                            </p>
                          </div>
                        )}
                        <div className="w-full flex items-center gap-2">
                          <motion.button
                            onClick={() => handleOAuthConnect(item.id)}
                            whileTap={tapPress}
                            transition={spring.press}
                            className="flex-1 btn-primary py-2 text-xs font-bold gap-2 shadow-xs cursor-pointer"
                            title="Complete Google Sign-In authorization"
                          >
                            <Globe size={14} /> {hasConfiguredApp ? 'Complete Google Sign-In' : 'Connect with Google'}
                          </motion.button>
                          <motion.button
                            onClick={() => {
                              setModalInitialTab('custom_app');
                              setActiveModal(item);
                            }}
                            whileTap={tapPress}
                            transition={spring.press}
                            className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl cursor-pointer"
                            title="Configure Custom OAuth Client ID / Secret"
                          >
                            <Sliders size={14} />
                          </motion.button>
                        </div>
                        <div className="flex items-center justify-center pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setModalInitialTab('direct_token');
                              setActiveModal(item);
                            }}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Key size={12} />
                            <span>Or connect via Service Account JSON (Recommended)</span>
                          </button>
                        </div>
                      </div>
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
          initialTab={modalInitialTab}
          onClose={() => {
            setActiveModal(null);
            setModalInitialTab('one_click');
          }}
          onSuccess={(serviceId, maskedKey) => {
            setActiveModal(null);
            setModalInitialTab('one_click');
            fetchStatus();
          }}
          onSaved={(serviceId, maskedKey) => {
            fetchStatus();
          }}
          onOAuthConnect={(svcId) => {
            const svc = svcId || activeModal?.id;
            setActiveModal(null);
            if (svc) handleOAuthConnect(svc);
          }}
        />
      )}

    </div>
  );
}
