// __tests__/dnd/custom-sections.test.ts — the player-authored EXTRA sections model (D-13).
//
// These sections render across every system + template, so their normalizer is the safety net: untyped JSON
// from the DB / AI / an older schema must never throw or produce a broken shape. The mutations are immutable
// and id-stable (no Math.random / Date.now), so they're pinned here too.
import { describe, it, expect } from 'vitest';
import {
  normalizeCustomSections,
  nextId,
  blankSection,
  blankBlock,
  addSection,
  removeSection,
  updateSection,
  moveSection,
  addBlock,
  removeBlock,
  updateBlock,
  blockIsEmpty,
  sectionIsEmpty,
  type CustomSection,
} from '@/lib/dnd/custom-sections';

describe('nextId — deterministic, collision-free', () => {
  it('starts at 1 and steps past the highest existing', () => {
    expect(nextId('s', [])).toBe('s1');
    expect(nextId('s', ['s1', 's2'])).toBe('s3');
    expect(nextId('s', ['s5', 's2'])).toBe('s6'); // off the MAX, not the count
    expect(nextId('b', ['b1', 'junk', 'b9'])).toBe('b10'); // ignores non-matching ids
  });
});

describe('normalizeCustomSections — defensive parse', () => {
  it('returns [] for non-arrays and garbage', () => {
    expect(normalizeCustomSections(undefined)).toEqual([]);
    expect(normalizeCustomSections(null)).toEqual([]);
    expect(normalizeCustomSections('nope')).toEqual([]);
    expect(normalizeCustomSections({})).toEqual([]);
  });

  it('coerces a well-formed section, keeping the three block kinds', () => {
    const out = normalizeCustomSections([
      {
        id: 's1',
        title: 'Ship Log',
        icon: '🚀',
        blocks: [
          { id: 'b1', kind: 'text', heading: 'Manifest', body: 'Line one\n\nLine two' },
          { id: 'b2', kind: 'stats', rows: [{ label: 'Fuel', value: '80%' }, { label: 'Crew', value: '4' }] },
          { id: 'b3', kind: 'list', heading: 'Cargo', items: ['Ore', 'Water'] },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Ship Log');
    expect(out[0].icon).toBe('🚀');
    expect(out[0].blocks.map((b) => b.kind)).toEqual(['text', 'stats', 'list']);
  });

  it('fills a missing title, drops unknown block kinds, and prunes empty rows/items', () => {
    const out = normalizeCustomSections([
      {
        blocks: [
          { kind: 'bogus', foo: 1 },
          { kind: 'stats', rows: [{ label: '', value: '' }, { label: 'Keep', value: '1' }] },
          { kind: 'list', items: ['', '  ', 'real'] },
        ],
      },
    ]);
    expect(out[0].title).toBe('Untitled section');
    // the bogus block is gone; stats kept only the non-empty row; list kept only the real item
    expect(out[0].blocks).toHaveLength(2);
    const stats = out[0].blocks[0];
    expect(stats.kind).toBe('stats');
    if (stats.kind === 'stats') expect(stats.rows).toEqual([{ label: 'Keep', value: '1' }]);
    const list = out[0].blocks[1];
    if (list.kind === 'list') expect(list.items).toEqual(['real']);
  });

  it('de-duplicates colliding section AND block ids', () => {
    const out = normalizeCustomSections([
      { id: 'x', title: 'A', blocks: [{ id: 'b', kind: 'text', body: 'a' }, { id: 'b', kind: 'text', body: 'b' }] },
      { id: 'x', title: 'B', blocks: [] },
    ]);
    expect(new Set(out.map((s) => s.id)).size).toBe(2); // both sections kept, ids made unique
    const ids = out[0].blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(2); // both blocks kept, ids made unique
  });

  it('assigns ids to blocks that lack them', () => {
    const out = normalizeCustomSections([{ title: 'T', blocks: [{ kind: 'text', body: 'hi' }] }]);
    expect(out[0].blocks[0].id).toBeTruthy();
  });
});

describe('section + block mutations — immutable and id-stable', () => {
  const base: CustomSection[] = [blankSection([], 'One'), blankSection([blankSection([], 'One')], 'Two')];

  it('addSection appends with a unique id and does not mutate the input', () => {
    const start = [blankSection([], 'A')];
    const next = addSection(start, 'B');
    expect(next).toHaveLength(2);
    expect(start).toHaveLength(1); // untouched
    expect(new Set(next.map((s) => s.id)).size).toBe(2);
    expect(next[1].title).toBe('B');
  });

  it('removeSection drops by id', () => {
    const s = addSection(addSection([], 'A'), 'B');
    const next = removeSection(s, s[0].id);
    expect(next.map((x) => x.title)).toEqual(['B']);
  });

  it('updateSection patches title/icon only', () => {
    const s = addSection([], 'A');
    const next = updateSection(s, s[0].id, { title: 'Renamed', icon: '⭐' });
    expect(next[0].title).toBe('Renamed');
    expect(next[0].icon).toBe('⭐');
    expect(next[0].blocks).toBe(s[0].blocks); // blocks reference preserved
  });

  it('moveSection reorders and clamps at the ends', () => {
    const s = addSection(addSection([], 'A'), 'B');
    expect(moveSection(s, s[1].id, -1).map((x) => x.title)).toEqual(['B', 'A']);
    expect(moveSection(s, s[0].id, -1).map((x) => x.title)).toEqual(['A', 'B']); // no-op at start
    expect(moveSection(s, s[1].id, 1).map((x) => x.title)).toEqual(['A', 'B']); // no-op at end
  });

  it('addBlock / updateBlock / removeBlock thread by section + block id', () => {
    let s = addSection([], 'A');
    const sid = s[0].id;
    s = addBlock(s, sid, 'text');
    expect(s[0].blocks).toHaveLength(1);
    const b = s[0].blocks[0];
    s = updateBlock(s, sid, { ...b, kind: 'text', body: 'hello' } as typeof b);
    const updated = s[0].blocks[0];
    if (updated.kind === 'text') expect(updated.body).toBe('hello');
    s = removeBlock(s, sid, b.id);
    expect(s[0].blocks).toHaveLength(0);
  });

  it('blankBlock produces a usable empty of each kind', () => {
    expect(blankBlock('text', []).kind).toBe('text');
    const stats = blankBlock('stats', []);
    if (stats.kind === 'stats') expect(stats.rows).toHaveLength(1);
    const list = blankBlock('list', ['b1']);
    expect(list.id).toBe('b2');
  });
});

describe('emptiness helpers — for hiding not-yet-populated content', () => {
  it('blockIsEmpty is true only when nothing would render', () => {
    expect(blockIsEmpty({ id: 'b', kind: 'text', body: '   ' })).toBe(true);
    expect(blockIsEmpty({ id: 'b', kind: 'text', body: 'x' })).toBe(false);
    expect(blockIsEmpty({ id: 'b', kind: 'text', heading: 'H', body: '' })).toBe(false);
    expect(blockIsEmpty({ id: 'b', kind: 'stats', rows: [{ label: '', value: '' }] })).toBe(true);
    expect(blockIsEmpty({ id: 'b', kind: 'list', items: ['', ' '] })).toBe(true);
    expect(blockIsEmpty({ id: 'b', kind: 'list', items: ['real'] })).toBe(false);
  });

  it('sectionIsEmpty is true when every block is empty', () => {
    expect(sectionIsEmpty({ id: 's', title: 'T', blocks: [] })).toBe(true);
    expect(sectionIsEmpty({ id: 's', title: 'T', blocks: [{ id: 'b', kind: 'text', body: '' }] })).toBe(true);
    expect(sectionIsEmpty({ id: 's', title: 'T', blocks: [{ id: 'b', kind: 'text', body: 'x' }] })).toBe(false);
  });
});
