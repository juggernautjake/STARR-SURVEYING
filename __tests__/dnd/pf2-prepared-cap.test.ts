// __tests__/dnd/pf2-prepared-cap.test.ts — S7c's last piece: the prepared-slot cap is ENFORCED.
//
// THE DECISION (owner 2026-07-27, "make a good decision for 6 — I trust your judgement"): enforce it, the
// way 5e already does. `SpellsPanel.tsx` refuses a prepare past the cap (`if (held >= preparedCap) return c`)
// and disables the control with an explanation. PF2 displaying `Rank 1: 2/3` and then silently allowing a
// 4th would mean the two systems disagree about whether a published budget means anything — worse than
// either answer on its own.
//
// WHY THIS IS NOT A BREACH OF S15's "only ACQUISITION is gated" boundary, which is what made it a decision
// rather than a task: preparing acquires nothing. Nothing joins or leaves the character; it is an
// assignment of spells they ALREADY hold into slots the sheet itself publishes. The budget shipped first
// (`bfd60b94`) precisely so the cap is stated before it bites — S7b's finding that *a cap discovered by
// being refused reads as a bug; the same number stated in advance reads as a rule*.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pf2PreparedRoom } from '@/lib/dnd/systems/pathfinder2e/spell-counts';

/** A prepared caster with 3 rank-1 slots and 2 rank-2 slots. */
const SLOTS = [5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0];
const spell = (name: string, rank: number, prepared = true, focus = false) => ({ name, rank, prepared, focus });

describe('the cap, where it applies', () => {
  it('allows a prepare while slots remain', () => {
    const room = pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells: [spell('Magic Missile', 1)], rank: 1 });
    expect(room.slots).toBe(3);
    expect(room.prepared).toBe(1);
    expect(room.hasRoom).toBe(true);
    expect(room.reason).toBeNull();
  });

  it('refuses the one past the cap, and says why in the player’s terms', () => {
    const spells = [spell('A', 1), spell('B', 1), spell('C', 1)];
    const room = pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells, rank: 1 });
    expect(room.hasRoom).toBe(false);
    expect(room.prepared).toBe(3);
    // The message has to name the number AND the way out; "invalid" would be the bug S7b describes.
    expect(room.reason).toMatch(/rank 1 grants 3 slots/);
    expect(room.reason).toMatch(/un-prepare one/i);
  });

  it('counts per RANK, so a full rank 1 never blocks rank 2', () => {
    const spells = [spell('A', 1), spell('B', 1), spell('C', 1)];
    expect(pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells, rank: 1 }).hasRoom).toBe(false);
    expect(pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells, rank: 2 }).hasRoom).toBe(true);
  });

  it('singularises the message for a one-slot rank', () => {
    const oneSlot = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const room = pf2PreparedRoom({ kind: 'prepared', slots: oneSlot, spells: [spell('A', 1)], rank: 1 });
    expect(room.reason).toMatch(/grants 1 slot and it is all prepared/);
  });
});

describe('the four exemptions — each matching the slot pills, so refusal and display cannot disagree', () => {
  const full = [spell('A', 1), spell('B', 1), spell('C', 1)];

  it('SPONTANEOUS casters are never capped — a repertoire is not a per-day assignment', () => {
    const room = pf2PreparedRoom({ kind: 'spontaneous', slots: SLOTS, spells: full, rank: 1 });
    expect(room.hasRoom).toBe(true);
    expect(room.slots).toBeNull();
  });

  it('CANTRIPS are never capped here — not slot-cast; their cap bites at pick time', () => {
    const cantrips = [spell('Ray', 0), spell('Shield', 0), spell('Light', 0), spell('Detect', 0), spell('Sigil', 0), spell('Stabilize', 0)];
    const room = pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells: cantrips, rank: 0 });
    expect(room.hasRoom).toBe(true);
    expect(room.slots).toBeNull();
  });

  it('FOCUS spells do not consume a slot, so they never fill one', () => {
    const focus = [spell('F1', 1, true, true), spell('F2', 1, true, true), spell('F3', 1, true, true)];
    const room = pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells: focus, rank: 1 });
    expect(room.prepared).toBe(0);
    expect(room.hasRoom).toBe(true);
  });

  it('a rank with NO modelled slots is never capped — that is the reduced-caster case', () => {
    // Magus/Summoner have no published table, so `slots` is suppressed for them (`1d2ebad7`). Capping on a
    // zero would invent a rule for exactly the classes this strand exists to stop inventing rules for.
    for (const slots of [SLOTS, [], undefined, null] as const) {
      const room = pf2PreparedRoom({ kind: 'prepared', slots, spells: full, rank: 5 });
      expect(room.hasRoom, `rank 5 with ${JSON.stringify(slots)}`).toBe(true);
      expect(room.slots).toBeNull();
    }
  });
});

describe('what it must never do to a player’s content', () => {
  it('an over-count caster is GRANDFATHERED — no room, but nothing is removed', () => {
    // Q5's recorded assumption. The count reports the overage honestly rather than hiding or trimming it.
    const over = [spell('A', 1), spell('B', 1), spell('C', 1), spell('D', 1), spell('E', 1)];
    const room = pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells: over, rank: 1 });
    expect(room.prepared).toBe(5);
    expect(room.slots).toBe(3);
    expect(room.hasRoom).toBe(false);
    expect(room.reason).toMatch(/5 spells are prepared against 3 rank-1 slots/);
  });

  it('re-saving an ALREADY-prepared spell is never refused by its own presence', () => {
    // Without this, opening a prepared spell at a full rank and pressing Save would refuse the spell for
    // occupying the slot it already occupies — the cap eating an edit rather than preventing an addition.
    const spells = [spell('A', 1), spell('B', 1), spell('C', 1)];
    const room = pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells, rank: 1, editingName: 'B' });
    expect(room.prepared).toBe(2);
    expect(room.hasRoom).toBe(true);
  });

  it('and the editing match is name-insensitive to case and padding', () => {
    const spells = [spell('A', 1), spell('B', 1), spell('C', 1)];
    expect(pf2PreparedRoom({ kind: 'prepared', slots: SLOTS, spells, rank: 1, editingName: '  b ' }).hasRoom).toBe(true);
  });
});

describe('the control is actually wired to it', () => {
  // The repo's most common defect is authored-but-not-wired: a rule that exists, is tested, and is read by
  // nothing. `slotTableModelled` was exactly that before `1d2ebad7`.
  const EDITOR = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2ElementEditor.tsx'), 'utf8');
  const PANEL = readFileSync(join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');

  it('the panel passes the character’s live slot state to the editor', () => {
    expect(PANEL).toContain('preparedRoomFor={(rank) => pf2PreparedRoom({');
    expect(PANEL).toMatch(/editingName: editor\.initial\?\.name/);
  });

  it('the checkbox disables only when there is no room AND it is not already on', () => {
    // The `&& !prepared` half is what keeps un-preparing always available.
    expect(EDITOR).toContain('disabled={!!room && !room.hasRoom && !prepared}');
  });

  it('the budget renders beside the control, not only on refusal', () => {
    expect(EDITOR).toMatch(/\{room\.prepared \+ \(prepared \? 1 : 0\)\}\/\{room\.slots\}/);
  });

  it('the room follows the RANK field rather than being fixed at mount', () => {
    expect(EDITOR).toContain('preparedRoomFor ? preparedRoomFor(rank) : null');
  });
});
