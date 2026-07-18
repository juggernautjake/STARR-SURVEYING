// lib/dnd/roll.ts — Phase 2, Area R1: the shared, pure d20 roll-resolution engine the bespoke sheets (IG +
// PF2) and the roller UI build on. It takes the NATURAL die as input rather than rolling it, so the same
// function serves all of the owner's input modes: the roller feeds it an RNG face (auto), the player types a
// face (manual roll input), or a real-life roll is recorded (IRL) — every path resolves identically.
//
// Randomness stays OUT of this module (it would make it impure + untestable); a caller that wants an
// auto-roll uses `rollNaturalD20()` and passes the face in. Degrees of success use the four-step ladder that
// IG and Pathfinder 2e share (crit on beating/among by 10, one step shift on a natural 20 / 1).

export type RollDegree = 'critical-failure' | 'failure' | 'success' | 'critical-success';

export interface RollInput {
  /** The d20 face, 1–20. From an RNG (auto), the player (manual), or a recorded IRL roll. */
  natural: number;
  /** The flat modifier added to the face (ability + proficiency + item, etc.). */
  modifier: number;
  /** The DC/target, when the roll is against one. Omitted ⇒ just a total (e.g. an initiative or damage-adjacent number). */
  dc?: number;
  /** The character's system — selects the success model (IG/PF2 use degrees; others success/fail). */
  system?: string;
}

export interface RollResult {
  natural: number;
  modifier: number;
  /** natural + modifier. */
  total: number;
  dc?: number;
  /** The four-step degree, for systems that use it (IG, PF2) AND when a dc was supplied. */
  degree?: RollDegree;
  /** Whether the roll met the DC (all systems), when a dc was supplied. For degree systems this is true on a
   *  success or critical success. */
  success?: boolean;
  /** Natural 20. */
  critical: boolean;
  /** Natural 1. */
  fumble: boolean;
}

const DEGREES = ['critical-failure', 'failure', 'success', 'critical-success'] as const;

/** The four-step degree of success IG + PF2 share: beat the DC by 10 = crit success, meet it = success, miss
 *  by 10 = crit failure; a natural 20 bumps one step up, a natural 1 one step down (clamped). */
export function fourStepDegree(total: number, dc: number, natural?: number): RollDegree {
  let step = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (natural === 20) step = Math.min(3, step + 1);
  else if (natural === 1) step = Math.max(0, step - 1);
  return DEGREES[step];
}

const usesDegrees = (system?: string): boolean => system === 'intuitive-games' || system === 'pathfinder2e';

/** Clamp a d20 face to 1–20 (so a bad manual entry can't produce an out-of-range roll). */
export function clampNatural(n: number): number {
  return Math.max(1, Math.min(20, Math.floor(n || 0)));
}

/**
 * Resolve a d20 roll from its natural face + modifier (+ optional DC). Pure: the same input always gives the
 * same result, so it's identical whether the face came from an RNG, a typed entry, or a recorded IRL roll.
 */
export function resolveD20Roll(input: RollInput): RollResult {
  const natural = clampNatural(input.natural);
  const modifier = Math.round(input.modifier || 0);
  const total = natural + modifier;
  const result: RollResult = {
    natural,
    modifier,
    total,
    critical: natural === 20,
    fumble: natural === 1,
  };
  if (input.dc != null) {
    result.dc = input.dc;
    if (usesDegrees(input.system)) {
      const degree = fourStepDegree(total, input.dc, natural);
      result.degree = degree;
      result.success = degree === 'success' || degree === 'critical-success';
    } else {
      // 5e-style: meet-or-beat the DC. (Attack-roll auto-hit on a nat 20 is a caller concern; this is the
      // general check/save model.)
      result.success = total >= input.dc;
    }
  }
  return result;
}

/** Roll a natural d20 (1–20). Impure — the only randomness in the roll path — kept separate so the resolver
 *  above stays pure/testable. Callers in the auto-roll mode use this, then pass the face to `resolveD20Roll`. */
export function rollNaturalD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}
