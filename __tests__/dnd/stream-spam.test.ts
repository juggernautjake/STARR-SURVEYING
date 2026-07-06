// __tests__/dnd/stream-spam.test.ts — procedural spam variations (J5).
import { describe, it, expect } from 'vitest';
import { spamVariations } from '@/lib/dnd/stream-spam';

describe('spamVariations', () => {
  it('produces the requested count and is deterministic', () => {
    const a = spamVariations('pog', 20);
    expect(a).toHaveLength(20);
    expect(a).toEqual(spamVariations('pog', 20));
  });
  it('varies the styling (uppercase, spacing, emoji, reactions)', () => {
    const v = spamVariations('pog', 20);
    expect(v.some((s) => s === 'POG 🔥')).toBe(true);          // uppercase + emoji
    expect(v.some((s) => s === 'p o g')).toBe(true);           // spaced
    expect(v.some((s) => /pog/i.test(s) && /[🔥💀😭]/.test(s))).toBe(true); // emoji wrap
    expect(v.some((s) => /LMAOOO|OMG|cinema/i.test(s))).toBe(true);        // reaction
  });
  it('falls back to POG for an empty phrase and caps length', () => {
    expect(spamVariations('', 3).every((s) => s.length > 0)).toBe(true);
    expect(spamVariations('x'.repeat(500), 3).every((s) => s.length <= 240)).toBe(true);
  });
});
