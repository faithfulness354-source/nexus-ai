'use client';

import { useEffect, useRef, useState } from 'react';

const EDGE = '#050B14';
const SRC = '/splash/intro.mp4';
const SCALE = 0.686375;

type Props = { onComplete?: () => void };

export function StartupSplash({ onComplete }: Props) {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const done = useRef(false);

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
    console.warn('Splash video play blocked, bypassing:', video.error?.message || 'media error');
    finish();
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const close = () => finish();
    video.parentElement?.setAttribute('data-splash', 'live');
    video.addEventListener('ended', close);
    const watch = window.setInterval(() => {
      if (video.ended || (video.duration > 0 && video.currentTime >= video.duration - 0.2)) close();
    }, 300);
    const watchdog = window.setTimeout(close, 17000);
    const stall = window.setTimeout(() => {
      if (done.current) return;
      const current = videoRef.current;
      const started = !!current && !current.error && current.currentTime > 0 && !current.paused;
      if (!started) {
        console.warn('Splash video play blocked, bypassing: playback stalled');
        finish();
      }
    }, 3500);

    const reveal = () => {
      if (done.current) return;
      video.muted = false;
      video.volume = 1;
      setShown(true);
      if (video.paused) {
        void video.play().catch((err) => {
          console.warn('Splash video play blocked, bypassing:', err);
          finish();
        });
      }
    };
    video.muted = true;
    void video.play().then(reveal).catch((err) => {
      console.warn('Splash video play blocked, bypassing:', err);
      finish();
    });

    return () => {
      video.removeEventListener('ended', close);
      window.clearInterval(watch);
      window.clearTimeout(watchdog);
      window.clearTimeout(stall);
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
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 200,
        width: '100%',
        height: '100%',
        backgroundColor: EDGE,
        overflow: 'hidden',
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
      `}</style>
      <video
        ref={videoRef}
        src={SRC}
        autoPlay
        muted
        controls={false}
        loop
        playsInline
        preload="auto"
        onPlaying={() => setShown(true)}
        onEnded={finish}
        onError={onVideoError}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `max(calc(100vw * ${SCALE}), calc(100vh * ${(1280 / 720) * SCALE}))`,
          height: `max(calc(100vh * ${SCALE}), calc(100vw * ${(720 / 1280) * SCALE}))`,
          maxWidth: 'none',
          objectFit: 'fill',
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
