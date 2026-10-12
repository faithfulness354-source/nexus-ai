'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Compass, Plus, KeyRound, Sparkles, X, Check, Pencil, MessageSquare, CreditCard, UserRound, BookOpen, Code2, Palette, Shield, Users, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersonaName } from '@/lib/persona';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { useAccess } from '@/components/billing/access-provider';
import { useNsfwView } from '@/lib/nsfw-view';

interface DrawerSession {
  id: string;
  title: string;
  characterId: string;
  character?: { name: string; avatar: string | null } | null;
  updatedAt: string;
}

const NAV = [
  { href: '/', label: 'Browse Characters', icon: Compass },
  { href: '/characters/new', label: 'Create Character', icon: Plus },
  { href: '/settings?tab=subscription', label: 'Subscription & Tiers', icon: CreditCard },
];

const DASHBOARD_NAV = [
  { href: '/dashboard/personas', label: 'Personas', icon: UserRound },
  { href: '/dashboard/lorebooks', label: 'Lorebooks', icon: BookOpen },
  { href: '/dashboard/scripts', label: 'Custom Scripts', icon: Code2 },
  { href: '/dashboard/profile', label: 'Profile', icon: Palette },
  { href: '/dashboard/profiles', label: 'All profiles', icon: Users },
];

export function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSession = searchParams?.get('session');
  const [sessions, setSessions] = useState<DrawerSession[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const { status } = useAccess();
  const nsfwView = useNsfwView();
  const [persona, setPersona] = usePersonaName();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  // Refresh active chats every time the drawer opens
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setChatsLoading(true);
    fetch(`/api/sessions?nsfw=${nsfwView ? 'true' : 'false'}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any) => { if (!cancel) setSessions(Array.isArray(data) ? data.slice(0, 30) : []); })
      .catch((err) => { if (!cancel) console.error('Failed to load sessions', err); })
      .finally(() => { if (!cancel) setChatsLoading(false); });
    return () => { cancel = true; };
  }, [open, nsfwView]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  function saveName() {
    setPersona(draftName);
    setEditingName(false);
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />
      <aside
        aria-label="Main menu"
        aria-hidden={!open}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] flex flex-col bg-card shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full invisible'
        )}
      >
        <div className="flex items-center justify-between px-4 h-14 shrink-0">
          <Link href="/" onClick={onClose} className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-display font-bold text-lg tracking-tight">NexusAI</span>
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Profile */}
        <div className="mx-3 mb-3 rounded-xl bg-secondary/60 p-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0">
            {(persona[0] ?? 'Y').toUpperCase()}
          </div>
          {editingName ? (
            <form className="flex-1 flex items-center gap-1 min-w-0" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Your persona name"
                className="flex-1 min-w-0 bg-background rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <button type="submit" aria-label="Save name" className="h-7 w-7 rounded-md flex items-center justify-center text-primary hover:bg-primary/10">
                <Check className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{persona}</p>
              <button
                type="button"
                onClick={() => { setDraftName(persona === 'You' ? '' : persona); setEditingName(true); }}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" /> Edit persona name
              </button>
            </div>
          )}
        </div>

        <nav className="px-3 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === href ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
          {status?.isCreatorAdmin && (
            <Link
              href="/dashboard/cards"
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === '/dashboard/cards' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Shield className="h-4 w-4 shrink-0" />
              Card directory
            </Link>
          )}
          {status?.isCreatorAdmin && (
            <Link
              href="/admin/maintenance"
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === '/admin/maintenance' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Wrench className="h-4 w-4 shrink-0" />
              Maintenance
            </Link>
          )}
          {status?.isCreatorAdmin && (
            <Link
              href="/settings?tab=api"
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === '/settings' && searchParams?.get('tab') === 'api' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <KeyRound className="h-4 w-4 shrink-0" />
              API Settings
            </Link>
          )}
        </nav>

        <div className="mt-5 px-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dashboard</div>
        <nav className="px-3 grid grid-cols-2 gap-1">
          {DASHBOARD_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-w-0',
                pathname === href ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-5 px-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Chats</div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/characters/${s.characterId}/chat?session=${s.id}`}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors min-w-0',
                activeSession === s.id ? 'bg-primary/15' : 'hover:bg-secondary'
              )}
            >
              <CharacterAvatar src={s.character?.avatar} name={s.character?.name ?? s.title} className="h-9 w-9 text-xs" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.character?.name ?? 'Character'}</p>
                <p className="text-xs text-muted-foreground truncate">{s.title}</p>
              </div>
            </Link>
          ))}
          {!chatsLoading && sessions.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" /> {nsfwView ? 'No NSFW chats' : 'No SFW chats'}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
