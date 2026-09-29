'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn,
  LogOut,
  User,
  Shield,
  ChevronDown,
  CheckCircle2,
  Sparkles,
  Key
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';

export default function UserMenu() {
  const { user, signOut, loading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('signin');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
      <div className="h-8 w-20 rounded-xl bg-slate-200/50 dark:bg-slate-800/50 animate-pulse" />
    );
  }

  if (!user) {
    return (
      <>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAuthModalMode('signin');
              setIsAuthModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/70 dark:bg-slate-900/70 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-sm transition-all"
          >
            <LogIn size={13} className="text-blue-500" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthModalMode('signup');
              setIsAuthModalOpen(true);
            }}
            className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm shadow-blue-500/20 transition-all"
          >
            <span>Sign Up</span>
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

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const initial = (user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-all text-xs font-medium shadow-sm cursor-pointer"
      >
        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shadow-inner">
          {initial}
        </div>
        <span className="hidden md:inline max-w-[120px] truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">
          {displayName}
        </span>
        <ChevronDown size={13} className="text-slate-400" />
      </button>

      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-2 z-50 overflow-hidden"
          >
            {/* Header info */}
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed In As</p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                {displayName}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
                  <Shield size={10} />
                  Private Workspace
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <div className="space-y-0.5">
              <div className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Key size={13} className="text-blue-500" />
                <span>Isolated API Integrations</span>
              </div>
            </div>

            {/* Sign Out Action */}
            <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={async () => {
                  setIsDropdownOpen(false);
                  await signOut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
