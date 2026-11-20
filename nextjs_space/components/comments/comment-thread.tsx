'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flag, Loader2, Pin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CommentItem {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
  flagged: boolean;
  pinned: boolean;
  canDelete: boolean;
  canPin: boolean;
  canReport: boolean;
}

export function CommentThread({ type, targetId, title }: { type: 'card' | 'profile'; targetId: string; title: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const path = usePathname() || '/';

  useEffect(() => {
    let cancel = false;
    fetch(`/api/comments?type=${type}&target=${encodeURIComponent(targetId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Could not load comments');
        return data;
      })
      .then((data) => {
        if (cancel) return;
        setComments(Array.isArray(data.comments) ? data.comments : []);
        setSignedIn(!!data.signedIn);
      })
      .catch((err: Error) => { if (!cancel) setError(err.message); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [type, targetId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim() || posting) return;
    setPosting(true);
    setError('');
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, targetId, content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not post that comment');
      setComments(Array.isArray(data.comments) ? data.comments : []);
      setContent('');
      setSignedIn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post that comment');
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    setError('');
    try {
      const response = await fetch('/api/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, targetId, id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not delete that comment');
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete that comment';
      setError(message);
      toast.error(message);
    }
  }

  async function act(id: string, action: 'report' | 'pin' | 'unpin') {
    setError('');
    try {
      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, targetId, id, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not update that comment');
      setComments(Array.isArray(data.comments) ? data.comments : []);
      if (action === 'report') toast.success('Comment reported');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update that comment';
      setError(message);
      toast.error(message);
    }
  }

  return (
    <section className="mt-8 rounded-2xl bg-card p-4 ring-1 ring-white/10 sm:p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {signedIn ? (
        <form onSubmit={(event) => void submit(event)} className="mt-3 space-y-2">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={type === 'profile' ? 'Sign the guestbook…' : 'Write a comment…'}
            className="w-full scroll-mt-24 rounded-xl bg-secondary px-3 py-2 text-base outline-none ring-1 ring-white/10 focus:ring-primary"
          />
          <button type="submit" disabled={posting || !content.trim()} className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {posting ? 'Posting…' : 'Post'}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          <Link href={`/login?callbackUrl=${encodeURIComponent(path)}`} className="font-semibold text-primary">Sign in</Link> to leave a comment.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className={`rounded-xl px-3 py-2 ${comment.pinned ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-secondary/50'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold">{comment.pinned ? 'Pinned · ' : ''}{comment.authorName}</p>
                <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
              {comment.flagged && comment.canDelete && <p className="mt-1 text-[11px] font-semibold text-amber-200">Reported</p>}
              <div className="mt-1 flex flex-wrap gap-1">
                {comment.canDelete && (
                  <button type="button" aria-label="Delete comment" onClick={() => void remove(comment.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {comment.canReport && (
                  <button type="button" aria-label="Report comment" onClick={() => void act(comment.id, 'report')} className="inline-flex h-11 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <Flag className="h-4 w-4" /> Report
                  </button>
                )}
                {comment.canPin && (
                  <button type="button" aria-label={comment.pinned ? 'Unpin comment' : 'Pin comment'} onClick={() => void act(comment.id, comment.pinned ? 'unpin' : 'pin')} className="inline-flex h-11 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <Pin className="h-4 w-4" /> {comment.pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
