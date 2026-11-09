'use client';

export function ImagePanel({
  dataUrl,
  alt = 'Generated image',
}: {
  dataUrl: string;
  alt?: string;
}) {
  function download() {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `local-assistant-${Date.now()}.png`;
    anchor.click();
  }

  return (
    <figure className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-ink-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={alt} className="max-h-[28rem] w-full object-contain bg-black/40" />
      <figcaption className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
        <span className="truncate text-xs text-mist-500">Local generation</span>
        <button
          type="button"
          onClick={download}
          className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30"
        >
          Download PNG
        </button>
      </figcaption>
    </figure>
  );
}
