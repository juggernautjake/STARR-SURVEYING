// lib/dnd/systems/pathfinder2e/inventory.ts — what a Pathfinder 2e character is carrying (P5-1).
//
// AUDIT FINDING C-1, the largest cross-system parity hole: PF2 had **no inventory at all**. No `inventory`
// field on the model, no equipment panel among its nine, no coins. A PF2 character could not record that
// they were carrying a rope — while `data/equipment.ts` shipped full weapon, armour, shield, rune and item
// tables that reached only the rules library and the armour editor.
//
// BULK IS THE POINT, not a nicety. It is a core PF2 mechanic with real combat consequences (encumbered
// costs 10 feet of Speed and gives a −1 penalty to Str- and Dex-based checks), and it is the thing 5e's
// weight-in-pounds model cannot express. So this file models Bulk properly rather than storing a number of
// pounds and calling it done.
//
// Pure — no React, no DB. The panel, the editor and any future engine bridge all read the same arithmetic.

/** A Bulk value as PF2 writes it: a number, `'L'` (light), or `'—'` / `''` (negligible).
 *
 *  Kept as the WRITTEN form rather than normalised to a number at rest, because "L" is what the books say
 *  and what an author types, and round-tripping it through 0.1 loses the distinction between "light" and
 *  "a tenth of a Bulk" — which matters when ten of them become 1 Bulk exactly. */
export type BulkValue = string | number;

export interface PF2Item {
  id: string;
  name: string;
  quantity: number;
  /** Written Bulk for ONE of them. */
  bulk?: BulkValue;
  /** Where it is. `worn` and `held` are the two that matter for Bulk in the strictest reading; this model
   *  counts all three, because PF2 counts everything you carry. `stowed` is kept so a player can see what
   *  is in the backpack versus in their hands. */
  location?: 'worn' | 'held' | 'stowed';
  /** Magic items you have Invested. PF2 caps this at 10 per day; `investedCount` reports it. */
  invested?: boolean;
  notes?: string;
}

/** How many Bulk one item of this value is worth. `L` is a tenth; negligible is nothing. */
export function bulkOf(v: BulkValue | undefined): number {
  if (v == null || v === '' || v === '—' || v === '-') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().toUpperCase();
  if (s === 'L') return 0.1;
  if (s === '—' || s === '-' || s === '0') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Total Bulk carried.
 *
 * Rounded to one decimal at the END, not per item, because PF2's rule is that ten Light items make 1 Bulk —
 * summing 0.1 ten times in floating point gives 0.9999999999999999, and a character with exactly ten
 * torches should read 1.0, not 0.9. Summing first and rounding once is what makes that come out right.
 */
export function totalBulk(items: readonly PF2Item[]): number {
  const raw = items.reduce((sum, i) => sum + bulkOf(i.bulk) * Math.max(0, i.quantity || 0), 0);
  return Math.round(raw * 10) / 10;
}

/** The Bulk you can carry before you are Encumbered: 5 + your Strength modifier. */
export function bulkLimit(strModifier: number): number {
  return 5 + (Number.isFinite(strModifier) ? strModifier : 0);
}

/** The most you can carry at all — the limit plus 5. Beyond this you cannot move. */
export function bulkMaximum(strModifier: number): number {
  return bulkLimit(strModifier) + 5;
}

export type BulkState = 'ok' | 'encumbered' | 'overloaded';

/** Where this character stands. `>` not `>=`: PF2 says you become encumbered when you carry MORE than
 *  5 + Str, so carrying exactly your limit is fine — an off-by-one here would penalise a legal load. */
export function bulkState(carried: number, strModifier: number): BulkState {
  if (carried > bulkMaximum(strModifier)) return 'overloaded';
  if (carried > bulkLimit(strModifier)) return 'encumbered';
  return 'ok';
}

/** What being over the line actually costs, in the game's own words. Returned as data so the sheet can
 *  render it and a future engine bridge can apply it, rather than each surface writing its own sentence. */
export interface BulkPenalty {
  state: BulkState;
  /** Speed penalty in feet (0 when unencumbered). */
  speedPenalty: number;
  /** Penalty to Strength- and Dexterity-based checks and DCs. */
  checkPenalty: number;
  note: string;
}

export function bulkPenalty(carried: number, strModifier: number): BulkPenalty {
  const state = bulkState(carried, strModifier);
  if (state === 'overloaded') {
    return {
      state,
      speedPenalty: 10,
      checkPenalty: -1,
      note: 'Overloaded — you cannot move at all until you drop something. (Encumbered penalties also apply.)',
    };
  }
  if (state === 'encumbered') {
    return {
      state,
      speedPenalty: 10,
      checkPenalty: -1,
      note: 'Encumbered — your Speed drops by 10 feet, and you take a −1 penalty to Strength- and Dexterity-based checks and DCs.',
    };
  }
  return { state, speedPenalty: 0, checkPenalty: 0, note: '' };
}

/** How many items are Invested. PF2 allows 10 per day; over that, the excess does nothing. */
export function investedCount(items: readonly PF2Item[]): number {
  return items.filter((i) => i.invested).length;
}

export const INVESTED_LIMIT = 10;

/** Defensively read a stored inventory. A row that cannot be an item is DROPPED rather than coerced — the
 *  same rule the statblock follows, and for the same reason: an invented line on an equipment list is a
 *  thing a player will act on. */
export function normalizeInventory(raw: unknown): PF2Item[] {
  if (!Array.isArray(raw)) return [];
  const out: PF2Item[] = [];
  for (const [i, r] of raw.entries()) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) continue;
    const qty = Number(o.quantity);
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : `item-${i}`,
      name,
      quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
      ...(o.bulk != null && o.bulk !== '' ? { bulk: typeof o.bulk === 'number' ? o.bulk : String(o.bulk) } : {}),
      ...(o.location === 'worn' || o.location === 'held' || o.location === 'stowed' ? { location: o.location } : {}),
      ...(o.invested === true ? { invested: true } : {}),
      ...(typeof o.notes === 'string' && o.notes.trim() ? { notes: o.notes.trim() } : {}),
    });
  }
  return out;
}

/** Bulk rendered the way the books write it: `0` → `—`, `0.1` → `L`, otherwise the number. */
export function formatBulk(n: number): string {
  if (n <= 0) return '—';
  if (n < 1) return n === 0.1 ? 'L' : `${Math.round(n * 10)}L`;
  return String(Math.round(n * 10) / 10);
}
