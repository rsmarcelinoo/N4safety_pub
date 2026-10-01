/**
 * ACCOUNT SETTINGS SCREEN
 *
 * Privacy controls, notification preferences, and sign-out.
 * Persists to AsyncStorage key n4safety_account_prefs_v1.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Bell, LogOut, Share2, Shield, ShieldOff } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { useTheme } from '@/contexts/PreferencesContext';
import { useSession } from '@/contexts/SessionContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';

const PREFS_KEY = 'n4safety_account_prefs_v1';
const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });

interface AccountPrefs {
  shareContacts: boolean;
  receiveSOSAlerts: boolean;
  appNotifications: boolean;
}

const DEFAULTS: AccountPrefs = {
  shareContacts: true,
  receiveSOSAlerts: true,
  appNotifications: true,
};

function SectionHeader({ label }: { label: string }) {
  const t = useTheme();
  return (
    <Text style={[styles.sectionHeader, { color: t.colors.textMuted }]}>{label.toUpperCase()}</Text>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  sub,
  value,
  onChange,
  danger,
}: {
  icon: React.ComponentType<{ color: string; size: number; strokeWidth?: number }>;
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[styles.toggleRow, { borderTopColor: t.colors.divider }]}>
      <View style={[styles.iconWrap, { backgroundColor: danger ? 'rgba(255,59,107,0.12)' : `${t.colors.info}18` }]}>
        <Icon color={danger ? t.colors.accent : t.colors.info} size={18} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[styles.toggleLabel, { color: t.colors.text }]}>{label}</Text>
        <Text style={[styles.toggleSub, { color: t.colors.textMuted }]}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: t.colors.divider, true: t.colors.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function AccountSettingsScreen() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const router = useRouter();
  const { logout } = useSession();
  const [prefs, setPrefs] = useState<AccountPrefs>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (!raw) return;
      try { setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<AccountPrefs>) }); } catch { /* ignore */ }
    });
  }, []);

  const update = async (patch: Partial<AccountPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };

  const confirmLogout = () => {
    Alert.alert(
      i18n('account.sign_out'),
      i18n('account.sign_out_confirm'),
      [
        { text: i18n('common.cancel'), style: 'cancel' },
        {
          text: i18n('account.sign_out'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth/register');
          },
        },
      ],
    );
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: t.colors.text }]}>{i18n('account.title')}</Text>

          {/* Privacy */}
          <SectionHeader label={i18n('account.privacy_header')} />
          <GlassCard style={{ padding: 0 }}>
            <ToggleRow
              icon={Share2}
              label={i18n('account.contact_sharing')}
              sub={i18n('account.contact_sharing_desc')}
              value={prefs.shareContacts}
              onChange={(v) => { void update({ shareContacts: v }); }}
            />
            <ToggleRow
              icon={ShieldOff}
              label={i18n('account.receive_sos')}
              sub={i18n('account.receive_sos_desc')}
              value={prefs.receiveSOSAlerts}
              onChange={(v) => { void update({ receiveSOSAlerts: v }); }}
            />
          </GlassCard>

          {/* Notifications */}
          <SectionHeader label={i18n('account.notifications_header')} />
          <GlassCard style={{ padding: 0 }}>
            <ToggleRow
              icon={Bell}
              label={i18n('account.app_notifications')}
              sub={i18n('account.app_notifications_desc')}
              value={prefs.appNotifications}
              onChange={(v) => { void update({ appNotifications: v }); }}
            />
            <View style={[styles.noteRow, { borderTopColor: t.colors.divider }]}>
              <Shield size={14} color={t.colors.textMuted} strokeWidth={2} />
              <Text style={[styles.noteText, { color: t.colors.textMuted }]}>
                {i18n('account.sos_note')}
              </Text>
            </View>
          </GlassCard>

          {/* Sign out */}
          <SectionHeader label={i18n('account.session_header')} />
          <Pressable
            onPress={confirmLogout}
            style={({ pressed }) => [styles.logoutBtn, { borderColor: 'rgba(255,59,107,0.35)', backgroundColor: 'rgba(255,59,107,0.08)', opacity: pressed ? 0.8 : 1 }]}
          >
            <LogOut color={t.colors.accent} size={18} strokeWidth={2.2} />
            <Text style={[styles.logoutText, { color: t.colors.accent }]}>{i18n('account.sign_out')}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 120 },
  title: { fontFamily: FONT, fontSize: 32, fontWeight: '800', marginBottom: 24 },
  sectionHeader: { fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginLeft: 12, marginTop: 24 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  toggleLabel: { fontFamily: FONT, fontSize: 15, fontWeight: '600' },
  toggleSub: { fontFamily: FONT, fontSize: 12, marginTop: 2 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1 },
  noteText: { fontFamily: FONT, fontSize: 12, flex: 1, lineHeight: 16 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 16, borderWidth: 1,
  },
  logoutText: { fontFamily: FONT, fontSize: 16, fontWeight: '700' },
});
