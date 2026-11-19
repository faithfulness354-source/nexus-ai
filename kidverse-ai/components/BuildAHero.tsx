import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HERO_PRESETS } from '@/constants/themes';
import type { HeroBuild } from '@/types';

interface BuildAHeroProps {
  value: HeroBuild;
  onChange: (next: HeroBuild) => void;
  accent: string;
  textColor: string;
}

function ChipRow({
  label,
  options,
  selected,
  onSelect,
  accent,
}: {
  label: string;
  options: readonly string[];
  selected: string;
  onSelect: (v: string) => void;
  accent: string;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={[
                styles.chip,
                active && { backgroundColor: accent, borderColor: accent },
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function BuildAHero({ value, onChange, accent, textColor }: BuildAHeroProps) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: textColor }]}>Build-a-Hero</Text>
      <Text style={styles.sub}>Pick archetype, sidekick, and quest goal.</Text>
      <ChipRow
        label="Archetype"
        options={HERO_PRESETS.archetypes}
        selected={value.archetype}
        onSelect={(archetype) => onChange({ ...value, archetype })}
        accent={accent}
      />
      <ChipRow
        label="Sidekick"
        options={HERO_PRESETS.sidekicks}
        selected={value.sidekick}
        onSelect={(sidekick) => onChange({ ...value, sidekick })}
        accent={accent}
      />
      <ChipRow
        label="Quest Goal"
        options={HERO_PRESETS.quest_goals}
        selected={value.quest_goal}
        onSelect={(quest_goal) => onChange({ ...value, quest_goal })}
        accent={accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    marginTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  sub: {
    color: '#64748B',
    marginBottom: 4,
  },
  block: {
    gap: 8,
  },
  label: {
    fontWeight: '700',
    color: '#334155',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});
