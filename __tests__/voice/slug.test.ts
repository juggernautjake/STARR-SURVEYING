// __tests__/voice/slug.test.ts
//
// The distinction these tests protect is subtle and easy to "simplify" into a bug: some static routes
// under /AndrewAsh read `va_pages` by slug and some do not, and only the second kind may shadow a
// page. Collapsing the two lists into one "reserved" list breaks adopting a built-in page; dropping
// the list entirely makes a page slugged `studio` invisible forever with no error anywhere.

import { describe, expect, it } from 'vitest';

import { SHADOWED_SLUGS, isShadowedSlug, safeSlug, slugify } from '@/lib/voice/slug';
import { DEFAULT_PAGES } from '@/lib/voice/default-pages';

describe('slugify', () => {
  it('makes a URL segment out of a title', () => {
    expect(slugify('Radio Spot — :30 and :15')).toBe('radio-spot-30-and-15');
  });

  it('strips diacritics rather than dropping the letter', () => {
    // "Peña" must become "pena", not "pea".
    expect(slugify('Peña')).toBe('pena');
  });

  it('never returns an empty string', () => {
    // An empty slug would produce /AndrewAsh/ — the home page — for a brand new project.
    expect(slugify('')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
  });

  it('caps length so a pasted paragraph cannot become a URL', () => {
    expect(slugify('a'.repeat(400))).toHaveLength(80);
  });
});

describe('isShadowedSlug', () => {
  it('blocks the paths whose routes never read the pages table', () => {
    // A page here saves, lists, publishes — and renders the studio forever.
    for (const slug of ['studio', 'login', 'client', 'invoice', 'contract', 'api', 'p']) {
      expect(isShadowedSlug(slug)).toBe(true);
    }
  });

  it('does NOT block the built-in page slugs', () => {
    // These resolve through SystemPage, which looks the slug up in va_pages and prefers Andrew's row.
    // That IS adopting a built-in page. Blocking them would break the feature the list protects.
    for (const slug of ['about', 'coaching', 'contact', 'voice-over', 'home', 'work']) {
      expect(isShadowedSlug(slug)).toBe(false);
    }
  });

  it('leaves an ordinary page slug alone', () => {
    expect(isShadowedSlug('rates')).toBe(false);
    expect(isShadowedSlug('my-recording-space')).toBe(false);
  });

  it('every built-in page can still be adopted', () => {
    // Locked against the real default-page list rather than a hardcoded copy, so adding a built-in
    // page in future cannot silently make it un-adoptable.
    for (const page of DEFAULT_PAGES) {
      expect(isShadowedSlug(page.slug)).toBe(false);
    }
  });

  it('lists no slug twice', () => {
    expect(new Set(SHADOWED_SLUGS).size).toBe(SHADOWED_SLUGS.length);
  });
});

describe('safeSlug', () => {
  it('steps a shadowed slug aside instead of rejecting it', () => {
    // "Studio" is a reasonable name for a page about his recording space.
    expect(safeSlug('Studio')).toBe('studio-page');
    expect(safeSlug('Login')).toBe('login-page');
  });

  it('leaves everything else exactly as slugify left it', () => {
    expect(safeSlug('My Rates')).toBe(slugify('My Rates'));
    expect(safeSlug('About')).toBe('about');
  });

  it('produces a slug that is not itself shadowed', () => {
    // The property that actually matters: whatever comes out can be served.
    for (const slug of [...SHADOWED_SLUGS, 'rates', '', '!!!']) {
      expect(isShadowedSlug(safeSlug(slug))).toBe(false);
    }
  });
});
