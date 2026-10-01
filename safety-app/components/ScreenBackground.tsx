import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/PreferencesContext';

interface ScreenBackgroundProps {
  children: React.ReactNode;
}

/**
 * SCREEN BACKGROUND WRAPPER
 * 
 * Logic:
 * - Applies a theme-aware LinearGradient as the base layer.
 * - Renders two decorative blobs (accent and info) with 20% opacity.
 * - Used as the root wrapper for all screens to ensure visual consistency.
 */
export function ScreenBackground({ children }: ScreenBackgroundProps) {
  const t = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <LinearGradient
        colors={[t.colors.bgGradientStart, t.colors.bgGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Decorative Blobs */}
      <View style={[
        styles.blob, 
        { 
          backgroundColor: t.colors.info, 
          top: -60, 
          left: -40,
          opacity: 0.12 
        }
      ]} />
      <View style={[
        styles.blob, 
        { 
          backgroundColor: t.colors.accent, 
          bottom: 120, 
          right: -60,
          opacity: 0.12 
        }
      ]} />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  blob: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
});
