/**
 * LOGIN SCREEN — returning users
 *
 * Email + password sign-in.
 * "Create account" routes to the multi-step sign-up wizard.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/contexts/SessionContext';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';
import { ApiError } from '@/services/apiClient';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });

export default function LoginScreen() {
  const router = useRouter();
  const t = useTheme();
  const { t: i18n } = useI18n();
  const { login } = useSession();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) setError(i18n('errors.auth_invalid'));
        else if (e.status === 0) setError(i18n('errors.network'));
        else setError(i18n('errors.server'));
      } else {
        setError(e instanceof Error ? e.message : i18n('errors.server'));
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
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoWrap}>
              <BlurView
                intensity={50} tint={t.blurTint}
                style={[styles.logoBlur, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.glass }]}
              >
                <Shield color={t.colors.accent} size={32} strokeWidth={1.8} />
              </BlurView>
              <Text style={[styles.appName, { color: t.colors.text }]}>Guardian Sphere</Text>
              <Text style={[styles.tagline, { color: t.colors.textMuted }]}>{i18n('home.subtitle')}</Text>
            </View>

            <BlurView intensity={55} tint={t.blurTint} style={[styles.card, { borderColor: t.colors.glassBorder, borderRadius: t.radius.lg }]}>
              <View style={[styles.cardInner, { backgroundColor: t.colors.glass }]}>
                {error && (
                  <View style={[styles.errorText, { backgroundColor: `${t.colors.accent}14` }]}>
                    <Text style={{ color: t.colors.accent }}>{error}</Text>
                  </View>
                )}

                <Text style={[styles.label, { color: t.colors.textMuted }]}>{i18n('auth.email')}</Text>
                <TextInput
                  style={inputStyle}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={t.colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  accessibilityLabel={i18n('auth.email')}
                />

                <Text style={[styles.label, { color: t.colors.textMuted }]}>{i18n('auth.password')}</Text>
                <TextInput
                  style={inputStyle}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={t.colors.textMuted}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={onLogin}
                  accessibilityLabel={i18n('auth.password')}
                />

                <Pressable
                  onPress={onLogin}
                  disabled={loading}
                  accessibilityLabel={i18n('auth.sign_in')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.primaryBtnWrap, { borderRadius: t.radius.pill, opacity: pressed ? 0.85 : 1 }]}
                >
                  <LinearGradient
                    colors={t.colors.accentGradient as [string, string, ...string[]]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.primaryBtn}
                  >
                    {loading
                      ? <ActivityIndicator color={t.colors.textInverse} />
                      : <Text style={[styles.primaryBtnText, { color: t.colors.textInverse }]}>{i18n('auth.sign_in')}</Text>
                    }
                  </LinearGradient>
                </Pressable>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={[styles.line, { backgroundColor: t.colors.divider }]} />
                  <Text style={[styles.orText, { color: t.colors.textMuted }]}>{i18n('auth.or')}</Text>
                  <View style={[styles.line, { backgroundColor: t.colors.divider }]} />
                </View>

                {/* Aesthetic Social Buttons */}
                <Pressable
                  onPress={() => console.log('Aesthetic Apple button pressed')}
                  style={[styles.socialBtn, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.pill }]}
                >
                  <Text style={[styles.socialBtnText, { color: t.colors.text }]}>Continue with Apple</Text>
                </Pressable>

                <Pressable
                  onPress={() => console.log('Aesthetic Google button pressed')}
                  style={[styles.socialBtn, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.pill }]}
                >
                  <Text style={[styles.socialBtnText, { color: t.colors.text }]}>{i18n('auth.sign_in_google')}</Text>
                </Pressable>

                <Pressable onPress={() => router.push('/auth/register')} style={styles.switchRow}>
                  <Text style={[styles.switchText, { color: t.colors.textMuted }]}>
                    {i18n('auth.no_account')}{' '}
                    <Text style={[styles.switchLink, { color: t.colors.accent }]}>{i18n('auth.create_account')}</Text>
                  </Text>
                </Pressable>
              </View>
            </BlurView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll:        { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap:      { alignItems: 'center', marginBottom: 32 },
  logoBlur:      { width: 72, height: 72, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14, overflow: 'hidden' },
  appName:       { fontFamily: FONT, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  tagline:       { fontFamily: FONT, fontSize: 14 },
  card:          { borderWidth: 1, overflow: 'hidden' },
  cardInner:     { padding: 24 },
  errorText:     { borderRadius: 10, padding: 12, marginBottom: 16 },
  label:         { fontFamily: FONT, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input:         { height: 48, paddingHorizontal: 14, fontSize: 15, borderWidth: 1 },
  primaryBtnWrap:{ marginTop: 24, overflow: 'hidden' },
  primaryBtn:    { height: 52, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText:{ fontFamily: FONT, fontSize: 16, fontWeight: '700' },
  dividerRow:    { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  line:          { flex: 1, height: 1 },
  orText:        { fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  socialBtn:     { width: '100%', height: 50, marginTop: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  socialBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '600' },
  switchRow:     { alignItems: 'center', marginTop: 20 },
  switchText:    { fontFamily: FONT, fontSize: 14 },
  switchLink:    { fontWeight: '700' },
});
