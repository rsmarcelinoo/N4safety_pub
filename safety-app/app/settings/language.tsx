import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Languages } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { useI18n } from '../../i18n';
import { useTheme } from '@/contexts/PreferencesContext';
import { Language } from '../../i18n/translations';
import { ScreenBackground } from '@/components/ScreenBackground';

const LANGUAGES: { id: Language; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'pt', label: 'Portuguese', native: 'Português' },
  { id: 'es', label: 'Spanish', native: 'Español' },
  { id: 'fr', label: 'French', native: 'Français' },
  { id: 'it', label: 'Italian', native: 'Italiano' },
  { id: 'de', label: 'German', native: 'Deutsch' },
];

export default function LanguageScreen() {
  const { t, language: selectedId, setLanguage, loading } = useI18n();
  const tTheme = useTheme();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tTheme.colors.accent} />
      </View>
    );
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Languages size={32} color={tTheme.colors.info} style={styles.headerIcon} />
            <Text style={[styles.title, { color: tTheme.colors.text }]}>{t('language.title')}</Text>
            <Text style={[styles.subtitle, { color: tTheme.colors.textMuted }]}>{t('language.subtitle')}</Text>
          </View>

          <GlassCard style={styles.card}>
            {LANGUAGES.map((lang, index) => {
              const isSelected = selectedId === lang.id;
              return (
                <React.Fragment key={lang.id}>
                  <Pressable
                    onPress={() => setLanguage(lang.id)}
                    style={({ pressed }) => [
                      styles.langRow,
                      pressed && styles.pressed,
                      isSelected && styles.selectedRow
                    ]}
                  >
                    <View style={styles.langTextContainer}>
                      <Text style={[styles.langLabel, { color: tTheme.colors.text }, isSelected && { color: tTheme.colors.text }]}>
                        {lang.label}
                      </Text>
                      <Text style={[styles.langNative, { color: tTheme.colors.textMuted }]}>{lang.native}</Text>
                    </View>
                    {isSelected && <Check size={20} color={tTheme.colors.accent} strokeWidth={3} />}
                  </Pressable>
                  {index < LANGUAGES.length - 1 && <View style={[styles.divider, { backgroundColor: tTheme.colors.divider }]} />}
                </React.Fragment>
              );
            })}
          </GlassCard>

          <View style={styles.infoBox}>
            <Text style={[styles.infoText, { color: tTheme.colors.textMuted }]}>
              {t('language.info')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  header: { marginBottom: 24, alignItems: 'center' },
  headerIcon: { marginBottom: 12 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  card: { padding: 0 },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.3)' },
  selectedRow: { backgroundColor: 'rgba(255,255,255,0.15)' },
  langTextContainer: { flex: 1 },
  langLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  langNative: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
  },
  infoBox: {
    marginTop: 24,
    paddingHorizontal: 10,
  },
  infoText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
