import React from 'react';
import { Pressable, PressableProps, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '@/contexts/PreferencesContext';
import { LinearGradient } from 'expo-linear-gradient';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

export function Button({ label, variant = 'primary', loading, style, ...props }: ButtonProps) {
  const t = useTheme();
  const isPrimary = variant === 'primary';

  const containerStyle: StyleProp<ViewStyle> = [
    styles.button,
    { borderRadius: t.radius.pill },
    !isPrimary && { backgroundColor: t.colors.pill, borderWidth: 1, borderColor: t.colors.glassBorder },
    style as ViewStyle
  ];

  const content = (
    <Text style={[
        styles.text, 
        { color: isPrimary ? t.colors.textInverse : t.colors.text }
      ]}>
        {label}
    </Text>
  );

  return (
    <Pressable 
      {...props} 
      style={(state) => [
        containerStyle, 
        state.pressed && { opacity: 0.8 }
      ]}
    >
      {isPrimary ? (
        <LinearGradient 
            colors={t.colors.accentGradient as [string, string, ...string[]]}
            style={styles.gradient}
        >
            {content}
        </LinearGradient>
      ) : content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 20 },
  gradient: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  text: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
