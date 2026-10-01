/**
 * SCALED TEXT
 *
 * Drop-in replacement for RN `Text` that reads `fontScale` from
 * PreferencesContext and multiplies any `fontSize` found in the style prop.
 *
 * Usage: replace `<Text style={…}>` with `<ScaledText style={…}>` in
 * high-traffic screens to respect the user's font size preference.
 *
 * Multi-Agent Note: Use this component in new UI work. Existing screens
 * can be migrated gradually — no need to change everything at once.
 */

import React from 'react';
import { Text, TextProps, TextStyle, StyleSheet } from 'react-native';
import { usePreferences } from '@/contexts/PreferencesContext';

/**
 * Recursively resolves a style prop (which can be an array, object, number,
 * null, undefined, or false) and multiplies every `fontSize` by the scale.
 */
function scaleTextStyle(
  style: TextProps['style'],
  scale: number,
): TextProps['style'] {
  if (!style) return style;

  // StyleSheet.flatten handles arrays, registered styles, etc.
  const flat: TextStyle = StyleSheet.flatten(style) as TextStyle;

  if (flat.fontSize != null) {
    return { ...flat, fontSize: flat.fontSize * scale };
  }

  return flat;
}

export function ScaledText({ style, ...props }: TextProps) {
  const { fontScale } = usePreferences();

  // When scale is exactly 1.0 skip the work
  if (fontScale === 1.0) {
    return <Text style={style} {...props} />;
  }

  const scaled = scaleTextStyle(style, fontScale);
  return <Text style={scaled} {...props} />;
}
