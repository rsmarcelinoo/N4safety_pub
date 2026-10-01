/**
 * STATUS WIDGET COMPONENT
 * 
 * Logic:
 * - A compact, reusable widget used to display status metrics (e.g., Battery, Connectivity).
 * - Wraps content in a `GlassCard` and uses a tinted icon background for visual emphasis.
 * 
 * Styling Rationale:
 * - Follows the "Liquid Glass" design system.
 * - `tint` prop allows for contextual coloring (e.g., green for connected, amber for low battery).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from './GlassCard';
import { theme } from '../constants/theme';

export function StatusWidget({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string; tint?: string }) {
    return (
        <GlassCard style={{ flex: 1 }}>
            <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: (tint ?? theme.colors.accent) + '33' }]}>{icon}</View>
                <View>
                    <Text style={styles.label}>{label}</Text>
                    <Text style={styles.value}>{value}</Text>
                </View>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    label: { color: theme.colors.textMuted, fontSize: 12 },
    value: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
});
