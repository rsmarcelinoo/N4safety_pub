/**
 * NOTIFICATION SERVICE
 *
 * Handles Expo push notifications: registration, permissions, listeners.
 * Integrates with backend `/api/v1/users/me/push-token` for SOS alerts.
 *
 * Multi-Agent Note: All notification setup goes through this file.
 */

import * as Notifications from 'expo-notifications';

/**
 * Request notification permissions and return device push token.
 * Called after successful login/register to register device for SOS alerts.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[Notifications] Permission denied by user');
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (e) {
    console.warn('[Notifications] Push token unavailable (dev build required):', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Request notification permission (for explicit permission prompts).
 * Returns true if permission was granted.
 */
export async function requestPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Subscribe to incoming notifications and response handling.
 * Returns unsubscribe function.
 *
 * Usage:
 *   const unsub = addNotificationListener(
 *     (notification) => console.log('Received:', notification.request.content.body),
 *     (response) => console.log('Tapped:', response.notification.request.content.body)
 *   );
 */
export function addNotificationListener(
  onReceive: (notification: Notifications.Notification) => void,
  onResponse?: (response: Notifications.NotificationResponse) => void,
): () => void {
  const receivedListener = Notifications.addNotificationReceivedListener(onReceive);

  const responseListener = onResponse
    ? Notifications.addNotificationResponseReceivedListener(onResponse)
    : null;

  return () => {
    receivedListener.remove();
    responseListener?.remove();
  };
}
