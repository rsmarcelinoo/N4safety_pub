/**
 * LOCATION FEATURE TYPES
 *
 * Coordinates follow the standard { latitude, longitude } shape used by expo-location.
 * Note: GeoJSON uses [longitude, latitude] — convert at the service boundary, not in UI code.
 *
 * Multi-Agent Note: Import from here. Do not redefine these locally.
 */

import type { RiskLevel } from './map';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationState {
  coords: Coordinates | null;
  address: string | null;
  riskLevel: RiskLevel | null;
  loading: boolean;
  error: string | null;
}
