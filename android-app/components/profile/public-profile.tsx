'use client';

import { useEffect, useState } from 'react';
import { useAccess } from '@/components/billing/access-provider';
import { MobileProfileView } from '@/components/profile/mobile-profile-view';
import type { ProfileBadge } from '@/lib/profile';

export interface ProfileCharacter {
  id: string; name: string; title?: string; summary: string; creator?: string; tags: string[];
  avatar: string | null; banner?: string | null; nsfw: boolean; chatCount?: number; ownerId?: string | null;
  audioUrl?: string | null; visibility?: string | null; moderated?: boolean | null;
}

export interface PublicProfileData {
  username: string | null;
  displayName: string | null;
  image: string | null;
  bio: string;
  banner: string | null;
  bannerAnimated: boolean;
  bannerPositionY: number;
  accentTheme: string;
  profileSongUrl?: string;
  badges: ProfileBadge[];
  stats: { characters: number; loreEntries: number; chats: number };
}

export function PublicProfile({ profile, pinned, creations }: {
  profile: PublicProfileData;
  pinned: ProfileCharacter[];
  creations: ProfileCharacter[];
  compact?: boolean;
}) {
  const { status: access } = useAccess();
  const [owned, setOwned] = useState(creations);
  const canEdit = (card: ProfileCharacter) => !!access?.isCreatorAdmin || (!!access?.userId && card.ownerId === access.userId);
  const ownProfile = !!access?.username && profile.username === access.username;

  useEffect(() => {
    setOwned(creations);
  }, [profile.username, creations]);

  return <MobileProfileView profile={profile} pinned={pinned} creations={owned} canEditCard={canEdit} ownProfile={ownProfile} />;
}
