/**
 * SOS HISTORY SCREEN
 *
 * Displays historical SOS events from sosService with local fallback storage.
 * Rows show trigger timestamp, resolved location label, circles alerted,
 * alert duration, and outcome status.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { AlertTriangle, Clock3, MapPin, RefreshCw, Users } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { useTheme } from '@/contexts/PreferencesContext';
import { lightTheme } from '@/constants/theme';
import { reverseGeocode } from '@/services/locationService';
import { getSOSHistory } from '@/services/sosService';
import type { SOSEvent } from '@/types/sos';
import { useI18n } from '@/i18n';

type SOSHistoryEvent = SOSEvent & { cancelledAt?: string };

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return 'Active';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '—';

  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getOutcome(event: SOSHistoryEvent): 'Triggered' | 'Cancelled' {
  return event.cancelledAt ? 'Cancelled' : 'Triggered';
}

export default function SOSHistoryScreen() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const [history, setHistory] = useState<SOSHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationByEventId, setLocationByEventId] = useState<Record<string, string>>({});

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const events = await getSOSHistory();
      setHistory(events as SOSHistoryEvent[]);
    } catch (loadError) {
      console.error('Failed to load SOS history:', loadError);
      setError(i18n('sos_history.load_error'));
    } finally {
      setLoading(false);
    }
  }, [i18n]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  useEffect(() => {
    let isActive = true;

    const resolveLocations = async () => {
      const pending = history.filter(
        (item) => item.coords && !locationByEventId[item.id],
      );
      if (pending.length === 0) return;

      const resolved = await Promise.all(
        pending.map(async (item) => {
          try {
            const label = await reverseGeocode(item.coords!);
            return { id: item.id, label };
          } catch {
            return {
              id: item.id,
              label: `${item.coords!.latitude.toFixed(4)}, ${item.coords!.longitude.toFixed(4)}`,
            };
          }
        }),
      );

      if (!isActive) return;

      setLocationByEventId((previous) => {
        const next = { ...previous };
        for (const item of resolved) {
          next[item.id] = item.label;
        }
        return next;
      });
    };

    void resolveLocations();
    return () => {
      isActive = false;
    };
  }, [history, locationByEventId]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) =>
          new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
      ),
    [history],
  );

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <LinearGradient
        colors={[t.colors.bgGradientStart, t.colors.bgGradientEnd] as const}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={sortedHistory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={[styles.title, { color: t.colors.text }]}>{i18n('sos_history.title')}</Text>
              <Text style={[styles.subtitle, { color: t.colors.textMuted }]}>{i18n('sos_history.subtitle')}</Text>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <GlassCard>
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={t.colors.accent} />
                  <Text style={[styles.emptyText, { color: t.colors.textMuted }]}>{i18n('sos_history.loading')}</Text>
                </View>
              </GlassCard>
            ) : (
              <GlassCard>
                <View style={styles.emptyWrap}>
                  <AlertTriangle size={28} color={t.colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: t.colors.text }]}>{i18n('sos_history.empty_title')}</Text>
                  <Text style={[styles.emptyText, { color: t.colors.textMuted }]}>
                    {i18n('sos_history.empty_subtitle')}
                  </Text>
                </View>
              </GlassCard>
            )
          }
          renderItem={({ item }) => {
            const outcome = getOutcome(item);
            const locationLabel = item.coords
              ? (locationByEventId[item.id] ?? i18n('sos_history.resolving_address'))
              : i18n('sos_history.location_unavailable');
            const isTriggered = outcome !== 'Cancelled';

            return (
              <GlassCard style={styles.rowCard}>
                <View style={styles.rowTop}>
                  <Text style={[styles.timestamp, { color: t.colors.text }]}>{formatTimestamp(item.triggeredAt)}</Text>
                  <View style={[styles.outcomePill, {
                    backgroundColor: isTriggered ? `${t.colors.accent}12` : `${t.colors.safe}12`,
                    borderColor:     isTriggered ? `${t.colors.accent}40` : `${t.colors.safe}40`,
                  }]}>
                    <Text style={[styles.outcomeText, { color: isTriggered ? t.colors.accent : t.colors.safe }]}>
                      {isTriggered ? i18n('sos_history.status_active') : i18n('sos_history.status_cancelled')}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <MapPin size={14} color={t.colors.textMuted} />
                  <Text style={[styles.metaText, { color: t.colors.textMuted }]} numberOfLines={2}>{locationLabel}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Users size={14} color={t.colors.textMuted} />
                  <Text style={[styles.metaText, { color: t.colors.textMuted }]}>
                    {i18n('sos_history.circles_alerted', { count: item.circleIds.length, plural: item.circleIds.length !== 1 ? 's' : '' })}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Clock3 size={14} color={t.colors.textMuted} />
                  <Text style={[styles.metaText, { color: t.colors.textMuted }]}>
                    {i18n('sos_history.duration_label')}: {formatDuration(item.triggeredAt, item.cancelledAt)}
                  </Text>
                </View>
              </GlassCard>
            );
          }}
          ListFooterComponent={
            error ? (
              <GlassCard>
                <Text style={[styles.errorText, { color: t.colors.accent }]}>{error}</Text>
                <Pressable
                  onPress={() => { void loadHistory(); }}
                  style={({ pressed }) => [styles.retryButton, { backgroundColor: t.colors.accent }, pressed && styles.buttonPressed]}
                >
                  <RefreshCw size={15} color={t.colors.textInverse} />
                  <Text style={[styles.retryText, { color: t.colors.textInverse }]}>{i18n('sos_history.retry')}</Text>
                </Pressable>
              </GlassCard>
            ) : null
          }
        />
      </SafeAreaView>
    </View>
  );
}

const { spacing, font, radius } = lightTheme;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 130, gap: spacing.md },
  header: { marginBottom: spacing.sm },
  title: { fontSize: font.h1, fontWeight: '800' },
  subtitle: { fontSize: font.body, marginTop: 2 },
  rowCard: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  timestamp: { fontSize: font.small, fontWeight: '700' },
  outcomePill: { borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing.sm, borderWidth: 1 },
  outcomeText: { fontSize: font.tiny, fontWeight: '700', letterSpacing: 0.2 },
  metaRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: { flex: 1, fontSize: font.small, lineHeight: 18 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: font.h3, fontWeight: '700' },
  emptyText: { fontSize: font.body, textAlign: 'center' },
  errorText: { fontSize: font.small, textAlign: 'center' },
  retryButton: { marginTop: spacing.sm, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  retryText: { fontSize: font.body, fontWeight: '700' },
  buttonPressed: { opacity: 0.84 },
});
