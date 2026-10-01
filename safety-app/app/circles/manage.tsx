import { Redirect } from 'expo-router';

/**
 * MANAGE CIRCLES ROUTE REDIRECT
 *
 * Why this exists:
 * - Legacy deep-links and older navigation points still target `/circles/manage`.
 * - The active Circles list now lives in the `devices` tab, so this route redirects there.
 */
export default function ManageCirclesScreen() {
  return <Redirect href="/devices" />;
}
