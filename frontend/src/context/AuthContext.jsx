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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Setup Axios interceptor to attach Bearer token to all outgoing requests
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(async (config) => {
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

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, []);

  // Sync Supabase auth state & Guest demo mode
  useEffect(() => {
    const initAuth = async () => {
      try {
        const isDemo = typeof window !== 'undefined' && localStorage.getItem('audit_demo_session') === 'true';
        if (isDemo) {
          const demoUser = {
            id: 'demo-guest-user',
            email: 'demo@bloomxsolutions.com',
            user_metadata: { name: 'Demo Guest' },
            aud: 'authenticated',
            role: 'authenticated'
          };
          setUser(demoUser);
          setSession({ user: demoUser, access_token: 'demo-token' });
          setLoading(false);
          return;
        }

        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Error fetching Supabase session:', error.message);
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
      const isDemo = typeof window !== 'undefined' && localStorage.getItem('audit_demo_session') === 'true';
      if (isDemo && !currentSession) {
        // Keep guest demo mode active if user explicitly chose it
        return;
      }
      setSession(currentSession);
      setUser(currentSession?.user || null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
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
        options: {
          redirectTo: redirectUri,
          queryParams: {
            prompt: 'consent select_account',
            access_type: 'offline',
          },
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

  const signInAsGuest = useCallback(() => {
    const demoUser = {
      id: 'demo-guest-user',
      email: 'demo@bloomxsolutions.com',
      user_metadata: { name: 'Demo Guest' },
      aud: 'authenticated',
      role: 'authenticated'
    };
    setUser(demoUser);
    setSession({ user: demoUser, access_token: 'demo-token' });
    try {
      localStorage.setItem('audit_demo_session', 'true');
    } catch {}
    toast.success('Welcome to AuditPro Demo!', {
      description: 'Logged in as guest demo user.',
    });
    return { success: true };
  }, []);

  const signOut = useCallback(async () => {
    try {
      try {
        localStorage.removeItem('audit_demo_session');
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
