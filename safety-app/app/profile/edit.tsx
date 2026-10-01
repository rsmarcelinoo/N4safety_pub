/**
 * PROFILE EDIT SCREEN
 *
 * Allows users to update their name, age, and phone number.
 * Syncs with the backend via SessionContext.updateProfile.
 */

import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User, Phone, Calendar, Save } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { useTheme } from '@/contexts/PreferencesContext';
import { useSession } from '@/contexts/SessionContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';
import { ApiError } from '@/services/apiClient';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });

export default function ProfileEditScreen() {
  const t = useTheme();
  const { t: i18n } = useI18n();
  const router = useRouter();
  const { session, updateProfile } = useSession();

  const [name, setName]       = useState(session?.name ?? '');
  const [phone, setPhone]     = useState(session?.phone ?? '');
  const [age, setAge]         = useState(''); // Age is short? in backend
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we had a more detailed user object from an API call, we'd load it here.
    // For now, session has name and phone.
  }, []);

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert(i18n('common.error'), 'Name is required.');
      return;
    }

    setLoading(true);
    try {
      const patch: { name: string; phone?: string; age?: number } = {
        name: name.trim(),
        phone: phone.trim() || undefined,
      };
      
      if (age.trim()) {
        const ageNum = parseInt(age.trim(), 10);
        if (isNaN(ageNum) || ageNum < 1 || ageNum > 150) {
          Alert.alert(i18n('common.error'), 'Enter a valid age (1-150).');
          setLoading(false);
          return;
        }
        patch.age = ageNum;
      }

      await updateProfile(patch);
      Alert.alert(i18n('common.success'), i18n('account.profile_updated'));
      router.back();
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = e.status === 400 ? 'Invalid value. Age must be 13-150.' : i18n('errors.server');
        Alert.alert(i18n('common.error'), msg);
      } else {
        Alert.alert(i18n('common.error'), e instanceof Error ? e.message : i18n('errors.server'));
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: t.colors.text, backgroundColor: t.colors.pill, borderColor: t.colors.glassBorder, borderRadius: t.radius.sm },
  ];

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: t.colors.text }]}>{i18n('settings.edit_profile')}</Text>

            {/* Avatar Placeholder */}
            <View style={styles.avatarWrap}>
              <View style={[styles.avatar, { backgroundColor: t.colors.accent + '20', borderColor: t.colors.accent + '40' }]}>
                <Text style={[styles.avatarText, { color: t.colors.accent }]}>
                  {name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </Text>
              </View>
              <Text style={[styles.email, { color: t.colors.textMuted }]}>{session?.email}</Text>
            </View>

            <GlassCard style={styles.formCard}>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <User size={14} color={t.colors.textMuted} />
                  <Text style={[styles.label, { color: t.colors.textMuted }]}>{i18n('circles.member_name')}</Text>
                </View>
                <TextInput
                  style={inputStyle}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your Name"
                  placeholderTextColor={t.colors.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Phone size={14} color={t.colors.textMuted} />
                  <Text style={[styles.label, { color: t.colors.textMuted }]}>{i18n('circles.member_phone')}</Text>
                </View>
                <TextInput
                  style={inputStyle}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+351 912 345 678"
                  placeholderTextColor={t.colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Calendar size={14} color={t.colors.textMuted} />
                  <Text style={[styles.label, { color: t.colors.textMuted }]}>{i18n('account.age')}</Text>
                </View>
                <TextInput
                  style={inputStyle}
                  value={age}
                  onChangeText={setAge}
                  placeholder="e.g. 25"
                  placeholderTextColor={t.colors.textMuted}
                  keyboardType="number-pad"
                />
              </View>
            </GlassCard>

            <Pressable
              onPress={onSave}
              disabled={loading}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: t.colors.accent, borderRadius: t.radius.md, opacity: pressed || loading ? 0.8 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Save color="#fff" size={20} />
                  <Text style={styles.saveBtnText}>{i18n('common.save')}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 100 },
  title: { fontFamily: FONT, fontSize: 32, fontWeight: '800', marginBottom: 24 },
  
  avatarWrap: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontFamily: FONT, fontSize: 28, fontWeight: '700' },
  email: { fontFamily: FONT, fontSize: 15, fontWeight: '500' },

  formCard: { padding: 20, gap: 20 },
  inputGroup: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 2 },
  label: { fontFamily: FONT, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontFamily: FONT, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, marginTop: 24 },
  saveBtnText: { fontFamily: FONT, fontSize: 17, fontWeight: '700', color: '#fff' },
});
