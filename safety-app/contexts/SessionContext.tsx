/**
 * SESSION CONTEXT
 *
 * Single source of truth for auth state across the app. Wraps the root layout.
 * Provides: current session, login/logout actions, loading flag.
 *
 * On mount: reads SecureStore once. On login/logout: updates state + SecureStore.
 * Components read `useSession()` — they never call authService directly.
 *
 * Also calls notificationService.registerForPushNotifications() after a
 * successful login so the backend can target this device.
 *
 * Multi-Agent Note: Import useSession() to access the current user.
 * Never call authService.login/logout from UI components — call
 * sessionContext.login/logout instead.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as authService from '@/services/authService';
import * as bleService from '@/services/bleService';
import { registerForPushNotifications } from '@/services/notificationService';
import type { AuthSession } from '@/services/authService';

interface SessionContextValue {
  session:  AuthSession | null;
  loading:  boolean;
  login:    (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string, age?: number) => Promise<void>;
  updateProfile: (patch: { name?: string; phone?: string; age?: number }) => Promise<void>;
  logout:   () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void bleService.autoReconnectToStoredDongle();
  }, []);

  // Restore session from SecureStore on cold start
  useEffect(() => {
    authService.getSession().then((stored) => {
      if (!stored) { setLoading(false); return; }

      if (authService.isSessionValid(stored)) {
        setSession(stored);
        setLoading(false);
        return;
      }

      // Access token expired — try silent refresh
      authService.refreshSession(stored)
        .then((refreshed) => setSession(refreshed))
        .catch(() => setSession(null)) // refresh failed → force re-login
        .finally(() => setLoading(false));
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await authService.login(email, password);
    setSession(s);
    registerForPushNotifications().then((token) => {
      if (token) void authService.registerPushToken(token, Platform.OS as 'ios' | 'android');
    });
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, phone?: string, age?: number) => {
    const s = await authService.register(name, email, password, phone, age);
    setSession(s);
    registerForPushNotifications().then((token) => {
      if (token) void authService.registerPushToken(token, Platform.OS as 'ios' | 'android');
    });
  }, []);

  const updateProfile = useCallback(async (patch: { name?: string; phone?: string; age?: number }) => {
    const s = await authService.updateProfile(patch);
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setSession(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading, login, register, updateProfile, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
