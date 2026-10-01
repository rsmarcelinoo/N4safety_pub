/**
 * HOME DASHBOARD SCREEN
 *
 * Serves as the primary entry point and status overview.
 * All four widgets now pull from live data sources:
 *
 *   Profile widget   → AsyncStorage `n4safety:profile:v1` (written by profile/edit.tsx)
 *   Circles widget   → circlesStorage.loadCircles(), filtered to isActive
 *   Dongle widget    → still mock (BLE integration is a future milestone)
 *   Location widget  → locationService.getCurrentLocation() + reverseGeocode()
 *
 * Data is refreshed via useFocusEffect so edits in sub-screens reflect immediately
 * on return. Location is fetched once on mount.
 *
 * Multi-Agent Note: This screen is high-traffic. Always use GlassCard for new
 * widgets and refer to constants/theme.ts for all colors.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  BatteryFull,
  Bluetooth,
  MapPin,
  Pencil,
  User as UserIcon,
} from 'lucide-react-native';
import { lightTheme } from '@/constants/theme';
import { useTheme } from '@/contexts/PreferencesContext';
import { loadCircles } from '@/services/circlesStorage';
import { fetchHeatmap } from '@/services/mapService';
import { getCurrentLocation, reverseGeocode } from '@/services/locationService';
import * as bleService from '@/services/bleService';
import { useSession } from '@/contexts/SessionContext';
import type { Circle } from '@/types/circles';
import type { RiskLevel } from '@/types/map';
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner';
import { Image } from 'expo-image';
import { useI18n } from '@/i18n';
import { ScaledText } from '@/components/ScaledText';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });
const PROFILE_KEY = 'n4safety:profile:v1';

interface RiskDisplay {
  label: string;
  percent: number;
  color: string;
  gradient: readonly [string, string];
}

const RISK_PRIORITY: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
const RISK_DISPLAY: Record<RiskLevel, RiskDisplay> = {
  low: { label: 'Low', percent: 20, color: lightTheme.colors.safe, gradient: [lightTheme.colors.safe, lightTheme.colors.safe] },
  medium: { label: 'Medium', percent: 55, color: lightTheme.colors.warn, gradient: [lightTheme.colors.warn, lightTheme.colors.warn] },
  high: { label: 'High', percent: 85, color: lightTheme.colors.accent, gradient: [lightTheme.colors.accent, lightTheme.colors.accentGlow] },
};

interface Profile {
  name: string;
  age: string;
  email: string;
  avatarUri?: string;
}

function getGreeting(t: (path: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t('home.greeting_morning');
  if (hour < 18) return t('home.greeting_afternoon');
  return t('home.greeting_evening');
}

function GlassCard({
  children,
  style,
  scrollOffset,
  index = 0,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  scrollOffset?: SharedValue<number>;
  index?: number;
}) {
  const t = useTheme();
  const blurIntensity = useRef(50);

  const animatedBlurStyle = useAnimatedStyle(() => {
    if (!scrollOffset) return {};
    const blurOpacity = interpolate(
      scrollOffset.value,
      [index * 200 - 100, index * 200 + 100],
      [1, 0.7],
      Extrapolation.CLAMP,
    );
    return { opacity: blurOpacity };
  });

  return (
    <View style={[styles.cardShadow, { shadowColor: t.colors.glassShadow }, style]}>
      <Animated.View style={[styles.cardBlur, { borderColor: t.colors.glassBorder, overflow: 'hidden', borderRadius: 20 }, animatedBlurStyle]}>
        <BlurView intensity={blurIntensity.current} tint={t.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[styles.cardInner, { backgroundColor: t.colors.glass }]}>{children}</View>
      </Animated.View>
    </View>
  );
}

/* ─── Screen ─── */
export default function HomeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const activeTheme = useTheme();
  const { session } = useSession();

  const [profile, setProfile]             = useState<Profile>({
    name: session?.name ?? 'Guest',
    age: '',
    email: session?.email ?? '',
  });
  const [activeCircles, setActiveCircles] = useState<Circle[]>([]);
  const [dongleState, setDongleState]     = useState(bleService.getBleStatus());
  const [locationText, setLocationText] = useState<string | null>(null);
  const [greeting, setGreeting]           = useState(getGreeting(t));
  const [riskDisplay, setRiskDisplay] = useState<RiskDisplay>(RISK_DISPLAY.low);
  const dongleConnected = dongleState.connected;

  useEffect(() => {
    const unsub = bleService.subscribeToDongleState(setDongleState);
    return unsub;
  }, []);

  useEffect(() => {
    if (session) setProfile((prev) => ({ ...prev, name: session.name, email: session.email }));
  }, [session]);

  // Reload profile + circles every time home gains focus
  useFocusEffect(useCallback(() => {
    setGreeting(getGreeting(t));

    void AsyncStorage.getItem(PROFILE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as Partial<Profile>;
        setProfile((prev) => ({ ...prev, ...saved }));
      } catch {
        // Corrupted storage — keep defaults
      }
    });

    void loadCircles()
      .then((circles) => setActiveCircles(circles.filter((c) => c.isActive)))
      .catch(() => {});

    void fetchHeatmap()
      .then((heatmap) => {
        const weights = heatmap.features.map((f) => f.properties.weight);
        if (weights.length === 0) { setRiskDisplay(RISK_DISPLAY.low); return; }
        const maxWeight = Math.max(...weights);
        const clamped = Math.min(maxWeight, 1);
        const percent = Math.round(clamped * 100);
        const level: RiskLevel = clamped <= 0.35 ? 'low' : clamped <= 0.65 ? 'medium' : 'high';
        setRiskDisplay({ label: level.charAt(0).toUpperCase() + level.slice(1), percent, color: RISK_DISPLAY[level].color, gradient: RISK_DISPLAY[level].gradient });
      })
      .catch(() => setRiskDisplay(RISK_DISPLAY.low));
  }, [t]));

  // Fetch location once on mount
  useEffect(() => {
    void getCurrentLocation()
      .then((coords) => reverseGeocode(coords))
      .then(setLocationText)
      .catch(() => setLocationText('Location unavailable'));
  }, []);

  // ─── Reanimated scroll handler ───────────────────────────────────────────────
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Parallax background: subtle vertical shift as user scrolls
  const parallaxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * -0.05 }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: activeTheme.colors.bg }]}>
      <Animated.View style={[StyleSheet.absoluteFill, parallaxStyle]}>
        <LinearGradient
          colors={[activeTheme.colors.bgGradientStart, activeTheme.colors.bg, activeTheme.colors.bgGradientEnd] as const}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.blob, { backgroundColor: `${activeTheme.colors.info}20`, top: -60, left: -40 }]} />
        <View style={[styles.blob, { backgroundColor: `${activeTheme.colors.accent}20`, top: 220, right: -60 }]} />
      </Animated.View>

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {/* Greeting */}
          <View style={styles.header}>
            <ScaledText style={[styles.greeting, { color: activeTheme.colors.text }]}>{greeting}</ScaledText>
            <ScaledText style={[styles.subGreeting, { color: activeTheme.colors.textMuted }]}>{t('home.subtitle')}</ScaledText>
          </View>

          <NotificationPermissionBanner />

          {/* Widget 1: Profile */}
          <GlassCard>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                {profile.avatarUri ? (
                  <Image source={{ uri: profile.avatarUri }} style={{ width: 60, height: 60, borderRadius: 30 }} />
                ) : (
                  <UserIcon color={activeTheme.colors.textMuted} size={32} strokeWidth={2} />
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <ScaledText style={[styles.name, { color: activeTheme.colors.text }]} numberOfLines={1}>{profile.name}</ScaledText>
                {!!profile.age && (
                  <ScaledText style={[styles.metaText, { color: activeTheme.colors.textMuted }]}>Age: {profile.age}</ScaledText>
                )}
                <ScaledText style={[styles.emailText, { color: activeTheme.colors.textMuted }]} numberOfLines={1}>{profile.email}</ScaledText>
              </View>
              <Pressable
                onPress={() => router.push('/profile/edit')}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              >
                <BlurView intensity={40} tint={activeTheme.blurTint} style={styles.editBtn}>
                  <Pencil color={activeTheme.colors.text} size={14} strokeWidth={2.5} />
                  <Text style={[styles.editText, { color: activeTheme.colors.text }]}>Edit</Text>
                </BlurView>
              </Pressable>
            </View>
          </GlassCard>

          {/* Widget 2: Dongle Hardware Status */}
          <Pressable
            onPress={() => router.push('/dongle/status')}
            accessibilityRole="button"
            accessibilityLabel="View dongle status"
            style={({ pressed }) => [styles.widgetPressable, pressed && styles.widgetPressed]}
          >
            <GlassCard style={{ marginTop: 16 }}>
              <ScaledText style={[styles.cardTitle, { color: activeTheme.colors.text }]}>{t('home.dongle_status')}</ScaledText>
              <View style={styles.statusRow}>
                <View style={styles.statusItem}>
                  <View style={[styles.iconCircle, { backgroundColor: dongleConnected ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.12)' }]}>
                    <Bluetooth color={dongleConnected ? activeTheme.colors.safe : activeTheme.colors.textMuted} size={20} strokeWidth={2.4} />
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <ScaledText style={[styles.statusLabel, { color: activeTheme.colors.textMuted }]}>{t('home.status')}</ScaledText>
                    <ScaledText style={[styles.statusValue, { color: dongleConnected ? activeTheme.colors.safe : activeTheme.colors.textMuted }]}>
                      {dongleConnected ? t('home.connected') : t('home.dongle_disconnected')}
                    </ScaledText>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: activeTheme.colors.divider }]} />

                <View style={styles.statusItem}>
                  <View style={[styles.iconCircle, { backgroundColor: dongleConnected ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.12)' }]}>
                    <BatteryFull color={dongleConnected ? activeTheme.colors.safe : activeTheme.colors.textMuted} size={20} strokeWidth={2.4} />
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <ScaledText style={[styles.statusLabel, { color: activeTheme.colors.textMuted }]}>{t('home.battery')}</ScaledText>
                    <ScaledText style={[styles.statusValue, { color: dongleConnected ? activeTheme.colors.safe : activeTheme.colors.textMuted }]}>
                      {dongleConnected && dongleState.batteryLevel !== null ? `${dongleState.batteryLevel}%` : '—'}
                    </ScaledText>
                  </View>
                </View>
              </View>
            </GlassCard>
          </Pressable>

          {/* Widget 3: Active Circles */}
          <Pressable
            onPress={() => router.push('/circles/manage')}
            accessibilityRole="button"
            accessibilityLabel="Manage active circles"
            style={({ pressed }) => [styles.widgetPressable, pressed && styles.widgetPressed]}
          >
            <GlassCard style={{ marginTop: 16 }}>
              <ScaledText style={[styles.cardTitle, { color: activeTheme.colors.text }]}>{t('home.active_circles')}</ScaledText>
              {activeCircles.length === 0 ? (
                <ScaledText style={[styles.emptyCircles, { color: activeTheme.colors.textMuted }]}>
                  {t('home.no_circles')}
                </ScaledText>
              ) : (
                <View style={styles.pillRow}>
                  {activeCircles.map((c) => (
                    <View key={c.id} style={styles.pill}>
                      <ScaledText style={[styles.pillText, { color: activeTheme.colors.text }]}>{c.name}</ScaledText>
                    </View>
                  ))}
                </View>
              )}
            </GlassCard>
          </Pressable>

          {/* Widget 4: Current Location */}
          <Pressable
            onPress={() => router.push('/(tabs)/location')}
            accessibilityRole="button"
            accessibilityLabel="View location map and danger zones"
            style={({ pressed }) => [styles.widgetPressable, pressed && styles.widgetPressed]}
          >
            <GlassCard style={{ marginTop: 16, marginBottom: 140 }}>
              <View style={styles.locationHeader}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                  <MapPin color={activeTheme.colors.info} size={20} strokeWidth={2.4} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <ScaledText style={[styles.cardTitle, { color: activeTheme.colors.text }]}>{t('home.current_location')}</ScaledText>
                  <ScaledText style={[styles.locationText, { color: activeTheme.colors.textMuted }]} numberOfLines={1}>
                    {locationText ?? t('home.locating')}
                  </ScaledText>
                </View>
              </View>

              {/* Risk level — computed from real danger zone data */}
                <View style={{ marginTop: 18 }}>
                  <View style={styles.riskHeaderRow}>
                    <ScaledText style={[styles.statusLabel, { color: activeTheme.colors.textMuted }]}>{t('home.risk_level')}</ScaledText>
                    <ScaledText style={[styles.riskValue, { color: riskDisplay.color }]}>
                      {riskDisplay.label} · {riskDisplay.percent}%
                    </ScaledText>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: activeTheme.colors.divider }]}>
                    <LinearGradient
                      colors={riskDisplay.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${riskDisplay.percent}%` }]}
                    />
                  </View>
                </View>
            </GlassCard>
          </Pressable>
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

// Text and border colors are applied as inline styles using activeTheme to
// support dark mode. Only structural/layout values live here.
const styles = StyleSheet.create({
  root: { flex: 1 },
  blob: { position: 'absolute', width: 240, height: 240, borderRadius: 120, opacity: 0.55 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  header: { marginBottom: 18, marginTop: 6 },
  greeting: { fontFamily: FONT, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  subGreeting: { fontFamily: FONT, fontSize: 15, marginTop: 4 },
  cardShadow: { borderRadius: 24, backgroundColor: 'transparent', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  cardBlur: { borderRadius: 24, overflow: 'hidden', borderWidth: 1 },
  cardInner: { padding: 18 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: FONT, fontSize: 18, fontWeight: '700' },
  metaText: { fontFamily: FONT, fontSize: 13, marginTop: 2 },
  emailText: { fontFamily: FONT, fontSize: 11, marginTop: 1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.4)' },
  editText: { fontFamily: FONT, fontSize: 12, fontWeight: '600', marginLeft: 4 },
  cardTitle: { fontFamily: FONT, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  statusItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  divider: { width: 1, height: 32, marginHorizontal: 8 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  statusValue: { fontFamily: FONT, fontSize: 15, fontWeight: '700', marginTop: 1 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  pillText: { fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  emptyCircles: { fontFamily: FONT, fontSize: 13, marginTop: 10, lineHeight: 18 },
  locationHeader: { flexDirection: 'row', alignItems: 'center' },
  locationText: { fontFamily: FONT, fontSize: 13, marginTop: 2 },
  riskHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  riskValue: { fontFamily: FONT, fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 10, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  widgetPressable: { borderRadius: 24 },
  widgetPressed: { opacity: 0.94 },
});
