// lib/messages/rich-text.ts
// Shared rich-text helpers for chat messages. Pasting formatted text should keep
// its formatting, so message `content` may be sanitized HTML. These helpers are
// pure / dependency-free (no DOMPurify import) so they're safe to use on the
// server too (the send route strips tags for previews + notifications). The
// actual DOMPurify sanitization happens client-side using MESSAGE_SANITIZE_CONFIG.

/** Tight allowlist: inline emphasis, links, lists, paragraphs/line-breaks, code.
 *  No style/class/img/script — so pasted formatting can't smuggle unreadable
 *  colors, layout abuse, or XSS. */
export const MESSAGE_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'p', 'div', 'span',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

/** Cheap check: does this string contain an HTML tag? Used to decide whether a
 *  bubble renders as sanitized HTML or as plain text. */
export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ',
};

/** Strip tags → readable plain text (for conversation previews + the
 *  notification body). Block elements + <br> become spaces; entities decode. */
export function htmlToPlainText(input: string): string {
  if (!input) return '';
  if (!looksLikeHtml(input)) return input;
  return input
    .replace(/<\s*(br|p|div|li|h[1-4]|blockquote|pre)\b[^>]*>/gi, ' ')
    .replace(/<\/\s*(p|div|li|h[1-4]|blockquote|pre|ul|ol)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&[a-z#0-9]+;/gi, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
