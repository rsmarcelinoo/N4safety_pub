import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, CirclePlus, Users } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import type { Circle, CircleMembership } from '@/types/circles';
import { loadCircles, loadMemberships, toggleCircleSharing } from '@/services/circlesStorage';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';

export default function Devices() {
  const router = useRouter();
  const t = useTheme();
  const { t: i18n } = useI18n();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'mine' | 'memberships'>('mine');
  const [memberships, setMemberships] = useState<CircleMembership[]>([]);
  const listData: (Circle | CircleMembership)[] = viewMode === 'mine' ? circles : memberships;

  const refreshCircles = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const nextCircles = await loadCircles();
      // Sort: Active first, then by name
      nextCircles.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.name.localeCompare(b.name));
      setCircles(nextCircles);
    } catch (error) {
      console.error('Unable to load circles from storage:', error);
      setErrorMessage(i18n('errors.network'));
    } finally {
      setIsLoading(false);
    }
  }, [i18n]);

  const refreshMemberships = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const nextMemberships = await loadMemberships();
      setMemberships(nextMemberships);
    } catch (error) {
      console.error('Unable to load memberships:', error);
      setErrorMessage(i18n('errors.network'));
    } finally {
      setIsLoading(false);
    }
  }, [i18n]);

  useFocusEffect(
    useCallback(() => {
      void refreshCircles();
      void refreshMemberships();
    }, [refreshCircles, refreshMemberships]),
  );

  const onToggleCircleSharing = useCallback(async (circle: Circle) => {
    try {
      setUpdatingId(circle.id);
      const updatedCircle = await toggleCircleSharing(circle.id);
      setCircles((previous) => {
        const next = previous.map((item) => (item.id === updatedCircle.id ? updatedCircle : item));
        return next.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.name.localeCompare(b.name));
      });
    } catch (error) {
      console.error(`Failed to toggle sharing for circle ${circle.id}:`, error);
      setErrorMessage(i18n('errors.server'));
    } finally {
      setUpdatingId(null);
    }
  }, [i18n]);

  const renderCircleRow = ({ item }: { item: Circle }) => {
    const isUpdating = updatingId === item.id;

    return (
      <GlassCard style={styles.rowCard}>
        <Pressable
          onPress={() => router.push(`/circles/${item.id}/edit`)}
          style={({ pressed }) => [styles.circleRow, pressed && styles.buttonPressed]}
        >
          <View style={styles.circleMeta}>
            <View style={styles.nameRow}>
              <Text style={[styles.circleName, { color: t.colors.text, fontSize: t.font.body }]}>{item.name}</Text>
              <View style={[styles.countBadge, { backgroundColor: t.colors.pill }]}>
                <Text style={[styles.countBadgeText, { color: t.colors.textMuted }]}>
                  {i18n('circles.contacts_selected', { count: item.contacts.length, plural: item.contacts.length === 1 ? '' : 's' })}
                </Text>
              </View>
            </View>
            <View style={styles.alertTypesPreview}>
              {item.alertSettings.sos && <View style={[styles.miniDot, { backgroundColor: t.colors.accent }]} />}
              {item.alertSettings.notification && <View style={[styles.miniDot, { backgroundColor: t.colors.info }]} />}
              {item.alertSettings.emergencyServices && <View style={[styles.miniDot, { backgroundColor: t.colors.warn }]} />}
            </View>
          </View>
          <ChevronRight size={16} color={t.colors.textMuted} />
        </Pressable>

        <Pressable
          disabled={isUpdating}
          onPress={() => {
            void onToggleCircleSharing(item);
          }}
          style={({ pressed }) => [
            styles.toggleButton,
            { borderRadius: t.radius.pill, borderColor: t.colors.glassBorder },
            item.isActive ? { backgroundColor: t.colors.accent, borderColor: t.colors.accent } : { backgroundColor: 'transparent' },
            pressed && styles.buttonPressed,
          ]}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color={item.isActive ? t.colors.textInverse : t.colors.text} />
          ) : (
            <Text
              style={[
                styles.toggleButtonText,
                { fontSize: 13 },
                item.isActive ? { color: t.colors.textInverse } : { color: t.colors.textMuted },
              ]}
            >
              {item.isActive ? i18n('circles.sharing_on').toUpperCase() : i18n('circles.sharing_off').toUpperCase()}
            </Text>
          )}
        </Pressable>
      </GlassCard>
    );
  };

  const renderMembershipRow = ({ item }: { item: CircleMembership }) => (
    <GlassCard style={styles.rowCard}>
      <View style={styles.circleRow}>
        <View style={styles.circleMeta}>
          <Text style={[styles.circleName, { color: t.colors.text, fontSize: t.font.body }]}>{item.circleName}</Text>
          <Text style={[styles.circleCount, { color: t.colors.textMuted, fontSize: t.font.small }]}>
            {i18n('circles.owner_label')}: {item.ownerName}
          </Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        {item.alertSettings.sos ? <Text style={[styles.badge, { color: t.colors.text, borderColor: t.colors.glassBorder }]}>{i18n('circles.alert_sos')}</Text> : null}
        {item.alertSettings.notification ? <Text style={[styles.badge, { color: t.colors.text, borderColor: t.colors.glassBorder }]}>{i18n('circles.alert_notification')}</Text> : null}
        {item.alertSettings.emergencyServices ? <Text style={[styles.badge, { color: t.colors.text, borderColor: t.colors.glassBorder }]}>{i18n('circles.alert_emergency')}</Text> : null}
      </View>
    </GlassCard>
  );

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={listData}
          keyExtractor={(item) => ('id' in item ? item.id : item.circleId)}
          renderItem={({ item }) =>
            'id' in item
              ? renderCircleRow({ item })
              : renderMembershipRow({ item })
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { padding: t.spacing.lg, gap: t.spacing.md }]}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.headerRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.title, { color: t.colors.text, fontSize: t.font.h1 }]}>{i18n('tabs.circles')}</Text>
                  <Text style={[styles.subtitle, { color: t.colors.textMuted, fontSize: t.font.body }]}>{i18n('circles.subtitle')}</Text>
                </View>
                <Pressable
                  onPress={() => router.push('/circles/create')}
                  style={({ pressed }) => [styles.headerAction, { backgroundColor: t.colors.accent }, pressed && styles.buttonPressed]}
                >
                  <CirclePlus size={18} color={t.colors.textInverse} />
                </Pressable>
              </View>
              <View style={[styles.segmentedWrap, { borderColor: t.colors.glassBorder }]}>
                <Pressable
                  onPress={() => setViewMode('mine')}
                  style={[styles.segmentButton, viewMode === 'mine' && { backgroundColor: t.colors.pill }]}
                >
                  <Text style={[styles.segmentText, { color: t.colors.text }]}>{i18n('circles.my_circles')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setViewMode('memberships')}
                  style={[styles.segmentButton, viewMode === 'memberships' && { backgroundColor: t.colors.pill }]}
                >
                  <Text style={[styles.segmentText, { color: t.colors.text }]}>{i18n('circles.added_to')}</Text>
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            isLoading ? (
              <GlassCard>
                <View style={styles.centerContent}>
                  <ActivityIndicator color={t.colors.accent} />
                  <Text style={[styles.emptySubtitle, { color: t.colors.textMuted, fontSize: t.font.body }]}>{i18n('common.loading')}</Text>
                </View>
              </GlassCard>
            ) : (
              <GlassCard>
                <View style={styles.emptyState}>
                  <Users size={36} color={t.colors.textMuted} />
                  {viewMode === 'mine' ? (
                    <>
                      <Text style={[styles.emptyTitle, { color: t.colors.text, fontSize: t.font.h3 }]}>{i18n('circles.empty_title')}</Text>
                      <Text style={[styles.emptySubtitle, { color: t.colors.textMuted, fontSize: t.font.body }]}>{i18n('circles.empty_subtitle')}</Text>
                      <Pressable
                        onPress={() => router.push('/circles/create')}
                        style={({ pressed }) => [styles.primaryButton, { borderRadius: t.radius.md, backgroundColor: t.colors.accent, gap: t.spacing.xs }, pressed && styles.buttonPressed]}
                      >
                        <CirclePlus size={16} color={t.colors.textInverse} />
                        <Text style={[styles.primaryButtonText, { color: t.colors.textInverse, fontSize: t.font.body }]}>{i18n('home.no_circles')}</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.emptyTitle, { color: t.colors.text, fontSize: t.font.h3 }]}>{i18n('circles.memberships_empty_title')}</Text>
                      <Text style={[styles.emptySubtitle, { color: t.colors.textMuted, fontSize: t.font.body }]}>{i18n('circles.memberships_empty_subtitle')}</Text>
                    </>
                  )}
                </View>
              </GlassCard>
            )
          }
          ListFooterComponent={
            errorMessage ? (
              <Text style={[styles.errorText, { color: t.colors.accent, fontSize: t.font.small }]}>{errorMessage}</Text>
            ) : null
          }
        />

      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: 130 },
  headerBlock: { marginBottom: 10 },
  segmentedWrap: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 999,
  },
  segmentText: { fontWeight: '700', fontSize: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { fontWeight: '800' },
  subtitle: { },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCard: {
    marginBottom: 10,
    padding: 16,
  },
  circleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  circleMeta: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  circleName: { fontWeight: '700' },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  alertTypesPreview: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  circleCount: { marginTop: 3 },
  badgeRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  toggleButton: {
    marginTop: 16,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  toggleButtonText: { fontWeight: '700' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: { fontWeight: '700' },
  emptySubtitle: { textAlign: 'center' },
  primaryButton: {
    marginTop: 10,
    height: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryButtonText: { fontWeight: '700' },
  errorText: { textAlign: 'center' },
  buttonPressed: { opacity: 0.85 },
});
