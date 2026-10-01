import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations, Language, TranslationKeys } from './translations';

const STORAGE_KEY = 'n4safety:prefs:v1';

interface I18nContextType {
  t: (path: string, vars?: Record<string, string | number>) => string;
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  loading: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const prefs = JSON.parse(stored);
          if (prefs.language && translations[prefs.language as Language]) {
            setLanguageState(prefs.language as Language);
          }
        }
      } catch (e) {
        console.error('Failed to load language', e);
      } finally {
        setLoading(false);
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = async (lang: Language) => {
    try {
      setLanguageState(lang);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      let prefs = stored ? JSON.parse(stored) : {};
      prefs.language = lang;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.error('Failed to save language', e);
    }
  };

  const t = (path: string, vars?: Record<string, string | number>): string => {
    const keys = path.split('.');
    let result: any = translations[language];

    for (const key of keys) {
      if (result && result[key] !== undefined) {
        result = result[key];
      } else {
        // Fallback to English if key missing in current language
        let fallback: any = translations['en'];
        for (const fKey of keys) {
          if (fallback && fallback[fKey] !== undefined) {
            fallback = fallback[fKey];
          } else {
            return path;
          }
        }
        result = fallback;
        break;
      }
    }

    const str = typeof result === 'string' ? result : path;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  };

  return (
    <I18nContext.Provider value={{ t, language, setLanguage, loading }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
