'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface CommentItem {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
  canDelete: boolean;
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
    const response = await fetch('/api/comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, targetId, id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'Could not delete that comment');
      return;
    }
    setComments(Array.isArray(data.comments) ? data.comments : []);
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
            className="w-full rounded-xl bg-secondary px-3 py-2 text-base outline-none ring-1 ring-white/10 focus:ring-primary"
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
            <li key={comment.id} className="rounded-xl bg-secondary/50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold">{comment.authorName}</p>
                <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
              {comment.canDelete && (
                <button type="button" onClick={() => void remove(comment.id)} className="mt-1 text-xs font-semibold text-muted-foreground hover:text-destructive">Delete</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
