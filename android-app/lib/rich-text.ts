// Helpers for rich-text (HTML + Markdown) character fields. Safe on server and client.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** http(s) URLs and same-site paths. Rejects javascript:, data:, and protocol-relative URLs. */
export function isSafeImageSrc(src: string): boolean {
  const value = src.trim();
  if (!value || value.length > 2048 || /[\u0000-\u001f\s]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('..') && !value.includes('\\')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Standard image tag persisted in rich-text form fields. */
export function imageTag(src: string, alt = ''): string {
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`;
}

const MD_IMAGE = /!\[([^\]\n]*)\]\(\s*(https?:\/\/[^\s)]+|\/(?!\/)[^\s)]+)\s*\)/g;
const LONE_IMAGE_URL = /(^|\n)([ \t]*)(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s<]*)?)(?=[ \t]*(?:\n|$))/gi;
const IMG_TAG = /<img\b([^>]*?)\/?\s*>/gi;

function readAttr(tag: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').trim();
}

/**
 * Turns Markdown images and a line that is only an image URL into `<img>` tags.
 * Existing tags are left in place so the editor can paint them.
 */
export function promoteImages(input: string): string {
  if (!input) return '';
  MD_IMAGE.lastIndex = 0;
  LONE_IMAGE_URL.lastIndex = 0;
  const withMarkdown = input.replace(MD_IMAGE, (full, alt: string, src: string) => (
    isSafeImageSrc(src) ? imageTag(src, alt) : full
  ));
  return withMarkdown.replace(LONE_IMAGE_URL, (full, lead: string, space: string, src: string) => (
    isSafeImageSrc(src) ? `${lead}${space}${imageTag(src, '')}` : full
  ));
}

/** `<img>` tags → Markdown images so react-markdown can draw them. */
export function htmlImagesToMarkdown(input: string): string {
  if (!input || !/<img\b/i.test(input)) return input ?? '';
  IMG_TAG.lastIndex = 0;
  return input.replace(IMG_TAG, (full) => {
    const src = readAttr(full, 'src');
    if (!isSafeImageSrc(src)) return '';
    const alt = readAttr(full, 'alt').replace(/[\[\]]/g, '');
    return `![${alt}](${src})`;
  });
}

export function looksLikeHtml(s: string): boolean {
  return /<\/?(p|div|br|span|b|strong|i|em|u|s|strike|h[1-6]|ul|ol|li|blockquote|hr|img|a|font|small|mark)\b[^>]*>/i.test(s ?? '');
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Plain text (with newlines) → simple HTML paragraphs for the editor. */
export function textToHtml(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Strips HTML formatting so only readable text reaches the LLM (saves context tokens).
 * Keeps line structure, list bullets and link targets; drops images and styling.
 */
export function htmlToPlainText(input: string | null | undefined): string {
  const s = input ?? '';
  if (!looksLikeHtml(s)) return s;
  return s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
      const t = text.replace(/<[^>]+>/g, '').trim();
      return href && t && t !== href ? `${t} (${href})` : t || href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n---\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|blockquote|li|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
