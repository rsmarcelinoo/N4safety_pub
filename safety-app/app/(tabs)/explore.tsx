/**
 * SOS SCREEN
 *
 * State machine: idle → triggered → idle (via cancel)
 *
 * Trigger flow:
 *   1. User arrives at this screen by tapping the floating SOS tab button.
 *   2. They press and hold the large ring button for 3 seconds.
 *      A SVG progress ring fills up as visual confirmation of hold duration.
 *      Releasing before 3s resets the ring — prevents accidental triggers.
 *   3. On completion the screen transitions to "SOS Sent" state:
 *      - Loads active circles from circlesStorage
 *      - Attempts to snapshot current GPS coords via locationService
 *      - Builds a SOSEvent (logged locally; real dispatch needs the backend)
 *      - Shows which circles were alerted
 *   4. "Cancel Alert" resets to idle.
 *
 * The 3-second hold IS the intentional confirmation mechanism — no additional
 * dialog is shown, which keeps the flow fast in a genuine emergency.
 *
 * Multi-Agent Note: SOSEvent is defined in @/types/sos. Dispatch logic (push
 * notifications, SMS) belongs in a future sosService.ts, not here.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { AlertTriangle, Flashlight, MapPin, Shield, ShieldAlert, X, Zap } from 'lucide-react-native';
import { loadCircles } from '@/services/circlesStorage';
import { getCurrentLocation, reverseGeocode, subscribeToLocation } from '@/services/locationService';
import { sendSOSAlert, cancelSOSAlert, startLocationStream } from '@/services/sosService';
import { fetchHeatmap, submitReport, submitSafeCheckin } from '@/services/mapService';
import * as bleService from '@/services/bleService';
import { ApiError } from '@/services/apiClient';
import { useI18n } from '@/i18n';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ThemedText } from '@/components/ui/text';
import { Toast } from '@/components/Toast';
import type { Circle as CircleType } from '@/types/circles';
import type { HeatmapCollection, IncidentType } from '@/types/map';
import type { SOSEvent, SOSStatus } from '@/types/sos';
import type { Coordinates } from '@/types/location';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });

// Ring geometry
const RING_RADIUS = 88;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const HOLD_DURATION = 3000;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type ReportOption = { type: IncidentType; labelKey: string; Icon: React.ComponentType<{ color: string; size: number }> };
const REPORT_OPTIONS: ReportOption[] = [
  { type: 'poor_lighting',    labelKey: 'explore.report.poor_lighting',    Icon: Flashlight },
  { type: 'suspicious_person', labelKey: 'explore.report.suspicious_person', Icon: AlertTriangle },
  { type: 'harassment',       labelKey: 'explore.report.harassment',       Icon: AlertTriangle },
  { type: 'theft',            labelKey: 'explore.report.theft',            Icon: AlertTriangle },
  { type: 'assault',          labelKey: 'explore.report.assault',          Icon: Zap },
  { type: 'fight',            labelKey: 'explore.report.fight',            Icon: Zap },
];

export default function SOSScreen() {
  const { t } = useI18n();
  const activeTheme = useTheme();
  const [status, setStatus]               = useState<SOSStatus>('idle');
  const [activeCircles, setActiveCircles] = useState<CircleType[]>([]);
  const [allCircles, setAllCircles]       = useState<CircleType[]>([]);
  const [sosEvent, setSosEvent]           = useState<SOSEvent | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('Getting location…');

  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [submittingReport, setSubmittingReport]     = useState(false);
  const [toastVisible, setToastVisible]             = useState(false);
  const [toastMessage, setToastMessage]             = useState('');
  const [toastType, setToastType]                   = useState<'success' | 'error'>('success');
  const heatmapRef        = useRef<HeatmapCollection | null>(null);
  const lastCheckinRef    = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const userCoordsRef     = useRef<Coordinates | null>(null);

  // Reanimated shared value: 0 → 1 over HOLD_DURATION ms
  const holdProgress = useSharedValue(0);
  const triggered = useRef(false);
  const activeEventId = useRef<string | null>(null);
  const stopStream = useRef<(() => void) | null>(null);
  const hapticInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated SVG ring: dashoffset shrinks as progress grows
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - holdProgress.value),
  }));

  // Radial liquid fill: scale grows from center, opacity increases
  const liquidFillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.3 + 0.7 * holdProgress.value }],
    opacity: 0.08 + 0.35 * holdProgress.value,
  }));

  // Progressive haptics: stronger as fill increases (called from UI thread)
  const doHaptic = useCallback((progress: number) => {
    if (progress < 0.33) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (progress < 0.66) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const circles = await loadCircles();
      setAllCircles(circles);
      setActiveCircles(circles.filter((c) => c.isActive));
    } catch {
      // Storage read failure — show empty state, don't crash
    }
  }, []);

  // Load heatmap data on focus for zone check-in prompts
  useFocusEffect(useCallback(() => {
    fetchHeatmap().then((h) => { heatmapRef.current = h; }).catch(() => {});
  }, []));

  // Subscribe to GPS to detect high-risk zone entry
  useEffect(() => {
    const unsub = subscribeToLocation((coords) => {
      userCoordsRef.current = coords;
      checkZoneEntry(coords);
    });
    return unsub;
  }, []);

  const checkZoneEntry = useCallback((coords: Coordinates) => {
    const heatmap = heatmapRef.current;
    if (!heatmap || heatmap.features.length === 0) return;

    const now = Date.now();
    const last = lastCheckinRef.current;
    if (last) {
      const distFromLast = haversineKm(coords.latitude, coords.longitude, last.lat, last.lng);
      const timeSince = now - last.time;
      // Skip if within 200m of last checkin and less than 30 min ago
      if (distFromLast < 0.2 && timeSince < 30 * 60 * 1000) return;
    }

    const hasHotSpot = heatmap.features.some((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const dist = haversineKm(coords.latitude, coords.longitude, lat, lng);
      return dist < 0.2 && f.properties.weight > 0.4;
    });

    if (!hasHotSpot) return;
    lastCheckinRef.current = { lat: coords.latitude, lng: coords.longitude, time: now };

    Alert.alert(
      t('explore.checkin.title'),
      t('explore.checkin.body'),
      [
        {
          text: t('explore.checkin.im_fine'),
          style: 'cancel',
          onPress: () => {
            const latest = userCoordsRef.current;
            if (!latest) return;
            void submitSafeCheckin(latest.latitude, latest.longitude)
              .then(() => fetchHeatmap().then((h) => { heatmapRef.current = h; }))
              .catch(() => {});
          },
        },
        { text: t('explore.checkin.report_something'), onPress: () => setReportModalVisible(true) },
      ],
    );
  }, [t]);

  const handleReportTypeSelect = useCallback(async (type: IncidentType) => {
    const SOS_PROMPT_TYPES: IncidentType[] = ['assault', 'harassment', 'theft'];

    if (SOS_PROMPT_TYPES.includes(type)) {
      Alert.alert(
        t('explore.report.confirm_title'),
        t('explore.report.confirm_body'),
        [
          {
            text: t('explore.report.confirm_sos'),
            style: 'destructive',
            onPress: () => {
              setReportModalVisible(false);
              // Trigger the SOS hold programmatically
              if (status === 'idle') {
                triggered.current = true;
                void triggerSOS();
              }
            },
          },
          {
            text: t('explore.report.confirm_report'),
            onPress: () => void doSubmitReport(type),
          },
        ],
      );
      return;
    }
    await doSubmitReport(type);
  }, [status, t]);

  const doSubmitReport = async (type: IncidentType) => {
    setSubmittingReport(true);
    const coords = userCoordsRef.current;
    if (!coords) {
      setReportModalVisible(false);
      setSubmittingReport(false);
      return;
    }
    try {
      await submitReport(type, coords.latitude, coords.longitude);
      setReportModalVisible(false);
      setToastMessage(t('explore.report.success'));
      setToastType('success');
      setToastVisible(true);
      // Refresh local heatmap cache
      fetchHeatmap().then((h) => { heatmapRef.current = h; }).catch(() => {});
    } catch (e) {
      setToastMessage(e instanceof ApiError && e.status === 0 ? t('errors.network') : t('errors.server'));
      setToastType('error');
      setToastVisible(true);
    } finally {
      setSubmittingReport(false);
    }
  };

  // Subscribe to hardware SOS button (0x01 from ESP32)
  useEffect(() => {
    const unsub = bleService.subscribeToHardwareSOS(() => {
      // Hardware button held 3s → fire SOS exactly as if user held the app button
      if (status === 'idle') {
        triggered.current = true;
        void triggerSOS();
      }
    });
    return unsub;
  }, [status]);

  // Reload circles every time this tab gains focus
  useFocusEffect(useCallback(() => {
    void loadData();
    if (status === 'cancelled') {
      setStatus('idle');
      setSosEvent(null);
    }
  }, [loadData, status]));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimation(holdProgress);
      holdProgress.value = 0;
      if (hapticInterval.current) clearInterval(hapticInterval.current);
    };
  }, [holdProgress]);

  const onPressIn = useCallback(() => {
    if (status !== 'idle') return;
    triggered.current = false;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Haptics pulse progressively stronger during hold
    doHaptic(0);
    let lastHapticStep = 0;
    hapticInterval.current = setInterval(() => {
      const progress = holdProgress.value;
      const step = Math.floor(progress / 0.33);
      if (step > lastHapticStep) {
        lastHapticStep = step;
        doHaptic(progress);
      }
    }, 400);

    holdProgress.value = withTiming(1, {
      duration: HOLD_DURATION,
      easing: Easing.linear,
    }, (finished) => {
      if (!finished) return;
      runOnJS(doHaptic)(1);
      runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
      runOnJS(triggerSOS)();
    });

    triggered.current = false;
  }, [status, doHaptic, holdProgress]);

  const onPressOut = useCallback(() => {
    if (triggered.current) return;
    cancelAnimation(holdProgress);
    if (hapticInterval.current) {
      clearInterval(hapticInterval.current);
      hapticInterval.current = null;
    }
    holdProgress.value = withSpring(0, { damping: 15, stiffness: 150 });
  }, [holdProgress]);

  const triggerSOS = async () => {
    let coords = null;
    let address = 'Unknown location';

    // Heartbeat haptic pulse
    const interval = setInterval(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 1000);
    // Track interval so we can clear it
    (activeEventId as any).hapticInterval = interval;

    try {
      coords = await getCurrentLocation();
      address = await reverseGeocode(coords);
    } catch {
      // Location unavailable — SOS still fires without coordinates
    }

    setLocationLabel(address);

    const circles = await loadCircles();
    const active = circles.filter((c) => c.isActive);
    setActiveCircles(active);

    const event: SOSEvent = {
      id: `sos-${Date.now()}`,
      triggeredAt: new Date().toISOString(),
      coords,
      circleIds: active.map((c) => c.id),
    };

    setSosEvent(event);
    setStatus('triggered');

    // Tell the dongle: red LED on
    void bleService.writeSosState('triggered');

    // Dispatch to backend (push + SMS)
    try {
      const serverId = await sendSOSAlert(event);
      activeEventId.current = serverId;

      // Start streaming live GPS to backend → SignalR → circle members
      stopStream.current = startLocationStream(serverId, () => coords);
    } catch (e) {
      console.error('SOS dispatch failed:', e);
      if (e instanceof ApiError && e.status === 0) {
        // Network error is handled gracefully as it also saves to local cache
        // but we should still notify the user that cloud dispatch failed.
      }
    }
  };

  const cancelSOS = useCallback(() => {
    cancelAnimation(holdProgress);
    holdProgress.value = 0;
    triggered.current = false;
    
    // Stop heartbeat
    if ((activeEventId as any).hapticInterval) {
        clearInterval((activeEventId as any).hapticInterval);
        (activeEventId as any).hapticInterval = null;
    }

    // Stop GPS stream
    stopStream.current?.();
    stopStream.current = null;

    // Cancel on backend
    if (activeEventId.current) {
      void cancelSOSAlert(activeEventId.current);
      activeEventId.current = null;
    }

    // Tell dongle: green LED on
    void bleService.writeSosState('cancelled');

    setStatus('idle');
    setSosEvent(null);
    setLocationLabel('Getting location…');
  }, [holdProgress]);

  /* ─────────────── TRIGGERED STATE ─────────────── */
  if (status === 'triggered') {
    return (
      <View style={[styles.root, { backgroundColor: activeTheme.colors.bg }]}>
        <LinearGradient
          colors={activeTheme.blurTint === 'dark' ? [activeTheme.colors.bgGradientStart, activeTheme.colors.bgGradientEnd] : ['#fff1f3', '#ffe4e8', '#fecdd3']}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={styles.centeredContent} edges={['top', 'bottom']}>
          {/* Confirmation icon */}
          <BlurView intensity={50} tint={activeTheme.blurTint} style={[styles.alertIconWrap, { borderColor: activeTheme.colors.glassBorder, backgroundColor: activeTheme.colors.glass }]}>
            <ShieldAlert color={activeTheme.colors.accent} size={44} strokeWidth={1.8} />
          </BlurView>

          <ThemedText style={styles.alertTitle}>{t('sos.alert_sent')}</ThemedText>
          <ThemedText style={[styles.alertTime, { color: activeTheme.colors.accent }]}>
            {sosEvent ? formatTime(new Date(sosEvent.triggeredAt)) : ''}
          </ThemedText>
          <ThemedText style={[styles.alertLocation, { color: activeTheme.colors.textMuted }]} numberOfLines={2}>
            {locationLabel === 'Getting location…' ? t('home.locating') : locationLabel}
          </ThemedText>

          {/* Alerted circles */}
          <BlurView intensity={50} tint={activeTheme.blurTint} style={[styles.alertedCard, { borderColor: activeTheme.colors.glassBorder, borderRadius: activeTheme.radius.lg }]}>
            <View style={[styles.alertedCardInner, { backgroundColor: activeTheme.colors.glass }]}>
              <Text style={[styles.alertedTitle, { color: activeTheme.colors.textMuted }]}>
                {activeCircles.length === 0
                  ? t('sos.no_active_circles')
                  : t('sos.active_circles_count', { count: activeCircles.length, plural: activeCircles.length > 1 ? 's' : '' })}
              </Text>
              {activeCircles.map((c) => (
                <View key={c.id} style={styles.circleRow}>
                  <View style={[styles.circleDot, { backgroundColor: activeTheme.colors.accent }]} />
                  <Text style={[styles.circleName, { color: activeTheme.colors.text }]}>{c.name}</Text>
                  <Text style={[styles.circleCount, { color: activeTheme.colors.textMuted }]}>
                    {c.contacts.length} {c.contacts.length !== 1 ? t('circles.member_phone') : t('circles.member_phone')}
                  </Text>
                </View>
              ))}
              {activeCircles.length === 0 && (
                <Text style={[styles.noCircleHint, { color: activeTheme.colors.textMuted }]}>
                  {t('sos.go_to_circles')}
                </Text>
              )}
            </View>
          </BlurView>

          {/* Cancel */}
          <Pressable
            onPress={cancelSOS}
            accessibilityRole="button"
            accessibilityLabel="Cancel SOS alert"
            style={({ pressed }) => [styles.cancelBtn, { borderRadius: activeTheme.radius.pill, backgroundColor: activeTheme.colors.accent, shadowColor: activeTheme.colors.accent }, pressed && { opacity: 0.8 }]}
          >
            <X color={activeTheme.colors.textInverse} size={18} strokeWidth={2.5} />
            <Text style={styles.cancelText}>{t('sos.cancel_alert')}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  /* ─────────────── IDLE STATE ─────────────── */
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.centeredContent} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Shield color={activeTheme.colors.accent} size={22} strokeWidth={2} />
          <Text style={[styles.title, { color: activeTheme.colors.text }]}>{t('explore.sos.title')}</Text>
        </View>

        <ThemedText style={[styles.subtitle, { color: activeTheme.colors.textMuted }]}>
          {t('sos.hold_instruction')}
        </ThemedText>

        {/* Hold button with radial liquid leak animation */}
        <View style={styles.ringWrap}>
          {/* SVG progress ring — circumference shrinks as hold fills */}
          <Svg style={StyleSheet.absoluteFill} width={RING_RADIUS * 2 + 20} height={RING_RADIUS * 2 + 20}>
            <AnimatedCircle
              cx={RING_RADIUS + 10}
              cy={RING_RADIUS + 10}
              r={RING_RADIUS}
              stroke={activeTheme.colors.accent}
              strokeWidth={4}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={RING_CIRCUMFERENCE}
              animatedProps={ringProps}
              opacity={0.6}
            />
          </Svg>
          <Pressable
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={styles.holdPressable}
            accessibilityRole="button"
            accessibilityLabel="Activate SOS — hold for 3 seconds"
          >
            <View style={styles.holdGradient}>
              {/* Radial liquid fill — scales from center, uses theme accent */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 999,
                    backgroundColor: activeTheme.colors.accent,
                  },
                  liquidFillStyle,
                ]}
              />
              <View style={styles.sosSpecular} />
              <Text style={[styles.holdLabel, { color: activeTheme.colors.textInverse }]}>{t('explore.sos.title')}</Text>
              <Text style={[styles.holdSub, { color: activeTheme.colors.textInverse }]}>{t('explore.sos.instruction').toUpperCase()}</Text>
            </View>
          </Pressable>
        </View>

        {/* Active circles preview */}
        <BlurView intensity={50} tint={activeTheme.blurTint} style={[styles.circlesCard, { borderRadius: activeTheme.radius.lg, borderColor: activeTheme.colors.glassBorder }]}>
          <View style={[styles.circlesCardInner, { backgroundColor: activeTheme.colors.glass }]}>
            <ThemedText style={[styles.circlesCardTitle, { color: activeTheme.colors.textMuted }]}>
              {activeCircles.length === 0 ? t('sos.no_active_circles') : t('sos.will_alert')}
            </ThemedText>

            {activeCircles.length === 0 ? (
              <ThemedText style={[styles.noCircleHint, { color: activeTheme.colors.textMuted }]}>
                {t('sos.activate_circle_hint')}
              </ThemedText>
            ) : (
              activeCircles.map((c) => (
                <View key={c.id} style={styles.circleRow}>
                  <View style={[styles.circleDot, { backgroundColor: activeTheme.colors.accent }]} />
                  <Text style={[styles.circleName, { color: activeTheme.colors.text }]}>{c.name}</Text>
                  <Text style={[styles.circleCount, { color: activeTheme.colors.textMuted }]}>
                    {c.contacts.length} {c.contacts.length !== 1 ? t('circles.member_phone') : t('circles.member_phone')}
                  </Text>
                </View>
              ))
            )}

            {allCircles.length > 0 && activeCircles.length < allCircles.length && (
              <Text style={[styles.inactiveHint, { color: activeTheme.colors.textMuted }]}>
                {t('sos.inactive_circles', { count: allCircles.length - activeCircles.length, plural: allCircles.length - activeCircles.length > 1 ? 's' : '' })}
              </Text>
            )}
          </View>
        </BlurView>

        {/* Report Unsafe Spot — secondary, non-alerting */}
        <Pressable
          onPress={() => setReportModalVisible(true)}
          style={({ pressed }) => [styles.reportBtn, pressed && { opacity: 0.7 }]}
        >
          <MapPin size={15} color={activeTheme.colors.textMuted} />
          <Text style={[styles.reportBtnText, { color: activeTheme.colors.textMuted }]}>
            {t('explore.report.button')}
          </Text>
        </Pressable>

        {/* Report type selection modal */}
        <Modal
          visible={reportModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setReportModalVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setReportModalVisible(false)}>
            <Pressable style={[styles.modalSheet, { backgroundColor: activeTheme.colors.bg }]} onPress={() => {}}>
              <View style={[styles.modalHandle, { backgroundColor: activeTheme.colors.divider }]} />
              <Text style={[styles.modalTitle, { color: activeTheme.colors.text }]}>
                {t('explore.report.title')}
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.reportGrid}>
                  {REPORT_OPTIONS.map(({ type, labelKey, Icon }) => (
                    <Pressable
                      key={type}
                      disabled={submittingReport}
                      onPress={() => void handleReportTypeSelect(type)}
                      style={({ pressed }) => [
                        styles.reportPill,
                        { borderColor: activeTheme.colors.glassBorder, backgroundColor: activeTheme.colors.glass },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Icon color={activeTheme.colors.accent} size={20} />
                      <Text style={[styles.reportPillText, { color: activeTheme.colors.text }]}>
                        {t(labelKey)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  title: {
    fontFamily: FONT,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: FONT,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 36,
    maxWidth: 280,
  },

  /* Ring + hold button */
  ringWrap: {
    width: RING_RADIUS * 2 + 16,
    height: RING_RADIUS * 2 + 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  holdPressable: {
    width: RING_RADIUS * 2 - 16,
    height: RING_RADIUS * 2 - 16,
    borderRadius: RING_RADIUS - 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.78)',
  },
  holdGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosSpecular: {
    position: 'absolute',
    top: 12,
    left: 20,
    right: 20,
    height: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  liquidFill: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  holdLabel: {
    fontFamily: FONT,
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  holdSub: {
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 3,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  /* Active circles card */
  circlesCard: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
  },
  circlesCardInner: {
    padding: 16,
    gap: 8,
  },
  circlesCardTitle: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  circleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  circleName: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  circleCount: {
    fontFamily: FONT,
    fontSize: 12,
  },
  noCircleHint: {
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  inactiveHint: {
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 2,
  },

  /* Triggered state */
  alertIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  alertTitle: {
    fontFamily: FONT,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  alertTime: {
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  alertLocation: {
    fontFamily: FONT,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 280,
  },
  alertedCard: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 24,
  },
  alertedCardInner: {
    padding: 16,
    gap: 8,
  },
  alertedTitle: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  cancelText: {
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },

  /* Report Unsafe button */
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  reportBtnText: {
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Report modal */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    minHeight: 360,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  reportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  reportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: '44%',
  },
  reportPillText: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '600',
  },
});
