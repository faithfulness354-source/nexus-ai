'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { History, KeyRound, Plus, UserRound, Compass, CreditCard, LogIn, LogOut, Crown, BookOpen, Code2, Palette, Shield, Users, Wrench } from 'lucide-react';
import { usePersonaName } from '@/lib/persona';
import { useAccess } from '@/components/billing/access-provider';
import { TIERS } from '@/lib/tiers';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ProfileMenu({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const [persona] = usePersonaName();
  const { data: session } = useSession();
  const { status } = useAccess();
  const email = session?.user?.email;
  const avatarUrl = status?.authenticated ? status.avatarUrl?.trim() || null : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!avatarUrl && failedUrl !== avatarUrl;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Profile menu"
          className={`h-9 w-9 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-sm font-bold flex items-center justify-center ring-2 transition ${status?.isAdmin ? 'ring-amber-400/80' : 'ring-transparent hover:ring-primary/60'}`}
        >
          {showImage ? (
            <img
              key={avatarUrl}
              src={avatarUrl}
              alt="Your profile avatar"
              className="h-full w-full object-cover"
              onError={() => setFailedUrl(avatarUrl)}
            />
          ) : (
            (persona[0] ?? 'Y').toUpperCase()
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <span className="truncate">{persona}</span>
          </div>
          {email && <p className="truncate text-[11px] font-normal text-muted-foreground">{email}</p>}
          {status?.authenticated && (
            <p className="flex items-center gap-1 text-[11px] font-medium">
              {status.isAdmin ? (
                <span className="inline-flex items-center gap-1 text-amber-400"><Crown className="h-3 w-3" /> Creator / Admin: unlimited</span>
              ) : (
                <span className="text-muted-foreground">
                  {TIERS[status.tier].name} plan · {status.creditsRemaining === null ? 'unlimited' : `${status.creditsRemaining} credits left`}
                </span>
              )}
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenDrawer}>
          <History className="h-4 w-4 mr-2" /> Chat history &amp; persona
        </DropdownMenuItem>
        {session?.user && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/personas"><UserRound className="h-4 w-4 mr-2" /> Personas</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/lorebooks"><BookOpen className="h-4 w-4 mr-2" /> Lorebooks</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/scripts"><Code2 className="h-4 w-4 mr-2" /> Custom scripts</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile"><Palette className="h-4 w-4 mr-2" /> Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profiles"><Users className="h-4 w-4 mr-2" /> All profiles</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/"><Compass className="h-4 w-4 mr-2" /> Browse characters</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/characters/new"><Plus className="h-4 w-4 mr-2" /> Create character</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=subscription"><CreditCard className="h-4 w-4 mr-2" /> Subscription &amp; Tiers</Link>
        </DropdownMenuItem>
        {status?.isCreatorAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/cards"><Shield className="h-4 w-4 mr-2" /> Card directory</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/maintenance"><Wrench className="h-4 w-4 mr-2" /> Maintenance</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=api"><KeyRound className="h-4 w-4 mr-2" /> API settings</Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {session?.user ? (
          <DropdownMenuItem onSelect={() => signOut({ redirectTo: '/login' })}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/login"><LogIn className="h-4 w-4 mr-2" /> Sign in</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
