import { useEffect, useRef } from 'react';
import { Pressable, Text, StyleSheet, Animated, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../constants/theme';

export function SOSButton() {
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
            ])
        ).start();
    }, [pulse]);

    const onPress = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.ring, { transform: [{ scale: pulse }] }]} />
            <Pressable onPress={onPress} style={styles.btn}>
                <Text style={styles.label}>SOS</Text>
                <Text style={styles.sub}>Hold to activate</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center', height: 240 },
    ring: {
        position: 'absolute', width: 220, height: 220, borderRadius: 110,
        backgroundColor: theme.colors.accent, opacity: 0.25,
    },
    btn: {
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: theme.colors.accent,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: theme.colors.accentGlow, shadowOpacity: 0.8, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
        elevation: 12,
    },
    label: { color: '#fff', fontSize: 48, fontWeight: '800', letterSpacing: 4 },
    sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
});
