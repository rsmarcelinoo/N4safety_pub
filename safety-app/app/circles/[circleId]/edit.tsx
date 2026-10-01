import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Search, Trash2 } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { deleteCircle, loadCircles, updateCircle } from '@/services/circlesStorage';
import { useTheme } from '@/contexts/PreferencesContext';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useI18n } from '@/i18n';
import { ApiError } from '@/services/apiClient';
import type { AlertSettings, Circle, ContactRef } from '@/types/circles';
import { DEFAULT_ALERT_SETTINGS } from '@/types/circles';

export default function EditCircleScreen() {
  const router = useRouter();
  const t = useTheme();
  const { t: i18n } = useI18n();
  const params = useLocalSearchParams<{ circleId?: string }>();
  const circleId = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const [circle, setCircle] = useState<Circle | null>(null);
  const [circleName, setCircleName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<ContactRef[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadScreenData = async () => {
      if (!circleId) {
        setPermissionMessage(i18n('errors.not_found'));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setPermissionMessage(null);

        const circles = await loadCircles();
        const found = circles.find((item) => item.id === circleId);

        if (!found) {
          setPermissionMessage(i18n('errors.not_found'));
          setLoading(false);
          return;
        }

        setCircle(found);
        setCircleName(found.name);
        setAlertSettings(found.alertSettings ?? DEFAULT_ALERT_SETTINGS);
        setSelectedContactIds(new Set(found.contacts.map((contact) => contact.id)));

        const permission = await Contacts.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          setContacts(found.contacts);
          setPermissionMessage(i18n('account.contact_sharing_desc'));
          setLoading(false);
          return;
        }

        const result = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
          sort: Contacts.SortTypes.FirstName,
        });

        const deviceContacts = result.data
          .map((contact): ContactRef | null => {
            const primaryPhone = contact.phoneNumbers?.[0]?.number?.trim();
            if (!primaryPhone || !contact.name?.trim()) {
              return null;
            }

            const mappedContact: ContactRef = {
              id: contact.id,
              name: contact.name.trim(),
              phoneNumber: primaryPhone,
            };
            if (contact.image?.uri) {
              mappedContact.avatarUri = contact.image.uri;
            }
            return mappedContact;
          })
          .filter((item): item is ContactRef => item !== null);

        const mergedById = new Map<string, ContactRef>();
        for (const item of found.contacts) {
          mergedById.set(item.id, item);
        }
        for (const item of deviceContacts) {
          mergedById.set(item.id, item);
        }
        setContacts(Array.from(mergedById.values()));
      } catch (error) {
        console.error('Failed to load circle edit data:', error);
        setPermissionMessage(i18n('errors.server'));
      } finally {
        setLoading(false);
      }
    };

    void loadScreenData();
  }, [circleId, i18n]);

  const filteredContacts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return contacts;
    }
    return contacts.filter((contact) => contact.name.toLowerCase().includes(query));
  }, [contacts, searchQuery]);

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedContactIds.has(contact.id)),
    [contacts, selectedContactIds],
  );

  const toggleContact = (contactId: string) => {
    setSelectedContactIds((previous) => {
      const next = new Set(previous);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const onSave = async () => {
    if (!circleId) {
      Alert.alert(i18n('common.error'), i18n('errors.not_found'));
      return;
    }

    const trimmedName = circleName.trim();
    if (!trimmedName) {
      Alert.alert(i18n('common.error'), i18n('circles.circle_name'));
      return;
    }
    if (selectedContacts.length === 0) {
      Alert.alert(i18n('common.error'), i18n('circles.no_members'));
      return;
    }

    try {
      setSaving(true);
      await updateCircle(circleId, {
        name: trimmedName,
        contacts: selectedContacts,
        alertSettings,
      });
      router.back();
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        Alert.alert(i18n('common.error'), i18n('errors.network'));
      } else {
        Alert.alert(i18n('common.error'), i18n('errors.server'));
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!circleId || !circle) {
      return;
    }

    Alert.alert(
      i18n('common.delete'),
      i18n('location.saved.remove_confirm', { name: circle.name }),
      [
        { text: i18n('common.cancel'), style: 'cancel' },
        {
          text: i18n('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCircle(circleId);
              router.replace('/(tabs)/devices');
            } catch (error) {
              Alert.alert(i18n('common.error'), i18n('errors.server'));
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.content, { padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: 120 }]}>
            <GlassCard>
              <Text style={[styles.title, { color: t.colors.text, fontSize: t.font.h2 }]}>{i18n('circles.edit_title')}</Text>
              <Text style={[styles.subtitle, { color: t.colors.textMuted, fontSize: t.font.small }]}>{i18n('circles.subtitle')}</Text>
              <TextInput
                value={circleName}
                onChangeText={setCircleName}
                placeholder={i18n('circles.circle_name_placeholder')}
                placeholderTextColor={t.colors.textMuted}
                style={[styles.input, { borderRadius: t.radius.md, borderColor: t.colors.glassBorder, color: t.colors.text, backgroundColor: t.colors.pill, fontSize: t.font.body }]}
              />
            </GlassCard>

            <GlassCard style={styles.contactsCard}>
              <Text style={[styles.sectionTitle, { color: t.colors.text, fontSize: t.font.h3 }]}>{i18n('circles.add_members')}</Text>
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

              {permissionMessage ? <Text style={[styles.errorText, { color: t.colors.accent, fontSize: t.font.small }]}>{permissionMessage}</Text> : null}

              <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={<Text style={[styles.emptyText, { color: t.colors.textMuted }]}>{i18n('circles.no_members')}</Text>}
                renderItem={({ item }) => {
                  const isSelected = selectedContactIds.has(item.id);
                  return (
                    <Pressable
                      onPress={() => toggleContact(item.id)}
                      style={({ pressed }) => [styles.contactRow, { borderRadius: t.radius.md, borderColor: t.colors.glassBorder, backgroundColor: t.colors.pill }, pressed && styles.buttonPressed]}
                    >
                      <View style={styles.avatar}>
                        <Text style={[styles.avatarText, { color: t.colors.accent }]}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.contactInfo}>
                        <Text style={[styles.contactName, { color: t.colors.text, fontSize: t.font.body }]}>{item.name}</Text>
                        <Text style={[styles.contactPhone, { color: t.colors.textMuted, fontSize: t.font.small }]}>{item.phoneNumber}</Text>
                      </View>
                      <View style={[styles.checkbox, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.glass }, isSelected && [styles.checkboxSelected, { backgroundColor: t.colors.accent, borderColor: t.colors.accent }]]}>
                        {isSelected ? <Check size={14} color={t.colors.textInverse} /> : null}
                      </View>
                    </Pressable>
                  );
                }}
              />
            </GlassCard>

            <GlassCard>
              <Text style={[styles.sectionTitle, { color: t.colors.text, fontSize: t.font.h3, marginBottom: t.spacing.sm }]}>{i18n('circles.alert_types')}</Text>
              {(
                [
                  { key: 'sos' as const,               label: i18n('circles.alert_sos'),              sub: i18n('circles.alert_sos_sub') },
                  { key: 'notification' as const,       label: i18n('circles.alert_notification'),      sub: i18n('circles.alert_notification_sub') },
                  { key: 'emergencyServices' as const,  label: i18n('circles.alert_emergency'),     sub: i18n('circles.alert_emergency_sub') },
                ] as const
              ).map(({ key, label, sub }) => (
                <View key={key} style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: t.colors.divider }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: t.colors.text, fontSize: t.font.body, fontWeight: '600' }]}>{label}</Text>
                    <Text style={[{ color: t.colors.textMuted, fontSize: t.font.small, marginTop: 2 }]}>{sub}</Text>
                  </View>
                  <Switch
                    value={alertSettings[key]}
                    onValueChange={(val) => setAlertSettings((prev) => ({ ...prev, [key]: val }))}
                    trackColor={{ false: t.colors.divider, true: t.colors.accent }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </GlassCard>

            <GlassCard>
              <Text style={[styles.selectedText, { color: t.colors.textMuted, fontSize: t.font.small, marginBottom: t.spacing.sm }]}>
                {i18n('circles.contacts_selected', { count: selectedContacts.length, plural: selectedContacts.length === 1 ? '' : 's' })}
              </Text>
              <Pressable
                disabled={saving}
                onPress={() => {
                  void onSave();
                }}
                style={({ pressed }) => [styles.saveButton, { borderRadius: t.radius.md, backgroundColor: t.colors.accent }, (pressed || saving) && styles.buttonPressed]}
              >
                {saving ? <ActivityIndicator color={t.colors.textInverse} /> : <Text style={[styles.saveButtonText, { color: t.colors.textInverse, fontSize: t.font.body }]}>{i18n('common.save')}</Text>}
              </Pressable>
              <Pressable
                onPress={onDelete}
                style={({ pressed }) => [styles.deleteButton, { borderRadius: t.radius.md, borderColor: 'rgba(255,59,107,0.4)', backgroundColor: 'rgba(255,59,107,0.08)' }, pressed && styles.buttonPressed]}
              >
                <Trash2 size={15} color={t.colors.accent} />
                <Text style={[styles.deleteButtonText, { color: t.colors.accent, fontSize: t.font.body }]}>{i18n('common.delete')}</Text>
              </Pressable>
            </GlassCard>
          </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800' },
  subtitle: { marginTop: 3 },
  input: {
    marginTop: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 46,
  },
  contactsCard: { flex: 1 },
  sectionTitle: { fontWeight: '700' },
  searchWrap: {
    marginTop: 10,
    height: 42,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1 },
  emptyText: { textAlign: 'center', marginTop: 16 },
  errorText: { marginTop: 10 },
  contactRow: {
    marginTop: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,59,107,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '700' },
  contactInfo: { flex: 1 },
  contactName: { fontWeight: '600' },
  contactPhone: { marginTop: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
  },
  selectedText: { },
  saveButton: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: { fontWeight: '700' },
  deleteButton: {
    marginTop: 10,
    height: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  deleteButtonText: { fontWeight: '700' },
  buttonPressed: { opacity: 0.85 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
});
