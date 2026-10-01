/**
 * SOS DISPATCH SERVICE
 *
 * Trigger, cancel, history, and live location streaming.
 * When EXPO_PUBLIC_API_URL is set, all calls hit the real backend.
 * AsyncStorage provides an offline-resilient history cache regardless.
 *
 * Live location streaming uses SignalR via @microsoft/signalr.
 * Install: npx expo install @microsoft/signalr
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './apiClient';
import { getBearerToken } from './authService';
import type { SOSEvent } from '@/types/sos';
import type { Coordinates } from '@/types/location';

const HISTORY_KEY  = 'n4safety:sos-history:v1';
const API_BASE     = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const BACKEND_LIVE = !!API_BASE;

// ─── Active SOS state (for HUD) ─────────────────────────────────────────────────
let _activeSosEvent: SOSEvent | null = null;
const _stateListeners = new Set<(event: SOSEvent | null) => void>();

export function getActiveSosEvent(): SOSEvent | null {
  return _activeSosEvent;
}

export function onSosStateChange(cb: (event: SOSEvent | null) => void): () => void {
  _stateListeners.add(cb);
  return () => _stateListeners.delete(cb);
}

function notifyState(event: SOSEvent | null) {
  _activeSosEvent = event;
  _stateListeners.forEach((cb) => cb(event));
}

// ─── Local cache helpers ───────────────────────────────────────────────────────

async function readCache(): Promise<SOSEvent[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as SOSEvent[]; } catch { return []; }
}

async function writeCache(events: SOSEvent[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(events.slice(0, 50)));
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function sendSOSAlert(event: SOSEvent): Promise<string> {
  try {
    notifyState(event);
    const history = await readCache();
    await writeCache([event, ...history]);

    if (BACKEND_LIVE) {
        try {
            const result = await apiFetch<{ eventId: string; triggeredAt: string }>(
                '/api/v1/sos/trigger',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        circleIds: event.circleIds,
                        lat:       event.coords?.latitude  ?? null,
                        lng:       event.coords?.longitude ?? null,
                    }),
                },
            );
            const updated = (await readCache()).map((e) =>
                e.id === event.id ? { ...e, id: result.eventId } : e,
            );
            await writeCache(updated);
            return result.eventId;
        } catch (e) {
            console.error('[SOS] Backend dispatch failed:', e);
            throw e;
        }
    }
    return event.id;
  } catch (error) {
    console.error('[SOS] Failed to initiate alert:', error);
    throw error;
  }
}

export async function cancelSOSAlert(eventId: string): Promise<void> {
  try {
    notifyState(null);
    const cancelledAt = new Date().toISOString();
    const history = await readCache();
    await writeCache(
        history.map((e) => (e.id === eventId ? { ...e, cancelledAt } : e)),
    );

    if (BACKEND_LIVE) {
        try {
            await apiFetch(`/api/v1/sos/${eventId}/cancel`, { method: 'POST' });
        } catch (e) {
            console.error('[SOS] Cancel sync failed:', e);
            throw e;
        }
    }
  } catch (error) {
    console.error('[SOS] Failed to cancel alert:', error);
    throw error;
  }
}

export async function getSOSHistory(): Promise<SOSEvent[]> {
  if (BACKEND_LIVE) {
    try {
      const remote = await apiFetch<SOSEvent[]>('/api/v1/sos/history');
      await writeCache(remote);
      return remote;
    } catch {
      // Fall through to local cache on network error
    }
  }
  return readCache();
}

/**
 * Called by circle members when they open a live SOS view.
 * Joins the SignalR group for the event and listens for location updates and cancellation.
 * Returns a cleanup function — call it when the screen unmounts.
 */
export function listenForSOSUpdates(
  eventId: string,
  onLocation: (lat: number, lng: number, timestamp: string) => void,
  onCancelled: () => void,
): () => void {
  if (!BACKEND_LIVE) return () => {};

  let connection: any = null;

  const start = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { HubConnectionBuilder, LogLevel } = require('@microsoft/signalr') as any;
      const token = await getBearerToken();

      connection = new HubConnectionBuilder()
        .withUrl(`${API_BASE}/hubs/sos?access_token=${token}`)
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

      connection.on('ReceiveLocation', (_id: string, lat: number, lng: number, ts: string) => {
        onLocation(lat, lng, ts);
      });

      connection.on('SOSCancelled', (_id: string) => {
        onCancelled();
      });

      await connection.start();
      // Join the server-side group so broadcasts reach this client
      await connection.invoke('JoinSOSEvent', eventId);
    } catch (e) {
      console.warn('[SOS] SignalR listen failed:', e);
    }
  };

  void start();

  return () => {
    connection?.stop().catch(() => {});
  };
}

/**
 * Streams live GPS to the backend via SignalR while an SOS is active.
 * Server fans out location updates to circle members.
 * Returns a cleanup function — call it when SOS is cancelled or screen unmounts.
 */
export function startLocationStream(
  eventId: string,
  getCoordsNow: () => Coordinates | null,
): () => void {
  if (!BACKEND_LIVE) {
    // Dev mock — just log
    const interval = setInterval(() => {
      const c = getCoordsNow();
      if (c) console.log('[SOS] Location stream (mock):', eventId, c);
    }, 5000);
    return () => clearInterval(interval);
  }

  // Real SignalR streaming
   
  let connection: any = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const start = async () => {
    try {
      // @microsoft/signalr: npx expo install @microsoft/signalr
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { HubConnectionBuilder, LogLevel } = require('@microsoft/signalr') as any;
      const token = await getBearerToken();

      connection = new HubConnectionBuilder()
        .withUrl(`${API_BASE}/hubs/sos?access_token=${token}`)
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

      await connection.start();

      // Send GPS ping every 5 seconds
      interval = setInterval(async () => {
        const coords = getCoordsNow();
        if (coords && connection?.state === 'Connected') {
          await connection.invoke('StreamLocation', eventId, coords.latitude, coords.longitude);
        }
      }, 5000);
    } catch (e) {
      console.warn('[SOS] SignalR stream failed:', e);
    }
  };

  void start();

  return () => {
    if (interval) clearInterval(interval);
    connection?.stop().catch(() => {});
  };
}
