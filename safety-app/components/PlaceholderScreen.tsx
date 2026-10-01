import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

/**
 * PLACEHOLDER SCREEN
 * 
 * Logic:
 * - Displays a consistent "Work in Progress" message for unfinished features.
 * - Uses the global background gradient and light-mode typography.
 * 
 * Multi-Agent Note: Use this for any route that hasn't been implemented yet 
 * to guide developers to the correct feature branch.
 */
export function PlaceholderScreen({ title, branch }: { title: string; branch: string }) {
    return (
        <View style={styles.root}>
            <LinearGradient 
                colors={[theme.colors.bgGradientStart, theme.colors.bgGradientEnd]} 
                style={StyleSheet.absoluteFill} 
            />
            <SafeAreaView style={styles.center}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.branchLabel}>Work on this feature in branch:</Text>
                <Text style={styles.branchName}>{branch}</Text>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { 
        flex: 1 
    },
    center: { 
        flex: 1, 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: theme.spacing.xl 
    },
    title: { 
        color: theme.colors.text, 
        fontSize: theme.font.h1, 
        fontWeight: '800', 
        marginBottom: theme.spacing.sm 
    },
    branchLabel: { 
        color: theme.colors.textMuted, 
        fontSize: theme.font.body 
    },
    branchName: { 
        color: theme.colors.accent, 
        fontSize: theme.font.h3, 
        fontWeight: '600', 
        marginTop: theme.spacing.xs 
    },
});
