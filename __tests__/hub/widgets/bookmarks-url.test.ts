// __tests__/hub/widgets/bookmarks-url.test.ts
//
// hub-widget-excellence-15 — bookmarks R1/R2. Locks the URL-safety
// guard: only internal paths + known-safe schemes render; dangerous or
// unfinished URLs are rejected so the widget never links somewhere
// harmful/broken.

import { describe, it, expect } from 'vitest';
import { isValidBookmarkUrl, safeBookmarks } from '@/lib/hub/widgets/bookmarks/url';

describe('isValidBookmarkUrl', () => {
  it('accepts complete http(s) URLs', () => {
    expect(isValidBookmarkUrl('https://example.com')).toBe(true);
    expect(isValidBookmarkUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('accepts internal absolute paths', () => {
    expect(isValidBookmarkUrl('/admin/jobs')).toBe(true);
    expect(isValidBookmarkUrl('/')).toBe(true);
  });

  it('accepts mailto: and tel:', () => {
    expect(isValidBookmarkUrl('mailto:crew@starr.com')).toBe(true);
    expect(isValidBookmarkUrl('tel:+15551234567')).toBe(true);
  });

  it('rejects dangerous schemes, protocol-relative, blanks + drafts', () => {
    expect(isValidBookmarkUrl('javascript:alert(1)')).toBe(false);
    expect(isValidBookmarkUrl('data:text/html,<script>')).toBe(false);
    expect(isValidBookmarkUrl('//evil.com')).toBe(false);
    expect(isValidBookmarkUrl('https://')).toBe(false); // unfinished draft
    expect(isValidBookmarkUrl('')).toBe(false);
    expect(isValidBookmarkUrl('   ')).toBe(false);
    expect(isValidBookmarkUrl('not a url')).toBe(false);
  });
});

describe('safeBookmarks', () => {
  it('keeps only renderable bookmarks, preserving order', () => {
    const out = safeBookmarks([
      { id: '1', url: 'https://a.com' },
      { id: '2', url: 'javascript:bad()' },
      { id: '3', url: '/admin/x' },
      { id: '4', url: 'https://' },
    ]);
    expect(out.map((b) => b.id)).toEqual(['1', '3']);
  });
});
