/**
 * AUTH SERVICE
 *
 * Full authentication lifecycle: login, register, social auth, refresh, logout.
 * Tokens stored exclusively in expo-secure-store — NEVER in AsyncStorage.
 *
 * When EXPO_PUBLIC_API_URL is set and the backend is live, all calls hit the
 * real API. Social auth tokens are verified server-side (no mock bypass needed
 * in production).
 *
 * For development without a backend, set EXPO_PUBLIC_API_URL to empty or unset
 * and the mock fallback activates automatically.
 */

import * as SecureStore from 'expo-secure-store';
import { apiFetch } from './apiClient';

const SESSION_KEY      = 'n4safety_session_v1';
const ACCESS_TOKEN_TTL = 15 * 60 * 1000;
const API_BASE         = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');
const BACKEND_LIVE     = !!process.env.EXPO_PUBLIC_API_URL;

export interface AuthSession {
  accessToken:  string;
  refreshToken: string;
  userId:       string;
  email:        string;
  name:         string;
  phone?:       string;
  expiresAt:    number;   // Unix ms
}

// ─── SecureStore helpers ──────────────────────────────────────────────────────

async function saveSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

// ─── API response → AuthSession ───────────────────────────────────────────────

interface ApiAuthResponse {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;
  user: { id: string; email: string; name: string; phone?: string };
}

function mapResponse(r: ApiAuthResponse): AuthSession {
  return {
    accessToken:  r.accessToken,
    refreshToken: r.refreshToken,
    expiresAt:    r.expiresAt,
    userId:       r.user.id,
    email:        r.user.email,
    name:         r.user.name,
    phone:        r.user.phone,
  };
}

async function postAuth(path: string, body: unknown): Promise<AuthSession> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
    throw new Error('Unable to reach the server. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  type RawResponse = ApiAuthResponse & {
    error?: string;
    errors?: Record<string, string[]>;
    title?: string;
  };

  let data: RawResponse;
  try {
    data = await res.json() as RawResponse;
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${res.status}). Try again.`);
  }

  if (!res.ok) {
    // Handle both { error: "..." } and ASP.NET ValidationProblemDetails { errors: { "Field": [...] } }
    const message =
      data.error ??
      (data.errors ? Object.values(data.errors).flat().join('. ') : null) ??
      data.title ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }

  const session = mapResponse(data);
  await saveSession(session);
  return session;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSession(): Promise<AuthSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
}

export function isSessionValid(s: AuthSession): boolean {
  return Date.now() < s.expiresAt - 30_000;  // 30s buffer
}

export async function login(email: string, password: string): Promise<AuthSession> {
  if (BACKEND_LIVE) {
    return postAuth('/api/v1/auth/login', { email, password });
  }

  // ── Dev mock (no backend) ─────────────────────────────────────────────────
  if (!email.includes('@')) throw new Error('Enter a valid email address.');
  if (password.length < 6)  throw new Error('Password must be at least 6 characters.');
  const session: AuthSession = {
    accessToken:  `mock.access.${Date.now()}`,
    refreshToken: `mock.refresh.${Date.now()}`,
    userId: email.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    email:  email.toLowerCase(),
    name:   email.split('@')[0],
    expiresAt: Date.now() + ACCESS_TOKEN_TTL,
  };
  await saveSession(session);
  return session;
}

export async function register(name: string, email: string, password: string, phone?: string, age?: number): Promise<AuthSession> {
  if (BACKEND_LIVE) {
    return await postAuth('/api/v1/auth/register', { name, email, password, phone, age });
  }

  // ── Dev mock ──────────────────────────────────────────────────────────────
  if (!name.trim())        throw new Error('Name is required.');
  if (!email.includes('@')) throw new Error('Enter a valid email address.');
  if (password.length < 6)  throw new Error('Password must be at least 6 characters.');
  const session: AuthSession = {
    accessToken:  `mock.access.${Date.now()}`,
    refreshToken: `mock.refresh.${Date.now()}`,
    userId: email.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    email:  email.toLowerCase(),
    name:   name.trim(),
    phone:  phone?.trim() || undefined,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL,
  };
  await saveSession(session);
  return session;
}

export async function refreshSession(session: AuthSession): Promise<AuthSession> {
  if (BACKEND_LIVE) {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken: session.refreshToken }),
    });
    // Backend now returns full AuthResponse (new access + new refresh token)
    const data = await res.json() as ApiAuthResponse & { error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Session expired.');
    const refreshed = mapResponse(data);
    await saveSession(refreshed);
    return refreshed;
  }

  // Dev mock
  const refreshed: AuthSession = {
    ...session,
    accessToken:  `mock.access.${Date.now()}`,
    refreshToken: `mock.refresh.${Date.now()}`,
    expiresAt:    Date.now() + ACCESS_TOKEN_TTL,
  };
  await saveSession(refreshed);
  return refreshed;
}

export async function updateProfile(patch: { name?: string; phone?: string; age?: number }): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated.');

  if (BACKEND_LIVE) {
    const res = await apiFetch('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    // Backend returns UserDto
    const updatedUser = res as { id: string; email: string; name: string; phone?: string };
    const next: AuthSession = {
      ...session,
      name: updatedUser.name,
      phone: updatedUser.phone,
    };
    await saveSession(next);
    return next;
  }

  // Dev mock
  const next: AuthSession = {
    ...session,
    name: patch.name ?? session.name,
    phone: patch.phone ?? session.phone,
  };
  await saveSession(next);
  return next;
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (BACKEND_LIVE && session) {
    // Fire and forget — don't block logout on network
    fetch(`${API_BASE}/api/v1/auth/logout`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body:    JSON.stringify({ refreshToken: session.refreshToken }),
    }).catch(() => {});
  }
  await clearSession();
}

/** Returns a valid access token, silently refreshing if expired. Throws if no session. */
export async function getBearerToken(): Promise<string> {
  let session = await getSession();
  if (!session) throw new Error('Not authenticated.');
  if (!isSessionValid(session)) {
    session = await refreshSession(session);
  }
  return session.accessToken;
}

/**
 * Register device push token with backend for SOS notifications.
 * Called after successful login/register via SessionContext.
 */
export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  try {
    await apiFetch('/api/v1/users/me/push-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  } catch (e) {
    console.warn('[Auth] Push token registration failed (non-fatal):', e);
    // Non-critical — app continues without push notifications
  }
}
