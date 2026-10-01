/**
 * SAVED LOCATION TYPES
 *
 * Used by the Locations tab (weather-app style).
 * 'current' is a reserved id for the live GPS card — never stored in AsyncStorage.
 *
 * Multi-Agent Note: Import from here. savedLocationsService owns all persistence.
 */

export interface SavedLocation {
  id: string;
  name: string;      // display name (city / neighbourhood from geocode)
  address: string;   // full reverse-geocoded address
  latitude: number;
  longitude: number;
  addedAt: string;   // ISO timestamp
}
