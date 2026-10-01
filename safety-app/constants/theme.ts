/**
 * LIQUID GLASS THEME — LIGHT + DARK
 *
 * `lightTheme` and `darkTheme` are the two concrete theme objects.
 * `theme` is an alias for `lightTheme` (kept for backward compatibility).
 * New screens should call `useTheme()` from PreferencesContext and receive
 * the active theme; do not import `theme` directly in new code.
 *
 * `blurTint` must be passed to every BlurView `tint` prop so glass surfaces
 * invert correctly in dark mode.
 *
 * Multi-Agent Note: Single source of truth for styling. Add colors here first.
 */

const shared = {
  radius: { xs: 8, sm: 12, md: 20, lg: 28, pill: 999 },
  spacing: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 },
  font: { h1: 32, h2: 24, h3: 18, body: 16, small: 13, tiny: 11 },
};

export const lightTheme = {
  colors: {
    bg: '#F8FAFC',
    bgGradientStart: '#FFFFFF',
    bgGradientEnd: '#F1F5F9',
    glass: 'rgba(255, 255, 255, 0.45)',
    glassBorder: 'rgba(255, 255, 255, 0.65)',
    glassShadow: 'rgba(15, 23, 42, 0.08)',
    text: '#0F172A',
    textMuted: '#64748B',
    textInverse: '#FFFFFF',
    accent: '#FF3B6B',
    accentGlow: '#FF6B95',
    accentGradient: ['#FF5F7A', '#EF2D5E', '#C31D4B'] as string[],
    safe: '#22C55E',
    warn: '#F59E0B',
    info: '#3B82F6',
    divider: 'rgba(15, 23, 42, 0.06)',
    pill: 'rgba(255, 255, 255, 0.6)',
  },
  blurTint: 'light' as const,
  ...shared,
};

export const darkTheme = {
  colors: {
    bg: '#0F172A',
    bgGradientStart: '#1E293B',
    bgGradientEnd: '#0F172A',
    glass: 'rgba(30, 41, 59, 0.65)',
    glassBorder: 'rgba(255, 255, 255, 0.10)',
    glassShadow: 'rgba(0, 0, 0, 0.50)',
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    textInverse: '#0F172A',
    accent: '#FF3B6B',
    accentGlow: '#FF6B95',
    accentGradient: ['#FF5F7A', '#EF2D5E', '#C31D4B'] as string[],
    safe: '#22C55E',
    warn: '#F59E0B',
    info: '#60A5FA',
    divider: 'rgba(255, 255, 255, 0.08)',
    pill: 'rgba(255, 255, 255, 0.08)',
  },
  blurTint: 'dark' as const,
  ...shared,
};

export const Colors = {
  light: {
    text: lightTheme.colors.text,
    background: lightTheme.colors.bg,
    tint: lightTheme.colors.accent,
    icon: lightTheme.colors.textMuted,
    tabIconDefault: lightTheme.colors.textMuted,
    tabIconSelected: lightTheme.colors.accent,
  },
  dark: {
    text: darkTheme.colors.text,
    background: darkTheme.colors.bg,
    tint: darkTheme.colors.accent,
    icon: darkTheme.colors.textMuted,
    tabIconDefault: darkTheme.colors.textMuted,
    tabIconSelected: darkTheme.colors.accent,
  },
};

// Backward-compat alias — existing screens that import `theme` still work (light mode).
// New screens: import { useTheme } from '@/contexts/PreferencesContext' instead.
export const theme = lightTheme;

export const highContrastTheme = {
  colors: {
    bg: '#000000',
    bgGradientStart: '#000000',
    bgGradientEnd: '#000000',
    glass: '#000000',
    glassBorder: '#FFFFFF',
    glassShadow: '#FFFFFF',
    text: '#FFFFFF',
    textMuted: '#E0E0E0',
    textInverse: '#000000',
    accent: '#FF0000',
    accentGlow: '#FF0000',
    accentGradient: ['#FF0000', '#FF0000', '#FF0000'] as string[],
    safe: '#00FF00',
    warn: '#FFFF00',
    info: '#00FFFF',
    divider: '#FFFFFF',
    pill: '#000000',
  },
  blurTint: 'dark' as const,
  ...shared,
};
