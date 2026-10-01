/**
 * ROOT LAYOUT
 *
 * Responsibilities:
 * 1. Wraps the entire app in SessionProvider (auth state) and SafeAreaProvider.
 * 2. Auth guard: after session loads, redirects unauthenticated users to /auth/login.
 *    Authenticated users in the auth group are redirected back to /(tabs).
 * 3. Onboarding guard: first-time users see /onboarding before login.
 * 4. Registers notification listeners so SOS alerts from circle members
 *    display as banners even when the app is backgrounded.
 * 5. Declares every stack route so headers and back-navigation work.
 *
 * Multi-Agent Note: To add a new stack screen, add a Stack.Screen entry here.
 * Do not use router.push() to routes that aren't declared — it will fail silently.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { addNotificationListener } from '@/services/notificationService';
import { I18nProvider } from '../i18n';
import { PreferencesProvider, useTheme } from '@/contexts/PreferencesContext';

const ONBOARDING_KEY = 'n4safety:onboarding:done';

// ─── Auth + Onboarding guard ─────────────────────────────────────────────────

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const segments = useSegments();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const navigatingRef = useRef(false);

useEffect(() => {
  AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
    setOnboardingDone(!!val);
    setOnboardingChecked(true);
  });
}, []);

useEffect(() => {
  if (loading || !onboardingChecked || navigatingRef.current) return;
  navigatingRef.current = true;

  const inAuth = segments[0] === 'auth';
  const inOnboarding = segments[0] === 'onboarding';

  if (!onboardingDone && !inOnboarding) {
    router.replace('/onboarding');
  } else if (!session && !inAuth && !inOnboarding) {
    router.replace('/auth/register');
  } else if (session && (inAuth || inOnboarding)) {
    router.replace('/(tabs)');
  } else {
    navigatingRef.current = false;
  }
}, [loading, session, segments, onboardingChecked, onboardingDone, router]);

return <>{children}</>;
}

// ─── Notification wiring ─────────────────────────────────────────────────────

function ThemedStatusBar() {
  const t = useTheme();
  return <StatusBar style={t.blurTint === 'dark' ? 'light' : 'dark'} />;
}

function NotificationBridge() {
  const router = useRouter();

  useEffect(() => {
    const cleanup = addNotificationListener(
      () => { }, // notification received while foregrounded — banner shown automatically
      (response: unknown) => {
        // User tapped a notification — route them to the SOS history
        const data = (response as { notification?: { request?: { content?: { data?: Record<string, unknown> } } } })
          ?.notification?.request?.content?.data;
        if (data?.type === 'sos_alert') {
          router.push('/sos/history');
        }
      },
    );
    return cleanup;
  }, [router]);

  return null;
}

// ─── Themed Stack (reads active theme so header matches dark/light mode) ────────

function AppNavigator() {
  const theme = useTheme();
  return (
    <>
      <ThemedStatusBar />
      <NotificationBridge />
      <NavigationGuard>
        <Stack
          screenOptions={{
            headerShown: true,
            headerTintColor: theme.colors.text,
            headerStyle: { backgroundColor: theme.colors.bg },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.bg },
            animation: 'slide_from_right',
          }}
        >
          {/* Auth group — no header */}
          <Stack.Screen name="auth/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/register" options={{ headerShown: false }} />

          {/* Onboarding — no header */}
          <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />

          {/* Tabs shell */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Stack destinations */}
          <Stack.Screen name="profile/edit" options={{ title: 'Edit Profile', headerBackTitle: 'Back' }} />
          <Stack.Screen name="dongle/status" options={{ title: 'Dongle Status', headerBackTitle: 'Back' }} />
          <Stack.Screen name="circles/manage" options={{ title: 'Manage Circles', headerBackTitle: 'Back' }} />
          <Stack.Screen name="circles/create" options={{ title: 'Create Circle', headerBackTitle: 'Back' }} />
          <Stack.Screen name="circles/[circleId]/edit" options={{ title: 'Edit Circle', headerBackTitle: 'Back' }} />
          <Stack.Screen name="location/current" options={{ title: 'Current Location', headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings/appearance" options={{ title: 'Appearance', headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings/privacy" options={{ title: 'Privacy', headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings/language" options={{ title: 'Language', headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings/faq" options={{ title: 'FAQ', headerBackTitle: 'Back' }} />
          <Stack.Screen name="sos/history" options={{ title: 'SOS History', headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings/account" options={{ title: 'Account', headerBackTitle: 'Back' }} />
        </Stack>
        {/* SOS Status HUD — persists across all screens during emergency */}
        <SosStatusHud />
      </NavigationGuard>
    </>
  );
}

import { ErrorBoundary } from '@/components/ErrorBoundary';
import SosStatusHud from '@/components/SosStatusHud';

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <I18nProvider>
      <PreferencesProvider>
        <SafeAreaProvider>
          <SessionProvider>
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
          </SessionProvider>
        </SafeAreaProvider>
      </PreferencesProvider>
    </I18nProvider>
  );
}
