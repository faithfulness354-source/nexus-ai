import { Pressable, StyleSheet, Text } from 'react-native';

import type { ChoiceOption } from '@/types';

interface ChoiceCardProps {
  choice: ChoiceOption;
  oversized?: boolean;
  accent: string;
  onPress: () => void;
}

export function ChoiceCard({ choice, oversized, accent, onPress }: ChoiceCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        oversized && styles.oversized,
        {
          borderColor: accent,
          backgroundColor: pressed ? `${accent}22` : '#FFFFFF',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <Text style={[styles.icon, oversized && styles.iconLarge]}>{choice.icon}</Text>
      <Text style={[styles.label, oversized && styles.labelLarge]}>{choice.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    flexGrow: 1,
    gap: 6,
  },
  oversized: {
    minHeight: 120,
    borderRadius: 24,
    paddingVertical: 20,
  },
  icon: {
    fontSize: 28,
  },
  iconLarge: {
    fontSize: 42,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  labelLarge: {
    fontSize: 18,
  },
});
