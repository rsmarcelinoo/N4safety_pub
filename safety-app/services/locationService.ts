/**
 * LOCATION SERVICE
 *
 * Thin wrapper around expo-location. Handles permission negotiation so UI
 * code never calls expo-location directly.
 *
 * Permission strategy: foreground-only for MVP. Background tracking (for dongle
 * SOS correlation) is a future milestone requiring a different permission tier.
 *
 * Multi-Agent Note: All expo-location calls go through this file. Import Coordinates
 * from @/types/location, not from expo-location.
 */

import * as Location from 'expo-location';
import type { Coordinates } from '@/types/location';

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<Coordinates> {
  const granted = await requestLocationPermission();
  if (!granted) throw new Error('Location permission denied');

  const result = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: result.coords.latitude,
    longitude: result.coords.longitude,
  };
}

export async function reverseGeocode(coords: Coordinates): Promise<string> {
  const [place] = await Location.reverseGeocodeAsync(coords);
  if (!place) return 'Unknown location';

  const parts = [place.street, place.district ?? place.subregion, place.city]
    .filter(Boolean)
    .join(', ');

  return parts || place.formattedAddress || 'Unknown location';
}

export function subscribeToLocation(
  cb: (coords: Coordinates) => void,
  options?: { distanceInterval?: number; timeInterval?: number },
): () => void {
  let sub: Location.LocationSubscription | null = null;

  Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: options?.timeInterval ?? 6000,
      distanceInterval: options?.distanceInterval ?? 15,
    },
    (loc) =>
      cb({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
  ).then((s) => { sub = s; });

  return () => { sub?.remove(); };
}
