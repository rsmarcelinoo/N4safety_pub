/**
 * TOAST COMPONENT
 *
 * A reusable in-screen notification that slides in from the top.
 * Primarily used for non-interruptive feedback like "Report submitted".
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { CheckCircle, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/contexts/PreferencesContext';

const FONT = Platform.select({ ios: 'System', android: 'sans-serif' });

interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onHide: () => void;
  duration?: number;
}

export function Toast({ visible, message, type = 'success', onHide, duration = 3000 }: ToastProps) {
  const t = useTheme();
  const translateY = useRef(new Animated.Value(-100)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.spring(translateY, {
        toValue: 60,
        useNativeDriver: true,
        tension: 40,
        friction: 7,
      }).start();

      const timer = setTimeout(() => {
        hide();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      hide();
    }
  }, [visible]);

  const hide = () => {
    Animated.timing(translateY, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setRendered(false);
      onHide();
    });
  };

  if (!rendered) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle size={18} color={t.colors.accent} />;
      case 'error':   return <AlertCircle size={18} color={t.colors.accent} />;
      default:        return <CheckCircle size={18} color={t.colors.info} />;
    }
  };

  const backgroundColor = type === 'success' 
    ? 'rgba(255,59,107,0.12)' // Glass variant of accent
    : 'rgba(255,255,255,0.1)';

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <BlurView intensity={60} tint={t.blurTint} style={[styles.toast, { borderColor: t.colors.glassBorder, backgroundColor }]}>
        <View style={styles.content}>
          {getIcon()}
          <Text style={[styles.message, { color: t.colors.text }]}>{message}</Text>
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 99,
    borderWidth: 1,
    minWidth: 200,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  message: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '600',
  },
});
