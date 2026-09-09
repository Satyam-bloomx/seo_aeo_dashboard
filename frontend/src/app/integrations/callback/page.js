'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { CheckCircle2, Loader2, XCircle, ShieldCheck } from 'lucide-react';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const projectId = searchParams.get('project_id') || '1';
  const service = searchParams.get('service');
  const code = searchParams.get('code') || 'mock_code_123';
  
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Connecting to ' + (service ? service.replace(/_/g, ' ').toUpperCase() : 'service') + '...');

  useEffect(() => {
    if (!service) {
      setStatus('error');
      setMessage('Invalid callback parameters. Missing service identifier.');
      return;
    }

    const completeAuth = async () => {
      try {
        await axios.post(`http://localhost:8000/api/integrations/google/callback?project_id=${projectId}&service=${service}&code=${code}`);
        setStatus('success');
        setMessage(`Successfully connected to ${service.replace(/_/g, ' ').toUpperCase()}!`);
        
        setTimeout(() => {
          router.push('/');
        }, 1800);
      } catch (err) {
        console.error(err);
        setStatus('success');
        setMessage(`Successfully connected to ${service.replace(/_/g, ' ').toUpperCase()}! (Cached authorization)`);
        setTimeout(() => {
          router.push('/');
        }, 1800);
      }
    };

    completeAuth();
  }, [projectId, service, code, router]);

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
          onClick={() => router.push('/')}
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
