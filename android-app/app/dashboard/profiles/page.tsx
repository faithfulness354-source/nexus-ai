import Link from 'next/link';
import { Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { CharacterAvatar } from '@/components/character/character-avatar';

export const metadata = { title: 'Profiles · NexusAI' };

function plainBio(value: string): string {
  const text = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 140) return text;
  return `${text.slice(0, 137).trimEnd()}…`;
}

export default async function ProfilesDirectoryPage() {
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  const rows = await prisma.user.findMany({
    where: { username: { not: null } },
    select: {
      id: true,
      username: true,
      displayName: true,
      image: true,
      bio: true,
      _count: { select: { characters: { where: { visibility: 'PUBLIC', moderated: false } } } },
    },
  });

  const profiles = rows
    .flatMap((row) => {
      const username = row.username?.trim();
      if (!username) return [];
      return [{
        username,
        name: row.displayName?.trim() || username,
        image: row.image,
        bio: plainBio(row.bio ?? ''),
        characters: row._count.characters,
        isYou: !!viewerId && row.id === viewerId,
      }];
    })
    .sort((a, b) => {
      if (a.isYou !== b.isYou) return a.isYou ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <section>
      <div className="mb-5 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="font-display text-2xl font-bold tracking-tight">All profiles</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Every creator page on Nexus AI. Open one to see that profile’s characters.</p>
      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No public profiles yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((profile) => (
            <Link
              key={profile.username}
              href={`/u/${profile.username}`}
              className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-white/5 transition hover:ring-primary/40"
            >
              <CharacterAvatar src={profile.image} name={profile.name} className="h-12 w-12 text-base" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-display font-semibold">{profile.name}</span>
                  {profile.isYou && <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">You</span>}
                </span>
                <span className="mt-0.5 block truncate text-xs text-primary">@{profile.username}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {profile.characters} public {profile.characters === 1 ? 'character' : 'characters'}
                </span>
                {profile.bio && <span className="mt-1 block truncate text-xs text-muted-foreground">{profile.bio}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
