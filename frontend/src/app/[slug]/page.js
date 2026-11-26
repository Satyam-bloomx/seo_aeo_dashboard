'use client';

import React from 'react';
import { useParams, notFound } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AuditDashboard from '@/features/AuditDashboard/AuditDashboard';
import AuthScreen from '@/features/Auth/AuthScreen';
import Loading from '@/app/loading';

const VALID_SLUGS = {
  dashboard: 'overview',
  overview: 'overview',
  issues: 'issues',
  explorer: 'explorer',
  'url-grid': 'explorer',
  grid: 'explorer',
  performance: 'performance',
  'speed-vitals': 'performance',
  vitals: 'performance',
  keywords: 'keywords',
  integrations: 'integrations',
  settings: 'overview',
};

export default function DynamicSlugPage() {
  const params = useParams();
  const rawSlug = params?.slug ? String(params.slug).toLowerCase() : '';

  if (!rawSlug || !VALID_SLUGS[rawSlug]) {
    notFound();
  }

  const activeTabId = VALID_SLUGS[rawSlug];
  const isSettings = rawSlug === 'settings';
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading progressOverride={10} label="Verifying your session" />;
  }

  if (!user) {
    return (
      <main className="min-h-screen min-h-[100dvh] w-full overflow-y-auto bg-[#07090E]">
        <AuthScreen />
      </main>
    );
  }

  return (
    <main className="h-screen h-[100dvh] w-full overflow-hidden">
      <AuditDashboard initialTab={activeTabId} initialOpenSettings={isSettings} />
    </main>
  );
}
