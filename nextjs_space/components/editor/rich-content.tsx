'use client';

import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { looksLikeHtml, promoteImages } from '@/lib/rich-text';
import { cn } from '@/lib/utils';

marked.setOptions({ gfm: true, breaks: true });

/** Markdown and/or HTML → sanitized HTML, with `<img>` tags kept. Browser only (DOMPurify needs the DOM). */
export function renderRich(source: string): string {
  const raw = source ?? '';
  const promoted = promoteImages(raw);
  const html = looksLikeHtml(raw)
    ? promoted
    : marked.parse(promoted, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['img'],
    ADD_ATTR: ['target', 'src', 'alt', 'title', 'width', 'height'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'object', 'embed'],
  });
}

let hooked = false;
function hookLinks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
}

/** Renders a character bio/definition that may contain HTML styling, Markdown, or both. */
export function RichContent({ content, className }: { content: string; className?: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    queueMicrotask(() => {
      if (cancel) return;
      hookLinks();
      try {
        setHtml(renderRich(content));
      } catch (err) {
        console.error('Failed to render rich text:', err);
        setHtml(null);
      }
    });
    return () => { cancel = true; };
  }, [content]);

  if (html === null) {
    return <div className={cn('rich-content whitespace-pre-wrap', className)}>{content.replace(/<[^>]+>/g, '')}</div>;
  }
  return <div className={cn('rich-content', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
