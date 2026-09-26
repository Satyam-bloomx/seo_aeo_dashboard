'use client';
import React, { useState, useEffect } from 'react';
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
  Maximize2,
  Globe,
  ShieldCheck,
  Sliders,
  Lock
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { copyToClipboard } from '@/utils/clipboard';
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
  },
  search_console: {
    docUrl: 'https://console.cloud.google.com/apis/credentials',
    title: 'Google Search Console OAuth 2.0 Application Setup',
    steps: [
      {
        step: 1,
        title: 'Enable Google Search Console API',
        desc: 'In Google Cloud Console, open APIs & Services > Library and ensure "Google Search Console API" (or Webmasters API) is enabled.',
        link: 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com',
        linkLabel: 'Enable Search Console API'
      },
      {
        step: 2,
        title: 'Create OAuth 2.0 Web Client ID & Add Redirect URI',
        desc: 'Go to APIs & Services > Credentials > Create Credentials > OAuth client ID. Select "Web application". In "Authorized redirect URIs", paste the exact URI shown below.',
        link: 'https://console.cloud.google.com/apis/credentials',
        linkLabel: 'Open Google Cloud Credentials'
      },
      {
        step: 3,
        title: 'Paste Client ID & Client Secret Below & Connect',
        desc: 'Enter your Client ID and Client Secret in the fields below and click "Save & Connect with Google" to authorize access to your Search Console properties.'
      }
    ]
  },
  google_analytics: {
    docUrl: 'https://console.cloud.google.com/apis/credentials',
    title: 'Google Analytics 4 (GA4) OAuth 2.0 Application Setup',
    steps: [
      {
        step: 1,
        title: 'Enable Google Analytics Data API',
        desc: 'In Google Cloud Console, open APIs & Services > Library and enable "Google Analytics Data API" and "Google Analytics Admin API".',
        link: 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com',
        linkLabel: 'Enable Analytics Data API'
      },
      {
        step: 2,
        title: 'Create OAuth 2.0 Web Client ID & Add Redirect URI',
        desc: 'Under Credentials, create an OAuth Client ID for "Web application". Add the Authorized redirect URI from the box below to Authorized redirect URIs.',
        link: 'https://console.cloud.google.com/apis/credentials',
        linkLabel: 'Open Google Cloud Credentials'
      },
      {
        step: 3,
        title: 'Paste Client ID & Client Secret Below & Connect',
        desc: 'Enter your Client ID and Client Secret in the fields below and click "Save & Connect with Google" to authorize access to your GA4 property.'
      }
    ]
  },
  google_business: {
    docUrl: 'https://developers.google.com/my-business',
    title: 'Google Places / Business Profile Setup',
    steps: [
      {
        step: 1,
        title: 'Enable Places API in Google Cloud',
        desc: 'Enable the "Places API" or "Geocoding API" on your Google Cloud Console project.',
        link: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com',
        linkLabel: 'Enable Places API'
      },
      {
        step: 2,
        title: 'Copy & Paste API Key',
        desc: 'Create an API Key under Credentials and paste it below to verify NAP consistency and Google Maps pins.'
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
  onSaved,
  onOAuthConnect
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);

  // Screaming Frog-style User-Defined OAuth Application state & 1-Click Tabs
  const [oauthTab, setOauthTab] = useState('one_click'); // 'one_click' | 'custom_app' | 'manual_token'
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isSavingApp, setIsSavingApp] = useState(false);
  const [ga4PropertyOverride, setGa4PropertyOverride] = useState('');
  const [isSavingProperty, setIsSavingProperty] = useState(false);

  useEffect(() => {
    if (integration?.authType === 'oauth') {
      axios.get(`${API_BASE_URL}/integrations/google/credentials/${projectId}/${integration.id}`)
        .then(res => {
          if (res.data?.client_id) {
            setCustomClientId(res.data.client_id);
          }
        })
        .catch(() => {});

      if (integration.id === 'google_analytics') {
        axios.get(`${API_BASE_URL}/integrations/google/properties/${projectId}?service=google_analytics`)
          .then(res => {
            if (res.data?.selected_property) {
              setGa4PropertyOverride(res.data.selected_property.replace(/^properties\//, ''));
            }
          })
          .catch(() => {});
      }
    }
  }, [integration, projectId]);

  const handleSaveGa4Property = async () => {
    if (!ga4PropertyOverride.trim()) return;
    setIsSavingProperty(true);
    try {
      const clean = ga4PropertyOverride.trim().startsWith('properties/') 
        ? ga4PropertyOverride.trim() 
        : `properties/${ga4PropertyOverride.trim()}`;
      await axios.post(`${API_BASE_URL}/integrations/google/select-property`, {
        project_id: projectId,
        service: 'google_analytics',
        property_url: clean
      });
      toast.success('GA4 Property Saved & Associated', { description: clean });
    } catch (e) {
      toast.error('Failed to save GA4 Property ID');
    } finally {
      setIsSavingProperty(false);
    }
  };

  const handleOneClickConnect = async () => {
    if (integration.id === 'google_analytics' && ga4PropertyOverride.trim()) {
      await handleSaveGa4Property();
    }
    if (onOAuthConnect) {
      onOAuthConnect(integration.id);
    }
  };

  const handleSaveCustomCredentialsAndConnect = async (e) => {
    if (e) e.preventDefault();
    if (!customClientId.trim()) {
      toast.warning('Please enter your Google Client ID.');
      return;
    }
    if (!customClientSecret.trim()) {
      toast.warning('Please enter your Google Client Secret.');
      return;
    }
    setIsSavingApp(true);
    try {
      await axios.post(`${API_BASE_URL}/integrations/google/credentials`, {
        project_id: projectId,
        service: integration.id,
        client_id: customClientId.trim(),
        client_secret: customClientSecret.trim()
      });
      if (integration.id === 'google_analytics' && ga4PropertyOverride.trim()) {
        await handleSaveGa4Property();
      }
      toast.success('Custom Google OAuth Credentials saved!');
      setIsSavingApp(false);
      if (onOAuthConnect) onOAuthConnect(integration.id);
    } catch (err) {
      setIsSavingApp(false);
      const errMsg = err.response?.data?.detail || 'Failed to save Google OAuth credentials.';
      toast.error(errMsg);
    }
  };

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
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
              <Key size={20} />
            </div>
            <div>
              <DialogTitle as="h3" className="text-base font-bold text-slate-900 dark:text-white">
                {integration.name}
              </DialogTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure API credentials for live crawler data enrichments</p>
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={tapPress}
            transition={spring.press}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* Modal Body with Step-by-Step Visual Guide */}
        <form onSubmit={handleSave} className="p-6 space-y-5 bg-white dark:bg-slate-900 max-h-[82vh] overflow-y-auto custom-scrollbar">

          {/* Custom Client ID & Secret (Screaming Frog User-Defined App) & 1-Click Direct OAuth */}
          {integration.authType === 'oauth' && (
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50/70 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900/90 overflow-hidden shadow-xs">
              {/* Tab Navigation */}
              <div className="flex border-b border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/40 p-1.5 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOauthTab('one_click')}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    oauthTab === 'one_click'
                      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Globe size={14} className="text-indigo-600 dark:text-indigo-400" />
                  1-Click Direct Sign-In
                </button>
                <button
                  type="button"
                  onClick={() => setOauthTab('custom_app')}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    oauthTab === 'custom_app'
                      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sliders size={14} className="text-indigo-600 dark:text-indigo-400" />
                  Custom Cloud App
                </button>
              </div>

              <div className="p-4 space-y-4">
                {oauthTab === 'one_click' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <ShieldCheck size={15} className="text-emerald-600 dark:text-emerald-400" />
                        Google Account Authorization (OAuth 2.0)
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        Sign in directly with your Google account. We authenticate directly with Google APIs to securely query your verified sites and live analytics.
                      </p>
                    </div>

                    {integration.id === 'google_analytics' && (
                      <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 space-y-2">
                        <label className="block text-[11px] font-bold text-orange-950 dark:text-orange-200">
                          Target GA4 Property ID (Optional / Direct Bypass)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ga4PropertyOverride}
                            onChange={(e) => setGa4PropertyOverride(e.target.value)}
                            placeholder="e.g. 349182749 or properties/349182749"
                            className="flex-1 text-xs font-mono bg-white dark:bg-slate-900 border border-orange-300 dark:border-orange-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={handleSaveGa4Property}
                            disabled={isSavingProperty || !ga4PropertyOverride.trim()}
                            className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
                          >
                            {isSavingProperty ? 'Saving...' : 'Set ID'}
                          </button>
                        </div>
                        <p className="text-[10px] text-orange-800 dark:text-orange-300 leading-tight">
                          If your Google Cloud Project has Google Analytics Admin API disabled, specifying your numeric Property ID here allows direct querying of your Google Analytics Data API.
                        </p>
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-indigo-100/80 dark:border-indigo-900/50">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Redirects to official Google Sign-In consent screen.
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleOneClickConnect}
                          className="btn-primary py-2 px-4 text-xs font-bold gap-2 shadow-xs cursor-pointer"
                        >
                          <Globe size={14} />
                          Sign In with Google
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {oauthTab === 'custom_app' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Sliders size={15} className="text-indigo-600 dark:text-indigo-400" />
                        Screaming Frog Style: User-Defined OAuth Application
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                        Enter your Google Cloud OAuth Client ID and Client Secret directly in the UI. No server configuration or .env changes required!
                      </p>
                    </div>

                    {/* Redirect URI with 1-click Copy */}
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-900/50 space-y-1">
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block uppercase tracking-wider">
                        Authorized Redirect URI (Add to Google Cloud Credentials):
                      </span>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-indigo-900 dark:text-indigo-300 select-all font-semibold overflow-x-auto">
                          {typeof window !== 'undefined' ? `${window.location.origin}/integrations/callback` : 'http://localhost:3000/integrations/callback'}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            const uri = typeof window !== 'undefined' ? `${window.location.origin}/integrations/callback` : 'http://localhost:3000/integrations/callback';
                            copyToClipboard(uri, 'Redirect URI');
                          }}
                          className="px-2.5 py-1 text-[11px] font-mono font-bold rounded bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition-colors shrink-0 shadow-2xs"
                        >
                          Copy URI
                        </button>
                      </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                          Google OAuth Client ID
                        </label>
                        <input
                          type="text"
                          value={customClientId}
                          onChange={(e) => setCustomClientId(e.target.value)}
                          placeholder="e.g. 103847293847-abcdef...apps.googleusercontent.com"
                          className="w-full glass-input px-3 py-2 font-mono text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                          Google OAuth Client Secret
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type={showClientSecret ? 'text' : 'password'}
                            value={customClientSecret}
                            onChange={(e) => setCustomClientSecret(e.target.value)}
                            placeholder="e.g. GOCSPX-abc123xyz..."
                            className="w-full glass-input pl-3 pr-10 py-2 font-mono text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowClientSecret(!showClientSecret)}
                            className="absolute right-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {showClientSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-indigo-100/80 dark:border-indigo-900/50">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight flex-1">
                        💡 Tip: Create this Client ID in your Google Cloud account so you can authenticate any Google account directly!
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveCustomCredentialsAndConnect}
                          disabled={isSavingApp}
                          className="btn-primary py-2 px-3.5 text-xs font-bold gap-1.5 whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
                        >
                          {isSavingApp ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
                          Save &amp; Connect with Google
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interactive Step-by-Step Guide Box with Cropped Screenshots */}
          {guide && (
            <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/70 to-slate-50/70 dark:from-indigo-950/30 dark:to-slate-900 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setIsGuideOpen(!isGuideOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-indigo-100/40 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-bold text-xs">
                  <BookOpen size={16} className="text-indigo-600 dark:text-indigo-400" />
                  <span>How to Get Your {integration.name} API Key (Visual Step-by-Step Guide)</span>
                </div>
                <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-semibold">
                  {isGuideOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {isGuideOpen ? 'Hide Guide' : 'Show Guide'}
                </span>
              </button>

              {isGuideOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-indigo-100/60 dark:border-indigo-900/40 text-xs text-slate-700 dark:text-slate-300">
                  <div className="space-y-3">
                    {guide.steps.map((s) => (
                      <div key={s.step} className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2.5">
                        <div className="flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                            {s.step}
                          </div>
                          <div className="flex-1">
                            <strong className="text-slate-900 dark:text-white font-bold block">{s.title}</strong>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{s.desc}</p>
                            {s.link && (
                              <a
                                href={s.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline"
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
                            className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-zoom-in max-w-md mx-auto shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
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
                className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2"
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
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}
              >
                <motion.span
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...spring.soft, delay: 0.06 }}
                  className="mt-0.5 shrink-0 flex"
                >
                  {testResult.success
                    ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                    : <AlertCircle size={16} className="text-rose-600 dark:text-rose-400" />}
                </motion.span>
                <div className="flex-1">
                  <p>{testResult.message}</p>
                  {testResult.latency_ms && (
                    <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 font-bold">Latency: {testResult.latency_ms}ms</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Manual API Key Input (Exclusively for API Key integrations like OpenAI, PageSpeed, etc.) */}
          {integration.authType !== 'oauth' && (
            <>
              <div>
                <label className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
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
                    className="w-full glass-input pl-3.5 pr-10 py-2.5 font-mono text-sm bg-slate-50/50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    autoFocus
                  />
                  <motion.button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    whileTap={tapPress}
                    transition={spring.press}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
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
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Your credentials are encrypted per-project and used exclusively for live crawler enrichments.
                </p>
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <motion.button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !apiKey.trim()}
                  whileTap={isTesting ? undefined : tapPress}
                  transition={spring.press}
                  className="btn-secondary py-2 px-3 text-xs font-bold gap-1.5 disabled:opacity-50 shadow-xs cursor-pointer"
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
                          <Loader2 size={13} className="animate-spin text-indigo-600 dark:text-indigo-400" /> Testing...
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} className="text-indigo-600 dark:text-indigo-400" /> Test Connection
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
                    className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileTap={isLoading ? undefined : tapPress}
                    transition={spring.press}
                    className="btn-primary py-2 px-4 text-xs font-bold gap-2 disabled:opacity-50 shadow-xs cursor-pointer"
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
            </>
          )}
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
              className="relative max-w-3xl w-full bg-white dark:bg-slate-900 rounded-2xl p-2 shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{previewImage.alt}</span>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
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
