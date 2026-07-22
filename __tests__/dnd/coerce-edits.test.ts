// coerceEditsArray — the fix for level-up 502s. The model returns `edits` as a JSON-encoded string
// (which doubles token cost and can truncate mid-array). This pure helper recovers the array.
import { describe, expect, it } from 'vitest';
import { coerceEditsArray } from '@/lib/dnd/sheet-edits';

describe('coerceEditsArray', () => {
  it('passes a real array straight through', () => {
    const arr = [{ op: 'set_level', value: 8 }];
    expect(coerceEditsArray(arr)).toBe(arr);
  });

  it('parses a COMPLETE stringified array — the common quirk', () => {
    // Exactly the shape the diagnostic caught: edits arrived as a JSON string.
    const s = JSON.stringify([{ op: 'set_level', value: 8 }, { op: 'set_ability', ability: 'wis', value: 18 }]);
    const out = coerceEditsArray(s);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ op: 'set_level', value: 8 });
  });

  it('SALVAGES the leading complete objects from a TRUNCATED string', () => {
    // A stringified array cut off mid-way (the max_tokens truncation). We should still get the
    // complete objects that arrived, so a level-up applies as much as it can rather than failing.
    const full = JSON.stringify([
      { op: 'set_level', value: 8 },
      { op: 'set_ability', ability: 'wis', value: 18 },
      { op: 'add_feature', name: 'Destroy Undead', source: 'Class', body: ['CR 1/2'] },
    ]);
    const truncated = full.slice(0, full.indexOf('Destroy Undead')); // cut inside the 3rd object
    const out = coerceEditsArray(truncated);
    expect(out.length).toBeGreaterThanOrEqual(2); // the first two survived
    expect(out[0]).toMatchObject({ op: 'set_level', value: 8 });
    expect(out[1]).toMatchObject({ op: 'set_ability', ability: 'wis' });
  });

  it('does not choke on braces INSIDE string values', () => {
    // A description containing { } must not confuse the depth tracker.
    const s = JSON.stringify([{ op: 'add_feature', name: 'X', body: ['deal {2d6} on a hit }{'] }, { op: 'set_level', value: 6 }]);
    const truncated = s.slice(0, s.length - 5); // lop the tail
    const out = coerceEditsArray(truncated);
    expect(out[0]).toMatchObject({ op: 'add_feature', name: 'X' });
  });

  it('returns [] for genuinely unusable input rather than throwing', () => {
    expect(coerceEditsArray(undefined)).toEqual([]);
    expect(coerceEditsArray(42)).toEqual([]);
    expect(coerceEditsArray('not json at all {[')).toEqual([]);
    expect(coerceEditsArray('"a string that is not an array"')).toEqual([]);
  });
});
