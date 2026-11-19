export type AgeTier = 'ages_5_7' | 'ages_8_9' | 'ages_10_12';

export type RealmId = 'storysprout' | 'realmhopper' | 'fableforge';

export interface KidProfile {
  id: string;
  nickname: string;
  avatar_id: string;
  age_tier: AgeTier;
  daily_message_limit: number;
  messages_used_today: number;
  unlocked_badges: string[];
}

export interface RealmWorld {
  id: string;
  age_tier: AgeTier;
  title: string;
  description: string;
  companion_name: string;
  theme_config: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    icon: string;
  };
  system_prompt_seed: string;
}

export interface ChoiceOption {
  label: string;
  icon: string;
}

export interface AdventureState {
  hearts: number;
  inventory: string[];
  quest_log: string[];
  badges: string[];
  hero?: HeroBuild;
  chapter: number;
  location: string;
}

export interface HeroBuild {
  archetype: string;
  sidekick: string;
  quest_goal: string;
}

export interface TurnResponse {
  narration: string;
  companion_dialogue: string;
  choices: ChoiceOption[];
  state_update: {
    hearts_delta: number;
    item_gained: string | null;
    quest_progress: string | null;
    badge_unlocked: string | null;
  };
}

export interface AdventureSession {
  id: string;
  kid_id: string;
  world_id: string;
  age_tier: AgeTier;
  state: AdventureState;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  status: 'active' | 'completed' | 'paused';
  last_turn?: TurnResponse;
}

export interface RealmTheme {
  id: RealmId;
  age_tier: AgeTier;
  name: string;
  tagline: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    success: string;
  };
  typography: {
    titleSize: number;
    bodySize: number;
    choiceSize: number;
  };
  speech: {
    rate: number;
    pitch: number;
    autoSpeak: boolean;
  };
  hud: 'storysprout' | 'realmhopper' | 'fableforge';
}
