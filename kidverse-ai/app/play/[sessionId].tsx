import * as Speech from 'expo-speech';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ChoiceCard } from '@/components/ChoiceCard';
import { getWorldById } from '@/constants/mockData';
import { RealmThemeProvider, useRealmTheme } from '@/contexts/RealmThemeContext';
import { useProfiles } from '@/contexts/ProfilesContext';
import { applyStateUpdate, mockRealmTurn } from '@/lib/mockAdventure';
import type { AdventureSession, TurnResponse } from '@/types';

export default function PlayScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { getSession } = useProfiles();
  const session = sessionId ? getSession(sessionId) : undefined;

  if (!session) {
    return (
      <View style={styles.center}>
        <Text>Session not found.</Text>
      </View>
    );
  }

  return (
    <RealmThemeProvider ageTier={session.age_tier}>
      <AdventureEngine sessionId={session.id} />
    </RealmThemeProvider>
  );
}

function AdventureEngine({ sessionId }: { sessionId: string }) {
  const theme = useRealmTheme();
  const { getSession, saveSession, incrementMessageUse } = useProfiles();
  const session = getSession(sessionId) as AdventureSession;
  const world = getWorldById(session.world_id);

  const [turn, setTurn] = useState<TurnResponse | null>(session.last_turn ?? null);
  const [textInput, setTextInput] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const turnIndex = useRef(session.messages.filter((m) => m.role === 'assistant').length);
  const bootstrapped = useRef(false);

  const hud = theme.hud;
  const oversized = hud === 'storysprout';

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, {
      rate: theme.speech.rate,
      pitch: theme.speech.pitch,
      language: 'en-US',
    });
  };

  const runTurn = async (playerInput: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const allowed = await incrementMessageUse(session.kid_id);
      if (!allowed && session.kid_id !== 'guest') {
        setLimitHit(true);
        setBusy(false);
        return;
      }

      // Prefer edge function when configured; fall back to local mock for Expo preview.
      const next = await callRealmTurn({
        age_tier: session.age_tier,
        turn_index: turnIndex.current,
        player_input: playerInput,
        world_title: world?.title ?? 'Adventure',
        companion_name: world?.companion_name ?? 'Friend',
      });

      turnIndex.current += 1;
      const updatedState = applyStateUpdate(session.state, next.state_update);
      const updated: AdventureSession = {
        ...session,
        state: {
          ...updatedState,
          chapter: updatedState.chapter + (turnIndex.current % 2 === 0 ? 1 : 0),
          location: world?.title ?? updatedState.location,
        },
        messages: [
          ...session.messages,
          ...(playerInput
            ? [{ role: 'user' as const, content: playerInput }]
            : []),
          {
            role: 'assistant',
            content: `${next.narration}\n${next.companion_dialogue}`,
          },
        ],
        last_turn: next,
      };
      await saveSession(updated);
      setTurn(next);

      const spoken = `${next.narration} ${next.companion_dialogue}`;
      if (theme.speech.autoSpeak || hud === 'storysprout') {
        speak(spoken);
      }
    } finally {
      setBusy(false);
      setListening(false);
      setTextInput('');
    }
  };

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (!session.last_turn) {
      runTurn('Start the adventure');
    } else if (theme.speech.autoSpeak) {
      speak(`${session.last_turn.narration} ${session.last_turn.companion_dialogue}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inventory = session.state.inventory;
  const hearts = session.state.hearts;

  const headerTitle = useMemo(() => world?.title ?? theme.name, [world?.title, theme.name]);

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
        }}
      />
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {hud !== 'storysprout' ? (
            <View style={[styles.hud, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.hudText, { color: theme.colors.text }]}>
                ❤️ {hearts}
              </Text>
              {hud === 'fableforge' ? (
                <Text style={[styles.hudText, { color: theme.colors.text }]}>
                  Ch. {session.state.chapter}
                </Text>
              ) : null}
              <Text style={[styles.hudText, { color: theme.colors.primary }]} numberOfLines={1}>
                🎒 {inventory.length ? inventory.join(', ') : 'empty'}
              </Text>
            </View>
          ) : (
            <View style={styles.heartsOnly}>
              <Text style={{ fontSize: 22 }}>❤️ {hearts}</Text>
            </View>
          )}

          {hud === 'fableforge' && session.state.hero ? (
            <View style={[styles.heroBanner, { borderColor: theme.colors.primary }]}>
              <Text style={{ fontWeight: '800', color: theme.colors.text }}>
                {session.state.hero.archetype} + {session.state.hero.sidekick}
              </Text>
              <Text style={{ color: theme.colors.textMuted }}>
                Goal: {session.state.hero.quest_goal}
              </Text>
            </View>
          ) : null}

          {busy && !turn ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} />
          ) : null}

          {turn ? (
            <View style={[styles.storyCard, { backgroundColor: theme.colors.surface }]}>
              <Text
                style={[
                  styles.narration,
                  {
                    color: theme.colors.text,
                    fontSize: theme.typography.bodySize,
                    lineHeight: theme.typography.bodySize + 8,
                  },
                ]}
              >
                {turn.narration}
              </Text>
              <Text style={[styles.companion, { color: theme.colors.primary }]}>
                {world?.companion_name ?? 'Friend'}: {turn.companion_dialogue}
              </Text>
              <Pressable onPress={() => speak(`${turn.narration} ${turn.companion_dialogue}`)}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>
                  🔊 Read aloud
                </Text>
              </Pressable>
            </View>
          ) : null}

          {hud === 'fableforge' ? (
            <View style={styles.questLog}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Quest log</Text>
              {session.state.quest_log.slice(-4).map((q, i) => (
                <Text key={`${q}-${i}`} style={{ color: theme.colors.textMuted, marginBottom: 4 }}>
                  • {q}
                </Text>
              ))}
            </View>
          ) : null}

          {hud === 'realmhopper' ? (
            <View style={styles.backpack}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Backpack</Text>
              <Text style={{ color: theme.colors.textMuted }}>
                {inventory.length ? inventory.join(' · ') : 'Nothing yet — solve a riddle!'}
              </Text>
            </View>
          ) : null}

          <View style={styles.choices}>
            {(turn?.choices ?? []).map((choice) => (
              <ChoiceCard
                key={choice.label}
                choice={choice}
                oversized={oversized}
                accent={theme.colors.primary}
                onPress={() => runTurn(choice.label)}
              />
            ))}
          </View>

          {limitHit ? (
            <Text style={styles.limit}>Daily message limit reached. Ask a parent to raise it.</Text>
          ) : null}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: theme.colors.surface }]}>
          {hud === 'storysprout' ? (
            <Pressable
              onPress={() => {
                setListening(true);
                setTimeout(() => {
                  runTurn('I want to explore!');
                }, 600);
              }}
              style={[
                styles.micButton,
                {
                  backgroundColor: listening ? theme.colors.accent : theme.colors.primary,
                },
              ]}
            >
              <Text style={styles.micIcon}>🎙️</Text>
              <Text style={styles.micLabel}>{listening ? 'Listening…' : 'Tap to talk'}</Text>
            </Pressable>
          ) : (
            <View style={styles.textRow}>
              <TextInput
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Type or dictate a safe action…"
                placeholderTextColor="#94A3B8"
                style={[styles.input, { color: theme.colors.text }]}
                onSubmitEditing={() => textInput.trim() && runTurn(textInput.trim())}
              />
              <Pressable
                onPress={() => {
                  setListening(true);
                  setTimeout(() => runTurn(textInput.trim() || 'Look around carefully'), 500);
                }}
                style={[styles.smallMic, { backgroundColor: theme.colors.secondary }]}
              >
                <Text style={{ fontSize: 18 }}>🎙️</Text>
              </Pressable>
              <Pressable
                onPress={() => textInput.trim() && runTurn(textInput.trim())}
                style={[styles.send, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={styles.sendText}>Go</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

async function callRealmTurn(payload: {
  age_tier: AdventureSession['age_tier'];
  turn_index: number;
  player_input: string;
  world_title: string;
  companion_name: string;
}): Promise<TurnResponse> {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (baseUrl && anon) {
    try {
      const res = await fetch(`${baseUrl}/functions/v1/realm-turn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anon}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return (await res.json()) as TurnResponse;
      }
    } catch {
      // Fall through to mock for local Expo preview.
    }
  }

  return mockRealmTurn({
    age_tier: payload.age_tier,
    turn_index: payload.turn_index,
    player_input: payload.player_input,
  });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 24, gap: 12 },
  hud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    borderRadius: 16,
    padding: 12,
  },
  hudText: { fontWeight: '700', fontSize: 14, maxWidth: '100%' },
  heartsOnly: { alignItems: 'flex-start' },
  heroBanner: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  storyCard: {
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  narration: { fontWeight: '600' },
  companion: { fontWeight: '700', fontSize: 16, lineHeight: 24 },
  sectionTitle: { fontWeight: '800', fontSize: 16, marginBottom: 6 },
  questLog: { gap: 2 },
  backpack: { gap: 4 },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  limit: { color: '#DC2626', fontWeight: '700' },
  inputBar: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  micButton: {
    borderRadius: 28,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  micIcon: { fontSize: 36 },
  micLabel: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  textRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  smallMic: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#FFF', fontWeight: '800' },
});
