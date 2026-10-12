import Link from 'next/link';
import type { LegalPolicy } from '@/src/content/legal/types';

const RELATED = [
  ['/terms', 'Terms of Service'],
  ['/privacy', 'Privacy Policy'],
  ['/dmca', 'DMCA & Take It Down'],
  ['/guidelines', 'Acceptable Use'],
] as const;

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        const link = part.match(/^\[\[(.+)\|(.+)\]\]$/);
        if (link) return <Link key={index} href={link[2]} className="text-primary hover:underline">{link[1]}</Link>;
        const strong = part.match(/^\*\*(.+)\*\*$/);
        if (strong) return <span key={index} className="font-medium text-foreground">{strong[1]}</span>;
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function PolicyView({ policy }: { policy: LegalPolicy }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Nexus AI</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{policy.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective {policy.effective}</p>
      <article className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
        {policy.sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{section.title}</h2>
            {section.blocks.map((block, index) => block.kind === 'list' ? (
              <ul key={index} className="list-disc space-y-2 pl-5">
                {block.items.map((item) => <li key={item}><RichText text={item} /></li>)}
              </ul>
            ) : (
              <p key={index}><RichText text={block.text} /></p>
            ))}
          </section>
        ))}
        <p>
          Related:{' '}
          {RELATED.map(([href, label], index) => (
            <span key={href}>
              {index > 0 && ' · '}
              <Link href={href} className="text-primary hover:underline">{label}</Link>
            </span>
          ))}
        </p>
      </article>
    </main>
  );
}
