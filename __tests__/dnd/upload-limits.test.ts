// __tests__/dnd/upload-limits.test.ts — one place for every /dnd upload ceiling (P1-6, audit F-6).
//
// F-6 said "six ceilings across eight routes". Live it was **seven distinct values across twelve routes** —
// two of them added by this very audit, so the duplication was still growing while the finding sat open.
//
// THE RISK IN THIS SLICE is not that the module is wrong; it is that consolidating quietly CHANGES a limit.
// A refactor that also re-tunes is unreviewable, so the first block below pins every route to the exact
// byte value it enforced beforehand. Those numbers were read off the pre-change source and are the point of
// the file: if one moves, that has to be a deliberate act with its own diff.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOAD_LIMITS, formatLimit, tooLargeMessage } from '@/lib/dnd/upload-limits';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MB = 1024 * 1024;

/** Every /dnd upload route, the key it now uses, and the size it enforced BEFORE this slice. */
const ROUTES: { path: string; key: keyof typeof UPLOAD_LIMITS; wasMB: number }[] = [
  { path: 'app/api/dnd/campaigns/[id]/maps/route.ts', key: 'LARGE_FILE', wasMB: 25 },
  { path: 'app/api/dnd/campaigns/[id]/soundboard/sounds/route.ts', key: 'AUDIO', wasMB: 20 },
  { path: 'app/api/dnd/characters/import/route.ts', key: 'LARGE_FILE', wasMB: 25 },
  { path: 'app/api/dnd/characters/[id]/media/route.ts', key: 'IMAGE', wasMB: 8 },
  { path: 'app/api/dnd/characters/[id]/uploads/route.ts', key: 'LARGE_FILE', wasMB: 25 },
  { path: 'app/api/dnd/handouts/route.ts', key: 'HANDOUT', wasMB: 12 },
  { path: 'app/api/dnd/homebrew/ingest/route.ts', key: 'DOCUMENT', wasMB: 10 },
  { path: 'app/api/dnd/homebrew/[id]/image/route.ts', key: 'IMAGE', wasMB: 8 },
  { path: 'app/api/dnd/media/route.ts', key: 'MEDIA', wasMB: 15 },
  { path: 'app/api/dnd/messages/image/route.ts', key: 'IMAGE', wasMB: 8 },
  { path: 'app/api/dnd/profile/avatar/route.ts', key: 'AVATAR', wasMB: 5 },
  { path: 'app/api/dnd/sessions/[id]/media/route.ts', key: 'HANDOUT', wasMB: 12 },
];

describe('the consolidation changed no limits', () => {
  it.each(ROUTES)('$path still enforces $wasMB MB', ({ key, wasMB }) => {
    expect(UPLOAD_LIMITS[key]).toBe(wasMB * MB);
  });

  it('and covers all twelve routes', () => {
    expect(ROUTES).toHaveLength(12);
  });
});

describe('every route reads the module rather than its own arithmetic', () => {
  it.each(ROUTES)('$path imports it and uses its key', ({ path, key }) => {
    const src = read(path);
    expect(src).toContain("from '@/lib/dnd/upload-limits'");
    expect(src).toContain(`const MAX_BYTES = UPLOAD_LIMITS.${key};`);
  });

  it('and no /dnd route still computes a ceiling inline', () => {
    // The guard that keeps this from regressing: a new route that writes its own `N * 1024 * 1024` fails
    // here rather than quietly becoming the thirteenth copy. This is exactly how the finding grew by four
    // routes while it was open.
    for (const { path } of ROUTES) {
      expect(read(path), `${path} should not hard-code a byte ceiling`).not.toMatch(/const MAX_BYTES = \d+ \* 1024 \* 1024/);
    }
  });
});

describe('the limit is no longer written twice per route', () => {
  // Each route had the number as arithmetic AND as English ("Image must be 8 MB or smaller."). The prose
  // copy is the one that would have gone stale silently, because no test reads an error string.
  const WITH_MESSAGES = ROUTES.filter((r) => !r.path.includes('/import/') && !r.path.includes('/uploads/'));

  it.each(WITH_MESSAGES)('$path builds its message from the constant', ({ path }) => {
    const src = read(path);
    expect(src).toContain('tooLargeMessage(MAX_BYTES');
    expect(src, 'the hard-coded MB in prose should be gone').not.toMatch(/must be \d+ MB or smaller/);
  });

  it('the two bulk routes have no message because they SKIP oversized files rather than failing', () => {
    // Worth pinning as intent rather than as an oversight: a multi-file upload drops the too-big ones and
    // saves the rest. Someone tidying for consistency would "fix" that into a hard failure.
    for (const p of ['app/api/dnd/characters/import/route.ts', 'app/api/dnd/characters/[id]/uploads/route.ts']) {
      expect(read(p)).toMatch(/size <= MAX_BYTES/);
    }
  });
});

describe('the helpers', () => {
  it('format whole megabytes', () => {
    expect(formatLimit(8 * MB)).toBe('8 MB');
    expect(formatLimit(25 * MB)).toBe('25 MB');
  });

  it('and keep the wording the routes already agreed on', () => {
    // Deliberately unchanged: the /dnd routes were consistent here, so the helper preserves their phrasing
    // rather than inventing new copy in a refactor slice.
    expect(tooLargeMessage(8 * MB, 'Image')).toBe('Image must be 8 MB or smaller.');
    expect(tooLargeMessage(20 * MB, 'Audio')).toBe('Audio must be 20 MB or smaller.');
    expect(tooLargeMessage(10 * MB)).toBe('File must be 10 MB or smaller.');
  });
});

describe('the limits are named by purpose, not by size', () => {
  it('so two routes sharing a reason share a constant', () => {
    // Three routes take 25 MB for the same reason (big arbitrary files) and two take 12 MB for the same
    // reason (things shown mid-session). That is the property that makes "raise the map limit" a one-line
    // change instead of a grep.
    expect(ROUTES.filter((r) => r.key === 'LARGE_FILE')).toHaveLength(3);
    expect(ROUTES.filter((r) => r.key === 'HANDOUT')).toHaveLength(2);
    expect(ROUTES.filter((r) => r.key === 'IMAGE')).toHaveLength(3);
  });

  it('and the values stay distinct where the reasons differ', () => {
    // An avatar and a battle map genuinely should not share a budget — the slice said keep the per-route
    // values, and flattening them would either make avatars absurd or break map uploads.
    expect(UPLOAD_LIMITS.AVATAR).toBeLessThan(UPLOAD_LIMITS.IMAGE);
    expect(UPLOAD_LIMITS.IMAGE).toBeLessThan(UPLOAD_LIMITS.LARGE_FILE);
    expect(new Set(Object.values(UPLOAD_LIMITS)).size).toBe(Object.keys(UPLOAD_LIMITS).length);
  });
});
