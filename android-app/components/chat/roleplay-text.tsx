'use client';

import { Children, isValidElement, cloneElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { htmlImagesToMarkdown, isSafeImageSrc } from '@/lib/rich-text';

const QUOTE_RE = /("[^"\n]+"|“[^”\n]+”)/g;

/** Wraps "spoken dialogue" inside plain text nodes with a highlighted span. */
function highlightQuotes(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      const parts = child.split(QUOTE_RE);
      if (parts.length === 1) return child;
      return parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rp-speech">{part}</span>
        ) : (
          part
        )
      );
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props?.children && typeof child.type !== 'string') {
      return cloneElement(child, undefined, highlightQuotes(child.props.children));
    }
    return child;
  });
}

const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{highlightQuotes(children)}</p>,
  li: ({ children }) => <li className="mb-1">{highlightQuotes(children)}</li>,
  em: ({ children }) => <em className="rp-action">{highlightQuotes(children)}</em>,
  strong: ({ children }) => <strong className="font-bold text-foreground">{highlightQuotes(children)}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/50 pl-3 my-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className={`${className} text-xs font-mono`}>{children}</code>
    ) : (
      <code className="bg-secondary px-1 py-0.5 rounded text-xs font-mono">{children}</code>
    ),
  pre: ({ children }) => <pre className="bg-secondary rounded-lg p-3 my-3 overflow-x-auto max-w-full">{children}</pre>,
  img: ({ src, alt }) => {
    const url = typeof src === 'string' ? src : '';
    if (!isSafeImageSrc(url)) return null;
    return <img src={url} alt={typeof alt === 'string' ? alt : ''} className="rp-image" />;
  },
};

export function RoleplayText({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="rp-text text-[15px] leading-relaxed break-words [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) => (/^\s*(javascript:|data:|vbscript:)/i.test(url) || url.startsWith('//') ? '' : url)}
      >
        {htmlImagesToMarkdown(content)}
      </ReactMarkdown>
      {streaming && <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />}
    </div>
  );
}
