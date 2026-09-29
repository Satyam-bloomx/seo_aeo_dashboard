'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import AuditDashboard from '@/features/AuditDashboard/AuditDashboard';
import AuthScreen from '@/features/Auth/AuthScreen';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();

  // Loading session state
  if (loading) {
    return (
      <div className="h-screen h-[100dvh] w-full flex flex-col items-center justify-center bg-[#07090E] text-slate-400">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={24} />
          </div>
        </div>
        <p className="text-xs font-mono tracking-wider text-slate-500 animate-pulse">
          VERIFYING SESSION...
        </p>
      </div>
    );
  }

  // Not signed in -> Mandatory Login Gate
  if (!user) {
    return (
      <main className="min-h-screen min-h-[100dvh] w-full overflow-y-auto bg-[#07090E]">
        <AuthScreen />
      </main>
    );
  }

  // Authenticated user -> Private Dashboard
  return (
    <main className="h-screen h-[100dvh] w-full overflow-hidden">
      <AuditDashboard />
    </main>
  );
}
