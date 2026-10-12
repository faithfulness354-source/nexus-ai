'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Only one card auto-starts; the rest wait for a click so a gallery doesn't play every track at once. */
let leaderId: string | null = null;

export function CharacterAudioPlayer({
  audioUrl,
  label = 'Character',
  className,
}: {
  audioUrl?: string | null;
  label?: string;
  className?: string;
}) {
  const src = (audioUrl ?? '').trim();
  const id = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    audio.loop = true;
    const amLeader = leaderId === null || leaderId === id;
    if (amLeader) leaderId = id;
    let cancelled = false;

    async function start() {
      if (!audio || !amLeader) return;
      try {
        audio.muted = false;
        await audio.play();
        if (cancelled) return;
        setMuted(false);
        setPlaying(true);
        setNeedsGesture(false);
      } catch {
        // Browsers block unmuted autoplay. A muted start still counts as playing; unmute waits for a tap.
        try {
          audio.muted = true;
          await audio.play();
          if (cancelled) return;
          setMuted(true);
          setPlaying(true);
          setNeedsGesture(false);
        } catch {
          if (cancelled) return;
          setPlaying(false);
          setNeedsGesture(true);
        }
      }
    }

    void start();
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      cancelled = true;
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      if (leaderId === id) leaderId = null;
    };
  }, [src, id]);

  if (!src) return null;

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    document.querySelectorAll('audio[data-character-audio]').forEach((node) => {
      if (node !== audio) (node as HTMLAudioElement).pause();
    });
    leaderId = id;
    try {
      await audio.play();
      setPlaying(true);
      setNeedsGesture(false);
    } catch {
      setPlaying(false);
      setNeedsGesture(true);
    }
  }

  async function toggleMute() {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !audio.muted;
    audio.muted = next;
    setMuted(next);
    if (!next && audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
        setNeedsGesture(false);
      } catch {
        setNeedsGesture(true);
      }
    }
  }

  return (
    <div className={cn('pointer-events-auto flex items-center gap-1 rounded-full bg-black/75 p-1 text-white shadow-lg ring-1 ring-white/15', className)}>
      <audio ref={audioRef} src={src} preload="auto" loop playsInline data-character-audio={id} />
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void togglePlay(); }}
        aria-label={playing ? `Pause ${label} audio` : `Play ${label} audio`}
        title={needsGesture ? 'Tap to play' : playing ? 'Pause' : 'Play'}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleMute(); }}
        aria-label={muted ? `Unmute ${label} audio` : `Mute ${label} audio`}
        aria-pressed={muted}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
