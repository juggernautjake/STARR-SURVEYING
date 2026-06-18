// lib/admin/messenger-search.ts
//
// Slice MX5 — helpers for the messenger popup's cross-
// conversation search. Pure + dependency-free so vitest can
// exercise them without a DOM.

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Split a snippet into alternating match/non-match segments
 *  for the given query. Case-insensitive; empty / whitespace
 *  queries return one non-match segment with the original
 *  text so the renderer can map it straight to a <span>. */
export function highlightSegments(snippet: string, query: string): HighlightSegment[] {
  const text = snippet ?? '';
  const q = (query ?? '').trim();
  if (q.length === 0) return [{ text, match: false }];

  const lowerSnippet = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const segments: HighlightSegment[] = [];

  let cursor = 0;
  while (cursor < text.length) {
    const idx = lowerSnippet.indexOf(lowerQuery, cursor);
    if (idx < 0) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: text.slice(cursor, idx), match: false });
    }
    segments.push({ text: text.slice(idx, idx + lowerQuery.length), match: true });
    cursor = idx + lowerQuery.length;
  }
  return segments;
}

/** Trim a long content string around the first match so the user
 *  sees the hit in context. Returns the leading slice when the
 *  query is missing / not found. */
export function snippetAroundMatch(
  content: string,
  query: string,
  maxLen: number = 120,
): string {
  const text = content ?? '';
  if (text.length <= maxLen) return text;
  const q = (query ?? '').trim();
  if (q.length === 0) return text.slice(0, maxLen) + '…';
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, maxLen) + '…';
  const halfWindow = Math.floor((maxLen - q.length) / 2);
  const start = Math.max(0, idx - halfWindow);
  const end = Math.min(text.length, idx + q.length + halfWindow);
  const out = text.slice(start, end);
  return (start > 0 ? '…' : '') + out + (end < text.length ? '…' : '');
}
