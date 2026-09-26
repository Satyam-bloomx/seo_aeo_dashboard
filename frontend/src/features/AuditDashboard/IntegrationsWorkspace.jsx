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
  ChevronDown
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

  // Check connection status from parent or current fetch
  const isCurrentConnected = useMemo(() => {
    if (selectedService === 'synergy') return true;
    return Boolean(integrationsStatus[selectedService]?.connected);
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
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs"
          >
            <div className="flex-1 w-full space-y-2">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-xs font-black uppercase tracking-wider font-mono text-indigo-900 dark:text-indigo-300">
                  Target {selectedService === 'search_console' ? 'Google Search Console' : 'Google Analytics 4'} Property
                </h4>
              </div>

              {availableProperties.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <select
                    value={selectedPropertyUrl}
                    onChange={(e) => handleSelectProperty(e.target.value)}
                    className="flex-1 text-xs font-mono bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
                  >
                    <option value="">-- Choose verified property --</option>
                    {availableProperties.map((p, idx) => (
                      <option key={idx} value={p.siteUrl || p.id}>
                        {p.displayName || p.siteUrl || p.name} {p.account ? `(${p.account})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-indigo-800 dark:text-indigo-300 font-sans">
                  {isLoadingProperties ? 'Discovering properties from Google API...' : 'No properties auto-discovered. You can enter your Property ID directly below.'}
                </p>
              )}

              {/* Manual Property ID Input */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder={selectedService === 'search_console' ? 'e.g. sc-domain:example.com or https://example.com/' : 'Enter GA4 Property ID (e.g. 123456789 or properties/123456789)'}
                  value={manualPropertyId}
                  onChange={(e) => setManualPropertyId(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => handleSelectProperty(manualPropertyId)}
                  disabled={!manualPropertyId.trim() || isSavingProperty}
                  className="btn-primary py-1.5 px-3 text-xs font-bold whitespace-nowrap shadow-xs cursor-pointer"
                >
                  {isSavingProperty ? 'Saving...' : 'Set & Sync'}
                </button>
                {selectedService === 'search_console' && selectedPropertyUrl && onAuditProperty && (
                  <button
                    onClick={() => onAuditProperty(selectedPropertyUrl)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs transition-colors"
                  >
                    <Zap size={12} />
                    <span>Run Crawler Audit</span>
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowPropertyDrawer(false)}
              className="text-xs text-indigo-700 dark:text-indigo-300 underline font-semibold cursor-pointer shrink-0 self-end md:self-center"
            >
              Close
            </button>
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
            {selectedService === 'search_console' || selectedService === 'google_analytics' ? (
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
                          Google Analytics 4 Action Required
                        </h4>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                          Configuration Needed
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

              {/* Traffic Channel Attribution & Top Landing Pages */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Traffic Channels */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Layers size={16} className="text-orange-600 dark:text-orange-400" />
                      Traffic Channel Attribution
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      Last 30 Days
                    </span>
                  </div>

                  {data?.channels && data.channels.length > 0 ? (
                    <div className="space-y-3 font-mono text-xs mt-1">
                      {data.channels.map((c, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-slate-700 dark:text-slate-300">
                            <span className="font-bold">{c.channel}</span>
                            <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                              {c.sessions?.toLocaleString()} ({c.percentage})
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${
                                idx === 0 ? 'bg-emerald-500' :
                                idx === 1 ? 'bg-blue-500' :
                                idx === 2 ? 'bg-purple-500' :
                                idx === 3 ? 'bg-amber-500' : 'bg-slate-400'
                              }`}
                              style={{ width: c.percentage }}
                            />
                          </div>
                        </div>
                      ))}
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
                    <div className="space-y-2 mt-1 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                      {data.top_landing_pages.slice(0, 8).map((lp, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs font-mono flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white truncate">{lp.path}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-extrabold text-indigo-700 dark:text-indigo-400 tabular-nums">{lp.sessions?.toLocaleString()} sess</span>
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
                  {synergyData?.canonical_mismatches && synergyData.canonical_mismatches.length > 0 ? (
                    synergyData.canonical_mismatches.map((m, idx) => (
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
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
