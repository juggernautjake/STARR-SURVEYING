// __tests__/dnd/term-index.test.ts — clickable cross-linking of rules terms (S3).
// The matcher is the risky part: a naive implementation lights up "action" inside "reaction",
// links a spell to itself, or breaks "Magic Missile" into "Magic" plus stray text.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { termIndexFor, findTerms, segmentText, abbreviate, DAMAGE_TYPES } from '@/lib/dnd/term-index';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const index = termIndexFor('dnd5e-2024');
const has = (t: string) => index.some((x) => x.term.toLowerCase() === t.toLowerCase());

describe('the index is built from existing content', () => {
  it('includes conditions, damage types, spells, feats and glossary terms', () => {
    expect(has('Frightened')).toBe(true);
    expect(has('fire')).toBe(true);
    expect(has('Fireball')).toBe(true);
    expect(index.some((t) => t.kind === 'feat')).toBe(true);
    expect(index.some((t) => t.kind === 'glossary')).toBe(true);
  });

  it('gives every term a short explanation and somewhere to read more', () => {
    for (const t of index) {
      expect(t.short.trim().length, t.term).toBeGreaterThan(0);
      expect(t.href.startsWith('/dnd/library/'), t.term).toBe(true);
    }
  });

  it('never repeats a term', () => {
    const keys = index.map((t) => t.term.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lets a condition outrank a same-named spell', () => {
    // In "the target is Frightened" the reader means the condition, not any spell.
    expect(index.find((t) => t.term.toLowerCase() === 'frightened')?.kind).toBe('condition');
  });

  it('defines every damage type, since nothing else in the library does', () => {
    expect(DAMAGE_TYPES.length).toBe(13);
    for (const d of DAMAGE_TYPES) expect(d.short.length).toBeGreaterThan(30);
  });

  it('returns nothing for a system with no content rather than another system’s terms', () => {
    expect(termIndexFor('nonsense-system')).toEqual([]);
  });
});

describe('abbreviate', () => {
  it('leaves short text alone', () => {
    expect(abbreviate('Short enough.')).toBe('Short enough.');
  });

  it('cuts on a sentence boundary, not mid-clause', () => {
    const long = 'First sentence here. Second sentence that runs on and on and on and on and on and on and on.';
    const out = abbreviate(long, 40);
    expect(out).toBe('First sentence here.');
  });

  it('ellipsises when there is no usable sentence break', () => {
    const out = abbreviate('a'.repeat(300), 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });

  it('collapses whitespace so a tooltip never shows ragged text', () => {
    expect(abbreviate('one   two\n\nthree')).toBe('one two three');
  });
});

describe('matching terms in text', () => {
  it('finds a condition in a sentence', () => {
    const m = findTerms('The target is Frightened until the end of its turn.', index);
    expect(m.some((x) => x.term.term === 'Frightened')).toBe(true);
  });

  it('matches whole words only', () => {
    // The classic bug: "action" lighting up inside "reaction".
    const m = findTerms('You may take a reaction.', index);
    expect(m.every((x) => x.text.toLowerCase() !== 'action')).toBe(true);
  });

  it('prefers the longest term at a position', () => {
    const m = findTerms('She casts Magic Missile at the darkness.', index);
    const texts = m.map((x) => x.text);
    expect(texts).toContain('Magic Missile');
    expect(texts).not.toContain('Magic');
  });

  it('never produces overlapping matches', () => {
    const m = findTerms('Fireball deals fire damage and leaves them Prone and Poisoned.', index);
    for (let i = 1; i < m.length; i++) expect(m[i].start).toBeGreaterThanOrEqual(m[i - 1].end);
  });

  it('does not link a term to itself', () => {
    // Fireball's own description must not turn "Fireball" into a link back to Fireball.
    const m = findTerms('Fireball is a fire spell.', index, 'Fireball');
    expect(m.every((x) => x.term.term !== 'Fireball')).toBe(true);
    // …but other terms in the same text still link.
    expect(m.some((x) => x.term.term === 'fire')).toBe(true);
  });

  it('preserves the original casing of what it matched', () => {
    const m = findTerms('the target is frightened', index);
    expect(m.find((x) => x.term.term === 'Frightened')?.text).toBe('frightened');
  });

  it('handles empty text', () => {
    expect(findTerms('', index)).toEqual([]);
  });
});

describe('segmenting for render', () => {
  it('returns one plain segment when nothing matches', () => {
    expect(segmentText('nothing here at all', [])).toEqual([{ text: 'nothing here at all' }]);
  });

  it('interleaves plain and linked segments in order, losing no characters', () => {
    const text = 'Deals fire damage and leaves the target Prone.';
    const segs = segmentText(text, index);
    expect(segs.map((s) => s.text).join('')).toBe(text); // nothing dropped or duplicated
    expect(segs.some((s) => s.term)).toBe(true);
  });
});

describe('the tooltip component', () => {
  const src = read('app/dnd/_ui/TermText.tsx');

  it('offers a close button, click-away and Escape', () => {
    expect(src).toContain('aria-label="Close"');
    expect(src).toContain('mousedown');
    expect(src).toContain("e.key === 'Escape'");
  });

  it('deep-links to the full entry', () => {
    expect(src).toContain('Read more');
    expect(src).toContain('seg.term.href');
  });

  it('memoises the index rather than rebuilding it per render', () => {
    // Building it walks every spell, condition, feat and glossary entry.
    expect(src).toContain('useMemo(() => termIndexFor(system)');
  });
});
