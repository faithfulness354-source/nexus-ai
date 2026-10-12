'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Minus, Link2, ImagePlus, Baseline, Highlighter, Loader2, Upload, RemoveFormatting,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadImage } from '@/lib/upload-client';
import { imageTag, isSafeImageSrc, looksLikeHtml, promoteImages, textToHtml } from '@/lib/rich-text';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const FONTS: { group: string; label: string; value: string }[] = [
  { group: 'Standard', label: 'Sans-Serif', value: 'ui-sans-serif, system-ui, sans-serif' },
  { group: 'Standard', label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { group: 'Standard', label: 'Fantasy / Cursive', value: 'Cinzel, "Palatino Linotype", fantasy, cursive' },
  { group: 'Standard', label: 'Monospace', value: 'ui-monospace, "SFMono-Regular", Menlo, monospace' },
  { group: 'Script', label: 'Great Vibes', value: '"Great Vibes", cursive' },
  { group: 'Script', label: 'Pinyon Script', value: '"Pinyon Script", cursive' },
  { group: 'Script', label: 'Satisfy', value: '"Satisfy", cursive' },
  { group: 'Script', label: 'Alex Brush', value: '"Alex Brush", cursive' },
  { group: 'Script', label: 'Sacramento', value: '"Sacramento", cursive' },
  { group: 'Calligraphic', label: 'Calligraphic / Ornamental Flourish Script', value: '"Imperial Script", cursive' },
  { group: 'Display', label: 'UnifrakturMaguntia', value: '"UnifrakturMaguntia", serif' },
  { group: 'Display', label: 'Pirata One', value: '"Pirata One", serif' },
  { group: 'Display', label: 'Cinzel Decorative', value: '"Cinzel Decorative", serif' },
  { group: 'Serif', label: 'Playfair Display', value: '"Playfair Display", serif' },
  { group: 'Serif', label: 'Bodoni Moda', value: '"Bodoni Moda", serif' },
  { group: 'Serif', label: 'Cormorant Garamond', value: '"Cormorant Garamond", serif' },
  { group: 'Futuristic', label: 'Orbitron', value: '"Orbitron", sans-serif' },
  { group: 'Futuristic', label: 'Rajdhani', value: '"Rajdhani", sans-serif' },
  { group: 'Futuristic', label: 'Audiowide', value: '"Audiowide", sans-serif' },
  { group: 'Futuristic', label: 'Share Tech Mono', value: '"Share Tech Mono", monospace' },
  { group: 'Handwritten', label: 'Caveat', value: '"Caveat", cursive' },
  { group: 'Handwritten', label: 'Patrick Hand', value: '"Patrick Hand", cursive' },
];
const FONT_GROUPS = [...new Set(FONTS.map((font) => font.group))];
const SIZES = [
  { label: 'Heading 1', value: 'h1' },
  { label: 'Heading 2', value: 'h2' },
  { label: 'Body', value: 'p' },
  { label: 'Small', value: 'small' },
];
const PRESETS = [
  { name: 'Gold', hex: '#F5C451' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Cyan', hex: '#22D3EE' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'White', hex: '#F4F4F5' },
];

/**
 * Image support for this contentEditable editor.
 * Equivalent to enabling `@tiptap/extension-image`: image URLs become real `<img>` nodes.
 */
const imageExtension = { name: 'image', enabled: true } as const;

const RICH_SANITIZE = {
  ADD_TAGS: ['img'],
  ADD_ATTR: ['src', 'alt', 'title', 'width', 'height'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'object', 'embed'],
};

/** Existing values may be plain text, Markdown or HTML; normalise to sanitized HTML for editing. */
function toEditorHtml(value: string): string {
  if (!value) return '';
  const promoted = promoteImages(value);
  const html = looksLikeHtml(value) ? promoted : (() => {
    try { return marked.parse(promoted, { async: false, gfm: true, breaks: true }) as string; } catch { return textToHtml(promoted); }
  })();
  return DOMPurify.sanitize(html, RICH_SANITIZE);
}

/** Replace completed Markdown images and lone image URLs with `<img>` elements in the canvas. */
function materializeImages(el: HTMLElement): void {
  if (!imageExtension.enabled) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  const sel = window.getSelection();
  for (const node of texts) {
    if (!node.isConnected) continue;
    if (promoteImages(node.data) === node.data) continue;
    const html = toEditorHtml(node.data);
    if (!/<img\b/i.test(html)) continue;
    const caretHere = !!sel && sel.anchorNode === node;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const last = tpl.content.lastChild;
    node.parentNode?.replaceChild(tpl.content, node);
    if (caretHere && last?.parentNode && sel) {
      const range = document.createRange();
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  ariaLabel?: string;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 120, className, ariaLabel }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const toolbarHold = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!value);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [openPanel, setOpenPanel] = useState<null | 'color' | 'highlight' | 'link' | 'image'>(null);
  const [customColor, setCustomColor] = useState('#F5C451');

  // Sync external value changes (initial load, snippet inserts) without clobbering typing.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = toEditorHtml(value);
    lastEmitted.current = value;
    setEmpty(!el.textContent?.trim() && !el.querySelector('img,hr'));
  }, [value]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const emitting = useRef(false);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el || emitting.current) return;
    emitting.current = true;
    try {
      materializeImages(el);
      const isEmpty = !el.textContent?.trim() && !el.querySelector('img,hr');
      const html = isEmpty ? '' : el.innerHTML;
      setEmpty(isEmpty);
      lastEmitted.current = html;
      onChangeRef.current(html);
    } finally {
      emitting.current = false;
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new MutationObserver(() => {
      const node = ref.current;
      if (!node || node.innerHTML === lastEmitted.current) return;
      emit();
    });
    obs.observe(el, { subtree: true, childList: true, characterData: true });
    return () => {
      obs.disconnect();
      emit();
    };
  }, [emit]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      if (toolbarHold.current) return;
      saveSelection();
    };
    const release = () => { toolbarHold.current = false; };
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
    };
  }, [saveSelection]);

  const restoreSelection = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (savedRange.current) sel.addRange(savedRange.current);
    else {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.addRange(r);
    }
  }, []);

  const exec = useCallback((cmd: string, arg?: string) => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, arg);
    saveSelection();
    emit();
  }, [restoreSelection, saveSelection, emit]);

  function applySize(v: string) {
    if (v === 'small') {
      exec('formatBlock', 'p');
      exec('fontSize', '2');
      return;
    }
    if (v === 'h1' || v === 'h2') {
      restoreSelection();
      document.execCommand('styleWithCSS', false, 'false');
      const block = `<${v}>`;
      if (!document.execCommand('formatBlock', false, block)) document.execCommand('formatBlock', false, v);
      saveSelection();
      emit();
      return;
    }
    exec('formatBlock', v);
  }

  function wrapSelection(tag: 'strong' | 'em' | 'span', className: string, style?: string) {
    const sel = window.getSelection();
    const root = ref.current;
    if (!sel || !sel.rangeCount || !root) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer) || range.collapsed) return;
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (style) el.setAttribute('style', style);
    try {
      range.surroundContents(el);
    } catch {
      el.appendChild(range.extractContents());
      range.insertNode(el);
    }
    const next = document.createRange();
    next.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(next);
    savedRange.current = next.cloneRange();
  }

  function applyInline(kind: 'bold' | 'italic') {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'false');
    const applied = document.execCommand(kind === 'bold' ? 'bold' : 'italic', false);
    if (!applied) wrapSelection(kind === 'bold' ? 'strong' : 'em', kind === 'bold' ? 'rt-bold' : 'rt-italic');
    saveSelection();
    emit();
  }

  function applyFont(family: string) {
    restoreSelection();
    const sel = window.getSelection();
    const root = ref.current;
    if (!sel || !root) return;
    if (!sel.rangeCount || !root.contains(sel.anchorNode)) {
      const end = document.createRange();
      end.selectNodeContents(root);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const span = document.createElement('span');
      span.style.fontFamily = family;
      span.appendChild(document.createTextNode('\u200b'));
      range.insertNode(span);
      const caret = document.createRange();
      caret.setStart(span.firstChild!, 1);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
      savedRange.current = caret.cloneRange();
    } else {
      wrapSelection('span', '', `font-family: ${family}`);
    }
    saveSelection();
    emit();
  }

  function applyAlign(align: 'left' | 'center' | 'right' | 'justify') {
    restoreSelection();
    const root = ref.current;
    const sel = window.getSelection();
    if (!root || !sel) return;
    if (!sel.rangeCount || !root.contains(sel.anchorNode)) {
      const end = document.createRange();
      end.selectNodeContents(root);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
    const inline = new Set(['B', 'I', 'EM', 'STRONG', 'SPAN', 'U', 'S', 'A', 'FONT', 'MARK']);
    let node: Node | null = sel.getRangeAt(0).startContainer;
    let block: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
    while (block && block !== root && block.parentElement !== root) block = block.parentElement;
    if (!block || block === root || inline.has(block.tagName)) {
      document.execCommand('formatBlock', false, 'p');
      node = window.getSelection()?.anchorNode ?? null;
      block = node && node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement ?? null;
      while (block && block !== root && block.parentElement !== root) block = block.parentElement;
    }
    if (!block || block === root) return;
    for (const name of ['rt-align-left', 'rt-align-center', 'rt-align-right', 'rt-align-justify']) block.classList.remove(name);
    block.classList.add(`rt-align-${align}`);
    saveSelection();
    emit();
  }

  function insertLink() {
    const url = linkUrl.trim();
    if (!url) return;
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.isCollapsed) exec('insertHTML', `<a href="${encodeURI(href)}">${href.replace(/[<>&"]/g, '')}</a>`);
    else exec('createLink', href);
    setLinkUrl('');
    setOpenPanel(null);
  }

  function insertHtml(html: string) {
    const safe = toEditorHtml(html);
    if (!safe || !imageExtension.enabled) return;
    restoreSelection();
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
      const end = document.createRange();
      end.selectNodeContents(el);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const tpl = document.createElement('template');
    tpl.innerHTML = safe;
    const last = tpl.content.lastChild;
    range.insertNode(tpl.content);
    if (last?.parentNode) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    savedRange.current = range.cloneRange();
    emit();
  }

  function insertImage(src: string) {
    const url = src.trim();
    if (!isSafeImageSrc(url)) return toast.error('Use an http(s) image URL or a site path like /images/scene.png');
    insertHtml(imageTag(url, ''));
    setImageUrl('');
    setOpenPanel(null);
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData('text/plain');
    const html = e.clipboardData.getData('text/html');
    const candidate = /<img\b/i.test(html) ? html : text;
    if (!candidate || !/<img\b|!\[[^\]]*\]\(|https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)/i.test(candidate)) return;
    const safe = toEditorHtml(candidate);
    if (!/<img\b/i.test(safe)) return;
    e.preventDefault();
    insertHtml(safe);
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadImage(file);
      insertImage(up.url);
    } catch (err: any) {
      console.error('Inline image upload failed:', err);
      toast.error(err?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const btn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors';
  const keep = (e: React.PointerEvent) => { toolbarHold.current = true; e.preventDefault(); };
  const sel = 'h-8 max-w-[11rem] rounded-md bg-secondary px-2 text-xs text-foreground ring-1 ring-white/5 focus:outline-none focus:ring-primary';

  const colorPanel = (cmd: 'foreColor' | 'hiliteColor', panel: 'color' | 'highlight', Icon: typeof Baseline, label: string) => (
    <Popover open={openPanel === panel} onOpenChange={(o) => setOpenPanel(o ? panel : null)}>
      <PopoverTrigger asChild>
        <button type="button" onPointerDown={keep} className={btn} aria-label={label} title={label}><Icon className="h-4 w-4" /></button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="mb-2 text-xs font-medium">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.hex} type="button" onPointerDown={keep} onClick={() => { exec(cmd, p.hex); setOpenPanel(null); }} title={p.name} aria-label={`${p.name} ${label}`}
              className="h-7 w-7 rounded-full ring-2 ring-white/10 hover:ring-white/40" style={{ background: p.hex }} />
          ))}
          {cmd === 'hiliteColor' && (
            <button type="button" onPointerDown={keep} onClick={() => { exec(cmd, 'transparent'); setOpenPanel(null); }} className="h-7 rounded-full px-2 text-[10px] ring-1 ring-white/20">None</button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="h-8 w-8 cursor-pointer rounded bg-transparent" aria-label="Pick custom color" />
          <Input value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="h-8 font-mono text-xs" aria-label="Custom hex value" />
          <Button size="sm" type="button" onClick={() => {
            if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(customColor.trim())) return toast.error('Use a hex value like #F5C451');
            exec(cmd, customColor.trim()); setOpenPanel(null);
          }}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className={cn('rounded-xl bg-background ring-1 ring-border focus-within:ring-primary/60 transition-shadow', className)}>
      <div className="sticky z-10 flex flex-wrap items-center gap-1 rounded-t-xl border-b border-border/70 bg-background/95 p-1.5 backdrop-blur-md" style={{ top: 'calc(3.5rem + max(0.5rem, env(safe-area-inset-top)))' }} role="toolbar" aria-label={`${ariaLabel ?? 'Text'} formatting`}>
        <select aria-label="Font" defaultValue="" className={sel} onPointerDown={saveSelection} onChange={(e) => { if (e.target.value) applyFont(e.target.value); e.target.value = ''; }}>
          <option value="" disabled>Font</option>
          {FONT_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {FONTS.filter((font) => font.group === group).map((font) => (
                <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select aria-label="Text size" defaultValue="" className={sel} onMouseDown={saveSelection} onChange={(e) => { if (e.target.value) applySize(e.target.value); e.target.value = ''; }}>
          <option value="" disabled>Size</option>
          {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {colorPanel('foreColor', 'color', Baseline, 'Text color')}
        {colorPanel('hiliteColor', 'highlight', Highlighter, 'Highlight color')}
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button type="button" onPointerDown={keep} onClick={() => applyInline('bold')} className={btn} aria-label="Bold" title="Bold"><Bold className="h-4 w-4" /></button>
        <button type="button" onPointerDown={keep} onClick={() => applyInline('italic')} className={btn} aria-label="Italic" title="Italic"><Italic className="h-4 w-4" /></button>
        <button type="button" onPointerDown={keep} onClick={() => exec('underline')} className={btn} aria-label="Underline" title="Underline"><Underline className="h-4 w-4" /></button>
        <button type="button" onPointerDown={keep} onClick={() => exec('strikeThrough')} className={btn} aria-label="Strikethrough" title="Strikethrough"><Strikethrough className="h-4 w-4" /></button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {([['left', AlignLeft, 'Align left'], ['center', AlignCenter, 'Align center'], ['right', AlignRight, 'Align right'], ['justify', AlignJustify, 'Justify']] as const).map(([align, Icon, label]) => (
          <button key={align} type="button" onPointerDown={keep} onClick={() => applyAlign(align)} className={btn} aria-label={label} title={label}><Icon className="h-4 w-4" /></button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button type="button" onPointerDown={keep} onClick={() => exec('insertUnorderedList')} className={btn} aria-label="Bulleted list" title="Bulleted list"><List className="h-4 w-4" /></button>
        <button type="button" onPointerDown={keep} onClick={() => exec('insertOrderedList')} className={btn} aria-label="Numbered list" title="Numbered list"><ListOrdered className="h-4 w-4" /></button>
        <button type="button" onPointerDown={keep} onClick={() => exec('formatBlock', 'blockquote')} className={btn} aria-label="Blockquote" title="Blockquote"><Quote className="h-4 w-4" /></button>
        <button type="button" onPointerDown={keep} onClick={() => exec('insertHorizontalRule')} className={btn} aria-label="Horizontal rule" title="Horizontal rule"><Minus className="h-4 w-4" /></button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Popover open={openPanel === 'link'} onOpenChange={(o) => { if (o) saveSelection(); setOpenPanel(o ? 'link' : null); }}>
          <PopoverTrigger asChild>
            <button type="button" onPointerDown={keep} className={btn} aria-label="Insert link" title="Insert link"><Link2 className="h-4 w-4" /></button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            <p className="mb-2 text-xs font-medium">Insert link</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); insertLink(); }}>
              <Input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://lore.example.com" className="h-8 text-xs" />
              <Button size="sm" type="submit">Add</Button>
            </form>
            <p className="mt-2 text-[11px] text-muted-foreground">Select text first to turn it into a link.</p>
          </PopoverContent>
        </Popover>
        <Popover open={openPanel === 'image'} onOpenChange={(o) => { if (o) saveSelection(); setOpenPanel(o ? 'image' : null); }}>
          <PopoverTrigger asChild>
            <button type="button" onPointerDown={keep} className={btn} aria-label="Insert image" title="Insert image"><ImagePlus className="h-4 w-4" /></button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            <p className="mb-2 text-xs font-medium">Insert image</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); insertImage(imageUrl.trim()); }}>
              <Input autoFocus value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://www.techsmith.com/wp-content/uploads/2025/09/blog_embed-video-in-google-slides_1500x1100.png" className="h-8 text-xs" />
              <Button size="sm" type="submit">Embed</Button>
            </form>
            <Button type="button" variant="secondary" size="sm" className="mt-2 w-full" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {uploading ? 'Uploading…' : 'Upload from device'}
            </Button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </PopoverContent>
        </Popover>
        <button type="button" onPointerDown={keep} onClick={() => exec('removeFormat')} className={btn} aria-label="Clear formatting" title="Clear formatting"><RemoveFormatting className="h-4 w-4" /></button>
      </div>
      <div className="relative">
        {empty && placeholder && (
          <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground/70 whitespace-pre-line">{placeholder}</p>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onPaste={onPaste}
          onBlur={() => { saveSelection(); emit(); }}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          className="rich-content break-words px-3 py-2.5 text-sm outline-none [overflow-wrap:anywhere]"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}
