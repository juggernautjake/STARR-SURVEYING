// __tests__/dnd/map-object-edits.test.ts — what a DM may change, and how to put it back (M4-2 · G7).
//
// The failures worth guarding here are the quiet ones. An undo that restores a row under a NEW id looks
// like it worked; a batch walked forwards ends with the object gone when the DM asked for it back; a
// resize offered on a token silently disagrees with the creature's own size category. None of those
// throw, and none of them are visible in the request that causes them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_SIZE, MIN_SIZE, PATCHABLE, SIZEABLE_KINDS, batchSummary, clampSize, clampZ, duplicateOffset, invert,
  normalizeRotation, summarizeEdit, undoOrder, type EditEntry,
} from '@/lib/dnd/maps/object-edits';

describe('rotation wraps rather than clamping', () => {
  it('normalises to [0, 360)', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(359)).toBe(359);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });

  it('wraps NEGATIVES the same way, because that is how "rotate left" counts', () => {
    // A clamp at zero would make the left button stop working the moment a prop was at 0°, which is
    // where every prop starts.
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-370)).toBe(350);
  });

  it('survives a non-number instead of writing NaN into the column', () => {
    expect(normalizeRotation(Number.NaN)).toBe(0);
    expect(normalizeRotation(Infinity)).toBe(0);
  });
});

describe('size', () => {
  it('never smaller than a hairline or bigger than the map', () => {
    expect(clampSize(0)).toBe(MIN_SIZE);
    expect(clampSize(-4)).toBe(MIN_SIZE);
    expect(clampSize(1e6)).toBe(MAX_SIZE);
    expect(clampSize(12)).toBe(12);
  });

  it('a TOKEN is not sizeable, and that is a rule rather than an oversight', () => {
    // A token's footprint comes from the creature's size category through the node's grid (M5-1b).
    // Letting a DM type a width would be the map holding a second opinion about how big an Ogre is —
    // the same reason a token stores no HP.
    expect(SIZEABLE_KINDS.has('token')).toBe(false);
    expect(SIZEABLE_KINDS.has('hidden')).toBe(false);
    for (const k of ['image', 'prop', 'light', 'area', 'note']) expect(SIZEABLE_KINDS.has(k)).toBe(true);
  });
});

describe('layer order is integers', () => {
  it('rounds, because "between 3 and 4" is a z-order nobody can reason about at a table', () => {
    expect(clampZ(3.4)).toBe(3);
    expect(clampZ(-2.6)).toBe(-3);
  });
  it('is bounded both ways', () => {
    expect(clampZ(1e9)).toBe(9999);
    expect(clampZ(-1e9)).toBe(-9999);
  });
});

describe('a duplicate lands somewhere you can see it', () => {
  it('offsets by one grid cell', () => {
    expect(duplicateOffset(5)).toEqual({ dx: 5, dy: 5 });
  });

  it('offsets by a world unit on a map with no grid', () => {
    // Zero offset is the trap: the copy is invisible under the original, the DM presses again, and now
    // there are three trees in one spot.
    expect(duplicateOffset(null)).toEqual({ dx: 1, dy: 1 });
    expect(duplicateOffset(0)).toEqual({ dx: 1, dy: 1 });
  });
});

describe('undo', () => {
  const entry = (over: Partial<EditEntry>): EditEntry => ({
    entity: 'object', entity_id: 'o1', action: 'update',
    before: { id: 'o1', x: 1 }, after: { id: 'o1', x: 2 }, summary: null, ...over,
  });

  it('inverts a create into a delete', () => {
    expect(invert(entry({ action: 'create', before: null }))).toEqual({ op: 'delete', id: 'o1' });
  });

  it('inverts a delete into an upsert of the ORIGINAL ROW, id included', () => {
    // The id is the part that matters. A re-insert under a fresh id restores the object and orphans
    // every discovery, trigger reference and shared `?token=` link that pointed at it — so the secret
    // comes back and the party's knowledge of it does not.
    const e = entry({ action: 'delete', before: { id: 'o1', kind: 'hidden' }, after: null });
    expect(invert(e)).toEqual({ op: 'upsert', row: { id: 'o1', kind: 'hidden' } });
  });

  it('inverts an update by writing `before` back', () => {
    expect(invert(entry({}))).toEqual({ op: 'upsert', row: { id: 'o1', x: 1 } });
  });

  it('walks a batch NEWEST FIRST', () => {
    // A batch that created a thing and then moved it must be inverted backwards. Forwards, the move's
    // `before` is written to a row the delete has not removed yet; and on create-then-delete a forwards
    // walk re-inserts the row and then deletes it, ending with the object GONE when the DM asked for it
    // back — an undo that does the opposite of undoing.
    const walked = undoOrder([
      { id: 'a', created_at: '2026-08-01T10:00:00Z' },
      { id: 'c', created_at: '2026-08-01T10:00:02Z' },
      { id: 'b', created_at: '2026-08-01T10:00:01Z' },
    ]);
    expect(walked.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate the array it is given', () => {
    const input = [{ id: 'a', created_at: '2' }, { id: 'b', created_at: '1' }];
    undoOrder(input);
    expect(input.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('the undo control names what it takes back', () => {
  it('uses the object label', () => {
    expect(summarizeEdit('delete', { kind: 'prop', label: 'Iron brazier' })).toBe('Removed Iron brazier');
    expect(summarizeEdit('create', { kind: 'token', label: 'Ogre' })).toBe('Placed Ogre');
    expect(summarizeEdit('update', { kind: 'area', label: 'Fog' })).toBe('Changed Fog');
  });

  it('falls back to the KIND rather than to nothing', () => {
    // "Undo" alone asks a DM mid-session to remember what they last did, which they will not. Even
    // "Removed a prop" tells them which of the two things they just did is going away.
    expect(summarizeEdit('delete', { kind: 'prop', label: null })).toBe('Removed a prop');
    expect(summarizeEdit('delete', { kind: 'prop', label: '   ' })).toBe('Removed a prop');
  });
});

describe('the whitelist and the journal describe the same object', () => {
  it('every patchable field is one the journal stores', () => {
    // This is the invariant the two halves of `object-edits.ts` exist to keep. Add a field to the route
    // and forget the journal, and the change is possible and un-undoable at the same time — an undo that
    // silently leaves half of it in place.
    const src = readFileSync(join(process.cwd(), 'lib/dnd/maps/object-edits.ts'), 'utf8');
    const columns = src.match(/export const OBJECT_COLUMNS = \[([\s\S]*?)\] as const/)![1];
    for (const f of PATCHABLE) expect(columns, `${f} is patchable but not journalled`).toContain(`'${f}'`);
  });

  it('does not let a caller name the fields that are not theirs', () => {
    // `map_node_id` would move an object to another campaign's map; `id` would let a PATCH become an
    // impersonation. Mass assignment here is not a field with a bad value, it is a field the caller does
    // not get to name at all.
    for (const forbidden of ['id', 'map_node_id', 'kind', 'created_at']) {
      expect(PATCHABLE as readonly string[]).not.toContain(forbidden);
    }
  });
});

describe('a batch is walked in an order that respects what depends on what', () => {
  // Every entry in one batch is written by a single INSERT, so `created_at` is a tie for all of them and
  // the sort order was whatever Postgres felt like. Harmless until a batch holds rows that depend on
  // each other — and deleting a found secret is exactly that: the object plus the discoveries that
  // cascaded with it, where restoring the discovery first is refused by the foreign key.
  //
  // Measured live before `seq` existed: the object came back, the discovery did not, and the response
  // still said `restored: 2`.
  it('breaks a created_at tie on seq, descending', () => {
    const t = '2026-08-01T10:00:00.000Z';
    const walked = undoOrder([
      { id: 'discovery', created_at: t, seq: 0 },
      { id: 'object', created_at: t, seq: 1 },
    ]);
    expect(walked.map((e) => e.id)).toEqual(['object', 'discovery']);
  });

  it('still puts a LATER batch entry first, whatever its seq', () => {
    // created_at outranks seq: seq only orders within one insert.
    const walked = undoOrder([
      { id: 'later', created_at: '2026-08-01T10:00:01Z', seq: 0 },
      { id: 'earlier', created_at: '2026-08-01T10:00:00Z', seq: 9 },
    ]);
    expect(walked.map((e) => e.id)).toEqual(['later', 'earlier']);
  });

  it('treats a missing seq as 0 rather than NaN-ing the comparison', () => {
    const t = '2026-08-01T10:00:00Z';
    expect(undoOrder([{ id: 'a', created_at: t }, { id: 'b', created_at: t }])).toHaveLength(2);
  });
});

describe('what the undo control calls a batch', () => {
  it('is the first entry with something to say, not the head', () => {
    // Deleting a found secret journals discovery rows (no summary) before the object row (the one that
    // says what happened). Reading the head gives "Undone." with no subject, at exactly the moment a DM
    // needs to know what came back. Verified live: this read `summary: null` before the fix.
    expect(batchSummary([{ summary: null }, { summary: 'Removed A rune' }])).toBe('Removed A rune');
  });

  it('ignores whitespace-only summaries', () => {
    expect(batchSummary([{ summary: '   ' }, { summary: 'Placed Ogre' }])).toBe('Placed Ogre');
  });

  it('is null when the whole batch is silent', () => {
    expect(batchSummary([{ summary: null }])).toBeNull();
    expect(batchSummary([])).toBeNull();
  });
});
