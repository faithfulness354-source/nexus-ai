import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BuildAHero } from '@/components/BuildAHero';
import { worldsForTier } from '@/constants/mockData';
import { HERO_PRESETS, REALM_THEMES } from '@/constants/themes';
import { RealmThemeProvider, useRealmTheme } from '@/contexts/RealmThemeContext';
import { useProfiles } from '@/contexts/ProfilesContext';
import { createInitialState } from '@/lib/mockAdventure';
import type { AgeTier, HeroBuild, RealmWorld } from '@/types';

const VALID_TIERS: AgeTier[] = ['ages_5_7', 'ages_8_9', 'ages_10_12'];

function isAgeTier(value: string): value is AgeTier {
  return VALID_TIERS.includes(value as AgeTier);
}

export default function RealmHubScreen() {
  const params = useLocalSearchParams<{ tier: string; kidId?: string }>();
  const tier = isAgeTier(params.tier) ? params.tier : 'ages_5_7';

  return (
    <RealmThemeProvider ageTier={tier}>
      <RealmHubBody kidId={params.kidId} tier={tier} />
    </RealmThemeProvider>
  );
}

function RealmHubBody({ kidId, tier }: { kidId?: string; tier: AgeTier }) {
  const theme = useRealmTheme();
  const { getProfile, saveSession } = useProfiles();
  const profile = kidId ? getProfile(kidId) : undefined;
  const worlds = useMemo(() => worldsForTier(tier), [tier]);
  const showHeroBuilder = tier === 'ages_8_9' || tier === 'ages_10_12';

  const [hero, setHero] = useState<HeroBuild>({
    archetype: HERO_PRESETS.archetypes[0],
    sidekick: HERO_PRESETS.sidekicks[0],
    quest_goal: HERO_PRESETS.quest_goals[0],
  });

  const startWorld = (world: RealmWorld) => {
    const sessionId = `session-${Date.now()}`;
    const session = {
      id: sessionId,
      kid_id: profile?.id ?? 'guest',
      world_id: world.id,
      age_tier: tier,
      state: createInitialState(showHeroBuilder ? hero : undefined),
      messages: [],
      status: 'active' as const,
    };
    // Persist in background; navigate immediately so web preview never stalls on storage.
    void saveSession(session);
    router.push({
      pathname: '/play/[sessionId]',
      params: { sessionId },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: theme.name,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.kicker, { color: theme.colors.primary }]}>
          {profile ? `${profile.nickname}'s Realm` : 'Realm Hub'}
        </Text>
        <Text style={[styles.title, { color: theme.colors.text, fontSize: theme.typography.titleSize }]}>
          {theme.name}
        </Text>
        <Text style={[styles.tagline, { color: theme.colors.textMuted }]}>{theme.tagline}</Text>

        <View style={[styles.badge, { backgroundColor: theme.colors.surface }]}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
            Voice rate {theme.speech.rate.toFixed(1)} · pitch {theme.speech.pitch.toFixed(2)}
            {theme.speech.autoSpeak ? ' · auto TTS on' : ''}
          </Text>
        </View>

        {showHeroBuilder ? (
          <BuildAHero
            value={hero}
            onChange={setHero}
            accent={theme.colors.primary}
            textColor={theme.colors.text}
          />
        ) : (
          <View style={styles.storyNote}>
            <Text style={[styles.storyNoteTitle, { color: theme.colors.text }]}>
              Giant mic + picture choices
            </Text>
            <Text style={{ color: theme.colors.textMuted, lineHeight: 22 }}>
              StorySprout reads every turn aloud and keeps adventures fail-free for little explorers.
            </Text>
          </View>
        )}

        <Text style={[styles.section, { color: theme.colors.text }]}>Starter worlds</Text>
        {worlds.map((world) => (
          <Pressable
            key={world.id}
            onPress={() => startWorld(world)}
            style={[
              styles.worldCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.primary,
              },
            ]}
          >
            <Text style={styles.worldIcon}>{world.theme_config.icon}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.worldTitle, { color: theme.colors.text }]}>{world.title}</Text>
              <Text style={{ color: theme.colors.textMuted, lineHeight: 20 }}>
                {world.description}
              </Text>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
                With {world.companion_name} →
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 10,
  },
  kicker: {
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
  },
  title: {
    fontWeight: '900',
  },
  tagline: {
    fontSize: 16,
    marginBottom: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 8,
  },
  storyNote: {
    gap: 6,
    marginVertical: 8,
  },
  storyNoteTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  section: {
    marginTop: 16,
    marginBottom: 4,
    fontSize: 18,
    fontWeight: '800',
  },
  worldCard: {
    flexDirection: 'row',
    gap: 14,
    borderWidth: 2,
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
  },
  worldIcon: {
    fontSize: 36,
  },
  worldTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
});
