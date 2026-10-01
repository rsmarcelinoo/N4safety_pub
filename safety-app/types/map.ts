/**
 * MAP FEATURE TYPES
 *
 * Single source of truth for all geospatial data structures.
 * GeoJSON shapes follow RFC 7946 — coordinates are always [longitude, latitude].
 * RiskLevel drives FillLayer paint expressions and theme color mapping.
 *
 * Multi-Agent Note: Import from here. Do not redefine these locally.
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface DangerZoneProperties {
  id: string;
  label: string;
  riskLevel: RiskLevel;
}

export interface DangerZone {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: DangerZoneProperties;
}

export interface DangerZoneCollection {
  type: 'FeatureCollection';
  features: DangerZone[];
}

// ─── Heatmap (crowd-sourced incident reports) ─────────────────────────────────

export type IncidentType =
  | 'poor_lighting'
  | 'suspicious_person'
  | 'harassment'
  | 'theft'
  | 'assault'
  | 'fight';

export interface HeatmapPoint {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { weight: number };
}

export interface HeatmapCollection {
  type: 'FeatureCollection';
  features: HeatmapPoint[];
}

// ─── Area Summary ─────────────────────────────────────────────────────

export interface AreaSummary {
  totalReports: number;
  recent24h: number;
  topType: string | null;
  riskScore: number;
  riskiestHour: number | null;
  safestHour: number | null;
  breakdown: Record<string, number>;
}
