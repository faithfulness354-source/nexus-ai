import { prisma } from '@/lib/db';
import {
  DEFAULT_BANNER_NAME_SIZE,
  DEFAULT_PROFILE_STYLE,
  parseBadgePrefs,
  parseProfileStyle,
  sanitizeBadgePrefs,
  sanitizeBannerNameSize,
  sanitizeBgType,
  sanitizeCardOpacity,
  sanitizeMediaUrl,
  sanitizeProfileStyle,
  sanitizeSongUrl,
  ROYAL_BLUE_ALLOY,
  type BadgePrefs,
  type ProfileStyle,
} from '@/lib/profile';

export interface ProfileExtras {
  profileSongUrl: string;
  profileStyle: ProfileStyle;
  badgePrefs: BadgePrefs;
  bannerNameSize: number;
  bannerNameColor: string;
  bannerNameGlow: boolean;
  profileBgType: 'image' | 'video';
  profileBgUrl: string;
  profileBgVideoUrl: string;
  profileCardOpacity: number;
  bannerMediaType: 'image' | 'video';
  bannerVideoUrl: string;
}

const EMPTY: ProfileExtras = {
  profileSongUrl: '',
  profileStyle: { ...DEFAULT_PROFILE_STYLE },
  badgePrefs: { order: [], hidden: [] },
  bannerNameSize: DEFAULT_BANNER_NAME_SIZE,
  bannerNameColor: '',
  bannerNameGlow: false,
  profileBgType: 'image',
  profileBgUrl: '',
  profileBgVideoUrl: '',
  profileCardOpacity: 35,
  bannerMediaType: 'image',
  bannerVideoUrl: '',
};

function hexColor(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (raw === ROYAL_BLUE_ALLOY) return ROYAL_BLUE_ALLOY;
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '';
}

/** Reads MySpace-style profile fields. A missing column keeps the defaults. */
export async function readProfileExtras(userId: string): Promise<ProfileExtras> {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "profileSongUrl", "profileStyle", "badgePrefs", "bannerNameSize", "bannerNameColor", "bannerNameGlow",
             "profileBgType", "profileBgUrl", "profileBgVideoUrl", "profileCardOpacity",
             "bannerMediaType", "bannerVideoUrl"
      FROM "User" WHERE id = ${userId}
    `;
    const row = rows[0];
    if (!row) return { ...EMPTY, profileStyle: { ...DEFAULT_PROFILE_STYLE } };
    const cell = (name: string) => {
      if (name in row) return row[name];
      const match = Object.keys(row).find((key) => key.replace(/"/g, '') === name);
      return match ? row[match] : undefined;
    };
    return {
      profileSongUrl: sanitizeSongUrl(String(cell('profileSongUrl') ?? '')),
      profileStyle: parseProfileStyle(cell('profileStyle') as string | null),
      badgePrefs: parseBadgePrefs(cell('badgePrefs') as string | null),
      bannerNameSize: sanitizeBannerNameSize(cell('bannerNameSize')),
      bannerNameColor: hexColor(cell('bannerNameColor')),
      bannerNameGlow: cell('bannerNameGlow') === true || cell('bannerNameGlow') === 't' || cell('bannerNameGlow') === 1,
      profileBgType: sanitizeBgType(cell('profileBgType')),
      profileBgUrl: sanitizeMediaUrl(String(cell('profileBgUrl') ?? '')),
      profileBgVideoUrl: sanitizeMediaUrl(String(cell('profileBgVideoUrl') ?? '')),
      profileCardOpacity: sanitizeCardOpacity(cell('profileCardOpacity')),
      bannerMediaType: sanitizeBgType(cell('bannerMediaType')),
      bannerVideoUrl: sanitizeMediaUrl(String(cell('bannerVideoUrl') ?? '')),
    };
  } catch (err) {
    console.warn('Profile style fields are unavailable', err instanceof Error ? err.message : 'unknown');
    return { ...EMPTY, profileStyle: { ...DEFAULT_PROFILE_STYLE } };
  }
}

export async function writeProfileExtras(userId: string, extras: ProfileExtras): Promise<void> {
  const song = sanitizeSongUrl(extras.profileSongUrl);
  const style = JSON.stringify(sanitizeProfileStyle(extras.profileStyle));
  const badges = JSON.stringify(sanitizeBadgePrefs(extras.badgePrefs));
  const size = sanitizeBannerNameSize(extras.bannerNameSize);
  const color = hexColor(extras.bannerNameColor);
  const glow = !!extras.bannerNameGlow;
  const bgType = sanitizeBgType(extras.profileBgType);
  const bgUrl = sanitizeMediaUrl(extras.profileBgUrl);
  const bgVideo = sanitizeMediaUrl(extras.profileBgVideoUrl);
  const cardOpacity = sanitizeCardOpacity(extras.profileCardOpacity);
  const bannerType = sanitizeBgType(extras.bannerMediaType);
  const bannerVideo = sanitizeMediaUrl(extras.bannerVideoUrl);
  await prisma.$executeRaw`
    UPDATE "User"
    SET "profileSongUrl" = ${song}, "profileStyle" = ${style}, "badgePrefs" = ${badges},
        "bannerNameSize" = ${size}, "bannerNameColor" = ${color}, "bannerNameGlow" = ${glow},
        "profileBgType" = ${bgType}, "profileBgUrl" = ${bgUrl}, "profileBgVideoUrl" = ${bgVideo},
        "profileCardOpacity" = ${cardOpacity},
        "bannerMediaType" = ${bannerType}, "bannerVideoUrl" = ${bannerVideo}
    WHERE id = ${userId}
  `;
}
