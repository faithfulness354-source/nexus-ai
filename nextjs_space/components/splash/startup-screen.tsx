'use client';

import { useEffect, useRef, useState } from 'react';

const EDGE = '#000';
const SRC = '/splash/intro.mp4';

type Props = { onComplete?: () => void };

export function StartupSplash({ onComplete }: Props) {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const started = useRef(false);

  function finish() {
    if (done.current) return;
    done.current = true;
    onComplete?.();
    setOpen(false);
    const video = videoRef.current;
    if (!video) return;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      /* The picture is already dismissed. Releasing the file is best-effort. */
    }
  }

  function onVideoError() {
    const video = videoRef.current;
    if (!video || done.current) return;
    if (video.error?.code === MediaError.MEDIA_ERR_ABORTED) return;
    console.warn('Splash video could not play:', video.error?.message || 'media error');
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const closeAfterPlay = () => {
      if (!started.current) return;
      finish();
    };
    const markStarted = () => {
      if (done.current) return;
      started.current = true;
      setShown(true);
    };
    const startPlayback = () => {
      if (done.current) return;
      video.muted = false;
      video.volume = 1;
      void video.play().then(markStarted).catch(() => {
        if (done.current) return;
        video.muted = true;
        void video.play().then(markStarted).catch((err) => {
          console.warn('Splash video play blocked, keeping the splash up:', err);
        });
      });
    };

    video.parentElement?.setAttribute('data-splash', 'live');
    video.addEventListener('ended', closeAfterPlay);
    video.addEventListener('playing', markStarted);
    const watch = window.setInterval(() => {
      if (!started.current || done.current) return;
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration < 1) return;
      if (video.ended || video.currentTime >= duration - 0.2) closeAfterPlay();
    }, 300);
    startPlayback();
    const retry = window.setInterval(() => {
      if (done.current || started.current || !video.paused) return;
      startPlayback();
    }, 1000);

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      done.current = false;
      started.current = false;
      setOpen(true);
      setShown(true);
      video.src = SRC;
      try { video.currentTime = 0; } catch { /* The file may still be loading. */ }
      startPlayback();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      video.removeEventListener('ended', closeAfterPlay);
      video.removeEventListener('playing', markStarted);
      window.clearInterval(watch);
      window.clearInterval(retry);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Startup"
      data-splash="4"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <style>{`
        [data-splash] video::-webkit-media-controls,
        [data-splash] video::-webkit-media-controls-enclosure,
        [data-splash] video::-webkit-media-controls-panel,
        [data-splash] video::-webkit-media-controls-play-button,
        [data-splash] video::-webkit-media-controls-start-playback-button,
        [data-splash] video::-webkit-media-controls-overlay-play-button {
          display: none !important;
          opacity: 0 !important;
          -webkit-appearance: none;
          pointer-events: none;
        }
        html[data-native-app="1"] [data-splash] {
          right: 0 !important;
          bottom: 0 !important;
          width: 100% !important;
          height: 100% !important;
          z-index: 200 !important;
          background-color: #050B14 !important;
        }
        html[data-native-app="1"] [data-splash] video {
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: max(calc(100vw * 0.686375), calc(100vh * 1.2206666667)) !important;
          height: max(calc(100vh * 0.686375), calc(100vw * 0.3860859375)) !important;
          max-width: none !important;
          margin: 0 !important;
          object-fit: fill !important;
          object-position: center !important;
          background-color: #050B14 !important;
        }
      `}</style>
      <video
        ref={videoRef}
        src={SRC}
        autoPlay
        muted
        controls={false}
        playsInline
        preload="auto"
        onPlaying={() => setShown(true)}
        onEnded={finish}
        onError={onVideoError}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          objectFit: 'cover',
          objectPosition: 'center',
          backgroundColor: EDGE,
          opacity: shown ? 1 : 0,
          pointerEvents: 'none',
        }}
      />
      <button
        type="button"
        onClick={finish}
        className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm"
        style={{ position: 'absolute', bottom: 40, right: 20, zIndex: 10 }}
      >
        Skip
      </button>
    </div>
  );
}
