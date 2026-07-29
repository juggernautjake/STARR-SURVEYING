// lib/dnd/bestiary/rolls.ts — turn a stat block entry into rollable dice (P13-8).
//
// The owner: *"the dice roller needs to work with creatures and stuff too"*. A creature's actions are the
// thing a DM rolls most often at the table, and until now a stat block was something you read numbers off
// and typed into a roller by hand.
//
// THIS IS WHY P13-1 KEPT `toHit` AND `damage` OUT OF `body`. Everything here is a parse of two short,
// well-shaped fields — "+14" and "2d10 + 8" — rather than a regex hunt through prose. Had they been
// folded into the body text, every roll would have been a guess about English.
//
// PURE. No React, no randomness at module scope: `rollDice` takes its own RNG so a test can pin it, which
// is the only way to assert that a d20+7 actually adds 7 rather than merely looks plausible.

/** A parsed dice expression: `2d10 + 8` → { count: 2, sides: 10, modifier: 8 }. */
export interface DiceSpec {
  count: number;
  sides: number;
  modifier: number;
}

export interface RollResult {
  spec: DiceSpec;
  /** Each die face, in order, so the UI can show the dice rather than only the sum. */
  dice: number[];
  modifier: number;
  total: number;
}

/**
 * Parse the leading dice expression out of a damage string. Real stat blocks write these many ways —
 * "2d10 + 8", "2d10+8", "1d6", "7 (2d6)" — so this takes the FIRST `NdM` it finds and any signed constant
 * immediately following it. Returns null when there is no dice expression at all, which is common and not
 * an error: plenty of damage lines are flat numbers or pure prose ("half the target's current hit points").
 */
export function parseDice(text: string | undefined | null): DiceSpec | null {
  const s = (text ?? '').trim();
  if (!s) return null;
  const m = s.match(/(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?/i);
  if (!m) return null;
  const sides = Number(m[2]);
  if (!Number.isFinite(sides) || sides < 2) return null;
  const count = m[1] ? Number(m[1]) : 1;
  if (!Number.isFinite(count) || count < 1 || count > 100) return null;
  const mod = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
  return { count, sides, modifier: mod };
}

/**
 * Parse a to-hit modifier — "+14", "-1", "14". Returns null for anything else, so a malformed field
 * offers no button rather than a button that rolls a lie.
 */
export function parseModifier(text: string | undefined | null): number | null {
  const s = (text ?? '').trim();
  if (!s) return null;
  const m = s.match(/^([+-]?)\s*(\d+)$/);
  if (!m) return null;
  return Number(m[2]) * (m[1] === '-' ? -1 : 1);
}

/** Roll a spec. `rng` returns [0, 1); injected so tests can pin every face. */
export function rollDice(spec: DiceSpec, rng: () => number = Math.random): RollResult {
  const dice: number[] = [];
  for (let i = 0; i < spec.count; i += 1) dice.push(Math.floor(rng() * spec.sides) + 1);
  return {
    spec,
    dice,
    modifier: spec.modifier,
    total: dice.reduce((a, b) => a + b, 0) + spec.modifier,
  };
}

/** A d20 attack roll at `mod`. Separate from `rollDice` because an attack is always one d20 — encoding
 *  that here keeps the caller from having to know it, and keeps "+14" from being rollable as anything
 *  other than d20+14. */
export function rollAttack(mod: number, rng: () => number = Math.random): RollResult {
  return rollDice({ count: 1, sides: 20, modifier: mod }, rng);
}

/** "2d10 + 8" for display — normalised from whatever the source wrote. */
export function formatSpec(spec: DiceSpec): string {
  const base = `${spec.count}d${spec.sides}`;
  if (!spec.modifier) return base;
  return `${base} ${spec.modifier < 0 ? '−' : '+'} ${Math.abs(spec.modifier)}`;
}

/** "18 = 12 + 6" — the sum shown with its parts, because a total nobody can check is a total nobody
 *  trusts at a table. */
export function explainRoll(r: RollResult): string {
  const parts = r.dice.join(' + ');
  const withMod = r.modifier ? `${parts} ${r.modifier < 0 ? '−' : '+'} ${Math.abs(r.modifier)}` : parts;
  return r.dice.length === 1 && !r.modifier ? String(r.total) : `${r.total} = ${withMod}`;
}
