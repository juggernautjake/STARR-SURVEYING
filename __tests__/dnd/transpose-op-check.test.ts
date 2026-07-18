// __tests__/dnd/transpose-op-check.test.ts — the transpose OP heuristic + funny flag. We keep an OP source
// character faithful (no auto-nerf); this just quips when the result is obviously strong for its level.
import { describe, it, expect } from 'vitest';
import { opNoteFor, overpoweredReasons } from '@/lib/dnd/transpose/op-check';

const normal = { name: 'Bram', level: 5, abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, maxHp: 44, attacksCount: 2 };

describe('transpose OP check', () => {
  it('a normal well-built character is NOT flagged', () => {
    expect(overpoweredReasons(normal)).toEqual([]);
    expect(opNoteFor(normal)).toBeNull();
  });

  it('an extreme single ability (24+) trips it on its own', () => {
    const op = { ...normal, abilities: { ...normal.abilities, str: 26 } };
    expect(opNoteFor(op)).toMatch(/possibly OP for level 5/i);
    expect(opNoteFor(op)).toMatch(/a 26 ability score/);
  });

  it('absurd HP for the level trips it', () => {
    expect(opNoteFor({ ...normal, maxHp: 400 })).toMatch(/400 HP at level 5/);
  });

  it('two milder signals together trip it, one alone does not', () => {
    // ability total 102 alone is one reason → not enough on its own.
    const oneReason = { ...normal, abilities: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 12 } };
    expect(overpoweredReasons(oneReason).length).toBe(1);
    expect(opNoteFor(oneReason)).toBeNull();
    // add a second (lots of attacks) → flagged.
    expect(opNoteFor({ ...oneReason, attacksCount: 8 })).toMatch(/possibly OP/i);
  });

  it('is deterministic — same character always gets the same note', () => {
    const op = { ...normal, abilities: { ...normal.abilities, str: 28 } };
    expect(opNoteFor(op)).toBe(opNoteFor(op));
  });
});
