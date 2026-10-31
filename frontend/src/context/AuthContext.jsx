'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import { toast } from 'sonner';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days (72 hours / 259,200,000 ms)
const SESSION_TIMESTAMP_KEY = 'audit_session_started_at';

const recordSessionStart = () => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
    }
  } catch {}
};

const checkIsSessionExpired = () => {
  try {
    if (typeof window === 'undefined') return false;
    const started = localStorage.getItem(SESSION_TIMESTAMP_KEY);
    if (!started) return false;
    const elapsed = Date.now() - parseInt(started, 10);
    return elapsed > THREE_DAYS_MS;
  } catch {
    return false;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Setup Axios interceptors: attach Bearer token and handle 3-day 401 re-login prompts
  useEffect(() => {
    const reqInterceptor = axios.interceptors.request.use(async (config) => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.warn('Could not attach auth token:', err);
      }
      return config;
    });

    const resInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          const detail = (error.response?.data?.detail || '').toLowerCase();
          if (detail.includes('3 days') || detail.includes('session expired')) {
            try {
              localStorage.removeItem(SESSION_TIMESTAMP_KEY);
              localStorage.removeItem('audit_demo_session');
              await supabase.auth.signOut();
            } catch {}
            setUser(null);
            setSession(null);
            toast.warning('Session Expired (3-Day Limit)', {
              description: 'For security purposes, please sign in again.',
              duration: 8000,
            });
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(reqInterceptor);
      axios.interceptors.response.eject(resInterceptor);
    };
  }, []);

  // Sync Supabase auth state, 3-day security expiry & Guest demo mode
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Enforce 3-day maximum session duration check
        if (checkIsSessionExpired()) {
          console.info('[Security] Session exceeded 3-day limit. Enforcing re-login.');
          try {
            localStorage.removeItem(SESSION_TIMESTAMP_KEY);
            localStorage.removeItem('audit_demo_session');
            await supabase.auth.signOut();
          } catch {}
          setUser(null);
          setSession(null);
          setLoading(false);
          toast.warning('Session Expired (3-Day Security Policy)', {
            description: 'For your security, please sign in again after 3 days.',
            duration: 9000,
          });
          return;
        }

        // Legacy fake guest flag from older builds: guests now use real anonymous Supabase sessions.
        try { localStorage.removeItem('audit_demo_session'); } catch {}

        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Error fetching Supabase session:', error.message);
        }

        if (initialSession) {
          if (!localStorage.getItem(SESSION_TIMESTAMP_KEY)) {
            recordSessionStart();
          }
        }

        setSession(initialSession);
        setUser(initialSession?.user || null);
      } catch (e) {
        console.error('Failed to initialize auth session:', e);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (currentSession && !localStorage.getItem(SESSION_TIMESTAMP_KEY)) {
        recordSessionStart();
      }
      setSession(currentSession);
      setUser(currentSession?.user || null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Periodic heartbeat to verify 3-day session expiration while tab is open
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (checkIsSessionExpired()) {
        try {
          localStorage.removeItem(SESSION_TIMESTAMP_KEY);
          localStorage.removeItem('audit_demo_session');
          supabase.auth.signOut();
        } catch {}
        setUser(null);
        setSession(null);
        toast.warning('Session Expired (3-Day Limit)', {
          description: 'For security purposes, please sign in again.',
          duration: 9000,
        });
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [user]);

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      recordSessionStart();
      toast.success('Signed in successfully!', {
        description: `Welcome back, ${data.user?.email || 'User'}`,
      });
      return { success: true, data };
    } catch (err) {
      toast.error('Sign In Failed', {
        description: err.message || 'Invalid email or password.',
      });
      return { success: false, error: err };
    }
  }, []);

  const signUp = useCallback(async (email, password, fullName = '') => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName ? fullName.trim() : '',
            name: fullName ? fullName.trim() : '',
          },
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        }
      });
      if (error) throw error;
      
      const displayName = fullName ? fullName.trim() : (data.user?.email || 'User');
      if (data.session) {
        toast.success('Account created & signed in!', {
          description: `Welcome, ${displayName}!`,
        });
      } else {
        toast.success('Registration successful!', {
          description: 'Please check your email to confirm your account.',
          duration: 8000,
        });
      }
      return { success: true, data };
    } catch (err) {
      toast.error('Registration Failed', {
        description: err.message || 'Could not create account.',
      });
      return { success: false, error: err };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const redirectUri = typeof window !== 'undefined' ? window.location.origin : '';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        // No forced prompt: Google only asks again when it needs to (first sign-in, several accounts
        // signed in, or access revoked). Search Console / GA4 use their own OAuth flow in Integrations,
        // so sign-in needs no offline Google refresh token.
        options: {
          redirectTo: redirectUri,
        },
      });
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      toast.error('Google Sign In Failed', {
        description: err.message || 'Could not authenticate with Google.',
      });
      return { success: false, error: err };
    }
  }, []);

  // Guests get a real, signed anonymous Supabase session and their own isolated workspace.
  // Requires "Anonymous sign-ins" to be enabled in Supabase (Authentication -> Providers).
  const signInAsGuest = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      recordSessionStart();
      toast.success('Welcome to AuditPro!', {
        description: 'You are using a private guest workspace. Create an account to keep access.',
      });
      return { success: true, data };
    } catch (err) {
      toast.error('Guest Access Unavailable', {
        description: err.message || 'Guest sign-in is not enabled. Please create an account.',
      });
      return { success: false, error: err };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('audit_') || k === SESSION_TIMESTAMP_KEY)
          .forEach((k) => localStorage.removeItem(k));
        sessionStorage.clear();
      } catch {}
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      toast.info('Signed out', {
        description: 'You have been signed out of your account.',
      });
      return { success: true };
    } catch (err) {
      toast.error('Sign Out Failed', {
        description: err.message || 'Could not sign out.',
      });
      return { success: false, error: err };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signInAsGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
