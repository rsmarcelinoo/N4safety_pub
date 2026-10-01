/**
 * SAVED LOCATIONS SERVICE
 *
 * Persistence layer for the Locations tab's saved-places list.
 * 'Current Location' (id='current') is always virtual — never stored here.
 * Cloud sync: When BACKEND_LIVE, sync to API; fall back to AsyncStorage on network error.
 *
 * Storage key uses underscores (SecureStore/AsyncStorage key rules: no colons).
 *
 * Multi-Agent Note: All Locations-tab persistence goes through this file.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedLocation } from '@/types/savedLocation';
import { apiFetch } from './apiClient';

const KEY = 'n4safety_saved_locations_v1';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const BACKEND_LIVE = !!API_BASE;

function parse(raw: string | null): SavedLocation[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as SavedLocation[]; } catch { return []; }
}

/**
 * Converts backend SavedLocationDto to mobile SavedLocation.
 */
function fromBackendDto(dto: {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  addedAt: string;
}): SavedLocation {
  return {
    id: dto.id,
    name: dto.name,
    address: dto.address,
    latitude: dto.lat,
    longitude: dto.lng,
    addedAt: dto.addedAt,
  };
}

/**
 * Converts mobile SavedLocation to backend CreateLocationRequest.
 */
function toBackendCreate(loc: SavedLocation) {
  return {
    name: loc.name,
    address: loc.address,
    lat: loc.latitude,
    lng: loc.longitude,
  };
}

export async function loadSavedLocations(): Promise<SavedLocation[]> {
  if (BACKEND_LIVE) {
    try {
      const remote = await apiFetch<{
        id: string;
        name: string;
        address: string;
        lat: number;
        lng: number;
        addedAt: string;
      }[]>('/api/v1/locations');
      // Sync remote into local cache for offline resilience
      const locations = remote.map(fromBackendDto);
      await AsyncStorage.setItem(KEY, JSON.stringify(locations));
      return locations;
    } catch (e) {
      console.warn('[Locations] Backend load failed, using local cache:', e);
    }
  }

  // Fall back to local storage on network error or when backend is not live
  return parse(await AsyncStorage.getItem(KEY));
}

export async function addSavedLocation(
  loc: Omit<SavedLocation, 'id' | 'addedAt'>,
): Promise<SavedLocation> {
  const next: SavedLocation = {
    ...loc,
    id: `loc_${Date.now()}`,
    addedAt: new Date().toISOString(),
  };

  // Try to sync to backend
  if (BACKEND_LIVE) {
    try {
      const response = await apiFetch<{
        id: string;
        name: string;
        address: string;
        lat: number;
        lng: number;
        addedAt: string;
      }>('/api/v1/locations', {
        method: 'POST',
        body: JSON.stringify(toBackendCreate(next)),
      });
      // Use server-assigned ID and createdAt
      const synced = fromBackendDto(response);
      const list = await loadSavedLocations();
      // Only add if not already present (avoid duplicates)
      const exists = list.some(l => l.id === synced.id);
      if (!exists) {
        await AsyncStorage.setItem(KEY, JSON.stringify([...list, synced]));
      }
      return synced;
    } catch (e) {
      console.warn('[Locations] Backend add failed, saving locally:', e);
    }
  }

  // Fall back to local-only creation
  const list = await loadSavedLocations();
  await AsyncStorage.setItem(KEY, JSON.stringify([...list, next]));
  return next;
}

export async function removeSavedLocation(id: string): Promise<void> {
  // Try to sync deletion to backend
  if (BACKEND_LIVE) {
    try {
      await apiFetch(`/api/v1/locations/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[Locations] Backend delete failed, removing locally:', e);
    }
  }

  // Update local storage
  const list = await loadSavedLocations();
  await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((l) => l.id !== id)));
}
