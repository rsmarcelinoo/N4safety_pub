import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Navigation, Info } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { getCurrentLocation, reverseGeocode } from '../../services/locationService';
import type { Coordinates } from '@/types/location';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';

export default function CurrentLocationScreen() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const currentCoords = await getCurrentLocation();
        setCoords(currentCoords);

        const readableAddress = await reverseGeocode(currentCoords);
        setAddress(readableAddress);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : i18n('errors.server'));
      } finally {
        setLoading(false);
      }
    })();
  }, [i18n]);

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: `${t.colors.info}18` }]}>
              <MapPin color={t.colors.info} size={28} strokeWidth={2.4} />
            </View>
            <Text style={[styles.title, { color: t.colors.text }]}>{i18n('location.title')}</Text>
            <Text style={[styles.subtitle, { color: t.colors.textMuted }]}>{i18n('location.subtitle')}</Text>
          </View>

          {loading ? (
            <GlassCard style={styles.loadingCard}>
              <ActivityIndicator size="large" color={t.colors.accent} />
              <Text style={[styles.loadingText, { color: t.colors.textMuted }]}>{i18n('common.loading')}</Text>
            </GlassCard>
          ) : errorMsg ? (
            <GlassCard style={styles.errorCard}>
              <Info color={t.colors.accent} size={24} />
              <Text style={[styles.errorText, { color: t.colors.accent }]}>{errorMsg}</Text>
            </GlassCard>
          ) : (
            <View>
              <GlassCard style={styles.dataCard}>
                <View style={styles.coordRow}>
                  <View style={styles.coordItem}>
                    <Text style={[styles.coordLabel, { color: t.colors.textMuted }]}>{i18n('location.latitude')}</Text>
                    <Text style={[styles.coordValue, { color: t.colors.text }]}>{coords?.latitude.toFixed(6)}</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: t.colors.divider }]} />
                  <View style={styles.coordItem}>
                    <Text style={[styles.coordLabel, { color: t.colors.textMuted }]}>{i18n('location.longitude')}</Text>
                    <Text style={[styles.coordValue, { color: t.colors.text }]}>{coords?.longitude.toFixed(6)}</Text>
                  </View>
                </View>
                
                <View style={styles.metaRow}>
                  <Navigation size={14} color={t.colors.textMuted} />
                  <Text style={[styles.metaText, { color: t.colors.textMuted }]}>
                    {i18n('location.accuracy')}: Balanced Mode
                  </Text>
                </View>
              </GlassCard>

              {address && (
                <GlassCard style={styles.addressCard}>
                  <Text style={[styles.coordLabel, { color: t.colors.textMuted }]}>{i18n('location.address')}</Text>
                  <Text style={[styles.addressText, { color: t.colors.text }]}>{address}</Text>
                </GlassCard>
              )}
            </View>
          )}

          <GlassCard style={[styles.noteCard, { backgroundColor: t.colors.bgGradientEnd }]}>
            <View style={styles.noteHeader}>
              <Info size={18} color={t.colors.info} />
              <Text style={[styles.noteTitle, { color: t.colors.info }]}>{i18n('location.note_title')}</Text>
            </View>
            <Text style={[styles.noteText, { color: t.colors.textMuted }]}>
              {i18n('location.note_text')}
            </Text>
          </GlassCard>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 10, flex: 1 },
  header: { marginBottom: 32, alignItems: 'center' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
  },
  loadingCard: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600',
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  dataCard: {
    padding: 24,
    marginBottom: 20,
  },
  addressCard: {
    padding: 20,
    marginBottom: 20,
  },
  addressText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 22,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coordItem: {
    flex: 1,
    alignItems: 'center',
  },
  coordLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  coordValue: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  divider: {
    width: 1,
    height: 40,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noteCard: {
    padding: 20,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
