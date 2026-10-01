import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Href, useRouter } from 'expo-router';
import { Palette, Lock, Languages, HelpCircle, ChevronRight, User, Bluetooth, ShieldAlert, Settings2, LogOut } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useSession } from '@/contexts/SessionContext';
import { useI18n } from '@/i18n';

function SettingsRow({
    label,
    icon: Icon,
    route,
    isLast = false,
}: {
    label: string;
    icon: React.ComponentType<{ color: string; size: number }>;
    route: Href;
    isLast?: boolean;
}) {
    const router = useRouter();
    const t = useTheme();
    return (
        <Pressable onPress={() => router.push(route)}>
            <View style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: t.colors.divider }]}>
                <Icon color={t.colors.accent} size={22} />
                <Text style={[styles.label, { color: t.colors.text }]}>{label}</Text>
                <ChevronRight color={t.colors.textMuted} size={20} />
            </View>
        </Pressable>
    );
}

export default function Settings() {
    const t = useTheme();
    const { t: i18n } = useI18n();
    const router = useRouter();
    const { logout } = useSession();
    const [loggingOut, setLoggingOut] = useState(false);

    const handleLogout = async () => {
        setLoggingOut(true);
        await logout();
        router.replace('/auth/register');
    };

    return (
        <ScreenBackground>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
                    <Text style={[styles.title, { color: t.colors.text }]}>{i18n('settings.title')}</Text>
                    
                    <View style={{ gap: 24, marginTop: 24 }}>
                        <View>
                            <Text style={[styles.groupTitle, { color: t.colors.textMuted }]}>{i18n('settings.account')}</Text>
                            <GlassCard style={{ padding: 0 }}>
                                <SettingsRow label={i18n('settings.edit_profile')} icon={User} route="/profile/edit" />
                                <SettingsRow label={i18n('account.title')} icon={Settings2} route="/settings/account" />
                                <SettingsRow label={i18n('settings.dongle_status')} icon={Bluetooth} route="/dongle/status" isLast />
                            </GlassCard>
                        </View>

                        <View>
                            <Text style={[styles.groupTitle, { color: t.colors.textMuted }]}>{i18n('settings.preferences')}</Text>
                            <GlassCard style={{ padding: 0 }}>
                                <SettingsRow label={i18n('settings.appearance')} icon={Palette} route="/settings/appearance" />
                                <SettingsRow label={i18n('settings.language')} icon={Languages} route="/settings/language" isLast />
                            </GlassCard>
                        </View>

                        <View>
                            <Text style={[styles.groupTitle, { color: t.colors.textMuted }]}>{i18n('settings.legal')}</Text>
                            <GlassCard style={{ padding: 0 }}>
                                <SettingsRow label={i18n('settings.privacy')} icon={Lock} route="/settings/privacy" />
                                <SettingsRow label={i18n('settings.faq')} icon={HelpCircle} route="/settings/faq" isLast />
                            </GlassCard>
                        </View>

                        <View>
                            <Text style={[styles.groupTitle, { color: t.colors.textMuted }]}>{i18n('settings.safety_title')}</Text>
                            <GlassCard style={{ padding: 0 }}>
                                <SettingsRow label={i18n('settings.sos_history')} icon={ShieldAlert} route="/sos/history" isLast />
                            </GlassCard>
                        </View>

                        <Pressable
                            disabled={loggingOut}
                            onPress={() => void handleLogout()}
                            style={({ pressed }) => [
                                styles.logoutButton,
                                { borderColor: 'rgba(255,59,107,0.4)', backgroundColor: 'rgba(255,59,107,0.08)', borderRadius: t.radius.md },
                                (pressed || loggingOut) && { opacity: 0.85 }
                            ]}
                        >
                            {loggingOut ? (
                                <ActivityIndicator color={t.colors.accent} />
                            ) : (
                                <>
                                    <LogOut size={20} color={t.colors.accent} />
                                    <Text style={[styles.logoutText, { color: t.colors.accent }]}>{i18n('account.sign_out')}</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </ScreenBackground>
    );
}

const styles = StyleSheet.create({
    title: { fontSize: 32, fontWeight: '800' },
    groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginLeft: 12, letterSpacing: 0.5 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
    label: { flex: 1, fontSize: 17, fontWeight: '500' },
    logoutButton: {
        marginTop: 8,
        height: 52,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    logoutText: {
        fontSize: 17,
        fontWeight: '700',
    },
});
