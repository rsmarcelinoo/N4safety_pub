/**
 * CIRCLES FEATURE TYPES
 * 
 * Logic:
 * - Defines the core data structures for the Circles safety feature.
 * - A 'Circle' is a collection of contacts that receive alerts.
 * - 'Contact' represents a user imported from the device or added manually.
 * 
 * Multi-Agent Note: Use these interfaces for all Circle-related UI and persistence.
 */

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  avatarUri?: string;
  isSelected?: boolean;
}

/**
 * Minimal contact representation stored inside a circle.
 * Keep this structure lean to simplify local persistence and sync later.
 */
export type ContactRef = Pick<Contact, 'id' | 'name' | 'phoneNumber' | 'avatarUri'>;

export interface AlertSettings {
  sos: boolean;               // include this circle in SOS triggers
  notification: boolean;      // send push notification to contacts
  emergencyServices: boolean; // also alert 112 / 911
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  sos: true,
  notification: true,
  emergencyServices: false,
};

export interface Circle {
  id: string;
  name: string;
  contacts: ContactRef[];
  createdAt: string;
  isActive: boolean;
  alertSettings: AlertSettings;
}

export interface CreateCircleInput {
  name: string;
  contacts?: ContactRef[];
  isActive?: boolean;
  alertSettings?: AlertSettings;
}

export interface UpdateCircleInput {
  name?: string;
  contacts?: ContactRef[];
  isActive?: boolean;
  alertSettings?: AlertSettings;
}

export interface ContactsImportResult {
  contacts: ContactRef[];
  skippedCount: number;
}

export interface CircleState {
  circles: Circle[];
  loading: boolean;
  error: string | null;
}

export interface CircleMembership {
  circleId: string;
  circleName: string;
  ownerName: string;
  ownerId: string;
  isActive: boolean;
  alertSettings: AlertSettings;
  addedAt: string;
}
