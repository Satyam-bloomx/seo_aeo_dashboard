'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn,
  LogOut,
  Shield,
  ChevronsUpDown,
  Key,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';

export default function UserMenu() {
  const { user, signOut, loading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('signin');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="h-12 w-full rounded-2xl bg-slate-100 dark:bg-[#121620] animate-pulse" />
    );
  }

  if (!user) {
    return (
      <>
        <div className="w-full pt-1">
          <button
            type="button"
            onClick={() => {
              setAuthModalMode('signin');
              setIsAuthModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white/70 dark:bg-[#121620] hover:bg-slate-50 dark:hover:bg-[#181D2A] text-slate-700 dark:text-[#D6E5FC] text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <LogIn size={13} className="text-[#4B88FF]" />
            <span>Sign In</span>
          </button>
        </div>

        <AuthModal
          isOpen={isAuthModalOpen}
          initialMode={authModalMode}
          onClose={() => setIsAuthModalOpen(false)}
        />
      </>
    );
  }

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'User';
  const email = user.email || '';
  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const initial = (displayName || 'U')[0].toUpperCase();

  return (
    <div className="relative w-full pt-1" ref={menuRef}>
      {/* Upward Dropdown / Popover Menu */}
      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-full mb-2 left-0 right-0 w-full rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0D0F15] backdrop-blur-2xl shadow-2xl p-3 z-50 overflow-hidden font-sans"
          >
            {/* Header info */}
            <div className="flex items-center gap-2.5 pb-2.5 mb-2 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="relative shrink-0">
                {avatarUrl && !imgError ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    onError={() => setImgError(true)}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-[#CAE366]/40 shadow-sm"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#183578] to-[#4B88FF] text-[#CAE366] flex items-center justify-center text-xs font-bold shadow-inner ring-2 ring-[#CAE366]/40">
                    {initial}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#CAE366] ring-2 ring-white dark:ring-[#0D0F15]" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                  {displayName}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-[#D6E5FC]/60 truncate">
                  {email}
                </p>
              </div>
            </div>

            {/* Status / Workspace info */}
            <div className="space-y-1 py-1">
              <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-[#121620] text-[11px] text-slate-600 dark:text-[#D6E5FC]/80">
                <span className="flex items-center gap-1.5">
                  <Shield size={12} className="text-[#CAE366]" />
                  <span>Workspace</span>
                </span>
                <span className="text-[10px] font-semibold text-[#CAE366] bg-[#CAE366]/10 px-1.5 py-0.5 rounded-md border border-[#CAE366]/20">
                  BloomX Pro
                </span>
              </div>

              <div className="flex items-center justify-between px-2 py-1.5 rounded-xl text-[11px] text-slate-500 dark:text-[#D6E5FC]/70">
                <span className="flex items-center gap-1.5">
                  <Key size={12} className="text-[#4B88FF]" />
                  <span>Auth Provider</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-[#D6E5FC]/50">
                  {user.app_metadata?.provider || 'Google'}
                </span>
              </div>
            </div>

            {/* Sign Out Action */}
            <div className="pt-2 mt-1 border-t border-slate-100 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={async () => {
                  setIsDropdownOpen(false);
                  await signOut();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer"
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Trigger Card in Sidebar */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`group relative flex w-full cursor-pointer items-center justify-between rounded-2xl border p-2 text-left transition-all duration-200 font-sans ${
          isDropdownOpen
            ? 'border-[#CAE366]/40 bg-slate-100/90 dark:bg-[#121620] shadow-sm'
            : 'border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0D0F15] hover:border-slate-300 dark:hover:border-white/15 hover:bg-slate-100/60 dark:hover:bg-[#121620]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            {avatarUrl && !imgError ? (
              <img
                src={avatarUrl}
                alt={displayName}
                onError={() => setImgError(true)}
                className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 dark:ring-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#183578] to-[#4B88FF] text-[#CAE366] flex items-center justify-center text-xs font-bold shadow-inner">
                {initial}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#CAE366] ring-1.5 ring-white dark:ring-[#0D0F15]" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-800 dark:text-[#D6E5FC] group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
              {displayName}
            </p>
            <p className="truncate text-[10px] text-slate-500 dark:text-[#D6E5FC]/50">
              {email}
            </p>
          </div>
        </div>

        <div className="shrink-0 pl-1 text-slate-400 dark:text-[#D6E5FC]/40 group-hover:text-slate-600 dark:group-hover:text-[#D6E5FC] transition-colors">
          <ChevronsUpDown size={14} />
        </div>
      </button>
    </div>
  );
}
