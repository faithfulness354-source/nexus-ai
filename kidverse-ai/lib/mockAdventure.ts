import type { AgeTier, AdventureState, HeroBuild, TurnResponse } from '@/types';

const STORY_TURNS: TurnResponse[] = [
  {
    narration: 'The meadow path sparkles. A tiny glowbug waves hello!',
    companion_dialogue: 'Hi friend! Want to hop to the flowers or hug a soft bunny?',
    choices: [
      { label: 'Hop to flowers', icon: '🌼' },
      { label: 'Hug bunny', icon: '🐰' },
      { label: 'Sing a song', icon: '🎵' },
    ],
    state_update: {
      hearts_delta: 1,
      item_gained: 'Soft Petal',
      quest_progress: 'Meet Glowbug',
      badge_unlocked: null,
    },
  },
  {
    narration: 'You found a sunny stone that feels warm and happy.',
    companion_dialogue: 'Wow! Keep it safe. Should we follow the butterfly trail next?',
    choices: [
      { label: 'Follow butterfly', icon: '🦋' },
      { label: 'Sit and rest', icon: '🧺' },
      { label: 'Share snack', icon: '🍎' },
    ],
    state_update: {
      hearts_delta: 1,
      item_gained: 'Sunny Stone',
      quest_progress: 'Warm stone found',
      badge_unlocked: 'Kind Explorer',
    },
  },
];

const HOPPER_TURNS: TurnResponse[] = [
  {
    narration:
      'Crystal light paints the cave walls. A coded door hums with three soft tones. Pip points at a backpack hook nearby.',
    companion_dialogue: 'Riddle time! Which path keeps the crystals singing?',
    choices: [
      { label: 'Tap the blue crystal', icon: '🔵' },
      { label: 'Listen for echoes', icon: '👂' },
      { label: 'Sketch the pattern', icon: '✏️' },
    ],
    state_update: {
      hearts_delta: 0,
      item_gained: 'Echo Chip',
      quest_progress: 'Open the first crystal door',
      badge_unlocked: null,
    },
  },
  {
    narration:
      'The door slides open with a cheerful chime. Inside, a bridge of floating stones waits above a misty drop—perfectly safe with glowing rails.',
    companion_dialogue: 'Nice solve! Grab the signal token before we hop across.',
    choices: [
      { label: 'Grab token', icon: '🪙' },
      { label: 'Test the first stone', icon: '🪨' },
      { label: 'Ask Pip for a hint', icon: '💡' },
    ],
    state_update: {
      hearts_delta: 1,
      item_gained: 'Signal Token',
      quest_progress: 'Cross the glowing bridge',
      badge_unlocked: 'Puzzle Starter',
    },
  },
];

const FABLE_TURNS: TurnResponse[] = [
  {
    narration:
      'Emberwood’s council hall smells like cedar and warm bread. Your quest board lists three peaceful missions, and Ash unrolls a map marked with soft amber ink.',
    companion_dialogue: 'Captain, the festival stalls need a guardian path. Ready to assign gear?',
    choices: [
      { label: 'Equip trail lantern', icon: '🏮' },
      { label: 'Scout the north grove', icon: '🧭' },
      { label: 'Talk to the baker', icon: '🍞' },
    ],
    state_update: {
      hearts_delta: 0,
      item_gained: 'Trail Lantern',
      quest_progress: 'Secure the festival path (1/3)',
      badge_unlocked: null,
    },
  },
  {
    narration:
      'You chart a safe route around the creek. Villagers cheer as your sidekick marks checkpoints. A new gear slot unlocks: Cloak of Calm Winds.',
    companion_dialogue: 'Stats look solid. One more checkpoint and the quest log will glow gold.',
    choices: [
      { label: 'Place second checkpoint', icon: '📍' },
      { label: 'Upgrade cloak', icon: '🧥' },
      { label: 'Review quest log', icon: '📜' },
    ],
    state_update: {
      hearts_delta: 1,
      item_gained: 'Cloak of Calm Winds',
      quest_progress: 'Secure the festival path (2/3)',
      badge_unlocked: 'Quest Lead',
    },
  },
];

function packForTier(tier: AgeTier): TurnResponse[] {
  if (tier === 'ages_5_7') return STORY_TURNS;
  if (tier === 'ages_8_9') return HOPPER_TURNS;
  return FABLE_TURNS;
}

export function createInitialState(hero?: HeroBuild): AdventureState {
  return {
    hearts: 5,
    inventory: [],
    quest_log: hero ? [`Begin: ${hero.quest_goal}`] : ['Begin the adventure'],
    badges: [],
    hero,
    chapter: 1,
    location: 'Starting Grove',
  };
}

export function applyStateUpdate(
  state: AdventureState,
  update: TurnResponse['state_update']
): AdventureState {
  const next: AdventureState = {
    ...state,
    hearts: Math.max(0, Math.min(10, state.hearts + update.hearts_delta)),
    inventory: [...state.inventory],
    quest_log: [...state.quest_log],
    badges: [...state.badges],
  };

  if (update.item_gained && !next.inventory.includes(update.item_gained)) {
    next.inventory.push(update.item_gained);
  }
  if (update.quest_progress) {
    next.quest_log.push(update.quest_progress);
  }
  if (update.badge_unlocked && !next.badges.includes(update.badge_unlocked)) {
    next.badges.push(update.badge_unlocked);
  }
  return next;
}

/** Offline mock turn engine so Expo preview works without Supabase. */
export function mockRealmTurn(params: {
  age_tier: AgeTier;
  turn_index: number;
  player_input: string;
}): TurnResponse {
  const pack = packForTier(params.age_tier);
  const base = pack[params.turn_index % pack.length];
  const input = params.player_input.trim();

  if (!input) return base;

  return {
    ...base,
    companion_dialogue: `${base.companion_dialogue} (You said: “${input.slice(0, 48)}”)`,
  };
}
