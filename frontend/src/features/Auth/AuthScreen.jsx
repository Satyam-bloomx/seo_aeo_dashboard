'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Zap,
  BarChart3,
  Globe,
  Sparkles,
  Layers,
  LockKeyhole,
  User
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { spring, tapPress } from '@/lib/motion';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { signIn, signUp, signInWithGoogle } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    if (mode === 'signup' && !fullName.trim()) return;
    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen min-h-[100dvh] w-full flex items-center justify-center bg-[#07090E] text-slate-100 overflow-hidden px-4 py-8">
      {/* Dynamic Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-indigo-600/5 blur-[160px] pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Side: Brand & Feature Highlights */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          {/* Logo Badge */}
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
              AuditPro Enterprise v20.4
            </span>
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Autonomous SEO, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                AEO & GEO Suite
              </span>
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-400 max-w-md mx-auto lg:mx-0 leading-relaxed">
              Sign in to unlock your private crawling workspace. Your Google Search Console, GA4 telemetry, and audit reports are isolated securely to your account.
            </p>
          </div>

          {/* Feature Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 max-w-md mx-auto lg:mx-0 text-left">
            <div className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
              <div className="flex items-center gap-2.5 text-blue-400 mb-1">
                <LockKeyhole size={16} />
                <span className="text-xs font-bold text-slate-200">Private Workspaces</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Credentials and telemetry are strictly scoped to your login.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
              <div className="flex items-center gap-2.5 text-indigo-400 mb-1">
                <Globe size={16} />
                <span className="text-xs font-bold text-slate-200">GSC & GA4 Telemetry</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Live organic impressions, clicks, sessions, and bounce rate.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
              <div className="flex items-center gap-2.5 text-emerald-400 mb-1">
                <Zap size={16} />
                <span className="text-xs font-bold text-slate-200">32-Factor Spider</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Core Web Vitals, canonicals, hreflang, status codes & schema.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
              <div className="flex items-center gap-2.5 text-purple-400 mb-1">
                <Sparkles size={16} />
                <span className="text-xs font-bold text-slate-200">AEO & LLM Citations</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Answer Engine Optimization score & AI Overviews readiness.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          <div className="relative rounded-3xl border border-slate-800 bg-slate-900/90 backdrop-blur-2xl p-7 sm:p-8 shadow-2xl shadow-black/80 overflow-hidden">
            {/* Top Glow Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {mode === 'signin' ? 'Sign In' : 'Create an Account'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {mode === 'signin'
                  ? 'Access your private audit projects & live integrations'
                  : 'Start your dedicated, multi-tenant technical SEO workspace'}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex p-1 bg-slate-950/80 rounded-xl mb-5 border border-slate-800/80">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'signin'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'signup'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Google 1-Click Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800/80 text-slate-200 text-xs font-semibold shadow-sm transition-all mb-4 group cursor-pointer disabled:opacity-50"
            >
              {isGoogleLoading ? (
                <Loader2 size={16} className="animate-spin text-blue-500" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="w-full border-t border-slate-800" />
              <span className="absolute bg-slate-900 px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                or with email
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      type="text"
                      required={mode === 'signup'}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <span>{mode === 'signin' ? 'Sign In to Workspace' : 'Create Free Account'}</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-5 pt-3 border-t border-slate-800/80 text-center">
              <p className="text-xs text-slate-400">
                {mode === 'signin' ? "Don't have an account yet?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                  className="text-blue-400 font-bold hover:underline cursor-pointer ml-1"
                >
                  {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
