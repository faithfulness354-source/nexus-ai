function Flourish({ side }: { side: 'left' | 'right' }) {
  const right = side === 'right';
  return (
    <div className={`flex items-center gap-1.5 flex-1 min-w-0 max-w-[180px] ${right ? 'flex-row-reverse' : ''}`} aria-hidden="true">
      <div className={`fantasy-rule flex-1 ${right ? 'fantasy-rule-r' : ''}`} />
      <svg viewBox="0 0 24 24" className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 drop-shadow-[0_0_6px_rgba(139,92,246,0.8)]">
        <path d="M12 1 L15 12 L12 23 L9 12 Z" fill="#e8c35a" />
        <path d="M1 12 L12 9.5 L23 12 L12 14.5 Z" fill="#c9962e" />
      </svg>
      <div className={`fantasy-rule w-3 sm:w-6 ${right ? 'fantasy-rule-r' : ''}`} />
    </div>
  );
}

export function FantasyBanner() {
  return (
    <section className="relative overflow-hidden px-3 pt-6 pb-4 sm:pt-9 sm:pb-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 45% 70% at 50% 40%, rgba(139,92,246,0.18), transparent 70%), radial-gradient(ellipse 30% 40% at 50% 60%, rgba(34,211,238,0.07), transparent 70%)',
        }}
      />
      <div className="relative mx-auto flex max-w-4xl items-center justify-center gap-2 sm:gap-4">
        <Flourish side="left" />
        <h1 className="fantasy-title shrink-0 text-center text-[22px] min-[400px]:text-[26px] sm:text-4xl lg:text-5xl">
          NEXUS AI
          <span className="block text-[0.52em] tracking-[0.42em] mt-1 pl-[0.42em]">ROLEPLAY</span>
        </h1>
        <Flourish side="right" />
      </div>
    </section>
  );
}
