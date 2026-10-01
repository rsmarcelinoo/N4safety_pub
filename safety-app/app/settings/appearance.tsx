import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sun, Moon, Smartphone, Type } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { usePreferences, useTheme, type FontSize, type DarkModePreference } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScaledText } from '@/components/ScaledText';
import { useI18n } from '@/i18n';

const FONT_SIZE_KEYS: FontSize[] = ['Small', 'Medium', 'Large'];

export default function AppearanceSettings() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const { fontSize, setFontSize, darkModePreference, setDarkModePreference, highContrastEnabled, setHighContrastEnabled } = usePreferences();

  const THEME_OPTIONS: {
    value: DarkModePreference;
    label: string;
    Icon: React.ComponentType<{ color: string; size: number; strokeWidth?: number }>;
  }[] = useMemo(() => [
    { value: 'light',  label: i18n('appearance.light'),  Icon: Sun },
    { value: 'system', label: i18n('appearance.system'), Icon: Smartphone },
    { value: 'dark',   label: i18n('appearance.dark'),   Icon: Moon },
  ], [i18n]);

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: t.colors.text }]}>{i18n('appearance.title')}</Text>

          {/* High Contrast Mode */}
          <GlassCard style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.sectionTitle, { color: t.colors.text }]}>{i18n('appearance.high_contrast')}</Text>
                <Switch
                    value={highContrastEnabled}
                    onValueChange={(val) => void setHighContrastEnabled(val)}
                    trackColor={{ false: t.colors.divider, true: t.colors.accent }}
                    thumbColor={t.colors.textInverse}
                />
            </View>
          </GlassCard>

          {/* Color theme */}
          <GlassCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: t.colors.text }]}>{i18n('appearance.theme_header')}</Text>
            <Text style={[styles.sectionSub, { color: t.colors.textMuted }]}>
              {i18n('appearance.theme_desc')}
            </Text>

            <View style={styles.themeRow}>
              {THEME_OPTIONS.map(({ value, label, Icon }) => {
                const active = darkModePreference === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => void setDarkModePreference(value)}
                    style={({ pressed }) => [
                      styles.themeCard,
                      {
                        borderColor: active ? t.colors.accent : t.colors.glassBorder,
                        backgroundColor: active ? `${t.colors.accent}14` : t.colors.pill,
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Icon
                      color={active ? t.colors.accent : t.colors.textMuted}
                      size={22}
                      strokeWidth={active ? 2.4 : 1.8}
                    />
                    <Text style={[
                      styles.themeCardLabel,
                      { color: active ? t.colors.accent : t.colors.textMuted, fontWeight: active ? '700' : '500' },
                    ]}>
                      {label}
                    </Text>
                    {active && (
                      <View style={[styles.activeIndicator, { backgroundColor: t.colors.accent }]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </GlassCard>

          {/* Font size */}
          <GlassCard style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Type color={t.colors.textMuted} size={18} strokeWidth={1.8} />
              <Text style={[styles.sectionTitle, { color: t.colors.text }]}>{i18n('appearance.font_header')}</Text>
            </View>
            <Text style={[styles.sectionSub, { color: t.colors.textMuted }]}>
              {i18n('appearance.font_desc')}
            </Text>

            <View style={[styles.fontToggleContainer, { backgroundColor: t.colors.divider }]}>
              {FONT_SIZE_KEYS.map((size) => {
                const isActive = fontSize === size;
                const labelKey = size === 'Small' ? 'appearance.font_small' : size === 'Large' ? 'appearance.font_large' : 'appearance.font_medium';
                return (
                  <Pressable
                    key={size}
                    onPress={() => void setFontSize(size)}
                    style={[styles.fontTogglePill, isActive && { backgroundColor: t.colors.glass }]}
                  >
                    <Text style={[
                      styles.fontToggleText,
                      { color: isActive ? t.colors.text : t.colors.textMuted },
                      isActive && { fontWeight: '700' },
                      size === 'Small' && { fontSize: 12 },
                      size === 'Large' && { fontSize: 17 },
                    ]}>
                      {i18n(labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.previewBox, { borderColor: t.colors.divider, backgroundColor: t.colors.pill }]}>
              <Text style={[styles.previewLabel, { color: t.colors.textMuted }]}>{i18n('appearance.preview_label')}</Text>
              <ScaledText style={[
                styles.previewText,
                { color: t.colors.text },
                fontSize === 'Small' && { fontSize: 13 },
                fontSize === 'Large' && { fontSize: 19 },
              ]}>
                {i18n('appearance.preview_text')}
              </ScaledText>
            </View>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 100 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 24 },
  card: { marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  sectionSub: { fontSize: 13, marginBottom: 18, lineHeight: 18 },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, borderRadius: 16, borderWidth: 1.5,
    gap: 6, position: 'relative',
  },
  themeCardLabel: { fontSize: 12 },
  activeIndicator: {
    position: 'absolute', bottom: 8, width: 20, height: 3, borderRadius: 2,
  },
  fontToggleContainer: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 24, marginBottom: 12 },
  fontTogglePill: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 20 },
  fontToggleText: { fontSize: 15 },
  previewBox: { borderWidth: 1, borderRadius: 12, padding: 14 },
  previewLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  previewText: { fontSize: 16, lineHeight: 22 },
});
