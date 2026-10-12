'use client';

import * as React from 'react';
import { Textarea, type TextareaProps } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Textarea that grows with its content (typing, pasting, external value changes). */
export const AutoTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps & { minHeight?: number }>(
  ({ className, minHeight = 120, onInput, style, ...props }, forwardedRef) => {
    const inner = React.useRef<HTMLTextAreaElement | null>(null);

    const resize = React.useCallback(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight + 2, minHeight)}px`;
    }, [minHeight]);

    React.useLayoutEffect(resize, [resize, props.value]);

    React.useEffect(() => {
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }, [resize]);

    return (
      <Textarea
        {...props}
        ref={(el) => {
          inner.current = el;
          if (typeof forwardedRef === 'function') forwardedRef(el);
          else if (forwardedRef) forwardedRef.current = el;
        }}
        onInput={(e) => { resize(); onInput?.(e); }}
        rows={1}
        style={{ ...style, minHeight }}
        className={cn('resize-none overflow-hidden leading-relaxed', className)}
      />
    );
  }
);
AutoTextarea.displayName = 'AutoTextarea';
