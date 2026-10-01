import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, LogOut } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../components/GlassCard';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useSession } from '@/contexts/SessionContext';

const PRIVACY_STORAGE_KEY = 'n4safety_privacy_v1';

interface PrivacySettings {
  shareContacts: boolean;
  receiveSOS: boolean;
  appNotifications: boolean;
}

const DEFAULT_SETTINGS: PrivacySettings = {
  shareContacts: true,
  receiveSOS: true,
  appNotifications: true,
};

export default function PrivacyScreen() {
  const tTheme = useTheme();
  const router = useRouter();
  const { logout } = useSession();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_STORAGE_KEY).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch (e) {
          console.error("Failed to parse privacy settings", e);
        }
      }
      setLoading(false);
    });
  }, []);

  const updateSetting = async (key: keyof PrivacySettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await AsyncStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(newSettings));
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.replace('/auth/register');
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {loading ? (
           <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
             <ActivityIndicator color={tTheme.colors.accent} />
           </View>
        ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ShieldCheck size={32} color={tTheme.colors.safe} style={styles.headerIcon} />
            <Text style={[styles.title, { color: tTheme.colors.text }]}>Privacy Settings</Text>
            <Text style={[styles.subtitle, { color: tTheme.colors.textMuted }]}>Manage what you share and receive.</Text>
          </View>

          <GlassCard style={styles.card}>
            {[
              {
                id: 'shareContacts' as const,
                title: "Share contacts with circles",
                description: "Allow your circle members to see who else is in the circle."
              },
              {
                id: 'receiveSOS' as const,
                title: "Receive SOS notifications from circles",
                description: "Get alerts when someone in your circle triggers an SOS."
              },
              {
                id: 'appNotifications' as const,
                title: "App notifications",
                description: "Receive general app updates and safety tips."
              }
            ].map((section, index, arr) => (
              <View key={section.id} style={[styles.section, index < arr.length - 1 && { borderBottomColor: tTheme.colors.divider, borderBottomWidth: 1 }]}>
                <View style={styles.textRow}>
                  <Text style={[styles.sectionTitle, { color: tTheme.colors.text }]}>{section.title}</Text>
                  <Text style={[styles.sectionText, { color: tTheme.colors.textMuted }]}>{section.description}</Text>
                </View>
                <Switch
                  value={settings[section.id]}
                  onValueChange={(val) => void updateSetting(section.id, val)}
                  trackColor={{ false: tTheme.colors.divider, true: tTheme.colors.safe }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </GlassCard>

          <Pressable
            disabled={loggingOut}
            onPress={() => void handleLogout()}
            style={({ pressed }) => [
              styles.logoutButton,
              { borderRadius: tTheme.radius.md, borderColor: 'rgba(255,59,107,0.4)', backgroundColor: 'rgba(255,59,107,0.08)' },
              (pressed || loggingOut) && { opacity: 0.85 }
            ]}
          >
            {loggingOut ? (
               <ActivityIndicator color={tTheme.colors.accent} />
            ) : (
               <>
                 <LogOut size={18} color={tTheme.colors.accent} />
                 <Text style={[styles.logoutButtonText, { color: tTheme.colors.accent }]}>Log out</Text>
               </>
            )}
          </Pressable>
        </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
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
  card: { paddingVertical: 0 },
  section: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  textRow: { flex: 1, paddingRight: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 13,
    lineHeight: 18,
  },
  logoutButton: {
    marginTop: 24,
    height: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutButtonText: {
    fontWeight: '700',
    fontSize: 16,
  },
});
