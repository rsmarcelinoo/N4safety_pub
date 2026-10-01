/**
 * ONBOARDING SCREEN
 *
 * 3-step flow introducing the core product pillars before auth:
 * 1) General safety value proposition
 * 2) Circles and trusted network behavior
 * 3) Dongle integration path
 *
 * Completion persists `n4safety:onboarding:done` so the root guard
 * does not show onboarding again on next launch.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bluetooth, ChevronRight, Shield, Users } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';

const ONBOARDING_KEY = 'n4safety:onboarding:done';

type StepItem = {
  id: 'welcome' | 'circles' | 'dongle';
  title: string;
  description: string;
  icon: 'shield' | 'users' | 'dongle';
};

const STEPS: StepItem[] = [
  {
    id: 'welcome',
    title: 'Your personal safety companion',
    description:
      'N4Safety keeps your trusted contacts close and your emergency flow fast when every second matters.',
    icon: 'shield',
  },
  {
    id: 'circles',
    title: 'Build your safety network',
    description:
      'Your circles receive your location the moment you need help, so they can react in real time.',
    icon: 'users',
  },
  {
    id: 'dongle',
    title: 'Pair the Guardian Sphere dongle',
    description:
      'Use hardware-level SOS for added reliability, including scenarios where phone signal is weak.',
    icon: 'dongle',
  },
];

function StepIcon({ type, accentColor }: { type: StepItem['icon'], accentColor: string }) {
  const iconProps = { size: 42, color: accentColor, strokeWidth: 2.1 as const };
  if (type === 'users') return <Users {...iconProps} />;
  if (type === 'dongle') return <Bluetooth {...iconProps} />;
  return <Shield {...iconProps} />;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const t = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const currentStep = STEPS[stepIndex];

  const progress = useMemo(
    () => `${stepIndex + 1}/${STEPS.length}`,
    [stepIndex],
  );

  const completeOnboarding = async () => {
    try {
      setFinishing(true);
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
      router.replace('/auth/login');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={[styles.content, { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md }]}>
          <View style={styles.header}>
            <Text style={[styles.badge, { color: t.colors.accent, fontSize: t.font.small }]}>N4Safety</Text>
            <Text style={[styles.progress, { color: t.colors.textMuted, fontSize: t.font.small }]}>{progress}</Text>
          </View>

          <GlassCard style={[styles.card, { marginTop: t.spacing.xl }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${t.colors.accent}18`, borderColor: t.colors.glassBorder, marginBottom: t.spacing.md }]}>
              <StepIcon type={currentStep.icon} accentColor={t.colors.accent} />
            </View>
            <Text style={[styles.title, { color: t.colors.text, fontSize: t.font.h2 }]}>{currentStep.title}</Text>
            <Text style={[styles.description, { color: t.colors.textMuted, fontSize: t.font.body, marginTop: t.spacing.sm }]}>{currentStep.description}</Text>
          </GlassCard>

          <View style={[styles.footer, { paddingBottom: t.spacing.sm, gap: t.spacing.md }]}>
            <View style={[styles.dots, { gap: t.spacing.xs }]}>
              {STEPS.map((step, index) => (
                <View
                  key={step.id}
                  style={[styles.dot, { backgroundColor: t.colors.divider }, index === stepIndex && [styles.dotActive, { backgroundColor: t.colors.accent }]]}
                />
              ))}
            </View>

            {currentStep.id !== 'dongle' ? (
              <Pressable
                onPress={() => setStepIndex((prev) => prev + 1)}
                style={({ pressed }) => [styles.primaryButton, { borderRadius: t.radius.md, backgroundColor: t.colors.accent }, pressed && styles.buttonPressed]}
              >
                <Text style={[styles.primaryButtonText, { color: t.colors.textInverse, fontSize: t.font.body }]}>
                  {currentStep.id === 'welcome' ? 'Get Started' : 'Next'}
                </Text>
                <ChevronRight size={16} color={t.colors.textInverse} />
              </Pressable>
            ) : (
              <View style={[styles.finalActions, { gap: t.spacing.sm }]}>
                <Pressable
                  onPress={() => {
                    void completeOnboarding();
                  }}
                  disabled={finishing}
                  style={({ pressed }) => [styles.secondaryButton, { borderRadius: t.radius.md, borderColor: t.colors.glassBorder, backgroundColor: t.colors.pill }, pressed && styles.buttonPressed]}
                >
                  <Text style={[styles.secondaryButtonText, { color: t.colors.text, fontSize: t.font.body }]}>Skip for now</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void completeOnboarding();
                  }}
                  disabled={finishing}
                  style={({ pressed }) => [styles.primaryButton, { borderRadius: t.radius.md, backgroundColor: t.colors.accent }, pressed && styles.buttonPressed]}
                >
                  <Text style={[styles.primaryButtonText, { color: t.colors.textInverse, fontSize: t.font.body }]}>Set Up Dongle</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { fontWeight: '800', letterSpacing: 0.5 },
  progress: { fontWeight: '600' },
  card: { alignItems: 'center' },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: { },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 22,
  },
  finalActions: { },
  primaryButton: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: { fontWeight: '700' },
  secondaryButton: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: { fontWeight: '700' },
  buttonPressed: { opacity: 0.84 },
});
