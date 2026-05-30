// lib/hub/widgets/bookmarks/url.ts
//
// hub-widget-excellence-15 — bookmarks R1/R2. Bookmarks are arbitrary
// user-entered URLs, so the widget can't validate them against a route
// table (pinned-pages does that). What it MUST do is never render a
// dangerous or broken link: reject `javascript:` / `data:` / blank /
// protocol-relative URLs, and only render internal paths or known-safe
// schemes. Pure + dependency-free → unit-tested in node.

const SAFE_SCHEME = /^(https?|mailto|tel):/i;

/**
 * True when a bookmark URL is safe + complete enough to render:
 *   - an internal absolute path (`/admin/…`) — but NOT a
 *     protocol-relative `//host` (which would navigate off-site),
 *   - or an absolute http(s) URL with a host,
 *   - or a `mailto:` / `tel:` link.
 * Everything else (blank, `javascript:`, `data:`, bare relative text,
 * an unfinished `https://`) is rejected.
 */
export function isValidBookmarkUrl(url: string): boolean {
  const u = (url ?? '').trim();
  if (!u) return false;
  if (u.startsWith('//')) return false;
  if (u.startsWith('/')) return true;
  if (/^https?:\/\//i.test(u)) return /^https?:\/\/\S+/i.test(u);
  return SAFE_SCHEME.test(u);
}

/** Keep only the bookmarks whose URL is safe to render. */
export function safeBookmarks<T extends { url: string }>(bookmarks: readonly T[]): T[] {
  return bookmarks.filter((b) => isValidBookmarkUrl(b.url));
}
