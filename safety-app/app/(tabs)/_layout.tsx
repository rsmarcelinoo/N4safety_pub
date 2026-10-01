import React from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Home, Map, Users, Settings } from 'lucide-react-native';
import { useTheme } from '@/contexts/PreferencesContext';
import { useI18n } from '@/i18n';

function GlassTabBarBackground() {
  const t = useTheme();
  const overlay = t.blurTint === 'dark'
    ? 'rgba(15,23,42,0.65)'
    : 'rgba(255,255,255,0.42)';
  return (
    <View style={styles.tabBarGlassClip}>
      <BlurView intensity={52} tint={t.blurTint} style={StyleSheet.absoluteFill} />
      <View style={[styles.tabBarOverlay, { backgroundColor: overlay }]} />
    </View>
  );
}

function FloatingSOSButton(props: BottomTabBarButtonProps) {
  return (
    <View pointerEvents="box-none" style={styles.sosSlot}>
      {/* @ts-expect-error — React 19 / RN 0.81 ref types diverge on Pressable; safe to suppress */}
      <Pressable
        {...props}
        style={({ pressed }) => [styles.sosPressable, pressed && styles.sosPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open SOS — emergency alert"
      >
        {/* Outer accent ring */}
        <View style={styles.sosRing} />
        <LinearGradient
          colors={['#FF2D55', '#C81940'] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.sosButton}
        >
          <Text style={styles.sosText}>SOS</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const { t: i18n } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: t.colors.text,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: i18n('tabs.home'),
          tabBarLabel: i18n('tabs.home'),
          tabBarIcon: ({ color }) => <Home color={color} size={22} strokeWidth={2.1} />,
        }}
      />
      <Tabs.Screen
        name="location"
        options={{
          title: i18n('tabs.location'),
          tabBarLabel: i18n('tabs.location'),
          tabBarIcon: ({ color }) => <Map color={color} size={22} strokeWidth={2.1} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'SOS',
          tabBarLabel: '',
          tabBarButton: (props) => <FloatingSOSButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: i18n('tabs.circles'),
          tabBarLabel: i18n('tabs.circles'),
          tabBarIcon: ({ color }) => <Users color={color} size={22} strokeWidth={2.1} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: i18n('tabs.settings'),
          tabBarLabel: i18n('tabs.settings'),
          tabBarIcon: ({ color }) => <Settings color={color} size={22} strokeWidth={2.1} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    height: 78,
    borderRadius: 30,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'transparent',
    elevation: 0,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  tabBarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  tabBarGlassClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: 'hidden',
  },
  tabItem: { paddingTop: 10 },
  tabLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6 },

  // SOS button — clean, single-layer design
  sosSlot: {
    flex: 1,
    top: -30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosPressable: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.88,
  },
  sosRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: 'rgba(255,45,85,0.28)',
  },
  sosButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: '#C81940',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  sosText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
