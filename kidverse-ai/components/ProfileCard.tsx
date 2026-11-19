import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getAvatarEmoji } from '@/constants/mockData';
import { REALM_THEMES } from '@/constants/themes';
import type { KidProfile } from '@/types';

interface ProfileCardProps {
  profile: KidProfile;
  onPress: () => void;
}

export function ProfileCard({ profile, onPress }: ProfileCardProps) {
  const theme = REALM_THEMES[profile.age_tier];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.primary,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.avatarRing, { backgroundColor: theme.colors.background }]}>
        <Text style={styles.avatar}>{getAvatarEmoji(profile.avatar_id)}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.name, { color: theme.colors.text }]}>{profile.nickname}</Text>
        <Text style={[styles.realm, { color: theme.colors.primary }]}>{theme.name}</Text>
        <Text style={[styles.limit, { color: theme.colors.textMuted }]}>
          {profile.messages_used_today}/{profile.daily_message_limit} messages today
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    fontSize: 34,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
  },
  realm: {
    fontSize: 15,
    fontWeight: '700',
  },
  limit: {
    fontSize: 13,
  },
  chevron: {
    fontSize: 28,
    color: '#94A3B8',
    fontWeight: '300',
  },
});
