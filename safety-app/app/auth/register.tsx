/**
 * SIGN UP SCREEN — multi-step onboarding wizard
 *
 * Step 1: Name + Age + social auth (Apple / Google) + "already have account"
 * Step 2: Email + Password
 * Step 3: Phone (skippable)
 *
 * Social auth (step 1) bypasses steps 2 & 3 and goes straight to /(tabs).
 */

import React, { useEffect, useRef, useState } from 'react';
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
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  withSequence,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { ChevronLeft, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/contexts/SessionContext';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';
import { ApiError } from '@/services/apiClient';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });

type Step = 1 | 2 | 3;

export default function RegisterScreen() {
  const router = useRouter();
  const t = useTheme();
  const { t: i18n } = useI18n();
  const { register } = useSession();

  const [step, setStep]         = useState<Step>(1);
  const [name, setName]         = useState('');
  const [age, setAge]           = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone]       = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  // ─── Social auth (step 1) ────────────────────────────────────────────────

  const onApple = () => {};

  const onGoogle = () => {};

  // ─── Step nav ────────────────────────────────────────────────────────────
  const nextStep1 = () => {
    if (!name.trim()) { setError(i18n('errors.server').replace('Something went wrong', 'Please enter your name')); return; }
    setError(null);
    setStep(2);
  };

  const nextStep2 = () => {
    if (!email.trim() || !email.includes('@')) { setError(i18n('errors.auth_invalid')); return; }
    if (password.length < 8) { setError(i18n('errors.auth_invalid').replace('Invalid', 'Password must be at least 8 characters.')); return; }
    setError(null);
    setStep(3);
  };

  const finish = async (skipPhone = false) => {
    setError(null);
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, skipPhone ? undefined : phone.trim() || undefined, parseInt(age, 10) || undefined);
      router.replace('/(tabs)');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) setError(i18n('errors.auth_email_taken'));
        else if (e.status === 0) setError(i18n('errors.network'));
        else setError(i18n('errors.server'));
      } else {
        setError(e instanceof Error ? e.message : i18n('errors.server'));
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Shared style helpers ─────────────────────────────────────────────────
  const inputStyle = [
    styles.input,
    { color: t.colors.text, backgroundColor: t.colors.pill, borderColor: t.colors.glassBorder, borderRadius: t.radius.sm },
  ];
  const labelStyle = [styles.label, { color: t.colors.textMuted }];

  const SocialDivider = () => (
    <View style={styles.dividerRow}>
      <View style={[styles.line, { backgroundColor: t.colors.divider }]} />
      <Text style={[styles.orText, { color: t.colors.textMuted }]}>{i18n('auth.or')}</Text>
      <View style={[styles.line, { backgroundColor: t.colors.divider }]} />
    </View>
  );

  const AppleBtn = () => (
    Platform.OS === 'ios' ? (
      <AppleAuthentication.AppleAuthenticationButton
        buttonStyle={
          t.blurTint === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        cornerRadius={t.radius.pill}
        style={styles.socialBtn}
        onPress={onApple}
      />
    ) : null
  );

  const GoogleBtn = () => (
    <Pressable
      onPress={onGoogle}
      disabled={loading}
      style={({ pressed }) => [
        styles.socialBtn,
        styles.googleBtn,
        { borderColor: t.colors.glassBorder, backgroundColor: t.colors.glass, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <BlurView intensity={30} tint={t.blurTint} style={StyleSheet.absoluteFill} />
      <Text style={styles.googleG}>G</Text>
      <Text style={[styles.socialBtnText, { color: t.colors.text }]}>{i18n('auth.continue_google')}</Text>
    </Pressable>
  );

  // ─── Render steps ─────────────────────────────────────────────────────────
  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back button for steps 2 & 3 */}
            {step > 1 && (
              <Pressable onPress={() => { setError(null); setStep((s) => (s - 1) as Step); }} style={styles.backBtn}>
                <ChevronLeft color={t.colors.text} size={22} strokeWidth={2.2} />
                <Text style={[styles.backText, { color: t.colors.text }]}>{i18n('common.back')}</Text>
              </Pressable>
            )}

            {/* ── STEP 1 ── */}
            {step === 1 && (
              <>
              <Animated.View entering={ZoomIn.duration(400).easing(Easing.out(Easing.circle))}>
                <View style={styles.logoWrap}>
                  <BlurView
                    intensity={50} tint={t.blurTint}
                    style={[styles.logoBlur, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.glass }]}
                  >
                    <Shield color={t.colors.accent} size={32} strokeWidth={1.8} />
                  </BlurView>
                  <Text style={[styles.appName, { color: t.colors.text }]}>Guardian Sphere</Text>
                </View>
              </Animated.View>

              <Animated.View entering={ZoomIn.duration(400).easing(Easing.out(Easing.circle)).delay(100)}>
                <BlurView intensity={55} tint={t.blurTint} style={[styles.card, { borderColor: t.colors.glassBorder, borderRadius: t.radius.lg }]}>
                  <View style={[styles.cardInner, { backgroundColor: t.colors.glass }]}>
                    <Text style={[styles.stepTitle, { color: t.colors.text }]}>{i18n('auth.step_account_title')}</Text>
                    <Text style={[styles.stepSub, { color: t.colors.textMuted }]}>{i18n('auth.step_account_sub')}</Text>

                    {error && (
                      <View style={[styles.errorText, { backgroundColor: `${t.colors.accent}14` }]}>
                        <Text style={{ color: t.colors.accent }}>{error}</Text>
                      </View>
                    )}

                    <Text style={labelStyle}>{i18n('circles.member_name')}</Text>
                    <TextInput
                      style={inputStyle}
                      value={name}
                      onChangeText={setName}
                      placeholder="Maria Silva"
                      placeholderTextColor={t.colors.textMuted}
                      autoCapitalize="words"
                      returnKeyType="next"
                      accessibilityLabel={i18n('circles.member_name')}
                    />

                    <Text style={labelStyle}>{i18n('auth.age')}</Text>
                    <TextInput
                      style={inputStyle}
                      value={age}
                      onChangeText={setAge}
                      placeholder="25"
                      placeholderTextColor={t.colors.textMuted}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      accessibilityLabel={i18n('auth.age')}
                    />

                    <Pressable
                      onPress={nextStep1}
                      accessibilityLabel={i18n('auth.continue')}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.primaryBtnWrap, { borderRadius: t.radius.pill, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <LinearGradient
                        colors={t.colors.accentGradient as [string, string, ...string[]]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.primaryBtn}
                      >
                        <Text style={[styles.primaryBtnText, { color: t.colors.textInverse }]}>{i18n('auth.continue')}</Text>
                      </LinearGradient>
                    </Pressable>

                    <SocialDivider />

                    <AppleBtn />
                    <GoogleBtn />

                    <Pressable onPress={() => router.push('/auth/login')} style={styles.switchRow}>
                      <Text style={[styles.switchText, { color: t.colors.textMuted }]}>
                        {i18n('auth.have_account')}{' '}
                        <Text style={[styles.switchLink, { color: t.colors.accent }]}>{i18n('auth.sign_in')}</Text>
                      </Text>
                    </Pressable>
                  </View>
                </BlurView>
              </Animated.View>
              </>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && (
              <Animated.View entering={SlideInRight.duration(350).easing(Easing.out(Easing.circle))} exiting={SlideOutLeft.duration(250)}>
              <BlurView intensity={55} tint={t.blurTint} style={[styles.card, { borderColor: t.colors.glassBorder, borderRadius: t.radius.lg, marginTop: 48 }]}>
                <View style={[styles.cardInner, { backgroundColor: t.colors.glass }]}>
                  <Text style={[styles.stepTitle, { color: t.colors.text }]}>{i18n('auth.step_email_title')}</Text>
                  <Text style={[styles.stepSub, { color: t.colors.textMuted }]}>{i18n('auth.step_email_sub')}</Text>

                  {error && <Text style={[styles.errorText, { color: t.colors.accent }]}>{error}</Text>}

                  <Text style={labelStyle}>{i18n('auth.email')}</Text>
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
                  />

                  <Text style={labelStyle}>{i18n('auth.password')}</Text>
                  <TextInput
                    style={inputStyle}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="8+ characters"
                    placeholderTextColor={t.colors.textMuted}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={nextStep2}
                  />

                  <Pressable
                    onPress={nextStep2}
                    style={({ pressed }) => [styles.primaryBtnWrap, { borderRadius: t.radius.pill, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <LinearGradient
                      colors={t.colors.accentGradient as [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.primaryBtn}
                    >
                      <Text style={styles.primaryBtnText}>{i18n('auth.next')}</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </BlurView>
              </Animated.View>
            )}

            {/* ── STEP 3 ── */}
            {step === 3 && (
              <Animated.View entering={SlideInRight.duration(350).easing(Easing.out(Easing.circle))} exiting={FadeOut.duration(200)}>
              <BlurView intensity={55} tint={t.blurTint} style={[styles.card, { borderColor: t.colors.glassBorder, borderRadius: t.radius.lg, marginTop: 48 }]}>
                <View style={[styles.cardInner, { backgroundColor: t.colors.glass }]}>
                  <Text style={[styles.stepTitle, { color: t.colors.text }]}>{i18n('auth.step_phone_title')}</Text>
                  <Text style={[styles.stepSub, { color: t.colors.textMuted }]}>{i18n('auth.step_phone_sub')}</Text>

                  {error && <Text style={[styles.errorText, { color: t.colors.accent }]}>{error}</Text>}

                  <Text style={labelStyle}>{i18n('circles.member_phone')}</Text>
                  <TextInput
                    style={inputStyle}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+351 912 345 678"
                    placeholderTextColor={t.colors.textMuted}
                    keyboardType="phone-pad"
                    returnKeyType="done"
                  />

                  <Pressable
                    onPress={() => { void finish(false); }}
                    disabled={loading}
                    style={({ pressed }) => [styles.primaryBtnWrap, { borderRadius: t.radius.pill, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <LinearGradient
                      colors={t.colors.accentGradient as [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.primaryBtn}
                    >
                      {loading
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryBtnText}>{i18n('auth.save_phone')}</Text>
                      }
                    </LinearGradient>
                  </Pressable>

                  <Pressable onPress={() => { void finish(true); }} style={styles.switchRow} disabled={loading}>
                    <Text style={[styles.switchText, { color: t.colors.textMuted }]}>
                      {i18n('auth.skip')}
                    </Text>
                  </Pressable>
                </View>
              </BlurView>
              </Animated.View>
            )}

            {/* Step indicator */}
            <View style={styles.dots}>
              {([1, 2, 3] as Step[]).map((s) => (
                <View
                  key={s}
                  style={[
                    styles.dot,
                    { backgroundColor: step === s ? t.colors.accent : t.colors.divider },
                  ]}
                />
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontFamily: FONT, fontSize: 15, fontWeight: '600' },

  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logoBlur: { width: 68, height: 68, borderRadius: 34, overflow: 'hidden', borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  appName: { fontFamily: FONT, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },

  card: { overflow: 'hidden', borderWidth: 1 },
  cardInner: { padding: 24, gap: 4 },

  stepTitle: { fontFamily: FONT, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  stepSub: { fontFamily: FONT, fontSize: 14, marginBottom: 12 },

  errorText: { fontFamily: FONT, fontSize: 13, backgroundColor: 'rgba(255,59,107,0.08)', padding: 10, borderRadius: 8, marginBottom: 8 },

  label: { fontFamily: FONT, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  input: { fontFamily: FONT, fontSize: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },

  primaryBtnWrap: { marginTop: 20, overflow: 'hidden' },
  primaryBtn: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontFamily: FONT, fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  line: { flex: 1, height: 1 },
  orText: { fontFamily: FONT, fontSize: 13, fontWeight: '600' },

  socialBtn: { width: '100%', height: 50, marginTop: 10, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  googleBtn: { flexDirection: 'row', gap: 10, borderWidth: 1 },
  googleG: { fontFamily: FONT, fontSize: 18, fontWeight: '800', color: '#4285F4' },
  socialBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '600' },

  switchRow: { alignItems: 'center', marginTop: 16 },
  switchText: { fontFamily: FONT, fontSize: 14 },
  switchLink: { fontWeight: '700' },

  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
