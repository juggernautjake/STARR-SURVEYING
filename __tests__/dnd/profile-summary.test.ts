// __tests__/dnd/profile-summary.test.ts — how the profile page READS (P11-9).
//
// The queries need a database; the shaping does not, and the shaping is where this goes wrong. An
// activity feed with a blank bullet in it looks like a rendering bug, and "combat.hp.current" is not a
// sentence — both are decisions made in `activityLine`, so both are pinned here.
import { describe, it, expect } from 'vitest';
import { activityLine, relativeTime } from '@/lib/dnd/profile-summary';

describe('activityLine', () => {
  it('prefers the written summary', () => {
    expect(activityLine('Gave Orin a longsword', 'inventory[longsword]')).toBe('Gave Orin a longsword');
  });

  it('falls back to the field path when there is no summary', () => {
    // Machine edits carry only a path. Showing the raw `combat.hp` is worse than a sentence and better
    // than an empty row, which is the actual choice on offer.
    expect(activityLine(null, 'combat.hp')).toBe('Changed combat hp');
    expect(activityLine('   ', 'abilities.str')).toBe('Changed abilities str');
  });

  it('splits the `section[name]` shape `editPath` writes', () => {
    // `sheet-edits.ts` writes `inventory[oak-shield]` / `spells[fireball]` for anything named. Run
    // together it reads as one mangled word; split, the name reads as a name.
    expect(activityLine(null, 'inventory[oak-shield]')).toBe('Changed inventory: oak shield');
    expect(activityLine(null, 'spells[fire-bolt]')).toBe('Changed spells: fire bolt');
  });

  it('says what a revert marker MEANS rather than showing it', () => {
    // `revert-batch:<uuid>` is an internal token. A user reading their own history should not meet a UUID.
    expect(activityLine(null, 'revert-batch:9f2c1d40-0000-4000-8000-000000000000')).toBe('Undid an earlier change');
  });

  it('never returns an empty string', () => {
    // The one guarantee the feed depends on: every row renders as something.
    for (const [s, p] of [[null, null], ['', ''], [null, '   ']] as [string | null, string | null][]) {
      expect(activityLine(s, p).length).toBeGreaterThan(0);
    }
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-29T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('reads as a feed, not a ledger', () => {
    expect(relativeTime(ago(30 * 1000), now)).toBe('just now');
    expect(relativeTime(ago(5 * 60 * 1000), now)).toBe('5 mins ago');
    expect(relativeTime(ago(60 * 60 * 1000), now)).toBe('1 hour ago');
    expect(relativeTime(ago(3 * 24 * 60 * 60 * 1000), now)).toBe('3 days ago');
    expect(relativeTime(ago(400 * 24 * 60 * 60 * 1000), now)).toBe('1 year ago');
  });

  it('singularises', () => {
    // "1 mins ago" is the kind of thing that makes a page look unfinished.
    expect(relativeTime(ago(60 * 1000), now)).toBe('1 min ago');
    expect(relativeTime(ago(24 * 60 * 60 * 1000), now)).toBe('1 day ago');
  });

  it('returns empty for an unparseable timestamp rather than "NaN years ago"', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});
