import type { KidProfile, RealmWorld } from '@/types';

/** Pre-seeded demo profiles — one per Realm for immediate Expo preview. */
export const DEMO_KID_PROFILES: KidProfile[] = [
  {
    id: 'kid-demo-storysprout',
    nickname: 'Sunny',
    avatar_id: 'fox',
    age_tier: 'ages_5_7',
    daily_message_limit: 40,
    messages_used_today: 2,
    unlocked_badges: ['First Sprout'],
  },
  {
    id: 'kid-demo-realmhopper',
    nickname: 'Comet',
    avatar_id: 'robot',
    age_tier: 'ages_8_9',
    daily_message_limit: 60,
    messages_used_today: 5,
    unlocked_badges: ['Puzzle Starter', 'Backpack Scout'],
  },
  {
    id: 'kid-demo-fableforge',
    nickname: 'Nova',
    avatar_id: 'dragon',
    age_tier: 'ages_10_12',
    daily_message_limit: 80,
    messages_used_today: 8,
    unlocked_badges: ['World Draft', 'Quest Lead'],
  },
];

export const STARTER_WORLDS: RealmWorld[] = [
  // StorySprout
  {
    id: 'world-ss-meadow',
    age_tier: 'ages_5_7',
    title: 'Sunny Meadow Trail',
    description: 'Follow Glowbug through soft grass and friendly animal friends.',
    companion_name: 'Glowbug',
    theme_config: {
      primary: '#2BB673',
      secondary: '#FFE566',
      accent: '#FF8A5B',
      background: '#E8FFF3',
      icon: '🌻',
    },
    system_prompt_seed:
      'StorySprout meadow adventure. Kindergarten language. 1-2 short sentences. Zero fail states.',
  },
  {
    id: 'world-ss-cloud',
    age_tier: 'ages_5_7',
    title: 'Cloud Pillow Castle',
    description: 'Float up to a fluffy castle and meet soft cloud pals.',
    companion_name: 'Puff',
    theme_config: {
      primary: '#7BE0FF',
      secondary: '#FFE566',
      accent: '#FF8A5B',
      background: '#F0FBFF',
      icon: '☁️',
    },
    system_prompt_seed:
      'StorySprout cloud castle. Voice-friendly picture prompts. Always encouraging.',
  },
  // RealmHopper
  {
    id: 'world-rh-crystal',
    age_tier: 'ages_8_9',
    title: 'Crystal Cave Codes',
    description: 'Solve glowing riddles to open the crystal doors.',
    companion_name: 'Pip',
    theme_config: {
      primary: '#2F6FED',
      secondary: '#7BE0FF',
      accent: '#FFB020',
      background: '#EAF3FF',
      icon: '💎',
    },
    system_prompt_seed:
      'RealmHopper puzzle cave. Offer riddles and backpack collectibles. 2-4 sentences.',
  },
  {
    id: 'world-rh-skybridge',
    age_tier: 'ages_8_9',
    title: 'Skybridge Relay',
    description: 'Race across floating bridges and gather signal tokens.',
    companion_name: 'Zip',
    theme_config: {
      primary: '#2F6FED',
      secondary: '#A7F3D0',
      accent: '#F97316',
      background: '#EEF6FF',
      icon: '🌉',
    },
    system_prompt_seed:
      'RealmHopper skybridge quest. Include choices, inventory hooks, and gentle challenges.',
  },
  // FableForge
  {
    id: 'world-ff-ember',
    age_tier: 'ages_10_12',
    title: 'Emberwood Chronicle',
    description: 'Rebuild a woodland kingdom with gear, stats, and multi-step quests.',
    companion_name: 'Ash',
    theme_config: {
      primary: '#0F766E',
      secondary: '#F59E0B',
      accent: '#DC2626',
      background: '#F0FDFA',
      icon: '🌳',
    },
    system_prompt_seed:
      'FableForge RPG. Track quest log, gear, and stats. Middle-grade narration. Strictly G-rated.',
  },
  {
    id: 'world-ff-starforge',
    age_tier: 'ages_10_12',
    title: 'Starforge Outpost',
    description: 'Design a hero crew and protect a peaceful space village.',
    companion_name: 'Lyra',
    theme_config: {
      primary: '#0F766E',
      secondary: '#38BDF8',
      accent: '#F59E0B',
      background: '#ECFEFF',
      icon: '🚀',
    },
    system_prompt_seed:
      'FableForge world-builder outpost. Modular hero choices. Multi-step peaceful quests.',
  },
];

export function worldsForTier(ageTier: KidProfile['age_tier']): RealmWorld[] {
  return STARTER_WORLDS.filter((w) => w.age_tier === ageTier);
}

export function getWorldById(worldId: string): RealmWorld | undefined {
  return STARTER_WORLDS.find((w) => w.id === worldId);
}

export function getAvatarEmoji(avatarId: string): string {
  const map: Record<string, string> = {
    fox: '🦊',
    owl: '🦉',
    panda: '🐼',
    dragon: '🐉',
    robot: '🤖',
    unicorn: '🦄',
  };
  return map[avatarId] ?? '⭐';
}
