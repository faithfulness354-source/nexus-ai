'use client';

import { createContext, useContext } from 'react';

export const GLITCH_LOOP_SRC = '/media/glitch_background_loop.mp4';

const GlitchSrcContext = createContext(GLITCH_LOOP_SRC);

export function GlitchSrcProvider({ src, children }: { src?: string; children: React.ReactNode }) {
  return <GlitchSrcContext.Provider value={src?.trim() || GLITCH_LOOP_SRC}>{children}</GlitchSrcContext.Provider>;
}

/** Video plus the opacity-slider shade. Negative z-index stays behind existing children. */
export function BoxGlitchLayers() {
  const src = useContext(GlitchSrcContext);
  return (
    <>
      <video autoPlay loop muted playsInline className="box-glitch-video pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" src={src} />
      <div
        className="box-glitch-shade pointer-events-none absolute inset-0 z-10 transition-opacity duration-150"
        style={{ backgroundColor: 'rgba(0, 0, 0, var(--glitch-overlay-opacity, 0.5))' }}
      />
    </>
  );
}
