/**
 * PREFERENCES CONTEXT
 *
 * Provides app-wide user preferences (font size, dark mode override, high contrast).
 * Reads from AsyncStorage key `n4safety:prefs:v1` on mount.
 * Exposes setters that persist back to AsyncStorage and update React state.
 *
 * Multi-Agent Note: All agents should import `usePreferences()` for font
 * scaling, dark mode, and high contrast. Do NOT read `n4safety:prefs:v1` directly elsewhere.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, highContrastTheme } from '@/constants/theme';

const PREFS_KEY = 'n4safety:prefs:v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FontSize = 'Small' | 'Medium' | 'Large';
export type DarkModePreference = 'system' | 'light' | 'dark';

const FONT_SCALE: Record<FontSize, number> = {
  Small:  0.88,
  Medium: 1.0,
  Large:  1.18,
};

export interface PreferencesContextValue {
  fontSize: FontSize;
  fontScale: number;
  setFontSize: (size: FontSize) => Promise<void>;
  darkModePreference: DarkModePreference;
  setDarkModePreference: (pref: DarkModePreference) => Promise<void>;
  highContrastEnabled: boolean;
  setHighContrastEnabled: (enabled: boolean) => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const PreferencesContext = createContext<PreferencesContextValue>({
  fontSize: 'Medium',
  fontScale: 1.0,
  setFontSize: async () => {},
  darkModePreference: 'light',
  setDarkModePreference: async () => {},
  highContrastEnabled: false,
  setHighContrastEnabled: async () => {},
});

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}

/** Returns the active theme object based on user preference + system scheme. */
export function useTheme() {
  const { darkModePreference, highContrastEnabled } = usePreferences();
  const systemScheme = useColorScheme();
  
  if (highContrastEnabled) return highContrastTheme;
  
  const resolved = darkModePreference === 'system' ? systemScheme : darkModePreference;
  return resolved === 'dark' ? darkTheme : lightTheme;
}

// ─── Provider ────────────────────────────────────────────────────────────────

interface PrefsState {
  fontSize: FontSize;
  darkModePreference: DarkModePreference;
  highContrastEnabled?: boolean;
  language?: string;
  [key: string]: unknown;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>('Medium');
  const [darkModePreference, setDarkModePrefState] = useState<DarkModePreference>('light');
  const [highContrastEnabled, setHighContrastEnabledState] = useState<boolean>(false);

  // Read preferences from AsyncStorage on mount
  useEffect(() => {
    void AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const prefs = JSON.parse(raw) as Partial<PrefsState>;
        if (prefs.fontSize && ['Small', 'Medium', 'Large'].includes(prefs.fontSize)) {
          setFontSizeState(prefs.fontSize);
        }
        if (prefs.darkModePreference && ['system', 'light', 'dark'].includes(prefs.darkModePreference)) {
          setDarkModePrefState(prefs.darkModePreference);
        }
        if (typeof prefs.highContrastEnabled === 'boolean') {
          setHighContrastEnabledState(prefs.highContrastEnabled);
        }
      } catch {
        // Corrupted storage — keep defaults
      }
    });
  }, []);

  // Merge a partial update into the stored prefs object
  const mergePrefs = useCallback(async (patch: Partial<PrefsState>) => {
    try {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      const prefs: PrefsState = raw ? (JSON.parse(raw) as PrefsState) : { fontSize: 'Medium', darkModePreference: 'light', highContrastEnabled: false };
      const merged = { ...prefs, ...patch };
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(merged));
    } catch {
      // Storage write failure — state was already updated optimistically
    }
  }, []);

  const setFontSize = useCallback(async (size: FontSize) => {
    setFontSizeState(size);
    await mergePrefs({ fontSize: size });
  }, [mergePrefs]);

  const setDarkModePreference = useCallback(async (pref: DarkModePreference) => {
    setDarkModePrefState(pref);
    await mergePrefs({ darkModePreference: pref });
  }, [mergePrefs]);

  const setHighContrastEnabled = useCallback(async (enabled: boolean) => {
    setHighContrastEnabledState(enabled);
    await mergePrefs({ highContrastEnabled: enabled });
  }, [mergePrefs]);

  const fontScale = FONT_SCALE[fontSize];

  return (
    <PreferencesContext.Provider
      value={{ fontSize, fontScale, setFontSize, darkModePreference, setDarkModePreference, highContrastEnabled, setHighContrastEnabled }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}
