'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { CheckCircle2, Loader2, XCircle, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '@/api/client';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Extract state, service, project_id, code and error parameters
  // Google OAuth passes state as "{project_id}:{service}" e.g. "1:search_console"
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
  const service = serviceParam;
  const code = codeParam;

  const [status, setStatus] = useState('loading');
  const serviceDisplayName = service ? service.replace(/_/g, ' ').toUpperCase() : 'GOOGLE SERVICE';
  const [message, setMessage] = useState(`Verifying OAuth credentials for ${serviceDisplayName}...`);
  const exchangeAttemptedRef = useRef(false);

  useEffect(() => {
    // 1. Google returned an error query (e.g. access_denied)
    if (errorParam) {
      setStatus('error');
      setMessage(errorDesc || errorParam || 'Google authorization was cancelled or denied.');
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

    // Guard against React Strict Mode double-invocation (single-use OAuth code)
    if (exchangeAttemptedRef.current) return;
    exchangeAttemptedRef.current = true;

    const completeAuth = async () => {
      try {
        setMessage(`Authenticating ${serviceDisplayName} with Google Cloud...`);
        
        const redirectUri = `${window.location.origin}/integrations/callback`;
        const endpoint = `${API_BASE_URL}/integrations/google/callback?project_id=${encodeURIComponent(projectId)}&service=${encodeURIComponent(service)}&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`;

        const res = await axios.post(endpoint);
        setStatus('success');
        setMessage(res.data?.message || `Successfully connected to ${serviceDisplayName}!`);
        
        setTimeout(() => {
          router.push('/?tab=integrations');
        }, 1800);
      } catch (err) {
        console.error("OAuth token exchange error:", err);
        const detail = err.response?.data?.detail || err.message || 'Token exchange failed.';
        setStatus('error');
        setMessage(`Authentication failed: ${detail}`);
      }
    };

    completeAuth();
  }, [projectId, service, code, errorParam, errorDesc, router, serviceDisplayName]);

  return (
    <div className="glass-card p-10 flex flex-col items-center max-w-md w-full text-center border border-slate-200 bg-white shadow-xl rounded-2xl text-slate-900">
      {status === 'loading' && (
        <Loader2 size={56} className="text-indigo-600 animate-spin mb-5" />
      )}
      
      {status === 'success' && (
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-5 shadow-sm">
          <CheckCircle2 size={36} />
        </div>
      )}
      
      {status === 'error' && (
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-5 shadow-sm">
          <XCircle size={36} />
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 mb-1">
        <ShieldCheck size={13} /> OAuth Verification
      </div>
      <h2 className="text-xl font-extrabold text-slate-900 mb-2 tracking-tight">OAuth Connection Status</h2>
      <p className="text-xs text-slate-500 leading-relaxed font-mono">{message}</p>
      
      {status === 'error' && (
        <button 
          onClick={() => router.push('/?tab=integrations')}
          className="mt-6 btn-primary py-2 px-5 text-xs font-bold shadow-xs"
        >
          Return to Dashboard
        </button>
      )}
    </div>
  );
}

export default function IntegrationsCallback() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative">
      <div className="ambient-bg"></div>
      <Suspense fallback={
        <div className="glass-card p-10 flex flex-col items-center max-w-md w-full text-center border border-slate-200 bg-white shadow-md">
          <Loader2 size={48} className="text-indigo-600 animate-spin mb-4" />
          <p className="text-xs font-mono text-slate-500">Loading OAuth callback telemetry...</p>
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
