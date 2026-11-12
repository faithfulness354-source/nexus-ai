import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getAvatarEmoji } from '@/constants/mockData';
import { REALM_THEMES, SAFE_AVATARS, SAFE_NICKNAMES } from '@/constants/themes';
import { useProfiles } from '@/contexts/ProfilesContext';
import type { AgeTier, KidProfile } from '@/types';

const TIERS: { id: AgeTier; label: string }[] = [
  { id: 'ages_5_7', label: 'StorySprout' },
  { id: 'ages_8_9', label: 'RealmHopper' },
  { id: 'ages_10_12', label: 'FableForge' },
];

export default function ParentDashboard() {
  const {
    profiles,
    sessions,
    parentUnlocked,
    lockParent,
    upsertProfile,
    setAgeTier,
    setDailyLimit,
    resetDemoData,
  } = useProfiles();

  const [draftNick, setDraftNick] = useState<string>(SAFE_NICKNAMES[0]);
  const [draftAvatar, setDraftAvatar] = useState<string>(SAFE_AVATARS[0].id);
  const [draftTier, setDraftTier] = useState<AgeTier>('ages_5_7');

  useEffect(() => {
    if (!parentUnlocked) {
      router.replace('/');
    }
  }, [parentUnlocked]);

  if (!parentUnlocked) return null;

  const createProfile = async () => {
    const profile: KidProfile = {
      id: `kid-${Date.now()}`,
      nickname: draftNick,
      avatar_id: draftAvatar,
      age_tier: draftTier,
      daily_message_limit: draftTier === 'ages_5_7' ? 40 : draftTier === 'ages_8_9' ? 60 : 80,
      messages_used_today: 0,
      unlocked_badges: [],
    };
    await upsertProfile(profile);
  };

  const graduate = async (kidId: string, current: AgeTier) => {
    const next: AgeTier =
      current === 'ages_5_7' ? 'ages_8_9' : current === 'ages_8_9' ? 'ages_10_12' : 'ages_10_12';
    await setAgeTier(kidId, next);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Parent Dashboard',
          headerRight: () => (
            <Pressable
              onPress={() => {
                lockParent();
                router.replace('/');
              }}
            >
              <Text style={styles.lock}>Lock</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          Zero-PII kid profiles: preset nickname + avatar only. No emails, real names, birthdates,
          locations, or photos.
        </Text>

        <Text style={styles.section}>Kid profiles</Text>
        {profiles.map((profile) => {
          const theme = REALM_THEMES[profile.age_tier];
          const kidSessions = sessions.filter((s) => s.kid_id === profile.id);
          const last = kidSessions[kidSessions.length - 1];
          return (
            <View key={profile.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.avatar}>{getAvatarEmoji(profile.avatar_id)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{profile.nickname}</Text>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
                    {theme.name}
                  </Text>
                </View>
              </View>

              <Text style={styles.meta}>
                Messages today: {profile.messages_used_today}/{profile.daily_message_limit}
              </Text>
              <Text style={styles.meta}>
                Badges: {profile.unlocked_badges.length ? profile.unlocked_badges.join(', ') : '—'}
              </Text>
              <Text style={styles.meta}>
                Last session:{' '}
                {last
                  ? `${last.status} · ${last.state.quest_log.slice(-1)[0] ?? 'just started'}`
                  : 'No sessions yet'}
              </Text>

              <View style={styles.row}>
                {TIERS.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setAgeTier(profile.id, t.id)}
                    style={[
                      styles.chip,
                      profile.age_tier === t.id && {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        profile.age_tier === t.id && { color: '#FFF' },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.row}>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => setDailyLimit(profile.id, profile.daily_message_limit - 10)}
                >
                  <Text style={styles.secondaryBtnText}>−10 msgs</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => setDailyLimit(profile.id, profile.daily_message_limit + 10)}
                >
                  <Text style={styles.secondaryBtnText}>+10 msgs</Text>
                </Pressable>
                {profile.age_tier !== 'ages_10_12' ? (
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => graduate(profile.id, profile.age_tier)}
                  >
                    <Text style={styles.primaryBtnText}>Graduate →</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}

        <Text style={styles.section}>Create profile</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Safe nickname presets</Text>
          <View style={styles.row}>
            {SAFE_NICKNAMES.map((nick) => (
              <Pressable
                key={nick}
                onPress={() => setDraftNick(nick)}
                style={[styles.chip, draftNick === nick && styles.chipOn]}
              >
                <Text style={[styles.chipText, draftNick === nick && styles.chipOnText]}>
                  {nick}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Avatar</Text>
          <View style={styles.row}>
            {SAFE_AVATARS.map((avatar) => (
              <Pressable
                key={avatar.id}
                onPress={() => setDraftAvatar(avatar.id)}
                style={[styles.avatarPick, draftAvatar === avatar.id && styles.avatarOn]}
              >
                <Text style={{ fontSize: 24 }}>{avatar.emoji}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Starting Realm</Text>
          <View style={styles.row}>
            {TIERS.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setDraftTier(t.id)}
                style={[styles.chip, draftTier === t.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, draftTier === t.id && styles.chipOnText]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[styles.primaryBtn, { marginTop: 16 }]} onPress={createProfile}>
            <Text style={styles.primaryBtnText}>Add kid profile</Text>
          </Pressable>
        </View>

        <Pressable style={styles.reset} onPress={resetDemoData}>
          <Text style={styles.resetText}>Reset demo profiles</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 48, gap: 10 },
  lock: { color: '#0F766E', fontWeight: '800', paddingHorizontal: 8 },
  lead: { color: '#475569', lineHeight: 22, marginBottom: 8 },
  section: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { fontSize: 36 },
  name: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  meta: { color: '#64748B', fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF',
  },
  chipOn: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  chipText: { fontWeight: '700', color: '#334155', fontSize: 12 },
  chipOnText: { color: '#FFF' },
  secondaryBtn: {
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryBtnText: { fontWeight: '700', color: '#334155' },
  primaryBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '800' },
  label: { fontWeight: '700', color: '#334155' },
  avatarPick: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOn: { borderColor: '#0F766E', backgroundColor: '#CCFBF1' },
  reset: { alignItems: 'center', paddingVertical: 16 },
  resetText: { color: '#94A3B8', fontWeight: '700' },
});
