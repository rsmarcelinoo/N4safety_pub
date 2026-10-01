/**
 * API CLIENT
 *
 * Central HTTP layer for all N4Safety backend calls.
 * - Injects Bearer token automatically
 * - On 401: silently refreshes token and retries once
 * - On failed refresh: clears session (forces re-login)
 * - Throws ApiError({ status, message }) on non-2xx
 * - 10-second timeout on every request
 *
 * Usage:
 *   import { apiFetch } from '@/services/apiClient';
 *   const user = await apiFetch<UserDto>('/api/v1/users/me');
 */

import * as SecureStore from 'expo-secure-store';

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');
const SESSION_KEY = 'n4safety_session_v1';
const API_BASE = BASE;
const BACKEND_LIVE = !!API_BASE;
const ACCESS_TOKEN_TTL = 15 * 60 * 1000;

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  name: string;
  phone?: string;
  expiresAt: number;
}

async function getSession(): Promise<AuthSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
}

function isSessionValid(s: AuthSession): boolean {
  return Date.now() < s.expiresAt - 30_000;
}

async function getBearerToken(): Promise<string> {
  let session = await getSession();
  if (!session) throw new Error('Not authenticated.');
  if (!isSessionValid(session)) {
    session = await refreshSession(session);
  }
  return session.accessToken;
}

async function refreshSession(session: AuthSession): Promise<AuthSession> {
  if (BACKEND_LIVE) {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const data = await res.json() as {
      accessToken: string; refreshToken: string; expiresAt: number;
      user: { id: string; email: string; name: string; phone?: string };
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? 'Session expired.');
    const refreshed: AuthSession = {
      accessToken: data.accessToken, refreshToken: data.refreshToken,
      expiresAt: data.expiresAt, userId: data.user.id,
      email: data.user.email, name: data.user.name, phone: data.user.phone,
    };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(refreshed));
    return refreshed;
  }
  const refreshed: AuthSession = {
    ...session,
    accessToken: `mock.access.${Date.now()}`,
    refreshToken: `mock.refresh.${Date.now()}`,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL,
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(refreshed));
  return refreshed;
}

async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
const TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchOptions = RequestInit & {
  auth?: boolean;   // default true — set false for public endpoints (e.g. danger zones)
};

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { auth = true, ...rest } = opts;

  return attempt<T>(path, rest, auth, true);
}

async function attempt<T>(
  path: string,
  opts: RequestInit,
  auth: boolean,
  allowRetry: boolean,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> ?? {}),
  };

  if (auth) {
    try {
      const token = await getBearerToken();
      // Mock tokens (dev sessions without a real backend) are not valid JWTs.
      // Sending them causes a 403 cascade on every request — bail early instead.
      if (token.startsWith('mock.')) {
        throw new ApiError(0, 'Local session — backend not reached.');
      }
      headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(401, 'Not authenticated.');
    }
  }

  try {
    const response = await fetch(`${BASE}${path}`, {
      ...opts,
      headers,
      signal: controller.signal,
    });

    // Silent refresh on 401
    if (response.status === 401 && auth && allowRetry) {
      const session = await getSession();
      if (session) {
        try {
          await refreshSession(session);
          // Retry once with the new token
          return attempt<T>(path, opts, auth, false);
        } catch {
          await logout();
          throw new ApiError(401, 'SESSION_EXPIRED');
        }
      }
      throw new ApiError(401, 'SESSION_EXPIRED');
    }

    if (response.status === 204) return undefined as T;

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { error?: string };
        message = body.error ?? message;
      } catch { /* ignore json parse error */ }
      throw new ApiError(response.status, message);
    }

    return response.json() as Promise<T>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const err = e as Error;
    if (err.name === 'AbortError') throw new ApiError(408, 'Request timed out.');
    throw new ApiError(0, 'Network error. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
}
