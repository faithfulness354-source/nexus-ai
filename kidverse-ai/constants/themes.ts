import type { AgeTier, RealmTheme } from '@/types';

export const REALM_THEMES: Record<AgeTier, RealmTheme> = {
  ages_5_7: {
    id: 'storysprout',
    age_tier: 'ages_5_7',
    name: 'StorySprout',
    tagline: 'Voice-first picture adventures',
    colors: {
      primary: '#2BB673',
      secondary: '#FFE566',
      accent: '#FF8A5B',
      background: '#E8FFF3',
      surface: '#FFFFFF',
      text: '#1F4D3A',
      textMuted: '#4F7A66',
      success: '#3DDC97',
    },
    typography: {
      titleSize: 34,
      bodySize: 22,
      choiceSize: 20,
    },
    speech: {
      rate: 0.9,
      pitch: 1.15,
      autoSpeak: true,
    },
    hud: 'storysprout',
  },
  ages_8_9: {
    id: 'realmhopper',
    age_tier: 'ages_8_9',
    name: 'RealmHopper',
    tagline: 'Quests, puzzles & backpack loot',
    colors: {
      primary: '#2F6FED',
      secondary: '#7BE0FF',
      accent: '#FFB020',
      background: '#EAF3FF',
      surface: '#FFFFFF',
      text: '#16325C',
      textMuted: '#4A668C',
      success: '#2BB673',
    },
    typography: {
      titleSize: 30,
      bodySize: 18,
      choiceSize: 17,
    },
    speech: {
      rate: 1.0,
      pitch: 1.05,
      autoSpeak: false,
    },
    hud: 'realmhopper',
  },
  ages_10_12: {
    id: 'fableforge',
    age_tier: 'ages_10_12',
    name: 'FableForge',
    tagline: 'Forge heroes. Build worlds. Quest on.',
    colors: {
      primary: '#0F766E',
      secondary: '#F59E0B',
      accent: '#DC2626',
      background: '#F0FDFA',
      surface: '#FFFFFF',
      text: '#134E4A',
      textMuted: '#3F6F6A',
      success: '#059669',
    },
    typography: {
      titleSize: 28,
      bodySize: 16,
      choiceSize: 15,
    },
    speech: {
      rate: 1.0,
      pitch: 1.0,
      autoSpeak: false,
    },
    hud: 'fableforge',
  },
};

export const SAFE_NICKNAMES = [
  'Sunny',
  'Pixel',
  'Maple',
  'Comet',
  'Echo',
  'Breeze',
  'Nova',
  'Pebble',
  'Spark',
  'River',
] as const;

export const SAFE_AVATARS = [
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'dragon', emoji: '🐉', label: 'Dragon' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
] as const;

export const HERO_PRESETS = {
  archetypes: ['Brave Explorer', 'Clever Inventor', 'Kind Guardian', 'Sky Pilot'],
  sidekicks: ['Glowbug', 'Tiny Robot', 'Talking Map', 'Cloud Pup'],
  quest_goals: ['Find the Lost Star', 'Help the Village', 'Unlock the Gate', 'Save the Festival'],
} as const;

/** Demo parent PIN for local preview only (never ship as production default). */
export const DEMO_PARENT_PIN = '1234';
