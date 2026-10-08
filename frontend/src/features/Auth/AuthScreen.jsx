'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  User,
  ShieldCheck,
  Check,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { signIn, signUp, signInWithGoogle, signInAsGuest } = useAuth();

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
    <div className="relative min-h-screen min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#050505] text-[#D6E5FC] px-4 py-12 selection:bg-[#CAE366]/20 selection:text-[#CAE366]">
      {/* BloomX Ambient Background Mesh */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(rgba(214, 229, 252, 0.6) 1px, transparent 1px)`,
          backgroundSize: '28px 28px'
        }}
      />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-80 bg-gradient-to-b from-[#223A6A]/20 via-[#4B88FF]/5 to-transparent pointer-events-none blur-2xl" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-[#CAE366]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[410px]">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4 flex items-center justify-center">
            {/* BloomX Official Logo */}
            <div className="relative h-12 w-44 flex items-center justify-center">
              <Image 
                src="/bloomx-logo.webp" 
                alt="BloomX Logo" 
                width={176} 
                height={48} 
                className="object-contain drop-shadow-[0_0_20px_rgba(75,136,255,0.25)]"
                priority
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            {mode === 'signin' ? 'Sign in to AuditPro' : 'Create your workspace'}
          </h1>
          <p className="mt-1.5 text-xs text-[#D6E5FC]/75 font-normal max-w-xs mx-auto">
            {mode === 'signin'
              ? 'Enter your credentials to access your private SEO & crawl engine'
              : 'Deploy autonomous technical SEO, AEO & GEO spider telemetry'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0D0F15]/90 backdrop-blur-xl p-4 xs:p-5 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {/* Segmented Mode Selector */}
          <div className="grid grid-cols-2 p-1 bg-[#07080B] rounded-xl mb-5 border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-[#151922] text-[#CAE366] shadow-xs border border-white/[0.08]'
                  : 'text-[#D6E5FC]/60 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-[#151922] text-[#CAE366] shadow-xs border border-white/[0.08]'
                  : 'text-[#D6E5FC]/60 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-white/[0.08] bg-[#07080B]/80 hover:bg-[#151922] text-white hover:text-[#D6E5FC] text-xs font-medium transition-all shadow-xs group cursor-pointer disabled:opacity-50"
          >
            {isGoogleLoading ? (
              <Loader2 size={15} className="animate-spin text-[#CAE366]" />
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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

          {/* Hairline Divider */}
          <div className="relative flex items-center justify-center my-5">
            <div className="w-full border-t border-white/[0.08]" />
            <span className="absolute bg-[#0D0F15] px-2.5 text-[11px] text-[#D6E5FC]/50 font-normal">
              or continue with email
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <label className="block text-[11px] font-medium text-[#D6E5FC] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required={mode === 'signup'}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    autoComplete="name"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.1] bg-[#07080B] text-white placeholder:text-[#D6E5FC]/30 text-xs focus:outline-none focus:border-[#CAE366] focus:ring-1 focus:ring-[#CAE366]/30 transition-all"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-[11px] font-medium text-[#D6E5FC] mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.1] bg-[#07080B] text-white placeholder:text-[#D6E5FC]/30 text-xs focus:outline-none focus:border-[#CAE366] focus:ring-1 focus:ring-[#CAE366]/30 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-medium text-[#D6E5FC]">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-white/[0.1] bg-[#07080B] text-white placeholder:text-[#D6E5FC]/30 text-xs focus:outline-none focus:border-[#CAE366] focus:ring-1 focus:ring-[#CAE366]/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D6E5FC]/50 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* BloomX Signature Gradient Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-full btn-primary text-white font-bold text-xs tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin text-[#CAE366]" />
              ) : (
                <>
                  <span>{mode === 'signin' ? 'Sign In to Workspace' : 'Create Free Account'}</span>
                  <ArrowRight size={14} className="text-[#CAE366]" />
                </>
              )}
            </button>
          </form>

          {/* Instant Guest / Demo Mode Button */}
          <div className="mt-3">
            <button
              type="button"
              onClick={signInAsGuest}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-[#D6E5FC]/80 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <Sparkles size={13} className="text-[#CAE366]" />
              <span>Explore Demo Workspace (Guest Mode)</span>
            </button>
          </div>

          {/* Footer toggle prompt */}
          <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
            <p className="text-xs text-[#D6E5FC]/60">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-[#CAE366] font-semibold hover:underline underline-offset-4 cursor-pointer ml-1"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Security & Workspace Trust Micro-Footer */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#CAE366]/5 border border-[#CAE366]/20 text-[10px] sm:text-[11px] font-medium text-[#CAE366] max-w-full text-center">
            <ShieldCheck size={13} className="text-[#CAE366] shrink-0" />
            <span className="hidden xs:inline">Multi-tenant workspace isolation • Supabase Auth</span>
            <span className="xs:hidden">Workspace isolation • Supabase Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
}


