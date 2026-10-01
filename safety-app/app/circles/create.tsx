import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { useRouter } from 'expo-router';
import { Check, Search } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { createCircle } from '@/services/circlesStorage';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';
import { ApiError } from '@/services/apiClient';
import type { AlertSettings, ContactRef } from '@/types/circles';
import { DEFAULT_ALERT_SETTINGS } from '@/types/circles';

export default function CreateCircleScreen() {
  const router = useRouter();
  const t = useTheme();
  const { t: i18n } = useI18n();
  const [circleName, setCircleName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<ContactRef[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

  const requestAndLoadContacts = useCallback(async () => {
    setLoadingContacts(true);
    setPermissionMessage(null);
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setPermissionMessage(i18n('account.contact_sharing_desc'));
        return;
      }
      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
        sort: Contacts.SortTypes.FirstName,
      });
      const mapped = result.data
        .map((c): ContactRef | null => {
          const phone = c.phoneNumbers?.[0]?.number?.trim();
          if (!phone || !c.name?.trim()) return null;
          const ref: ContactRef = { id: c.id, name: c.name.trim(), phoneNumber: phone };
          if (c.image?.uri) ref.avatarUri = c.image.uri;
          return ref;
        })
        .filter((item): item is ContactRef => item !== null);
      setContacts(mapped);
    } catch {
      setPermissionMessage(i18n('errors.server'));
    } finally {
      setLoadingContacts(false);
    }
  }, [i18n]);

  useEffect(() => { void requestAndLoadContacts(); }, [requestAndLoadContacts]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? contacts.filter((c) => c.name.toLowerCase().includes(q)) : contacts;
  }, [contacts, searchQuery]);

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedContactIds.has(c.id)),
    [contacts, selectedContactIds],
  );

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onSaveCircle = async () => {
    if (!circleName.trim()) { Alert.alert(i18n('common.error'), i18n('circles.circle_name')); return; }
    if (selectedContacts.length === 0) { Alert.alert(i18n('common.error'), i18n('circles.no_members')); return; }
    setSaving(true);
    try {
      await createCircle({ name: circleName.trim(), contacts: selectedContacts, alertSettings });
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        Alert.alert(i18n('common.error'), i18n('errors.network'));
      } else {
        Alert.alert(i18n('common.error'), i18n('errors.server'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <GlassCard>
            <Text style={[styles.title, { color: t.colors.text, fontSize: t.font.h2 }]}>{i18n('circles.create_title')}</Text>
            <Text style={[styles.subtitle, { color: t.colors.textMuted, fontSize: t.font.small }]}>{i18n('circles.subtitle')}</Text>
            <TextInput
              value={circleName}
              onChangeText={setCircleName}
              placeholder={i18n('circles.circle_name_placeholder')}
              placeholderTextColor={t.colors.textMuted}
              style={[styles.input, { borderRadius: t.radius.md, borderColor: t.colors.glassBorder, color: t.colors.text, backgroundColor: t.colors.pill, fontSize: t.font.body }]}
            />
          </GlassCard>

          {/* Contacts */}
          <GlassCard>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: t.colors.text, fontSize: t.font.h3 }]}>{i18n('circles.add_members')}</Text>
              <Pressable
                onPress={() => { void requestAndLoadContacts(); }}
                style={({ pressed }) => [styles.reloadBtn, { borderRadius: t.radius.sm, borderColor: t.colors.glassBorder, backgroundColor: t.colors.pill }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[{ color: t.colors.text, fontSize: t.font.small, fontWeight: '600' }]}>{i18n('common.back').replace('Back', 'Reload')}</Text>
              </Pressable>
            </View>

            <View style={[styles.searchWrap, { borderRadius: t.radius.md, borderColor: t.colors.glassBorder, backgroundColor: t.colors.pill }]}>
              <Search size={16} color={t.colors.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={i18n('location.saved.search_placeholder').replace('Search street, city or address…', i18n('circles.member_name'))}
                placeholderTextColor={t.colors.textMuted}
                style={[styles.searchInput, { color: t.colors.text, fontSize: t.font.body }]}
              />
            </View>

            {permissionMessage ? <Text style={[{ color: t.colors.accent, fontSize: t.font.small, marginTop: 8 }]}>{permissionMessage}</Text> : null}

            {loadingContacts ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator color={t.colors.accent} />
              </View>
            ) : filteredContacts.length === 0 ? (
              <Text style={[{ color: t.colors.textMuted, textAlign: 'center', marginTop: 16 }]}>{i18n('circles.no_members')}</Text>
            ) : (
              filteredContacts.map((item) => {
                const isSelected = selectedContactIds.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleContact(item.id)}
                    style={({ pressed }) => [styles.contactRow, { borderRadius: t.radius.md, borderColor: t.colors.glassBorder, backgroundColor: t.colors.pill }, pressed && { opacity: 0.8 }]}
                  >
                    <View style={styles.avatar}>
                      <Text style={[styles.avatarText, { color: t.colors.accent }]}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ color: t.colors.text, fontSize: t.font.body, fontWeight: '600' }]}>{item.name}</Text>
                      <Text style={[{ color: t.colors.textMuted, fontSize: t.font.small, marginTop: 1 }]}>{item.phoneNumber}</Text>
                    </View>
                    <View style={[styles.checkbox, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.glass }, isSelected && { backgroundColor: t.colors.accent, borderColor: t.colors.accent }]}>
                      {isSelected && <Check size={14} color={t.colors.textInverse} />}
                    </View>
                  </Pressable>
                );
              })
            )}
          </GlassCard>

          {/* Alert types */}
          <GlassCard>
            <Text style={[styles.sectionTitle, { color: t.colors.text, fontSize: t.font.h3, marginBottom: t.spacing.sm }]}>{i18n('circles.alert_types')}</Text>
            {([
              { key: 'sos' as const,              label: i18n('circles.alert_sos'),          sub: i18n('circles.alert_sos_sub') },
              { key: 'notification' as const,      label: i18n('circles.alert_notification'),  sub: i18n('circles.alert_notification_sub') },
              { key: 'emergencyServices' as const, label: i18n('circles.alert_emergency'), sub: i18n('circles.alert_emergency_sub') },
            ]).map(({ key, label, sub }) => (
              <View key={key} style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: t.colors.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: t.colors.text, fontSize: t.font.body, fontWeight: '600' }]}>{label}</Text>
                  <Text style={[{ color: t.colors.textMuted, fontSize: t.font.small, marginTop: 2 }]}>{sub}</Text>
                </View>
                <Switch
                  value={alertSettings[key]}
                  onValueChange={(val) => setAlertSettings((prev) => ({ ...prev, [key]: val }))}
                  trackColor={{ false: t.colors.divider, true: t.colors.accent }}
                  thumbColor={t.colors.textInverse}
                />
              </View>
            ))}
          </GlassCard>

          {/* Save */}
          <GlassCard>
            <Text style={[{ color: t.colors.textMuted, fontSize: t.font.small, marginBottom: t.spacing.sm }]}>
              {i18n('circles.contacts_selected', { count: selectedContacts.length, plural: selectedContacts.length === 1 ? '' : 's' })}
            </Text>
            <Pressable
              disabled={saving}
              onPress={() => { void onSaveCircle(); }}
              style={({ pressed }) => [styles.saveBtn, { borderRadius: t.radius.md, backgroundColor: t.colors.accent }, (pressed || saving) && { opacity: 0.85 }]}
            >
              {saving
                ? <ActivityIndicator color={t.colors.textInverse} />
                : <Text style={[{ color: t.colors.textInverse, fontSize: t.font.body, fontWeight: '700' }]}>{i18n('circles.save_circle')}</Text>
              }
            </Pressable>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '800' },
  subtitle: { marginTop: 3 },
  input: { marginTop: 16, borderWidth: 1, paddingHorizontal: 16, height: 46 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontWeight: '700' },
  reloadBtn: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  searchWrap: { marginTop: 10, height: 42, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  searchInput: { flex: 1 },
  contactRow: { marginTop: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,59,107,0.14)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  saveBtn: { height: 46, alignItems: 'center', justifyContent: 'center' },
});
