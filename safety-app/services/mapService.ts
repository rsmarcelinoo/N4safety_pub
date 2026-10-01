/**
 * MAP SERVICE
 *
 * Fetches danger zones from the backend when live, falls back to hardcoded
 * Leiria mock data when offline or no backend is configured.
 */

import { apiFetch } from './apiClient';
import type { AreaSummary, DangerZoneCollection, HeatmapCollection, IncidentType } from '@/types/map';

const BACKEND_LIVE = !!(process.env.EXPO_PUBLIC_API_URL ?? '');

const MOCK_ZONES: DangerZoneCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-8.810, 39.746], [-8.805, 39.746], [-8.805, 39.742], [-8.810, 39.742], [-8.810, 39.746]]] },
      properties: { id: 'a1000000-0000-0000-0000-000000000001', label: 'Leiria City Centre',   riskLevel: 'high' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-8.820, 39.750], [-8.812, 39.750], [-8.812, 39.745], [-8.820, 39.745], [-8.820, 39.750]]] },
      properties: { id: 'a1000000-0000-0000-0000-000000000002', label: 'Zona Oeste',            riskLevel: 'medium' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-8.808, 39.738], [-8.799, 39.738], [-8.799, 39.734], [-8.808, 39.734], [-8.808, 39.738]]] },
      properties: { id: 'a1000000-0000-0000-0000-000000000003', label: 'Parque da Cidade',      riskLevel: 'low' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-8.815, 39.756], [-8.806, 39.756], [-8.806, 39.751], [-8.815, 39.751], [-8.815, 39.756]]] },
      properties: { id: 'a1000000-0000-0000-0000-000000000004', label: 'Zona Industrial Norte', riskLevel: 'high' },
    },
  ],
};

export async function fetchDangerZones(bbox?: string): Promise<DangerZoneCollection> {
  if (BACKEND_LIVE) {
    try {
      const query = bbox ? `?bbox=${bbox}` : '';
      return await apiFetch<DangerZoneCollection>(`/api/v1/map/danger-zones${query}`, { auth: false });
    } catch {
      // fall through to mock
    }
  }
  return MOCK_ZONES;
}

const EMPTY_HEATMAP: HeatmapCollection = { type: 'FeatureCollection', features: [] };

export async function fetchHeatmap(bbox?: string): Promise<HeatmapCollection> {
  if (!BACKEND_LIVE) return EMPTY_HEATMAP;
  try {
    const query = bbox ? `?bbox=${bbox}` : '';
    return await apiFetch<HeatmapCollection>(`/api/v1/map/heatmap${query}`, { auth: false });
  } catch {
    return EMPTY_HEATMAP;
  }
}

export async function submitReport(type: IncidentType, lat: number, lng: number): Promise<void> {
  if (!BACKEND_LIVE) return;
  try {
    await apiFetch('/api/v1/map/reports', {
      method: 'POST',
      body: JSON.stringify({ type, lat, lng }),
    });
  } catch (e) {
    console.warn('[Map] Report submission failed:', e);
  }
}

export async function fetchAreaSummary(lat: number, lng: number, radius = 500): Promise<AreaSummary | null> {
  if (!BACKEND_LIVE) return null;
  try {
    return await apiFetch<AreaSummary>(
      `/api/v1/map/area-summary?lat=${lat}&lng=${lng}&radius=${radius}`,
      { auth: false },
    );
  } catch {
    return null;
  }
}

export async function submitSafeCheckin(lat: number, lng: number): Promise<void> {
  if (!BACKEND_LIVE) return;
  try {
    await apiFetch('/api/v1/map/safe-checkin', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    });
  } catch (e) {
    console.warn('[Map] Safe check-in failed:', e);
  }
}
