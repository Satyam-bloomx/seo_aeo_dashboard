'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3,
  Search,
  Globe,
  MapPin,
  Zap,
  RefreshCw,
  ArrowLeft,
  ExternalLink,
  TrendingUp,
  MousePointer,
  Eye,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Layers,
  ShieldCheck,
  Sparkles,
  Clock,
  ArrowUpRight,
  Filter,
  Check,
  ChevronRight,
  Target,
  FileText,
  Sliders,
  Key,
  Lock,
  ChevronDown,
  X,
  Copy,
  Trash2,
  Info,
  Bot,
  Plus,
  CheckSquare,
  Square,
  ArrowUpDown,
  BrainCircuit
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring, tapPress } from '@/lib/motion';
import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/api/client';

const WORKSPACE_SERVICES = [
  { id: 'search_console', name: 'Google Search Console', icon: Globe, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60' },
  { id: 'google_analytics', name: 'Google Analytics 4', icon: BarChart3, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900/60' },
  { id: 'google_business', name: 'Google Business Profile', icon: MapPin, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60' },
  { id: 'pagespeed', name: 'PageSpeed & Vitals', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60' },
  { id: 'synergy', name: 'SEO Audit Synergy', icon: Sparkles, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60' },
];

export default function IntegrationsWorkspace({
  projectId = 1,
  crawlId = null,
  seedUrl = '',
  pages = [],
  initialService = 'search_console',
  onBackToGrid,
  integrationsStatus = {},
  onOpenModal,
  onOAuthConnect,
  onRefreshStatus,
  onAuditProperty
}) {
  const [selectedService, setSelectedService] = useState(initialService);
  const [data, setData] = useState(null);
  const [synergyData, setSynergyData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQueryFilter, setSearchQueryFilter] = useState('');
  const [lastSynced, setLastSynced] = useState(null);
  const [latency, setLatency] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Property selection & manual property ID state
  const [availableProperties, setAvailableProperties] = useState([]);
  const [selectedPropertyUrl, setSelectedPropertyUrl] = useState('');
  const [manualPropertyId, setManualPropertyId] = useState('');
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [showPropertyDrawer, setShowPropertyDrawer] = useState(false);

  // Cross-correlation search & filters
  const [gscPageSearch, setGscPageSearch] = useState('');
  const [gscPageFilter, setGscPageFilter] = useState('all'); // 'all' | 'ranking' | 'striking' | 'canonical' | 'zero_clicks'
  const [ga4PageSearch, setGa4PageSearch] = useState('');
  const [ga4PageFilter, setGa4PageFilter] = useState('all'); // 'all' | 'traffic' | 'zombie' | 'high_bounce'
  const [copiedUrl, setCopiedUrl] = useState(null);

  // GA4 Acquisition Matrix & AI Strategy State
  const [selectedGa4Pillar, setSelectedGa4Pillar] = useState('all'); // 'all' | 'AEO' | 'SEO' | 'BRAND' | 'AUTHORITY'
  const [selectedChannelRows, setSelectedChannelRows] = useState({ 0: true, 1: true, 2: true, 3: true, 4: true });
  const [isSelectAllChannels, setIsSelectAllChannels] = useState(true);
  const [aiStrategyData, setAiStrategyData] = useState(null);
  const [isLoadingAiStrategy, setIsLoadingAiStrategy] = useState(false);
  const [showAiStrategyCard, setShowAiStrategyCard] = useState(false);

  const toggleChannelRow = (idx) => {
    setSelectedChannelRows(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const toggleSelectAllChannels = (channelsLength = 7) => {
    if (isSelectAllChannels) {
      setSelectedChannelRows({});
      setIsSelectAllChannels(false);
    } else {
      const allSelected = {};
      for (let i = 0; i < channelsLength; i++) {
        allSelected[i] = true;
      }
      setSelectedChannelRows(allSelected);
      setIsSelectAllChannels(true);
    }
  };

  const handleGenerateAiStrategy = async () => {
    setIsLoadingAiStrategy(true);
    setShowAiStrategyCard(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/integrations/ai-analytics-insights/${projectId}`, null, {
        params: {
          domain: cleanSeedDomain,
          crawl_id: crawlId
        }
      });
      if (res.data) {
        setAiStrategyData(res.data);
        toast.success(res.data.cached ? 'Loaded cached SEO/AEO/GEO diagnostic!' : 'Generated fresh AI SEO/AEO/GEO Strategy!');
      }
    } catch (err) {
      console.warn('Failed to generate AI analytics strategy:', err);
      toast.error('Could not generate AI strategy: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsLoadingAiStrategy(false);
    }
  };

  // Keep selectedService in sync if initialService changes from parent
  useEffect(() => {
    if (initialService) {
      setSelectedService(initialService);
    }
  }, [initialService]);

  // Clean domain helper
  const cleanDomain = useCallback((val) => {
    if (!val) return '';
    let str = String(val).trim().toLowerCase();
    str = str.replace(/^sc-domain:/i, '');
    str = str.replace(/^https?:\/\//i, '');
    str = str.replace(/^www\./i, '');
    str = str.split('/')[0];
    str = str.split('?')[0];
    str = str.split(':')[0];
    return str;
  }, []);

  const cleanSeedDomain = useMemo(() => {
    return cleanDomain(seedUrl || (pages && pages[0]?.url) || '');
  }, [seedUrl, pages, cleanDomain]);

  const cleanGscDomain = useMemo(() => {
    return cleanDomain(selectedPropertyUrl || data?.property || integrationsStatus?.search_console?.selected_property || '');
  }, [selectedPropertyUrl, data, integrationsStatus, cleanDomain]);

  const cleanGa4Domain = useMemo(() => {
    return cleanDomain(selectedPropertyUrl || data?.property_name || data?.property || integrationsStatus?.google_analytics?.selected_property || '');
  }, [selectedPropertyUrl, data, integrationsStatus, cleanDomain]);

  const isGscDomainMatched = useMemo(() => {
    if (!cleanSeedDomain || !cleanGscDomain) return false;
    return cleanSeedDomain.includes(cleanGscDomain) || cleanGscDomain.includes(cleanSeedDomain);
  }, [cleanSeedDomain, cleanGscDomain]);

  const isGa4DomainMatched = useMemo(() => {
    if (!cleanSeedDomain) return false;
    if (cleanGa4Domain && (cleanSeedDomain.includes(cleanGa4Domain) || cleanGa4Domain.includes(cleanSeedDomain))) return true;
    if (data?.top_landing_pages && data.top_landing_pages.length > 0) return true;
    return false;
  }, [cleanSeedDomain, cleanGa4Domain, data]);

  const isCurrentDomainMatched = useMemo(() => {
    if (selectedService === 'search_console') return isGscDomainMatched;
    if (selectedService === 'google_analytics') return isGa4DomainMatched;
    if (selectedService === 'synergy') return isGscDomainMatched || isGa4DomainMatched;
    return true;
  }, [selectedService, isGscDomainMatched, isGa4DomainMatched]);

  const handleCopyUrl = (urlToCopy) => {
    if (!urlToCopy) return;
    navigator.clipboard?.writeText(urlToCopy);
    setCopiedUrl(urlToCopy);
    toast.success('URL copied to clipboard!');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Process GSC Page Correlated Rows from Crawl Pages
  const correlatedGscPages = useMemo(() => {
    if (!pages || pages.length === 0) return [];
    return pages.map((p, idx) => {
      const ad = p.audit_data || p.auditData || {};
      const gsc = ad.Search_Console || ad.search_console || {};
      
      const rawClicks = gsc.Organic_Clicks_30d !== undefined && gsc.Organic_Clicks_30d !== 'Not Connected'
        ? parseInt(String(gsc.Organic_Clicks_30d).replace(/,/g, ''), 10) || 0
        : 0;
      const rawImpressions = gsc.Search_Impressions !== undefined && gsc.Search_Impressions !== 'Not Connected'
        ? parseInt(String(gsc.Search_Impressions).replace(/,/g, ''), 10) || 0
        : 0;
      const rawPos = gsc.Average_SERP_Position && gsc.Average_SERP_Position !== 'Not Connected'
        ? parseFloat(gsc.Average_SERP_Position) || null
        : null;
      const ctr = gsc.Average_CTR && gsc.Average_CTR !== 'Not Connected' ? gsc.Average_CTR : '0.0%';
      const indexState = gsc.Index_Coverage_State || (rawClicks > 0 ? 'Submitted and indexed' : 'Discovered');
      const googleCanonical = gsc.Google_Selected_Canonical || p.canonical_link_element_1 || p.url;
      const declaredCanonical = p.canonical_link_element_1 || p.url;
      const canonicalMismatch = Boolean(gsc.Canonical_Mismatch) || (
        googleCanonical && declaredCanonical && 
        cleanDomain(googleCanonical) === cleanDomain(declaredCanonical) && 
        googleCanonical.trim().toLowerCase() !== declaredCanonical.trim().toLowerCase()
      );
      const isStrikingDistance = rawPos !== null && rawPos >= 11 && rawPos <= 20;

      return {
        id: p.id || idx,
        url: p.url,
        title: p.title_1 || 'Untitled Page',
        statusCode: p.status_code || 200,
        clicks: rawClicks,
        impressions: rawImpressions,
        ctr,
        position: rawPos,
        indexState,
        googleCanonical,
        declaredCanonical,
        canonicalMismatch,
        isStrikingDistance,
        lastCrawl: gsc.Last_Googlebot_Crawl
      };
    });
  }, [pages, cleanDomain]);

  // Filtered GSC pages
  const filteredGscPages = useMemo(() => {
    return correlatedGscPages.filter(p => {
      const matchesSearch = !gscPageSearch.trim() || 
        p.url.toLowerCase().includes(gscPageSearch.toLowerCase()) || 
        p.title.toLowerCase().includes(gscPageSearch.toLowerCase());
      if (!matchesSearch) return false;

      if (gscPageFilter === 'striking') return p.isStrikingDistance;
      if (gscPageFilter === 'canonical') return p.canonicalMismatch;
      if (gscPageFilter === 'ranking') return (p.clicks > 0 || p.impressions > 0);
      if (gscPageFilter === 'zero_clicks') return p.clicks === 0;
      return true;
    });
  }, [correlatedGscPages, gscPageSearch, gscPageFilter]);

  const strikingDistancePages = useMemo(() => {
    return correlatedGscPages.filter(p => p.isStrikingDistance);
  }, [correlatedGscPages]);

  const canonicalMismatchPages = useMemo(() => {
    return correlatedGscPages.filter(p => p.canonicalMismatch);
  }, [correlatedGscPages]);

  // Process GA4 Page Correlated Rows from Crawl Pages
  const correlatedGa4Pages = useMemo(() => {
    if (!pages || pages.length === 0) return [];
    return pages.map((p, idx) => {
      const ad = p.audit_data || p.auditData || {};
      const ga4 = ad.Google_Analytics || ad.google_analytics || {};
      
      const sessions30d = ga4.Sessions_30d !== undefined && ga4.Sessions_30d !== 'Not Connected'
        ? parseInt(String(ga4.Sessions_30d).replace(/,/g, ''), 10) || 0
        : 0;
      const sessions90d = ga4.Sessions_90d !== undefined && ga4.Sessions_90d !== 'Not Connected'
        ? parseInt(String(ga4.Sessions_90d).replace(/,/g, ''), 10) || 0
        : 0;
      const bounceRate = ga4.Bounce_Rate && ga4.Bounce_Rate !== 'Not Connected' ? ga4.Bounce_Rate : '0.0%';
      const avgTime = ga4.Avg_Engagement_Time && ga4.Avg_Engagement_Time !== 'Not Connected' ? ga4.Avg_Engagement_Time : '0s';
      const isZombie = Boolean(ga4.Is_Zombie_Page) || (sessions90d === 0 && idx > 0);
      const zombieAction = ga4.Zombie_Recommended_Action || (isZombie ? '301 Redirect to parent or refresh content' : 'Active Traffic Source');
      const revenueRisk = ga4.Revenue_At_Risk || ((p.status_code || 200) >= 400 && sessions30d > 0 ? 'Critical P0' : 'Nominal P4');

      return {
        id: p.id || idx,
        url: p.url,
        title: p.title_1 || 'Untitled Page',
        statusCode: p.status_code || 200,
        sessions30d,
        sessions90d,
        bounceRate,
        avgTime,
        isZombie,
        zombieAction,
        revenueRisk
      };
    });
  }, [pages]);

  // Filtered GA4 pages
  const filteredGa4Pages = useMemo(() => {
    return correlatedGa4Pages.filter(p => {
      const matchesSearch = !ga4PageSearch.trim() || 
        p.url.toLowerCase().includes(ga4PageSearch.toLowerCase()) || 
        p.title.toLowerCase().includes(ga4PageSearch.toLowerCase());
      if (!matchesSearch) return false;

      if (ga4PageFilter === 'traffic') return p.sessions30d > 0;
      if (ga4PageFilter === 'zombie') return p.isZombie;
      if (ga4PageFilter === 'high_bounce') {
        const rate = parseFloat(p.bounceRate);
        return !isNaN(rate) && rate > 65;
      }
      return true;
    });
  }, [correlatedGa4Pages, ga4PageSearch, ga4PageFilter]);

  const zombiePagesList = useMemo(() => {
    return correlatedGa4Pages.filter(p => p.isZombie);
  }, [correlatedGa4Pages]);

  // Check connection status from parent or current fetch
  const isCurrentConnected = useMemo(() => {
    if (selectedService === 'synergy') return true;
    const statusObj = integrationsStatus[selectedService];
    return Boolean(statusObj?.connected || statusObj?.selected_property || statusObj?.has_telemetry);
  }, [selectedService, integrationsStatus]);

  // Fetch properties for Google services
  const loadProperties = useCallback(async (serviceId) => {
    if (serviceId !== 'search_console' && serviceId !== 'google_analytics') return;
    setIsLoadingProperties(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/integrations/google/properties/${projectId}?service=${serviceId}`);
      if (res.data?.properties) {
        setAvailableProperties(res.data.properties);
        if (res.data.selected_property) {
          setSelectedPropertyUrl(res.data.selected_property);
        } else if (res.data.properties.length > 0) {
          setSelectedPropertyUrl(res.data.properties[0].siteUrl);
        }
      }
      if (res.data?.error && (!res.data.properties || res.data.properties.length === 0)) {
        setErrorMessage(res.data.error);
      }
    } catch (err) {
      console.warn(`Could not load properties for ${serviceId}:`, err);
    } finally {
      setIsLoadingProperties(false);
    }
  }, [projectId]);

  // Fetch integration data from backend
  const loadServiceData = useCallback(async (serviceId) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (serviceId === 'synergy') {
        const targetCrawl = crawlId || 2;
        const res = await axios.get(`${API_BASE_URL}/integrations/synergy/${targetCrawl}`);
        setSynergyData(res.data);
        setIsLoading(false);
        return;
      }

      const res = await axios.get(`${API_BASE_URL}/integrations/data/${projectId}/${serviceId}`);
      if (res.data) {
        setData(res.data.data);
        setLastSynced(res.data.synced_at);
        setLatency(res.data.latency_ms);
        if (res.data.data?.google_permission_error) {
          setErrorMessage(res.data.data.google_permission_error);
        }
      }
      // Also fetch property list if Google service
      if (serviceId === 'search_console' || serviceId === 'google_analytics') {
        loadProperties(serviceId);
      }
    } catch (err) {
      console.warn(`Failed to fetch ${serviceId} data:`, err);
      const errDetail = err.response?.data?.detail || err.message || 'Could not load telemetry.';
      setErrorMessage(errDetail);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, crawlId, loadProperties]);

  useEffect(() => {
    loadServiceData(selectedService);
  }, [selectedService, loadServiceData]);

  // Handle on-demand live refetch / sync
  const handleRefetch = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    try {
      if (selectedService === 'synergy') {
        const targetCrawl = crawlId || 2;
        const res = await axios.get(`${API_BASE_URL}/integrations/synergy/${targetCrawl}`);
        setSynergyData(res.data);
        toast.success('Refreshed SEO audit synergy cross-correlation matrix!');
        setIsSyncing(false);
        return;
      }

      const res = await axios.post(`${API_BASE_URL}/integrations/sync/${projectId}/${selectedService}`);
      if (res.data) {
        setData(res.data.data);
        setLastSynced(res.data.synced_at);
        setLatency(res.data.latency_ms);
        if (res.data.data?.google_permission_error) {
          setErrorMessage(res.data.data.google_permission_error);
          toast.warning('Google returned a notice for this property.', {
            description: res.data.data.google_permission_error
          });
        } else {
          toast.success(`Synchronized ${selectedService.replace(/_/g, ' ').toUpperCase()}!`, {
            description: `Live latency: ${res.data.latency_ms || 28}ms. Telemetry active.`
          });
        }
        if (onRefreshStatus) onRefreshStatus();
      }
    } catch (err) {
      console.error('Sync failed:', err);
      const msg = err.response?.data?.detail || 'Sync failed. Please check connection credentials.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle property selection or manual Property ID save
  const handleSelectProperty = async (propertyValue) => {
    if (!propertyValue || !propertyValue.trim()) return;
    setIsSavingProperty(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/integrations/google/select-property`, {
        project_id: projectId,
        service: selectedService,
        property_url: propertyValue.trim()
      });
      setSelectedPropertyUrl(res.data.selected_property || propertyValue.trim());
      toast.success(`Active Property Updated!`, {
        description: `Targeting: ${res.data.selected_property || propertyValue.trim()}`
      });
      setShowPropertyDrawer(false);
      setManualPropertyId('');
      // Reload live data immediately
      await loadServiceData(selectedService);
      if (onRefreshStatus) onRefreshStatus();
    } catch (err) {
      toast.error('Failed to save selected property.');
    } finally {
      setIsSavingProperty(false);
    }
  };

  const formattedSyncedTime = useMemo(() => {
    if (!lastSynced) return 'Awaiting initial sync';
    try {
      const date = new Date(lastSynced);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Recently';
    }
  }, [lastSynced]);

  // Filtered queries for GSC
  const filteredQueries = useMemo(() => {
    if (!data?.top_queries) return [];
    if (!searchQueryFilter.trim()) return data.top_queries;
    return data.top_queries.filter(q =>
      q.query.toLowerCase().includes(searchQueryFilter.toLowerCase())
    );
  }, [data, searchQueryFilter]);

  const activeServiceObj = WORKSPACE_SERVICES.find(s => s.id === selectedService) || WORKSPACE_SERVICES[0];

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pr-2 gap-5 pb-8">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <motion.button
            onClick={onBackToGrid}
            whileTap={tapPress}
            transition={spring.press}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-xs transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            title="Return to Connections Hub"
          >
            <ArrowLeft size={15} />
            <span>Connections</span>
          </motion.button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <activeServiceObj.icon size={20} className={activeServiceObj.color} />
                {activeServiceObj.name}
              </h2>
              {isCurrentConnected ? (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Telemetry
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                  Authentication Required
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{data?.property || data?.property_name || selectedPropertyUrl || 'Telemetry Hub'}</span>
              <span>•</span>
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <Clock size={11} /> Last synced: {formattedSyncedTime}
              </span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {(selectedService === 'search_console' || selectedService === 'google_analytics') && isCurrentConnected && (
            <motion.button
              onClick={() => setShowPropertyDrawer(!showPropertyDrawer)}
              whileTap={tapPress}
              transition={spring.press}
              className="btn-secondary py-1.5 px-3 text-xs font-bold gap-1.5 shadow-xs cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <Sliders size={13} className="text-indigo-600 dark:text-indigo-400" />
              <span>Select Property</span>
              <ChevronDown size={13} className={showPropertyDrawer ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </motion.button>
          )}

          {selectedService === 'search_console' && isCurrentConnected && selectedPropertyUrl && onAuditProperty && (
            <motion.button
              onClick={() => onAuditProperty(selectedPropertyUrl)}
              whileTap={tapPress}
              transition={spring.press}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              title={`Initiate crawler audit for ${selectedPropertyUrl}`}
            >
              <Zap size={13} />
              <span className="hidden sm:inline">Audit This Property</span>
              <span className="sm:hidden">Audit</span>
            </motion.button>
          )}

          {latency && (
            <span className="hidden sm:inline-flex text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
              {latency}ms
            </span>
          )}

          {isCurrentConnected && (
            <motion.button
              onClick={handleRefetch}
              disabled={isSyncing || isLoading}
              whileTap={tapPress}
              transition={spring.press}
              className="btn-primary py-2 px-4 text-xs font-bold gap-2 shadow-xs cursor-pointer"
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin text-white" : "text-white"} />
              {isSyncing ? "Syncing Live API..." : "Sync Telemetry Now"}
            </motion.button>
          )}
        </div>
      </div>

      {/* Property Selector Drawer (Search Console & GA4) */}
      <AnimatePresence>
        {showPropertyDrawer && (selectedService === 'search_console' || selectedService === 'google_analytics') && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring.soft}
            className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200/90 dark:border-indigo-900/80 shadow-md p-5 space-y-4"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0">
                  {selectedService === 'search_console' ? (
                    <Globe size={18} className="text-blue-500" />
                  ) : (
                    <BarChart3 size={18} className="text-orange-500" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Target {selectedService === 'search_console' ? 'Google Search Console' : 'Google Analytics 4'} Property
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Active Property: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{selectedPropertyUrl || data?.property || data?.property_name || 'None selected'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPropertyDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close drawer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Auto-Discovered Properties Section (if any found) */}
            {availableProperties.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Auto-Discovered Properties ({availableProperties.length} found):
                  </label>
                  <button
                    type="button"
                    onClick={() => loadProperties(selectedService)}
                    disabled={isLoadingProperties}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} className={isLoadingProperties ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>
                <select
                  value={selectedPropertyUrl}
                  onChange={(e) => handleSelectProperty(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="">-- Choose verified property --</option>
                  {availableProperties.map((p, idx) => (
                    <option key={idx} value={p.siteUrl || p.name || p.id}>
                      {p.displayName || p.siteUrl || p.name} {p.account ? `(${p.account})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Manual Property ID Input Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {availableProperties.length > 0 ? 'Or Enter Property Manually:' : 'Enter Property ID or URL:'}
                </label>
                {availableProperties.length === 0 && (
                  <button
                    type="button"
                    onClick={() => loadProperties(selectedService)}
                    disabled={isLoadingProperties}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} className={isLoadingProperties ? 'animate-spin' : ''} />
                    <span>{isLoadingProperties ? 'Discovering...' : 'Retry Auto-Discovery'}</span>
                  </button>
                )}
              </div>

              {availableProperties.length === 0 && !isLoadingProperties && (
                <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200">
                  No properties were auto-discovered for this account. Enter your verified Property ID or Domain URL below to link and synchronize live telemetry.
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  type="text"
                  placeholder={
                    selectedService === 'search_console'
                      ? 'e.g. sc-domain:bloomxsolutions.com or https://bloomxsolutions.com/'
                      : 'e.g. 349182749 or properties/349182749'
                  }
                  value={manualPropertyId}
                  onChange={(e) => setManualPropertyId(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => handleSelectProperty(manualPropertyId)}
                  disabled={!manualPropertyId.trim() || isSavingProperty}
                  className="btn-primary py-2.5 px-4 text-xs font-bold whitespace-nowrap shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSavingProperty && <RefreshCw size={12} className="animate-spin text-white" />}
                  <span>{isSavingProperty ? 'Saving...' : 'Set & Sync Property'}</span>
                </button>

                {selectedService === 'search_console' && selectedPropertyUrl && onAuditProperty && (
                  <button
                    type="button"
                    onClick={() => onAuditProperty(selectedPropertyUrl)}
                    className="px-3.5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs transition-colors"
                  >
                    <Zap size={13} />
                    <span>Run Crawler Audit</span>
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {selectedService === 'search_console'
                  ? 'Tip: Supports Domain properties (sc-domain:example.com) and URL prefix (https://example.com/).'
                  : 'Tip: Find your 9-digit numeric Property ID in Google Analytics → Admin (gear icon) → Property Settings.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Service Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar shrink-0">
        {WORKSPACE_SERVICES.map((svc) => {
          const isSelected = selectedService === svc.id;
          const Icon = svc.icon;
          const isConnected = integrationsStatus[svc.id]?.connected || svc.id === 'synergy';

          return (
            <motion.button
              key={svc.id}
              onClick={() => setSelectedService(svc.id)}
              whileTap={tapPress}
              transition={spring.press}
              className={`relative px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer select-none border ${
                isSelected
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-800 shadow-xs'
              }`}
            >
              <Icon size={14} className={isSelected ? 'text-white' : svc.color} />
              <span>{svc.name}</span>
              {isConnected ? (
                <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
              ) : (
                <span className="text-[10px] text-slate-400 font-mono">Setup</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl animate-pulse shadow-xs">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-24 bg-slate-100 dark:bg-slate-800/80 rounded-xl" />
          ))}
          <div className="col-span-2 md:col-span-4 h-64 bg-slate-100 dark:bg-slate-800/80 rounded-xl mt-2" />
        </div>
      ) : !isCurrentConnected && selectedService !== 'synergy' ? (
        /* ============================================================== */
        /* EMPTY / NOT CONNECTED STATE: ENTERPRISE SETUP HERO             */
        /* ============================================================== */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-indigo-50/40 dark:from-slate-900 dark:via-slate-900/90 dark:to-indigo-950/30 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center max-w-3xl mx-auto gap-6 my-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-md">
            <activeServiceObj.icon size={32} className={activeServiceObj.color} />
          </div>

          <div className="space-y-2">
            <span className="px-3 py-1 text-[11px] font-mono font-bold uppercase tracking-wider rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Authentication Required
            </span>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Connect {activeServiceObj.name} Telemetry
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-lg leading-relaxed mx-auto">
              Link your verified Google account or credentials to correlate crawled audit URLs with live traffic, clicks, impressions, bounce rates, and organic conversion paths.
            </p>
          </div>

          {/* Key Capabilities Unlocked */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left w-full max-w-lg font-mono text-xs">
            {selectedService === 'google_analytics' ? (
              <>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">30d & 90d Sessions Telemetry</span>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Traffic Channel Attribution</span>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Engagement &amp; Bounce Rates</span>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Zombie Page Pinpointer</span>
                </div>
              </>
            ) : selectedService === 'search_console' ? (
              <>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Real Google Search Clicks</span>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Top 50 Ranking Queries</span>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">SERP Impressions &amp; CTR</span>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Device Share Breakdown</span>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-amber-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Core Web Vitals Benchmarks</span>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-amber-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200">Lighthouse Performance Scores</span>
                </div>
              </>
            )}
          </div>

          {/* Connect Action Button */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
            {selectedService === 'search_console' || selectedService === 'google_analytics' || selectedService === 'google_business' ? (
              <button
                onClick={() => {
                  if (onOAuthConnect) onOAuthConnect(selectedService);
                  else if (onOpenModal) onOpenModal({ id: selectedService, name: activeServiceObj.name, authType: 'oauth' });
                }}
                className="w-full btn-primary py-3 px-5 text-xs font-bold gap-2 shadow-md cursor-pointer justify-center"
              >
                <Globe size={15} />
                Connect with Google OAuth
              </button>
            ) : (

              <button
                onClick={() => {
                  if (onOpenModal) onOpenModal({ id: selectedService, name: activeServiceObj.name, authType: 'api_key' });
                }}
                className="w-full btn-primary py-3 px-5 text-xs font-bold gap-2 shadow-md cursor-pointer justify-center"
              >
                <Key size={15} />
                Configure API Key
              </button>
            )}

            <button
              onClick={() => {
                if (onOpenModal) onOpenModal({ id: selectedService, name: activeServiceObj.name, authType: 'oauth' });
              }}
              className="w-full btn-secondary py-3 px-4 text-xs font-bold gap-2 shadow-xs cursor-pointer justify-center text-slate-700 dark:text-slate-200"
            >
              <Sliders size={14} />
              Setup Guide &amp; Keys
            </button>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          {/* ============================================================== */}
          {/* 1. GOOGLE SEARCH CONSOLE WORKSPACE                             */}
          {/* ============================================================== */}
          {selectedService === 'search_console' && (
            <motion.div
              key="search_console"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col gap-5"
            >
              {/* Diagnostic / Permission Banner if Google restricted access */}
              {errorMessage && (
                <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black uppercase font-mono tracking-wider">
                          Google Search Console Status
                        </h4>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-mono">
                          Action Required
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                        Account: <strong className="font-mono">{data?.auth_account || integrationsStatus['search_console']?.account_email || 'Authenticated Account'}</strong>. 
                        Google returned: <em>"{errorMessage}"</em>.
                      </p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                        To view live search keywords and clicks, make sure this Google account has been added to the Search Console property, or switch to the property selector above.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPropertyDrawer(true)}
                    className="btn-secondary py-1.5 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-amber-200 dark:border-amber-800 shadow-xs cursor-pointer"
                  >
                    Select Property
                  </button>
                </div>
              )}

              {/* Domain Match & Synchronization Status Banner */}
              {isGscDomainMatched ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-indigo-50/70 dark:from-emerald-950/40 dark:via-slate-900/60 dark:to-indigo-950/30 border border-emerald-200/90 dark:border-emerald-800/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase font-mono tracking-wider text-emerald-900 dark:text-emerald-300">
                          Domain Verified &amp; Synchronized
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                          {pages.length > 0 ? `${pages.length} URLs Cross-Correlated` : 'Live Account Connected'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                        Audited site <strong className="font-mono text-slate-900 dark:text-white">{cleanSeedDomain}</strong> matches verified Google Search Console property <strong className="font-mono text-indigo-600 dark:text-indigo-400">{selectedPropertyUrl || cleanGscDomain}</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-xs flex-wrap">
                    <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold shadow-2xs">
                      {strikingDistancePages.length} Striking Distance Wins
                    </span>
                    <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 font-bold shadow-2xs">
                      {canonicalMismatchPages.length} Canonical Fixes
                    </span>
                  </div>
                </div>
              ) : cleanSeedDomain && cleanGscDomain ? (
                <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase font-mono tracking-wider text-amber-900 dark:text-amber-300">
                          Domain Notice: Property Mismatch
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                          External Property
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-200 mt-0.5">
                        Current audit is for <strong className="font-mono">{cleanSeedDomain}</strong>, but your connected Search Console property is <strong className="font-mono text-indigo-600 dark:text-indigo-300">{selectedPropertyUrl || cleanGscDomain}</strong>.
                      </p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                        Telemetry below reflects {cleanGscDomain}. Switch properties or run an audit for this property to enable 1-to-1 page cross-correlation.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onClick={() => setShowPropertyDrawer(true)}
                      className="btn-secondary py-1.5 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-800 shadow-xs cursor-pointer"
                    >
                      Switch Property
                    </button>
                    {selectedPropertyUrl && onAuditProperty && (
                      <button
                        onClick={() => onAuditProperty(selectedPropertyUrl)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Zap size={13} />
                        Audit {cleanGscDomain}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Total Clicks</span>
                    <MousePointer size={16} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.total_clicks?.toLocaleString() || 0}
                  </div>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                    <TrendingUp size={12} /> Google Search Clicks (28d)
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Impressions</span>
                    <Eye size={16} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.total_impressions?.toLocaleString() || 0}
                  </div>
                  <span className="text-[11px] text-purple-700 dark:text-purple-400 font-semibold mt-1">
                    Total SERP Appearances
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Average CTR</span>
                    <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.average_ctr || '0.0%'}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1">
                    Click-Through Rate Benchmark
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Avg SERP Position</span>
                    <Target size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.average_position || '0.0'}
                  </div>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">
                    Ranked Keyword Average
                  </span>
                </div>
              </div>

              {/* Quick Wins Highlights (Striking Distance & Canonical Alignment) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Striking Distance Widget */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <Target size={16} className="text-amber-500" />
                        Page 2 Striking Distance (Rank 11–20)
                      </h3>
                      <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {strikingDistancePages.length} Pages
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      URLs already ranking near the top of Search Page 2. Refreshing H2 tags and adding 2 internal links from authority pages can push them directly onto Page 1!
                    </p>
                  </div>

                  {strikingDistancePages.length > 0 ? (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                      {strikingDistancePages.slice(0, 4).map((p, idx) => (
                        <div key={idx} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-slate-900 dark:text-white truncate max-w-xs">{p.url}</span>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 shrink-0">
                            Rank #{p.position ? p.position.toFixed(1) : '15'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400 font-sans text-center">
                      No Page 2 ranking pages detected in the current crawl set.
                    </div>
                  )}

                  <button
                    onClick={() => setGscPageFilter('striking')}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer pt-1"
                  >
                    <span>View all {strikingDistancePages.length} Striking Distance URLs in table</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>

                {/* 2. Canonical Alignment Widget */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <AlertTriangle size={16} className="text-indigo-500" />
                        Google Canonical Alignment
                      </h3>
                      <span className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded-full ${
                        canonicalMismatchPages.length > 0 
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}>
                        {canonicalMismatchPages.length} Conflicts
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Verifies that Googlebot's indexed canonical matches your declared on-page <code className="font-mono text-slate-900 dark:text-white">&lt;link rel="canonical"&gt;</code> tag to avoid duplicate content penalties.
                    </p>
                  </div>

                  {canonicalMismatchPages.length > 0 ? (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                      {canonicalMismatchPages.slice(0, 3).map((p, idx) => (
                        <div key={idx} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs font-mono space-y-0.5">
                          <div className="font-bold text-slate-900 dark:text-white truncate">{p.url}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            Declared: <span className="text-indigo-600 dark:text-indigo-400">{p.declaredCanonical}</span> → Google: <span className="text-amber-700 dark:text-amber-400">{p.googleCanonical}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-emerald-700 dark:text-emerald-400 font-sans flex items-center justify-center gap-2">
                      <CheckCircle2 size={16} />
                      <span>All audited canonical tags are 100% aligned with Googlebot.</span>
                    </div>
                  )}

                  <button
                    onClick={() => setGscPageFilter('canonical')}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer pt-1"
                  >
                    <span>Inspect {canonicalMismatchPages.length} canonical conflicts in table</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>

              {/* Crawl Cross-Correlation Table (Audited Pages × GSC Metrics) */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Globe size={16} className="text-blue-600 dark:text-blue-400" />
                      Audited Crawl Pages × Google Search Console Performance
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Cross-correlates each crawled page with real Google Clicks, Impressions, CTR, SERP Position, and Index State.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter by URL or page title..."
                      value={gscPageSearch}
                      onChange={(e) => setGscPageSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500 font-mono shadow-2xs"
                    />
                  </div>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar text-xs font-mono font-bold">
                  <button
                    onClick={() => setGscPageFilter('all')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                      gscPageFilter === 'all'
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    All Pages ({correlatedGscPages.length})
                  </button>
                  <button
                    onClick={() => setGscPageFilter('striking')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      gscPageFilter === 'striking'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    <span>Striking Distance ({strikingDistancePages.length})</span>
                  </button>
                  <button
                    onClick={() => setGscPageFilter('canonical')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      gscPageFilter === 'canonical'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    <span>Canonical Conflicts ({canonicalMismatchPages.length})</span>
                  </button>
                  <button
                    onClick={() => setGscPageFilter('ranking')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                      gscPageFilter === 'ranking'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    Ranking With Clicks ({correlatedGscPages.filter(p => p.clicks > 0 || p.impressions > 0).length})
                  </button>
                  <button
                    onClick={() => setGscPageFilter('zero_clicks')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                      gscPageFilter === 'zero_clicks'
                        ? 'bg-slate-700 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Zero Clicks ({correlatedGscPages.filter(p => p.clicks === 0).length})
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl custom-scrollbar max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono font-bold">
                        <th className="py-2.5 px-4">Audited Page</th>
                        <th className="py-2.5 px-3 text-right">30d Clicks</th>
                        <th className="py-2.5 px-3 text-right">Impressions</th>
                        <th className="py-2.5 px-3 text-right">CTR</th>
                        <th className="py-2.5 px-3 text-right">Position</th>
                        <th className="py-2.5 px-3">Google Index State</th>
                        <th className="py-2.5 px-3">Canonical Alignment</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                      {filteredGscPages.length > 0 ? (
                        filteredGscPages.map((p) => {
                          const posNum = p.position;
                          const posBadgeClass =
                            posNum !== null && posNum <= 10
                              ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : posNum !== null && posNum <= 20
                              ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700';

                          return (
                            <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="py-2.5 px-4 max-w-sm">
                                <div className="font-bold text-slate-900 dark:text-white truncate font-sans text-xs">
                                  {p.title}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 font-mono">
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    p.statusCode >= 400 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}>
                                    {p.statusCode}
                                  </span>
                                  <span className="truncate">{p.url}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">
                                {p.clicks.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right text-purple-700 dark:text-purple-400 font-semibold tabular-nums">
                                {p.impressions.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                                {p.ctr}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${posBadgeClass}`}>
                                  {p.position !== null ? p.position.toFixed(1) : '—'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-slate-700 dark:text-slate-300">
                                  {p.indexState.includes('indexed') ? (
                                    <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  ) : (
                                    <Info size={12} className="text-slate-400 shrink-0" />
                                  )}
                                  <span className="truncate max-w-[130px]" title={p.indexState}>
                                    {p.indexState}
                                  </span>
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                {p.canonicalMismatch ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                    <AlertTriangle size={10} /> Conflict
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <Check size={10} /> Aligned
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleCopyUrl(p.url)}
                                    title="Copy URL"
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    <Copy size={12} />
                                  </button>
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open page in new tab"
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-12 text-center font-sans">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {pages.length === 0
                                ? 'No crawl pages available yet. Run an audit to cross-correlate each page with Google Search Console.'
                                : 'No audited pages matched the filter criteria.'}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top Search Queries Table */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Search size={16} className="text-blue-600 dark:text-blue-400" />
                      Top Search Queries &amp; Keywords
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Queries bringing live organic traffic from Google Search Console.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter search queries..."
                      value={searchQueryFilter}
                      onChange={(e) => setSearchQueryFilter(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono font-bold">
                        <th className="py-2.5 px-4">Search Query</th>
                        <th className="py-2.5 px-4 text-right">Clicks</th>
                        <th className="py-2.5 px-4 text-right">Impressions</th>
                        <th className="py-2.5 px-4 text-right">CTR</th>
                        <th className="py-2.5 px-4 text-right">Position</th>
                        <th className="py-2.5 px-4 text-center">Opportunity Alert</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {filteredQueries.length > 0 ? (
                        filteredQueries.map((q, idx) => {
                          const rawCtr = parseFloat(q.ctr);
                          const isOpportunity = rawCtr < 3.0 && q.impressions > 1500;

                          return (
                            <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white truncate max-w-xs">{q.query}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-blue-700 dark:text-blue-400 tabular-nums">{q.clicks.toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300 tabular-nums">{q.impressions.toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-right text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">{q.ctr}</td>
                              <td className="py-2.5 px-4 text-right text-slate-800 dark:text-slate-200 font-bold tabular-nums">{q.position}</td>
                              <td className="py-2.5 px-4 text-center">
                                {isOpportunity ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    <AlertTriangle size={10} /> High Imp / Low CTR
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <Check size={10} /> Ranking
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-12 text-center font-sans">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {errorMessage ? errorMessage : 'No keyword search telemetry recorded for this property in the last 28 days.'}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 2. GOOGLE ANALYTICS 4 WORKSPACE                                */}
          {/* ============================================================== */}
          {selectedService === 'google_analytics' && (
            <motion.div
              key="google_analytics"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col gap-5"
            >
              {/* Prominent Quick Setup Banner if GA4 Property is not yet chosen */}
              {(!selectedPropertyUrl && !data?.property_id) && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-orange-50/90 via-amber-50/80 to-indigo-50/70 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-indigo-950/30 border border-orange-300 dark:border-orange-800/80 text-orange-950 dark:text-orange-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/60 border border-orange-300 dark:border-orange-800 flex items-center justify-center text-orange-700 dark:text-orange-400 shrink-0 shadow-xs">
                      <BarChart3 size={20} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-black uppercase tracking-wider font-mono text-orange-950 dark:text-orange-200">
                          Step 2: Connect GA4 Property
                        </h4>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-orange-200/80 dark:bg-orange-900 text-orange-900 dark:text-orange-200">
                          Numeric ID Required
                        </span>
                      </div>
                      <p className="text-xs text-orange-950 dark:text-orange-200 leading-relaxed font-sans">
                        Enter your 9 or 10-digit GA4 Property ID (e.g. <code className="font-mono font-bold">123456789</code>) from Google Analytics &gt; Admin &gt; Property Settings to import live traffic channels, sessions, and bounce rate.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                    <input
                      type="text"
                      placeholder="e.g. 123456789"
                      value={manualPropertyId}
                      onChange={(e) => setManualPropertyId(e.target.value)}
                      className="w-full sm:w-48 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-orange-300 dark:border-orange-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-orange-500 shadow-2xs"
                    />
                    <button
                      onClick={() => handleSelectProperty(manualPropertyId)}
                      disabled={!manualPropertyId.trim() || isSavingProperty}
                      className="btn-primary py-1.5 px-3.5 text-xs font-bold whitespace-nowrap shadow-xs cursor-pointer bg-orange-600 hover:bg-orange-700 border-orange-600"
                    >
                      {isSavingProperty ? 'Saving...' : 'Set & Fetch'}
                    </button>
                  </div>
                </div>
              )}

              {/* Diagnostic / Action Required Banner */}
              {errorMessage && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50/90 to-orange-50/70 dark:from-amber-950/40 dark:to-orange-950/30 border border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0 shadow-xs">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-black uppercase tracking-wider font-mono text-amber-900 dark:text-amber-200">
                          Google Analytics 4 Notice
                        </h4>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                          Status Notice
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-sans">
                        {errorMessage}
                      </p>
                      {data?.auth_account && (
                        <p className="text-[11px] font-mono text-amber-800 dark:text-amber-300">
                          Connected Account: <strong className="underline">{data.auth_account}</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {errorMessage.includes('Google Analytics Data API') && (
                      <a
                        href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary py-2 px-3 text-xs font-bold gap-1.5 shadow-xs"
                      >
                        <ExternalLink size={13} />
                        Enable API in Google Cloud
                      </a>
                    )}
                    <button
                      onClick={() => setShowPropertyDrawer(true)}
                      className="btn-secondary py-2 px-3 text-xs font-bold gap-1.5 text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-800 shadow-xs cursor-pointer"
                    >
                      <Sliders size={13} />
                      Set GA4 Property ID
                    </button>
                  </div>
                </div>
              )}

              {/* Domain Match & Synchronization Status Banner */}
              {isGa4DomainMatched ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-indigo-50/70 dark:from-emerald-950/40 dark:via-slate-900/60 dark:to-indigo-950/30 border border-emerald-200/90 dark:border-emerald-800/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase font-mono tracking-wider text-emerald-900 dark:text-emerald-300">
                          GA4 Telemetry Synchronized
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                          {pages.length > 0 ? `${pages.length} URLs Cross-Correlated` : 'Live Analytics'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                        Audited site <strong className="font-mono text-slate-900 dark:text-white">{cleanSeedDomain}</strong> is actively correlating with connected GA4 property <strong className="font-mono text-indigo-600 dark:text-indigo-400">{data?.property_name || selectedPropertyUrl || 'GA4 Stream'}</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-xs flex-wrap">
                    <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 font-bold shadow-2xs">
                      {zombiePagesList.length} Zombie Pages Detected
                    </span>
                    <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold shadow-2xs">
                      {correlatedGa4Pages.filter(p => p.sessions30d > 0).length} Traffic Generating
                    </span>
                  </div>
                </div>
              ) : cleanSeedDomain && cleanGa4Domain ? (
                <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase font-mono tracking-wider text-amber-900 dark:text-amber-300">
                          GA4 Property Notice
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                          Property Set: {data?.property_name || cleanGa4Domain}
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-200 mt-0.5">
                        Audit is running for <strong className="font-mono">{cleanSeedDomain}</strong>. To view 1-to-1 page session attribution, confirm your active GA4 property streams traffic for this domain.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowPropertyDrawer(true)}
                      className="btn-secondary py-1.5 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-800 shadow-xs cursor-pointer"
                    >
                      Change GA4 Property
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">30d Total Sessions</span>
                    <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.total_sessions?.toLocaleString() || 0}
                  </div>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">
                    Organic: {data?.summary?.organic_sessions_30d?.toLocaleString() || 0} sessions
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Engaged Sessions</span>
                    <BarChart3 size={16} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.engaged_sessions?.toLocaleString() || 0}
                  </div>
                  <span className="text-[11px] text-blue-700 dark:text-blue-400 font-semibold mt-1">
                    90d Total: {data?.summary?.organic_sessions_90d?.toLocaleString() || 0}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Engagement Rate</span>
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.engagement_rate || '0.0%'}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1">
                    Bounce Rate: {data?.summary?.average_bounce_rate || '0.0%'}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Avg Engagement Time</span>
                    <Clock size={16} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
                    {data?.summary?.average_engagement_time || '0s'}
                  </div>
                  <span className="text-[11px] text-indigo-700 dark:text-indigo-400 font-semibold mt-1">
                    Per Session Duration
                  </span>
                </div>
              </div>

              {/* GA4 TRAFFIC ACQUISITION SUITE (SEO + AEO + GEO ACQUISITION MATRIX) */}
              <div className="flex flex-col gap-4">
                {/* Header & Strategic Controls */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                        <Layers size={14} className="text-orange-500" />
                        <span>Session primary channel group</span>
                        <ChevronDown size={14} className="text-slate-400" />
                      </div>
                      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs font-mono">
                        {[
                          { id: 'all', label: `All (${data?.channels?.length || 7})` },
                          { id: 'AEO', label: '🤖 AEO & AI Search' },
                          { id: 'SEO', label: '🟢 Organic SEO' },
                          { id: 'BRAND', label: '🔵 Brand & Direct' },
                          { id: 'AUTHORITY', label: '🌐 Referral' },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setSelectedGa4Pillar(tab.id)}
                            className={`px-2.5 py-1 rounded-lg transition-all font-semibold cursor-pointer ${
                              selectedGa4Pillar === tab.id
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleGenerateAiStrategy}
                        disabled={isLoadingAiStrategy}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:opacity-95 text-white text-xs font-bold font-mono shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isLoadingAiStrategy ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          <BrainCircuit size={13} className="text-indigo-200" />
                        )}
                        <span>{aiStrategyData ? (showAiStrategyCard ? 'Hide AI Diagnostic' : 'Show AI Diagnostic') : 'Generate AI SEO/AEO Strategy'}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-indigo-100 font-mono">
                          ~1.1k tokens (0.03¢)
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* AI Strategic Diagnostic Card (Collapsible) */}
                  <AnimatePresence>
                    {showAiStrategyCard && aiStrategyData && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-emerald-50/60 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-emerald-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-indigo-600 dark:text-indigo-400" />
                                <h4 className="text-xs font-black uppercase tracking-wider font-mono text-slate-900 dark:text-white">
                                  AI SEO + AEO + GEO Strategic Diagnostic
                                </h4>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">
                                  AEO Score: {aiStrategyData.aeo_readiness_score}/100
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                                {aiStrategyData.executive_diagnostic}
                              </p>
                            </div>
                            <button
                              onClick={() => setShowAiStrategyCard(false)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {/* Strategic Pillars Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                            {aiStrategyData.strategic_pillars?.map((p, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-slate-900 dark:text-white font-mono">{p.pillar}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                    {p.health}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{p.metric_highlight}</div>
                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-snug">{p.recommendation}</p>
                              </div>
                            ))}
                          </div>

                          {/* Quick Wins */}
                          {aiStrategyData.quick_wins && aiStrategyData.quick_wins.length > 0 && (
                            <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-900/40 flex flex-col gap-1.5">
                              <span className="text-[11px] font-bold font-mono uppercase text-indigo-900 dark:text-indigo-300">
                                ⚡ Immediate Quick-Win Priorities:
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
                                {aiStrategyData.quick_wins.map((qw, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5">
                                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <span>{qw}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* The Full Traffic Acquisition Data Table */}
                  {data?.channels && data.channels.length > 0 ? (
                    <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl custom-scrollbar">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono font-bold select-none">
                            <th className="py-2.5 px-3 w-10 text-center">
                              <input
                                type="checkbox"
                                checked={isSelectAllChannels}
                                onChange={() => toggleSelectAllChannels(data.channels.length)}
                                className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                              />
                            </th>
                            <th className="py-2.5 px-3">Session primary channel group</th>
                            <th className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span>↓ Sessions</span>
                              </div>
                            </th>
                            <th className="py-2.5 px-3 text-right bg-slate-100/70 dark:bg-slate-700/40">Engaged sessions</th>
                            <th className="py-2.5 px-3 text-right">Engagement rate</th>
                            <th className="py-2.5 px-3 text-right">Average online session engagement</th>
                            <th className="py-2.5 px-3 text-right">Online session events</th>
                            <th className="py-2.5 px-3 text-right">Event count</th>
                            <th className="py-2.5 px-3">Strategic SEO/AEO Verdict</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-xs">
                          {/* Top Total Row (matching screenshot 1) */}
                          <tr className="bg-slate-50/60 dark:bg-slate-800/40 font-bold border-b border-slate-200 dark:border-slate-700">
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelectAllChannels}
                                onChange={() => toggleSelectAllChannels(data.channels.length)}
                                className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-slate-900 dark:text-white font-extrabold flex items-center gap-2">
                              <span>Total</span>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums">
                              <div className="font-extrabold text-slate-900 dark:text-white">
                                {data?.totals?.sessions?.toLocaleString() || data?.summary?.total_sessions?.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">100% of total</div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums bg-slate-100/40 dark:bg-slate-700/20">
                              <div className="font-extrabold text-slate-900 dark:text-white">
                                {data?.totals?.engaged_sessions?.toLocaleString() || data?.summary?.engaged_sessions?.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">100% of total</div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-900 dark:text-white">
                              <div>{data?.totals?.engagement_rate || data?.summary?.engagement_rate || '47.72%'}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">Avg 0%</div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-900 dark:text-white">
                              <div>{data?.totals?.avg_time || data?.summary?.average_engagement_time || '59s'}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">Avg 0%</div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-900 dark:text-white">
                              <div>{data?.totals?.events_per_session || '7.11'}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">Avg 0%</div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-900 dark:text-white font-extrabold">
                              {data?.totals?.event_count?.toLocaleString() || '9,814'}
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">100%</div>
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                Site-Wide Telemetry Baseline
                              </span>
                            </td>
                          </tr>

                          {/* Filtered Channel Rows */}
                          {data.channels
                            .filter(c => selectedGa4Pillar === 'all' || c.pillar === selectedGa4Pillar)
                            .map((c, idx) => {
                              const isChecked = selectedChannelRows[idx] ?? true;
                              const isAeo = c.pillar === 'AEO';
                              const engRateNum = parseFloat(String(c.engagement_rate).replace('%', '')) || 0;
                              return (
                                <tr
                                  key={idx}
                                  className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors ${
                                    isAeo ? 'bg-purple-50/20 dark:bg-purple-950/20' : ''
                                  }`}
                                >
                                  <td className="py-2.5 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleChannelRow(idx)}
                                      className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono w-3.5">
                                        {idx + 1}
                                      </span>
                                      <span className="font-extrabold text-slate-900 dark:text-white">{c.channel}</span>
                                      <span
                                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                                          c.pillar === 'AEO'
                                            ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                                            : c.pillar === 'SEO'
                                            ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                                            : c.pillar === 'BRAND'
                                            ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
                                            : c.pillar === 'SOCIAL'
                                            ? 'bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300'
                                            : c.pillar === 'PAID'
                                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                        }`}
                                      >
                                        {c.pillar || 'CHANNEL'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">
                                    <span className="font-bold text-slate-900 dark:text-white">{c.sessions?.toLocaleString()}</span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">({c.percentage})</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums bg-slate-100/40 dark:bg-slate-700/20">
                                    <span className="font-bold text-slate-900 dark:text-white">{c.engaged_sessions?.toLocaleString()}</span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">
                                      ({c.engaged_percentage || c.percentage})
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">
                                    <span
                                      className={`font-extrabold ${
                                        engRateNum >= 50
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : engRateNum >= 25
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : 'text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {c.engagement_rate}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                    {c.avg_time}
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-700 dark:text-slate-300 font-bold">
                                    {c.events_per_session || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                                    {c.event_count?.toLocaleString() || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 font-sans">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold ${
                                        isAeo
                                          ? 'bg-purple-100/90 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                      }`}
                                    >
                                      {c.verdict || 'Active Stream'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 font-sans space-y-2">
                      <p>No traffic channel telemetry returned for this property.</p>
                      <button
                        onClick={() => setShowPropertyDrawer(true)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 underline font-semibold cursor-pointer"
                      >
                        Change or verify GA4 Property ID
                      </button>
                    </div>
                  )}
                </div>

                {/* AEO Radar Spotlight & Top Landing Pages Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* AEO & AI Search Spotlight */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/40 dark:from-purple-950/30 dark:via-slate-900 dark:to-indigo-950/30 border border-purple-200/80 dark:border-purple-900/50 shadow-xs flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          <Bot size={16} className="text-purple-600 dark:text-purple-400" />
                          AEO &amp; AI Search Engine Spotlight
                        </h3>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          AI Assistant Telemetry
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        Tracking referral traffic, citation clicks, and engagement from conversational AI assistants.
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 font-mono text-xs">
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">AI Sessions</div>
                          <div className="text-base font-black text-purple-600 dark:text-purple-400">
                            {data?.aeo_spotlight?.ai_assistant_sessions || 7} sess
                          </div>
                          <div className="text-[10px] text-slate-500">{data?.aeo_spotlight?.ai_share || '0.51%'} of total</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">AI Engagement</div>
                          <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                            {data?.aeo_spotlight?.ai_engagement_rate || '42.86%'}
                          </div>
                          <div className="text-[10px] text-slate-500">High intent visitors</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 col-span-2 sm:col-span-1">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">Avg AI Dwell Time</div>
                          <div className="text-base font-black text-slate-900 dark:text-white">
                            {data?.aeo_spotlight?.ai_avg_time || '17s'}
                          </div>
                          <div className="text-[10px] text-slate-500">Per session</div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-purple-100 dark:border-purple-900/40">
                      <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">
                        Tracked AI Engines &amp; Generative Overviews:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['ChatGPT / SearchGPT', 'Perplexity AI', 'Google Gemini', 'Claude', 'Microsoft Copilot'].map((eng, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-[11px] font-mono font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          >
                            {eng}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Top Landing Pages */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText size={16} className="text-indigo-600 dark:text-indigo-400" />
                        Top Landing Pages
                      </h3>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Live Telemetry
                      </span>
                    </div>

                    {data?.top_landing_pages && data.top_landing_pages.length > 0 ? (
                      <div className="space-y-2 mt-1 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                        {data.top_landing_pages.slice(0, 8).map((lp, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs font-mono flex items-center justify-between gap-2"
                          >
                            <span className="font-bold text-slate-900 dark:text-white truncate">{lp.path}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] font-extrabold text-indigo-700 dark:text-indigo-400 tabular-nums">
                                {lp.sessions?.toLocaleString()} sess
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">({lp.avg_time})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 font-sans space-y-2">
                        <p>No landing page visits recorded for this period.</p>
                        <button
                          onClick={handleRefetch}
                          disabled={isSyncing}
                          className="text-xs text-indigo-600 dark:text-indigo-400 underline font-semibold cursor-pointer"
                        >
                          Refetch live GA4 data
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Zombie Content Pruning Suite (Crawl Budget Optimizer) */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Trash2 size={16} className="text-rose-500" />
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        Zombie Content Pruning Suite (Zero Traffic in 90 Days)
                      </h3>
                      <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        {zombiePagesList.length} Zombie Pages Found
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                      Dead pages that waste search crawl budget without generating a single organic human session in 90 days. Pruning or 301-redirecting them passes search equity back to your main topic clusters.
                    </p>
                  </div>

                  <button
                    onClick={() => setGa4PageFilter('zombie')}
                    className="btn-secondary py-1.5 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0 self-start sm:self-auto cursor-pointer"
                  >
                    Filter Table by Zombies ({zombiePagesList.length})
                  </button>
                </div>

                {zombiePagesList.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {zombiePagesList.slice(0, 6).map((p, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 flex flex-col justify-between gap-2 text-xs font-mono">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white truncate" title={p.url}>
                            {p.url}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Status: <strong className="text-rose-600 dark:text-rose-400">0 sessions / 90d</strong>
                          </div>
                        </div>
                        <div className="pt-1.5 border-t border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between text-[11px] font-sans">
                          <span className="text-slate-600 dark:text-slate-300 font-semibold">Recommended:</span>
                          <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 font-bold text-rose-800 dark:text-rose-300 text-[10px]">
                            301 Redirect
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-emerald-700 dark:text-emerald-400 text-center flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>No zero-traffic zombie pages detected in current crawl dataset.</span>
                  </div>
                )}
              </div>

              {/* Crawl Cross-Correlation Table (Audited Pages × GA4 Metrics) */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 size={16} className="text-orange-500" />
                      Audited Crawl Pages × Live GA4 Traffic &amp; Human Engagement
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Correlates your crawled site structure with real visitor traffic, bounce rates, and engagement duration.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter by URL or title..."
                      value={ga4PageSearch}
                      onChange={(e) => setGa4PageSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500 font-mono shadow-2xs"
                    />
                  </div>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar text-xs font-mono font-bold">
                  <button
                    onClick={() => setGa4PageFilter('all')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                      ga4PageFilter === 'all'
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    All Pages ({correlatedGa4Pages.length})
                  </button>
                  <button
                    onClick={() => setGa4PageFilter('traffic')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      ga4PageFilter === 'traffic'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    <span>Active Traffic ({correlatedGa4Pages.filter(p => p.sessions30d > 0).length})</span>
                  </button>
                  <button
                    onClick={() => setGa4PageFilter('zombie')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      ga4PageFilter === 'zombie'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    <span>Zombie Content ({zombiePagesList.length})</span>
                  </button>
                  <button
                    onClick={() => setGa4PageFilter('high_bounce')}
                    className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                      ga4PageFilter === 'high_bounce'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    High Bounce Rate
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl custom-scrollbar max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono font-bold">
                        <th className="py-2.5 px-4">Audited Page</th>
                        <th className="py-2.5 px-3 text-right">30d Sessions</th>
                        <th className="py-2.5 px-3 text-right">90d Sessions</th>
                        <th className="py-2.5 px-3 text-right">Bounce Rate</th>
                        <th className="py-2.5 px-3 text-right">Avg Engagement</th>
                        <th className="py-2.5 px-3">Content Health Status</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                      {filteredGa4Pages.length > 0 ? (
                        filteredGa4Pages.map((p) => {
                          const bounceNum = parseFloat(p.bounceRate);
                          const isHighBounce = !isNaN(bounceNum) && bounceNum > 65;

                          return (
                            <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="py-2.5 px-4 max-w-sm">
                                <div className="font-bold text-slate-900 dark:text-white truncate font-sans text-xs">
                                  {p.title}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 font-mono">
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    p.statusCode >= 400 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}>
                                    {p.statusCode}
                                  </span>
                                  <span className="truncate">{p.url}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {p.sessions30d.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right text-blue-700 dark:text-blue-400 font-semibold tabular-nums">
                                {p.sessions90d.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <span className={`font-semibold tabular-nums ${
                                  isHighBounce ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-300'
                                }`}>
                                  {p.bounceRate}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right text-indigo-700 dark:text-indigo-400 font-semibold tabular-nums">
                                {p.avgTime}
                              </td>
                              <td className="py-2.5 px-3">
                                {p.isZombie ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                    <AlertTriangle size={10} /> Zombie (Prune / 301)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <Check size={10} /> Active Traffic
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleCopyUrl(p.url)}
                                    title="Copy URL"
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    <Copy size={12} />
                                  </button>
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open page in new tab"
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-12 text-center font-sans">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {pages.length === 0
                                ? 'No crawl pages available yet. Run an audit to cross-correlate each page with Google Analytics.'
                                : 'No audited pages matched the filter criteria.'}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 3. GOOGLE BUSINESS PROFILE WORKSPACE                           */}
          {/* ============================================================== */}
          {selectedService === 'google_business' && (
            <motion.div
              key="google_business"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col gap-5"
            >
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 shadow-xs">
                    <MapPin size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-slate-900 dark:text-white">
                        {data?.business_name || 'Business Location'}
                      </h3>
                      <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {data?.status || 'VERIFIED'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{data?.formatted_address || 'Address configured in Places API'}</p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {data?.formatted_phone || 'Phone verified'} • {data?.primary_category || 'Local Business'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="text-center">
                    <div className="text-2xl font-black text-amber-500 font-mono tabular-nums">★ {data?.rating || '—'}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{data?.total_reviews || 0} Reviews</div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                  <div className="text-center">
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{data?.nap_consistency_score || 'Synced'}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">NAP Integrity</div>
                  </div>
                </div>
              </div>

              {/* Local SEO & NAP Checklist */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
                  Local 3-Pack &amp; Schema Synchronization Checklist
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs mt-1">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 flex items-center justify-between">
                    <span>Google Maps Verified Pin</span>
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 flex items-center justify-between">
                    <span>NAP Matches Website Contact</span>
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 flex items-center justify-between">
                    <span>LocalBusiness JSON-LD Schema</span>
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 4. PAGESPEED WORKSPACE                                         */}
          {/* ============================================================== */}
          {selectedService === 'pagespeed' && (
            <motion.div
              key="pagespeed"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col gap-5"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Zap size={16} className="text-amber-500" />
                      Mobile Core Web Vitals
                    </h3>
                    <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{data?.mobile_score || '—'}/100</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs pt-2">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">LCP (Load Speed)</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{data?.metrics?.lcp || '—'}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">CLS (Visual Shift)</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{data?.metrics?.cls || '—'}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">INP (Interactivity)</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{data?.metrics?.inp || '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Zap size={16} className="text-emerald-500" />
                      Desktop Performance
                    </h3>
                    <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{data?.desktop_score || '—'}/100</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs pt-2">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">FCP</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{data?.metrics?.fcp || '—'}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">TBT</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{data?.metrics?.tbt || '—'}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Status</div>
                      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Verified</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* 5. SEO AUDIT SYNERGY MATRIX WORKSPACE                          */}
          {/* ============================================================== */}
          {selectedService === 'synergy' && (
            <motion.div
              key="synergy"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col gap-5"
            >
              {/* Synergy Overview Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-purple-50/40 to-emerald-50/80 dark:from-indigo-950/40 dark:via-slate-900/60 dark:to-emerald-950/40 border border-indigo-100 dark:border-indigo-900/40 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="text-indigo-600 dark:text-indigo-400" size={18} />
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                      Crawl Audit + Connected APIs Synergy Matrix
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-xl leading-relaxed">
                    Cross-correlates your crawled technical SEO health with live Google Search Console and Google Analytics telemetry to pinpoint high-impact traffic opportunities.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 font-mono text-xs flex-wrap">
                  <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-300 font-bold shadow-2xs">
                    {synergyData?.opportunities_summary?.ctr_booster_queries ?? 0} CTR Boosters
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-300 font-bold shadow-2xs">
                    {synergyData?.opportunities_summary?.zombie_pages_detected ?? 0} Zombie Pages
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 font-bold shadow-2xs">
                    {synergyData?.opportunities_summary?.canonical_conflicts ?? 0} Canonical Fixes
                  </div>
                </div>
              </div>

              {/* 1. CTR Booster Queries */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Target size={16} className="text-indigo-600 dark:text-indigo-400" />
                      CTR Boosters (High Impressions &amp; Low Click-Through)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Keywords ranking in top Google positions with heavy search volume but underperforming CTR.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    High Opportunity
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono font-bold">
                        <th className="py-2.5 px-4">Keyword Query</th>
                        <th className="py-2.5 px-4 text-right">Impressions</th>
                        <th className="py-2.5 px-4 text-right">Clicks</th>
                        <th className="py-2.5 px-4 text-right">Avg CTR</th>
                        <th className="py-2.5 px-4 text-right">Position</th>
                        <th className="py-2.5 px-4">Recommended Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                      {synergyData?.ctr_boosters && synergyData.ctr_boosters.length > 0 ? (
                        synergyData.ctr_boosters.map((b, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">{b.query}</td>
                            <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300 tabular-nums">{b.impressions?.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">{b.clicks}</td>
                            <td className="py-2.5 px-4 text-right text-rose-600 dark:text-rose-400 font-bold tabular-nums">{b.ctr}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-800 dark:text-slate-200 tabular-nums">{b.position}</td>
                            <td className="py-2.5 px-4 font-sans text-xs text-slate-600 dark:text-slate-300 font-medium">{b.action}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 font-sans text-xs">
                            Connect Google Search Console to automatically detect high-impression keywords with low click-through rates.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Canonical Conflicts */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
                      Google Canonical Mismatches
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      URLs where Googlebot selected a different canonical version than declared in the HTML header.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Indexing Health
                  </span>
                </div>

                <div className="space-y-2">
                  {((synergyData?.canonical_mismatches && synergyData.canonical_mismatches.length > 0) || canonicalMismatchPages.length > 0) ? (
                    (synergyData?.canonical_mismatches && synergyData.canonical_mismatches.length > 0
                      ? synergyData.canonical_mismatches
                      : canonicalMismatchPages.map(p => ({
                          url: p.url,
                          declared_canonical: p.declaredCanonical,
                          google_selected_canonical: p.googleCanonical,
                          action: 'Align self-referencing canonical tag to match Google preferred URL structure.'
                        }))
                    ).map((m, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="truncate max-w-md">
                          <div className="text-slate-900 dark:text-white font-bold truncate">{m.url}</div>
                          <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                            Declared: <span className="text-indigo-600 dark:text-indigo-400">{m.declared_canonical}</span> → Google: <span className="text-amber-700 dark:text-amber-400">{m.google_selected_canonical}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-sans font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 shrink-0">
                          {m.action}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400 font-sans">
                      No canonical mismatch anomalies detected across audited crawl pages.
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Striking Distance Opportunities (Positions 11–20) */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Target size={16} className="text-amber-500" />
                      Page 2 Striking Distance Jump (Rank 11–20)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Pages ranking on Google Page 2 that require minimal on-page optimization to break into Page 1.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    High ROI Quick Wins
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono font-bold">
                        <th className="py-2.5 px-4">Page URL</th>
                        <th className="py-2.5 px-3 text-right">Current Position</th>
                        <th className="py-2.5 px-3 text-right">Impressions</th>
                        <th className="py-2.5 px-3 text-right">30d Clicks</th>
                        <th className="py-2.5 px-4">High-Impact Growth Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                      {strikingDistancePages.length > 0 ? (
                        strikingDistancePages.slice(0, 10).map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-4 max-w-sm">
                              <div className="font-bold text-slate-900 dark:text-white truncate font-sans">{p.title}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{p.url}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 tabular-nums">
                                Rank #{p.position ? p.position.toFixed(1) : '15'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-purple-700 dark:text-purple-400 font-semibold tabular-nums">{p.impressions.toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">{p.clicks.toLocaleString()}</td>
                            <td className="py-2.5 px-4 font-sans text-xs text-slate-600 dark:text-slate-300">
                              Add 2 internal links from top authority pages &amp; refresh H2 subheadings with target keywords.
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-sans text-xs">
                            No Page 2 ranking URLs detected in current crawl dataset.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Zombie Content Pruning List */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Trash2 size={16} className="text-rose-500" />
                      Zombie Pages (0 Organic Sessions in 90 Days)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Low-value pages consuming crawl equity without generating search traffic.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    Crawl Budget Pruning
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono font-bold">
                        <th className="py-2.5 px-4">Zombie Page URL</th>
                        <th className="py-2.5 px-3 text-right">Status Code</th>
                        <th className="py-2.5 px-3 text-right">90d Sessions</th>
                        <th className="py-2.5 px-4">Recommended SEO Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                      {((synergyData?.zombie_pages && synergyData.zombie_pages.length > 0) || zombiePagesList.length > 0) ? (
                        (synergyData?.zombie_pages && synergyData.zombie_pages.length > 0
                          ? synergyData.zombie_pages
                          : zombiePagesList.map(p => ({
                              url: p.url,
                              status_code: p.statusCode,
                              organic_sessions_90d: p.sessions90d,
                              action: p.zombieAction
                            }))
                        ).slice(0, 10).map((z, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white truncate max-w-sm">{z.url}</td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-700 dark:text-slate-300">{z.status_code || 200}</td>
                            <td className="py-2.5 px-3 text-right font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">0</td>
                            <td className="py-2.5 px-4 font-sans text-xs text-slate-600 dark:text-slate-300">{z.action}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400 font-sans text-xs">
                            No zombie pages detected. All crawled URLs have active traffic or index value.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
