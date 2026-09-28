'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { CheckCircle2, Loader2, XCircle, ShieldCheck, AlertTriangle, Key, ArrowRight, RefreshCw, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '@/api/client';

function diagnoseOAuthError(rawError, rawDesc, redirectUri, service) {
  const err = (rawError || '').toLowerCase();
  const desc = (rawDesc || '').toLowerCase();
  const svcTitle = service === 'google_analytics' ? 'Google Analytics 4' : 'Google Search Console';

  if (err.includes('access_denied') || desc.includes('access_denied') || desc.includes('test user')) {
    return {
      title: 'Google Cloud: Test User Restriction (Access Denied)',
      summary: 'Google blocked authentication because your Google Cloud project is in "Testing" mode.',
      steps: [
        'Open Google Cloud Console > APIs & Services > OAuth consent screen.',
        'Scroll down to "Test users" and click "+ ADD USERS".',
        'Add your Google account email and click SAVE.',
        'Alternatively, switch to the "Direct Token / Service Account JSON" tab to connect instantly without OAuth consent screens.'
      ],
      link: 'https://console.cloud.google.com/apis/credentials/consent',
      linkLabel: 'Open Google Cloud OAuth Consent Screen'
    };
  }

  if (err.includes('redirect_uri_mismatch') || desc.includes('redirect_uri_mismatch')) {
    return {
      title: 'Authorized Redirect URI Mismatch',
      summary: `Google requires this exact URL to be whitelisted in your OAuth Client credentials:`,
      highlightText: redirectUri,
      steps: [
        'Open Google Cloud Console > APIs & Services > Credentials.',
        'Click on your OAuth 2.0 Client ID (Web application).',
        'Under "Authorized redirect URIs", paste the exact URL shown above.',
        'Click SAVE and wait ~60 seconds for Google servers to update.'
      ],
      link: 'https://console.cloud.google.com/apis/credentials',
      linkLabel: 'Open Google Cloud Credentials'
    };
  }

  if (desc.includes('analyticsdata') || desc.includes('analyticsadmin') || desc.includes('disabled')) {
    return {
      title: 'Google Analytics API Disabled in Google Cloud',
      summary: 'The required Google Analytics API is disabled in your Google Cloud Project.',
      steps: [
        'Enable "Google Analytics Data API" in Google Cloud Console.',
        'Enable "Google Analytics Admin API" in Google Cloud Console.',
        'Alternatively, enter your numeric GA4 Property ID directly in the dashboard to bypass Admin API.'
      ],
      link: 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com',
      linkLabel: 'Enable Analytics Data API'
    };
  }

  if (desc.includes('permission not granted') || desc.includes('checkbox')) {
    return {
      title: 'Required Permission Checkbox Not Selected',
      summary: `You must check the permission box on Google's consent screen to allow ${svcTitle} access.`,
      steps: [
        'Click "Try Again" below to reopen Google Sign-In.',
        `On the Google consent screen, locate the checkbox for "${svcTitle}" and ensure it is CHECKED.`,
        'Click Continue to complete authorization.'
      ]
    };
  }

  return {
    title: 'OAuth Authorization Failed',
    summary: rawDesc || rawError || `Google rejected the authentication request for ${svcTitle}.`,
    steps: [
      'Verify that your Google Client ID and Secret in backend/.env (or modal) are correct without extra spaces.',
      'Check that the authorized redirect URI in Google Cloud Console matches your current domain.',
      'Or use the Direct Token / Service Account JSON method to connect immediately.'
    ]
  };
}

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const stateParam = searchParams.get('state') || '';
  let serviceParam = searchParams.get('service');
  let projectIdParam = searchParams.get('project_id');
  const codeParam = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDesc = searchParams.get('error_description');

  if (stateParam) {
    if (stateParam.includes(':')) {
      const [stateProj, stateSvc] = stateParam.split(':');
      if (!projectIdParam && stateProj) projectIdParam = stateProj;
      if (!serviceParam && stateSvc) serviceParam = stateSvc;
    } else if (!serviceParam) {
      serviceParam = stateParam;
    }
  }

  const projectId = projectIdParam || '1';
  const service = serviceParam || 'google_analytics';
  const code = codeParam;

  const [status, setStatus] = useState('loading');
  const serviceDisplayName = service ? service.replace(/_/g, ' ').toUpperCase() : 'GOOGLE SERVICE';
  const [message, setMessage] = useState(`Verifying OAuth credentials for ${serviceDisplayName}...`);
  const [errorDetails, setErrorDetails] = useState(null);
  const [redirectUriUsed, setRedirectUriUsed] = useState('');
  const exchangeAttemptedRef = useRef(false);

  useEffect(() => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const callbackUri = `${currentOrigin}/integrations/callback`;
    setRedirectUriUsed(callbackUri);

    // 1. Google returned an error query (e.g. access_denied)
    if (errorParam) {
      const fullErrorMsg = errorDesc || errorParam || 'Google authorization was cancelled or denied.';
      setStatus('error');
      setMessage(fullErrorMsg);
      const diagnosis = diagnoseOAuthError(errorParam, errorDesc, callbackUri, service);
      setErrorDetails(diagnosis);

      // Record in sessionStorage for the dashboard
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('last_integration_error', JSON.stringify({
          service,
          error: fullErrorMsg,
          diagnosis: diagnosis.title,
          timestamp: Date.now()
        }));
      }

      // Record in backend DB so /status/1 displays it persistently
      axios.post(`${API_BASE_URL}/integrations/google/record-error`, {
        project_id: parseInt(projectId, 10),
        service,
        error: errorParam,
        error_description: fullErrorMsg
      }).catch(() => {});

      return;
    }

    // 2. Validate service identifier
    if (!service) {
      setStatus('error');
      setMessage('Invalid callback parameters. Missing service identifier.');
      return;
    }

    // 3. Validate auth code
    if (!code) {
      setStatus('error');
      setMessage('No authorization code returned from Google OAuth.');
      return;
    }

    // Guard against React Strict Mode double-invocation
    if (exchangeAttemptedRef.current) return;
    exchangeAttemptedRef.current = true;

    const completeAuth = async () => {
      try {
        setMessage(`Authenticating ${serviceDisplayName} with Google Cloud...`);
        
        const endpoint = `${API_BASE_URL}/integrations/google/callback?project_id=${encodeURIComponent(projectId)}&service=${encodeURIComponent(service)}&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(callbackUri)}`;

        const res = await axios.post(endpoint);
        setStatus('success');
        setMessage(res.data?.message || `Successfully connected to ${serviceDisplayName}!`);
        
        // Clear any stored errors on success
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('last_integration_error');
        }

        setTimeout(() => {
          router.push(`/?tab=integrations&service=${service}&connected=true`);
        }, 1500);
      } catch (err) {
        console.error("OAuth token exchange error:", err);
        const detail = err.response?.data?.detail || err.message || 'Token exchange failed.';
        setStatus('error');
        setMessage(`Authentication failed: ${detail}`);
        
        const diagnosis = diagnoseOAuthError(detail, detail, callbackUri, service);
        setErrorDetails(diagnosis);

        // Record in sessionStorage for the dashboard
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('last_integration_error', JSON.stringify({
            service,
            error: detail,
            diagnosis: diagnosis.title,
            timestamp: Date.now()
          }));
        }

        // Record in backend DB so /status/1 displays it persistently
        axios.post(`${API_BASE_URL}/integrations/google/record-error`, {
          project_id: parseInt(projectId, 10),
          service,
          error: 'token_exchange_error',
          error_description: detail
        }).catch(() => {});
      }
    };

    completeAuth();
  }, [projectId, service, code, errorParam, errorDesc, router, serviceDisplayName]);

  const handleReturnToDashboard = () => {
    const errText = message || errorDesc || errorParam || 'OAuth Authentication Failed';
    router.push(`/?tab=integrations&service=${encodeURIComponent(service)}&oauth_error=${encodeURIComponent(errText)}`);
  };

  const handleOpenDirectToken = () => {
    router.push(`/?tab=integrations&open_modal=${encodeURIComponent(service)}&tab_type=direct_token`);
  };

  const handleTryAgain = async () => {
    try {
      const redirectUri = window.location.origin;
      const res = await axios.get(
        `${API_BASE_URL}/integrations/google/auth?project_id=${projectId}&service=${service}&redirect_uri=${encodeURIComponent(redirectUri)}`
      );
      if (res.data?.auth_url) {
        window.location.href = res.data.auth_url;
      } else {
        handleReturnToDashboard();
      }
    } catch {
      handleReturnToDashboard();
    }
  };

  return (
    <div className="glass-card p-6 md:p-8 flex flex-col items-center max-w-xl w-full text-center border border-slate-200 dark:border-[#222222] bg-white dark:bg-[#0a0a0a] shadow-2xl rounded-2xl text-slate-900 dark:text-[#f4f4f5]">
      {status === 'loading' && (
        <Loader2 size={52} className="text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
      )}
      
      {status === 'success' && (
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 shadow-sm">
          <CheckCircle2 size={36} />
        </div>
      )}
      
      {status === 'error' && (
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 shadow-sm">
          <XCircle size={36} />
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">
        <ShieldCheck size={13} /> {serviceDisplayName} OAuth Verification
      </div>
      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">
        {status === 'success' ? 'Connected Successfully!' : status === 'error' ? 'Connection Failed' : 'Connecting to Google...'}
      </h2>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono max-w-md mb-4">{message}</p>
      
      {/* Rich Error Diagnosis Box */}
      {status === 'error' && errorDetails && (
        <div className="w-full text-left p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 mb-5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-rose-950 dark:text-rose-200">
                {errorDetails.title}
              </h4>
              <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5">
                {errorDetails.summary}
              </p>
            </div>
          </div>

          {errorDetails.highlightText && (
            <div className="bg-black/60 p-2 rounded-lg border border-rose-800/40 text-[11px] font-mono text-emerald-300 select-all break-all">
              {errorDetails.highlightText}
            </div>
          )}

          {errorDetails.steps && errorDetails.steps.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-rose-200/60 dark:border-rose-900/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300">How to Fix:</span>
              <ul className="space-y-1">
                {errorDetails.steps.map((st, idx) => (
                  <li key={idx} className="text-[11px] text-rose-900 dark:text-rose-200 flex items-start gap-1.5">
                    <span className="text-rose-500 font-bold shrink-0">{idx + 1}.</span>
                    <span>{st}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errorDetails.link && (
            <a
              href={errorDetails.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:underline pt-1"
            >
              {errorDetails.linkLabel || 'Open Google Cloud Console'} <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Action Buttons on Error */}
      {status === 'error' && (
        <div className="w-full flex flex-col sm:flex-row items-center gap-2 pt-2">
          <button 
            onClick={handleReturnToDashboard}
            className="w-full sm:flex-1 btn-primary py-2 px-3 text-xs font-bold shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Return to Dashboard</span>
            <ArrowRight size={13} />
          </button>
          <button
            onClick={handleOpenDirectToken}
            className="w-full sm:flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Key size={13} />
            <span>Direct Token / JSON</span>
          </button>
          <button
            onClick={handleTryAgain}
            className="w-full sm:w-auto p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer"
            title="Try connecting again"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsCallback() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#000000] flex flex-col items-center justify-center p-6 relative">
      <div className="ambient-bg"></div>
      <Suspense fallback={
        <div className="glass-card p-10 flex flex-col items-center max-w-md w-full text-center border border-slate-200 dark:border-[#222222] bg-white dark:bg-[#0a0a0a] shadow-md">
          <Loader2 size={48} className="text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">Loading OAuth callback telemetry...</p>
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
