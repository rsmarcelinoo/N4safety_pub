import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { useTheme } from '@/contexts/PreferencesContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ_ITEMS = [
  {
    question: "How does the N4Safety dongle work?",
    answer: "The dongle uses LoRa technology for independent, long-range communication. It pairs with your phone via BLE but can send SOS alerts even if your phone is out of reach or has no signal.",
  },
  {
    question: "What is a Safety Circle?",
    answer: "A Circle is a group of trusted contacts you choose. When you trigger an SOS, every member of your active circles receives your live location and status immediately.",
  },
  {
    question: "How are 'Danger Zones' calculated?",
    answer: "Danger zones are generated using a combination of real-time incident reports, historical safety data, and crowd-sourced heatmaps to help you stay aware of your surroundings.",
  },
  {
    question: "Is my location data private?",
    answer: "Absolutely. Your live location is only shared with your chosen Circles when an SOS is active. We use JWT authentication and encrypted databases to keep your data secure.",
  },
  {
    question: "Do I need the dongle to use the app?",
    answer: "No, the app is fully functional on its own. However, the dongle provides a discreet, physical way to trigger SOS alerts without needing to unlock your phone.",
  },
  {
    question: "Is the dongle waterproof?",
    answer: "Yes, the hardware is designed to be IP68 waterproof and shock-resistant, making it reliable in any emergency situation.",
  },
];

function FAQItem({ item, isOpen, onPress }: { item: typeof FAQ_ITEMS[0], isOpen: boolean, onPress: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.itemContainer}>
      <Pressable onPress={onPress} style={styles.questionRow}>
        <Text style={[styles.questionText, { color: t.colors.text }]}>{item.question}</Text>
        {isOpen ? (
          <ChevronUp size={20} color={t.colors.accent} />
        ) : (
          <ChevronDown size={20} color={t.colors.textMuted} />
        )}
      </Pressable>
      {isOpen && (
        <View style={styles.answerContainer}>
          <Text style={[styles.answerText, { color: t.colors.textMuted }]}>{item.answer}</Text>
        </View>
      )}
    </View>
  );
}

export default function FAQScreen() {
  const theme = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <LinearGradient
        colors={[theme.colors.bgGradientStart, theme.colors.bgGradientEnd] as const}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <HelpCircle size={32} color={theme.colors.accent} style={styles.headerIcon} />
            <Text style={[styles.title, { color: theme.colors.text }]}>Frequently Asked Questions</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Find quick answers to common questions about Guardian Sphere.</Text>
          </View>
          <GlassCard style={styles.card}>
            {FAQ_ITEMS.map((item, index) => (
              <React.Fragment key={index}>
                <FAQItem item={item} isOpen={openIndex === index} onPress={() => toggleItem(index)} />
                {index < FAQ_ITEMS.length - 1 && <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />}
              </React.Fragment>
            ))}
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  header: { marginBottom: 24, alignItems: 'center' },
  headerIcon: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', paddingHorizontal: 20 },
  card: { padding: 0 },
  itemContainer: { paddingVertical: 16, paddingHorizontal: 4 },
  questionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionText: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 12 },
  answerContainer: { marginTop: 12 },
  answerText: { fontSize: 14, lineHeight: 20 },
  divider: { height: 1 },
});
