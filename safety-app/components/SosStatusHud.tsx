/**
 * SOS STATUS HUD
 *
 * Floating GlassCard widget that appears on all screens during an active SOS.
 * Shows: connection quality (SignalR), time elapsed, circles notified.
 * Persists across tab navigation via root _layout.tsx integration.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/PreferencesContext';
import { useI18n } from '@/i18n';
import { getActiveSosEvent, onSosStateChange } from '@/services/sosService';
import type { SOSEvent } from '@/types/sos';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });

type ConnectionQuality = 'connected' | 'reconnecting' | 'disconnected';

const QUALITY_COLORS: Record<ConnectionQuality, string> = {
  connected:    '#22C55E',
  reconnecting: '#F59E0B',
  disconnected: '#EF4444',
};

const QUALITY_LABELS: Record<ConnectionQuality, string> = {
  connected:    'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default function SosStatusHud() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<SOSEvent | null>(null);
  const [elapsed, setElapsed] = useState('0s');
  const [quality, setQuality] = useState<ConnectionQuality>('disconnected');

  // Subscribe to SOS state changes
  useEffect(() => {
    const unsub = onSosStateChange((e) => setEvent(e));
    setEvent(getActiveSosEvent());
    return unsub;
  }, []);

  // Timer for elapsed display
  useEffect(() => {
    if (!event) return;
    const start = new Date(event.triggeredAt).getTime();
    const interval = setInterval(() => {
      setElapsed(formatElapsed(Date.now() - start));
    }, 1000);
    setElapsed(formatElapsed(Date.now() - start));
    return () => clearInterval(interval);
  }, [event]);

  if (!event) return null;

  return (
    <View style={[styles.container, { top: insets.top + 8, borderColor: t.colors.glassBorder }]}>
      <BlurView intensity={65} tint={t.blurTint} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { backgroundColor: t.colors.glass }]}>
        {/* Connection quality dot */}
        <View style={[styles.dot, { backgroundColor: QUALITY_COLORS[quality] }]} />

        {/* Elapsed timer */}
        <Text style={[styles.text, { color: t.colors.accent }]}>{elapsed}</Text>

        {/* Circle count */}
        <Text style={[styles.text, { color: t.colors.text }]}>
          {event.circleIds.length} {i18n('circles.member_phone')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: '600',
  },
});
