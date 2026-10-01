import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bluetooth, Battery, Signal, Clock } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useTheme } from '@/contexts/PreferencesContext';
import { useI18n } from '@/i18n';
import { getBleStatus, subscribeToDongleState, scanAndConnect, disconnect } from '@/services/bleService';
import type { DongleState } from '@/services/bleService';
import { LinearGradient } from 'expo-linear-gradient';

const BATTERY_MAX = 100;

export default function DongleStatusScreen() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const [dongleState, setDongleState] = useState<DongleState>(getBleStatus());
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    return subscribeToDongleState(setDongleState);
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      await scanAndConnect();
    } catch {}
    setScanning(false);
  }, []);

  const handleForget = useCallback(() => {
    disconnect(true);
  }, []);

  const statusColor = dongleState.connected
    ? '#22C55E'
    : dongleState.deviceId
      ? t.colors.warn
      : t.colors.textMuted;

  const statusLabel = dongleState.connected
    ? i18n('dongle.connected')
    : dongleState.deviceId
      ? i18n('dongle.reconnecting')
      : i18n('dongle.not_paired');

  const lastSeen = dongleState.lastSeenAt
    ? new Date(dongleState.lastSeenAt).toLocaleString()
    : '—';

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={[styles.title, { color: t.colors.text }]}>{i18n('dongle.title')}</Text>

          <GlassCard style={{ marginTop: 24 }}>
            {/* Header section */}
            <View style={styles.header}>
              <View style={[styles.iconContainer, { backgroundColor: `${statusColor}18` }]}>
                <Bluetooth color={statusColor} size={32} />
              </View>
              <View style={styles.headerTextContainer}>
                <Text style={[styles.deviceName, { color: t.colors.text }]}>
                  {dongleState.deviceId ? 'N4Safety-Shield' : i18n('dongle.not_paired')}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: t.colors.divider }]} />

            {/* Battery level */}
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: t.colors.pill }]}>
                <Battery color={t.colors.textMuted} size={20} />
              </View>
              <View style={styles.statContent}>
                <Text style={[styles.statLabel, { color: t.colors.textMuted }]}>{i18n('dongle.battery')}</Text>
                {dongleState.connected && dongleState.batteryLevel != null ? (
                  <View style={styles.batteryContainer}>
                    <View style={[styles.batteryTrack, { backgroundColor: t.colors.divider }]}>
                      <LinearGradient
                        colors={t.colors.accentGradient as [string, string, ...string[]]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={[styles.batteryFill, { width: `${Math.min(dongleState.batteryLevel / BATTERY_MAX * 100, 100)}%` }]}
                      />
                    </View>
                    <Text style={[styles.batteryText, { color: t.colors.text }]}>
                      {dongleState.batteryLevel}%
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.statValue, { color: t.colors.textMuted }]}>—</Text>
                )}
              </View>
            </View>

            {/* Signal strength */}
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: t.colors.pill }]}>
                <Signal color={t.colors.textMuted} size={20} />
              </View>
              <View style={styles.statContent}>
                <Text style={[styles.statLabel, { color: t.colors.textMuted }]}>{i18n('dongle.connected')}</Text>
                <Text style={[styles.statValue, { color: dongleState.connected ? t.colors.safe : t.colors.textMuted }]}>
                  {dongleState.connected ? i18n('dongle.connected') : i18n('dongle.disconnected')}
                </Text>
              </View>
            </View>

            {/* Last seen */}
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: t.colors.pill }]}>
                <Clock color={t.colors.textMuted} size={20} />
              </View>
              <View style={styles.statContent}>
                <Text style={[styles.statLabel, { color: t.colors.textMuted }]}>{i18n('dongle.last_seen')}</Text>
                <Text style={[styles.statValue, { color: t.colors.text }]}>{lastSeen}</Text>
              </View>
            </View>
          </GlassCard>

          {/* Instructions card */}
          <GlassCard style={{ marginTop: 16 }}>
            <Text style={[styles.instructionText, { color: t.colors.textMuted }]}>
              {i18n('dongle.instructions')}
            </Text>
          </GlassCard>

          {/* Action buttons */}
          {dongleState.connected ? (
            <Pressable
              onPress={handleForget}
              style={[styles.actionButton, { backgroundColor: `${t.colors.accent}18` }]}
            >
              <Text style={[styles.actionText, { color: t.colors.accent }]}>{i18n('dongle.forget')}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleScan}
              disabled={scanning}
              style={[styles.actionButton, { backgroundColor: t.colors.accent, opacity: scanning ? 0.6 : 1 }]}
            >
              {scanning ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.actionText, { color: '#fff' }]}>{i18n('dongle.scan')}</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconContainer: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  headerTextContainer: { flex: 1, gap: 4 },
  deviceName: { fontSize: 20, fontWeight: '700' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  divider: { height: 1, marginVertical: 20 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statContent: { flex: 1, gap: 4 },
  statLabel: { fontSize: 14, fontWeight: '500' },
  statValue: { fontSize: 16, fontWeight: '600' },
  batteryContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  batteryTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  batteryFill: { height: '100%', borderRadius: 4 },
  batteryText: { fontSize: 14, fontWeight: '600', width: 36 },
  instructionText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingVertical: 8 },
  actionButton: { marginTop: 40, paddingVertical: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 17, fontWeight: '700' },
});
