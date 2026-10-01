import React, { useEffect } from 'react';
import { BlurView } from 'expo-blur';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { useTheme } from '@/contexts/PreferencesContext';

export function GlassCard({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
    const t = useTheme();
    const shimmer = useSharedValue(0);

    useEffect(() => {
        shimmer.value = withRepeat(
            withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        const opacity = interpolate(shimmer.value, [0, 1], [0.05, 0.15]);
        return { opacity };
    });

    return (
        <View style={[styles.shadowWrapper, { shadowColor: t.colors.glassShadow }, style]}>
            <View style={[styles.container, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.glass, borderRadius: t.radius.lg }]}>
                <BlurView intensity={50} tint={t.blurTint} style={StyleSheet.absoluteFill} />
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, animatedStyle]} />
                <View style={[styles.inner, { padding: t.spacing.lg }]}>{children}</View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    shadowWrapper: {
        shadowOpacity: 1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 5,
    },
    container: {
        overflow: 'hidden',
        borderWidth: 1,
    },
    inner: { 
    },
});
