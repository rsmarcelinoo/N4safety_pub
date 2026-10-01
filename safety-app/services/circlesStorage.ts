import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertSettings, Circle, CircleMembership, ContactRef, CreateCircleInput, UpdateCircleInput } from '@/types/circles';
import { DEFAULT_ALERT_SETTINGS } from '@/types/circles';
import { apiFetch } from './apiClient';

/**
 * CIRCLES STORAGE SERVICE
 *
 * Logic:
 * - This is the single persistence boundary for circles in the MVP.
 * - It owns schema validation on read, so corrupted/unknown payloads fail loudly.
 * - All write helpers are read-modify-write to keep UI code simple and deterministic.
 * - Cloud sync: When BACKEND_LIVE, sync to API; fall back to AsyncStorage on network error.
 *
 * Multi-Agent Note:
 * - Keep all circles persistence updates in this file to avoid storage key drift.
 */
const CIRCLES_STORAGE_KEY = 'n4safety:circles:v1';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const BACKEND_LIVE = !!API_BASE;

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeContactRef(raw: unknown): ContactRef {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid contact: expected object.');
  }

  const candidate = raw as Record<string, unknown>;
  if (!isString(candidate.id)) {
    throw new Error('Invalid contact: id must be a non-empty string.');
  }
  if (!isString(candidate.name)) {
    throw new Error('Invalid contact: name must be a non-empty string.');
  }
  if (!isString(candidate.phoneNumber)) {
    throw new Error('Invalid contact: phoneNumber must be a non-empty string.');
  }
  if (candidate.avatarUri !== undefined && typeof candidate.avatarUri !== 'string') {
    throw new Error('Invalid contact: avatarUri must be a string when provided.');
  }

  return {
    id: candidate.id,
    name: candidate.name,
    phoneNumber: candidate.phoneNumber,
    avatarUri: candidate.avatarUri,
  };
}

function normalizeCircle(raw: unknown): Circle {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid circle payload: expected object.');
  }

  const candidate = raw as Record<string, unknown>;
  if (!isString(candidate.id)) {
    throw new Error('Invalid circle payload: id must be a non-empty string.');
  }
  if (!isString(candidate.name)) {
    throw new Error('Invalid circle payload: name must be a non-empty string.');
  }
  if (!isString(candidate.createdAt)) {
    throw new Error('Invalid circle payload: createdAt must be a non-empty ISO string.');
  }
  if (typeof candidate.isActive !== 'boolean') {
    throw new Error('Invalid circle payload: isActive must be boolean.');
  }
  if (!Array.isArray(candidate.contacts)) {
    throw new Error('Invalid circle payload: contacts must be an array.');
  }

  // alertSettings is new — backfill defaults for circles saved before this field existed
  const rawAlert = candidate.alertSettings as Record<string, unknown> | undefined;
  const alertSettings: AlertSettings = {
    sos:               typeof rawAlert?.sos               === 'boolean' ? rawAlert.sos               : DEFAULT_ALERT_SETTINGS.sos,
    notification:      typeof rawAlert?.notification      === 'boolean' ? rawAlert.notification      : DEFAULT_ALERT_SETTINGS.notification,
    emergencyServices: typeof rawAlert?.emergencyServices === 'boolean' ? rawAlert.emergencyServices : DEFAULT_ALERT_SETTINGS.emergencyServices,
  };

  return {
    id: candidate.id,
    name: candidate.name,
    createdAt: candidate.createdAt,
    isActive: candidate.isActive,
    contacts: candidate.contacts.map(normalizeContactRef),
    alertSettings,
  };
}

function parseCircles(jsonValue: string | null): Circle[] {
  if (!jsonValue) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonValue);
  } catch (error) {
    throw new Error(
      `Unable to parse circles storage JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid circles storage payload: expected an array.');
  }

  return parsed.map(normalizeCircle);
}

function makeCircleId(): string {
  return `circle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Converts backend CircleDto to mobile Circle.
 * The backend uses separate alert booleans; mobile uses an alertSettings object.
 */
function fromBackendDto(dto: {
  id: string;
  name: string;
  isActive: boolean;
  alertSos: boolean;
  alertNotification: boolean;
  alertEmergencyServices: boolean;
  createdAt: string;
  members?: { name: string; phone: string; userId?: string | null }[];
}): Circle {
  return {
    id: dto.id,
    name: dto.name,
    contacts: (dto.members ?? []).map((m) => ({
      id: m.userId ?? m.phone,
      name: m.name,
      phoneNumber: m.phone,
    })),
    createdAt: dto.createdAt,
    isActive: dto.isActive,
    alertSettings: {
      sos: dto.alertSos,
      notification: dto.alertNotification,
      emergencyServices: dto.alertEmergencyServices,
    },
  };
}

function toBackendMembers(contacts: ContactRef[]) {
  return contacts.map((c) => ({
    name: c.name,
    phone: c.phoneNumber,
    userId: null as string | null,
  }));
}

function toBackendCreate(circle: Circle) {
  return {
    name: circle.name,
    isActive: circle.isActive,
    alertSos: circle.alertSettings.sos,
    alertNotification: circle.alertSettings.notification,
    alertEmergencyServices: circle.alertSettings.emergencyServices,
    members: toBackendMembers(circle.contacts),
  };
}

function toBackendUpdate(circle: Circle) {
  return {
    name: circle.name,
    isActive: circle.isActive,
    alertSos: circle.alertSettings.sos,
    alertNotification: circle.alertSettings.notification,
    alertEmergencyServices: circle.alertSettings.emergencyServices,
    members: toBackendMembers(circle.contacts),
  };
}

export async function loadMemberships(): Promise<CircleMembership[]> {
  if (!BACKEND_LIVE) return [];

  const remote = await apiFetch<{
    circleId: string;
    circleName: string;
    ownerName: string;
    ownerId: string;
    isActive: boolean;
    alertSos: boolean;
    alertNotification: boolean;
    alertEmergencyServices: boolean;
    addedAt: string;
  }[]>('/api/v1/circles/memberships');

  return remote.map((m) => ({
    circleId: m.circleId,
    circleName: m.circleName,
    ownerName: m.ownerName,
    ownerId: m.ownerId,
    isActive: m.isActive,
    addedAt: m.addedAt,
    alertSettings: {
      sos: m.alertSos,
      notification: m.alertNotification,
      emergencyServices: m.alertEmergencyServices,
    },
  }));
}

export async function loadCircles(): Promise<Circle[]> {
  if (BACKEND_LIVE) {
    try {
      const remote = await apiFetch<{
        id: string;
        name: string;
        isActive: boolean;
        alertSos: boolean;
        alertNotification: boolean;
        alertEmergencyServices: boolean;
        createdAt: string;
        members?: { name: string; phone: string; userId?: string | null }[];
      }[]>('/api/v1/circles');
      const circles = remote.map(fromBackendDto);
      await saveCircles(circles);
      return circles;
    } catch {
      // Backend error — fall back to local cache
    }
  }

  const raw = await AsyncStorage.getItem(CIRCLES_STORAGE_KEY);
  return parseCircles(raw);
}

export async function saveCircles(circles: Circle[]): Promise<void> {
  const normalized = circles.map(normalizeCircle);
  await AsyncStorage.setItem(CIRCLES_STORAGE_KEY, JSON.stringify(normalized));
}

export async function createCircle(input: CreateCircleInput): Promise<Circle> {
  if (!isString(input.name)) {
    throw new Error('Circle name is required.');
  }

  const nextCircle: Circle = {
    id: makeCircleId(),
    name: input.name.trim(),
    contacts: (input.contacts ?? []).map(normalizeContactRef),
    createdAt: new Date().toISOString(),
    isActive: input.isActive ?? false,
    alertSettings: input.alertSettings ?? DEFAULT_ALERT_SETTINGS,
  };

  // Try to sync to backend
  if (BACKEND_LIVE) {
    try {
      const response = await apiFetch<{
        id: string;
        name: string;
        isActive: boolean;
        alertSos: boolean;
        alertNotification: boolean;
        alertEmergencyServices: boolean;
        createdAt: string;
        members?: { name: string; phone: string; userId?: string | null }[];
      }>('/api/v1/circles', {
        method: 'POST',
        body: JSON.stringify(toBackendCreate(nextCircle)),
      });
      // Use server-assigned ID and createdAt
      const synced = fromBackendDto(response);
      const circles = await loadCircles();
      // Only add if not already present (avoid duplicates)
      const exists = circles.some(c => c.id === synced.id);
      if (!exists) {
        await saveCircles([...circles, synced]);
      }
      return synced;
    } catch (e) {
      console.warn('[Circles] Backend create failed, saving locally:', e);
    }
  }

  // Fall back to local-only creation
  const circles = await loadCircles();
  await saveCircles([...circles, nextCircle]);
  return nextCircle;
}

export async function updateCircle(circleId: string, input: UpdateCircleInput): Promise<Circle> {
  if (!isString(circleId)) {
    throw new Error('Circle id is required.');
  }

  const circles = await loadCircles();
  const index = circles.findIndex((circle) => circle.id === circleId);
  if (index === -1) {
    throw new Error(`Circle not found: ${circleId}`);
  }

  const current = circles[index];
  const updated: Circle = {
    ...current,
    name: input.name !== undefined ? input.name.trim() : current.name,
    contacts: input.contacts !== undefined ? input.contacts.map(normalizeContactRef) : current.contacts,
    isActive: input.isActive !== undefined ? input.isActive : current.isActive,
    alertSettings: input.alertSettings !== undefined ? input.alertSettings : current.alertSettings,
  };

  if (!isString(updated.name)) {
    throw new Error('Circle name cannot be empty.');
  }

  // Try to sync to backend
  if (BACKEND_LIVE) {
    try {
      await apiFetch(`/api/v1/circles/${circleId}`, {
        method: 'PUT',
        body: JSON.stringify(toBackendUpdate(updated)),
      });
    } catch (e) {
      console.warn('[Circles] Backend update failed, saving locally:', e);
    }
  }

  // Update local storage
  const next = [...circles];
  next[index] = updated;
  await saveCircles(next);
  return updated;
}

export async function deleteCircle(circleId: string): Promise<void> {
  if (!isString(circleId)) {
    throw new Error('Circle id is required.');
  }

  const circles = await loadCircles();
  const next = circles.filter((circle) => circle.id !== circleId);
  if (next.length === circles.length) {
    throw new Error(`Circle not found: ${circleId}`);
  }

  // Try to sync deletion to backend
  if (BACKEND_LIVE) {
    try {
      await apiFetch(`/api/v1/circles/${circleId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[Circles] Backend delete failed, removing locally:', e);
    }
  }

  // Update local storage
  await saveCircles(next);
}

export async function toggleCircleSharing(circleId: string): Promise<Circle> {
  const circles = await loadCircles();
  const circle = circles.find((item) => item.id === circleId);
  if (!circle) {
    throw new Error(`Circle not found: ${circleId}`);
  }

  const newIsActive = !circle.isActive;

  // Try to sync to backend
  if (BACKEND_LIVE) {
    try {
      await apiFetch(`/api/v1/circles/${circleId}/toggle`, { method: 'PATCH' });
    } catch (e) {
      console.warn('[Circles] Backend toggle failed, updating locally:', e);
    }
  }

  // Update local storage
  return updateCircle(circleId, { isActive: newIsActive });
}

export { CIRCLES_STORAGE_KEY };
