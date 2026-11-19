import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DEMO_KID_PROFILES } from '@/constants/mockData';
import { DEMO_PARENT_PIN } from '@/constants/themes';
import type { AgeTier, AdventureSession, KidProfile } from '@/types';

const PROFILES_KEY = 'kidverse.profiles.v1';
const SESSIONS_KEY = 'kidverse.sessions.v1';
const PIN_KEY = 'kidverse.parent_pin.v1';

/** Sync cache so router.push after saveSession can resolve the session immediately. */
const sessionCache = new Map<string, AdventureSession>();

interface ProfilesContextValue {
  profiles: KidProfile[];
  sessions: AdventureSession[];
  loading: boolean;
  parentUnlocked: boolean;
  unlockParent: (pin: string) => boolean;
  lockParent: () => void;
  upsertProfile: (profile: KidProfile) => Promise<void>;
  setAgeTier: (kidId: string, age_tier: AgeTier) => Promise<void>;
  setDailyLimit: (kidId: string, limit: number) => Promise<void>;
  saveSession: (session: AdventureSession) => Promise<void>;
  getSession: (sessionId: string) => AdventureSession | undefined;
  getProfile: (kidId: string) => KidProfile | undefined;
  incrementMessageUse: (kidId: string) => Promise<boolean>;
  resetDemoData: () => Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<KidProfile[]>(DEMO_KID_PROFILES);
  const [sessions, setSessions] = useState<AdventureSession[]>([]);
  // Demo profiles are available immediately so Expo web/SSR never blocks on storage.
  const loading = false;
  const [parentUnlocked, setParentUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawProfiles, rawSessions, pin] = await Promise.all([
          AsyncStorage.getItem(PROFILES_KEY),
          AsyncStorage.getItem(SESSIONS_KEY),
          AsyncStorage.getItem(PIN_KEY),
        ]);
        if (cancelled) return;
        if (rawProfiles) setProfiles(JSON.parse(rawProfiles));
        if (rawSessions) {
          const parsed = JSON.parse(rawSessions) as AdventureSession[];
          parsed.forEach((s) => sessionCache.set(s.id, s));
          setSessions(parsed);
        }
        if (!pin) await AsyncStorage.setItem(PIN_KEY, DEMO_PARENT_PIN);
      } catch {
        // Keep in-memory demo profiles if storage is unavailable (e.g. private web).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistProfiles = useCallback(async (next: KidProfile[]) => {
    setProfiles(next);
    try {
      await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(next));
    } catch {
      // In-memory state remains authoritative for Expo preview.
    }
  }, []);

  const persistSessions = useCallback(async (next: AdventureSession[]) => {
    next.forEach((s) => sessionCache.set(s.id, s));
    setSessions(next);
    try {
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
    } catch {
      // In-memory state remains authoritative for Expo preview.
    }
  }, []);

  const unlockParent = useCallback((pin: string) => {
    const ok = pin === DEMO_PARENT_PIN;
    setParentUnlocked(ok);
    return ok;
  }, []);

  const lockParent = useCallback(() => setParentUnlocked(false), []);

  const upsertProfile = useCallback(
    async (profile: KidProfile) => {
      const exists = profiles.some((p) => p.id === profile.id);
      const next = exists
        ? profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...profiles, profile];
      await persistProfiles(next);
    },
    [persistProfiles, profiles]
  );

  const setAgeTier = useCallback(
    async (kidId: string, age_tier: AgeTier) => {
      const next = profiles.map((p) => (p.id === kidId ? { ...p, age_tier } : p));
      await persistProfiles(next);
    },
    [persistProfiles, profiles]
  );

  const setDailyLimit = useCallback(
    async (kidId: string, limit: number) => {
      const next = profiles.map((p) =>
        p.id === kidId ? { ...p, daily_message_limit: Math.max(5, Math.min(200, limit)) } : p
      );
      await persistProfiles(next);
    },
    [persistProfiles, profiles]
  );

  const saveSession = useCallback(
    async (session: AdventureSession) => {
      sessionCache.set(session.id, session);
      const next = sessions.some((s) => s.id === session.id)
        ? sessions.map((s) => (s.id === session.id ? session : s))
        : [...sessions, session];
      await persistSessions(next);
    },
    [persistSessions, sessions]
  );

  const getSession = useCallback(
    (sessionId: string) => sessionCache.get(sessionId) ?? sessions.find((s) => s.id === sessionId),
    [sessions]
  );

  const getProfile = useCallback(
    (kidId: string) => profiles.find((p) => p.id === kidId),
    [profiles]
  );

  const incrementMessageUse = useCallback(
    async (kidId: string) => {
      const profile = profiles.find((p) => p.id === kidId);
      if (!profile) return false;
      if (profile.messages_used_today >= profile.daily_message_limit) return false;
      const next = profiles.map((p) =>
        p.id === kidId ? { ...p, messages_used_today: p.messages_used_today + 1 } : p
      );
      await persistProfiles(next);
      return true;
    },
    [persistProfiles, profiles]
  );

  const resetDemoData = useCallback(async () => {
    await persistProfiles(DEMO_KID_PROFILES);
    await persistSessions([]);
  }, [persistProfiles, persistSessions]);

  const value = useMemo(
    () => ({
      profiles,
      sessions,
      loading,
      parentUnlocked,
      unlockParent,
      lockParent,
      upsertProfile,
      setAgeTier,
      setDailyLimit,
      saveSession,
      getSession,
      getProfile,
      incrementMessageUse,
      resetDemoData,
    }),
    [
      profiles,
      sessions,
      loading,
      parentUnlocked,
      unlockParent,
      lockParent,
      upsertProfile,
      setAgeTier,
      setDailyLimit,
      saveSession,
      getSession,
      getProfile,
      incrementMessageUse,
      resetDemoData,
    ]
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles() {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error('useProfiles must be used within ProfilesProvider');
  return ctx;
}
