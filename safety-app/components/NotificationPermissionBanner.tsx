import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { Bell, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { requestPermission } from '@/services/notificationService';

const DISMISS_KEY = 'n4safety:notif_banner_dismissed';

export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(DISMISS_KEY).then((val) => {
      if (val !== 'true') {
        setVisible(true);
      }
    });
  }, []);

  const handleDismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem(DISMISS_KEY, 'true');
  };

  const handleEnable = async () => {
    await requestPermission();
    await handleDismiss();
  };

  if (!visible) return null;

  return (
    <View style={styles.cardShadow}>
      <BlurView intensity={50} tint="light" style={styles.cardBlur}>
        <View style={styles.cardInner}>
          <View style={styles.iconContainer}>
            <Bell color={theme.colors.info} size={20} strokeWidth={2.5} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.text}>
              Enable notifications to receive alerts from your circles
            </Text>
            <Pressable onPress={handleEnable} style={styles.enableButton}>
              <Text style={styles.enableText}>Enable</Text>
            </Pressable>
          </View>
          <Pressable onPress={handleDismiss} style={styles.closeButton}>
            <X color={theme.colors.textMuted} size={18} />
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    borderRadius: 16,
    backgroundColor: 'transparent',
    shadowColor: theme.colors.glassShadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 16,
  },
  cardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  cardInner: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  text: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '500',
    marginBottom: 6,
  },
  enableButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 8,
  },
  enableText: {
    fontSize: 12,
    color: theme.colors.info,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
});
