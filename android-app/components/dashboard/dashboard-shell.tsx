'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRound, BookOpen, Code2, Palette, Users } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { cn } from '@/lib/utils';

export const HUBS = [
  { href: '/dashboard/personas', label: 'Personas', icon: UserRound, blurb: 'Who you are in the story' },
  { href: '/dashboard/lorebooks', label: 'Lorebooks', icon: BookOpen, blurb: 'World knowledge on demand' },
  { href: '/dashboard/scripts', label: 'Custom Scripts', icon: Code2, blurb: 'Regex & prompt automation' },
  { href: '/dashboard/profile', label: 'Profile', icon: Palette, blurb: 'Your public creator page' },
  { href: '/dashboard/profiles', label: 'Profiles', icon: Users, blurb: 'Every creator on Nexus AI' },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16">
        <div className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage everything that shapes your roleplay.</p>
        </div>
        <nav className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" aria-label="Dashboard hubs">
          {HUBS.map(({ href, label, icon: Icon, blurb }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3 ring-1 transition-all',
                  active ? 'bg-primary/15 ring-primary/50 text-foreground shadow-lg shadow-primary/10' : 'bg-card ring-white/5 text-muted-foreground hover:text-foreground hover:ring-primary/30'
                )}
              >
                <span className={cn('h-9 w-9 shrink-0 rounded-lg flex items-center justify-center', active ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{label}</span>
                  <span className="hidden sm:block text-[11px] text-muted-foreground truncate">{blurb}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}
