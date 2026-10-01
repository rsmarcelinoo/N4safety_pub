import React from 'react';
import { Text, TextProps, TextStyle, StyleSheet } from 'react-native';
import { useTheme, usePreferences } from '@/contexts/PreferencesContext';

export function ThemedText({ style, ...props }: TextProps) {
  const t = useTheme();
  const { fontScale } = usePreferences();
  
  const baseStyle: TextStyle = { color: t.colors.text };
  const flatStyle = StyleSheet.flatten(style) || {};

  const scaledStyle = {
    ...baseStyle,
    ...flatStyle,
    fontSize: (flatStyle.fontSize || 16) * fontScale,
  };

  return <Text style={scaledStyle} {...props} />;
}
