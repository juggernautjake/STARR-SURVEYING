// lib/dnd/systems/pathfinder2e/bonuses.ts — PF2's bonus/penalty stacking, and rune resolution (S13b).
//
// THE RULE THIS EXISTS FOR, because a naive sum is silently wrong every time:
// PF2 bonuses and penalties have TYPES — item, status, circumstance — and same-type effects do NOT
// stack. Only the HIGHEST bonus of each type applies, and only the WORST penalty of each type.
// Different types then add together. Untyped penalties are the exception: they always stack.
//
// 5e has nothing like this. Adding a +1 item bonus to a +2 item bonus gives +2, not +3, and a
// system that just sums modifiers produces numbers that look reasonable and are wrong — which is
// the failure mode this whole subsystem is built to avoid.
//
// `lib/dnd/conditions/pathfinder2e.ts` already implements the non-stacking rule for condition
// PENALTIES. This generalises it to bonuses too and to any source, so runes, spells, cover and
// conditions all resolve through one place rather than three that can disagree.
import { PF2_RUNES } from './data/equipment';
import type { PF2StrikingRune } from './strike';

/** PF2's three bonus types, plus untyped. Untyped is meaningful: it is the one kind that stacks. */
export type PF2BonusType = 'item' | 'status' | 'circumstance' | 'untyped';

export interface PF2Modifier {
  type: PF2BonusType;
  /** Positive = bonus, negative = penalty. */
  value: number;
  /** What produced it, for the roll breakdown. */
  source: string;
}

export interface PF2StackResult {
  total: number;
  /** Only the modifiers that actually contributed — the ones a roll breakdown should name. A
   *  suppressed +1 item bonus should NOT be listed, or the player will add it up themselves and
   *  get a different answer than the sheet. */
  applied: PF2Modifier[];
  /** Modifiers that were overridden by a same-type one. Shown as "suppressed" where the UI has
   *  room; a player asking "why isn't my +1 counting?" deserves an answer. */
  suppressed: PF2Modifier[];
}

/** Resolve a pile of modifiers under PF2's stacking rules. */
export function pf2StackModifiers(mods: PF2Modifier[]): PF2StackResult {
  const applied: PF2Modifier[] = [];
  const suppressed: PF2Modifier[] = [];

  // Untyped modifiers always stack, so they all apply and none are ever suppressed.
  for (const m of mods) if (m.type === 'untyped' && m.value !== 0) applied.push(m);

  for (const type of ['item', 'status', 'circumstance'] as const) {
    const ofType = mods.filter((m) => m.type === type && m.value !== 0);
    if (!ofType.length) continue;

    const bonuses = ofType.filter((m) => m.value > 0);
    const penalties = ofType.filter((m) => m.value < 0);

    // Highest bonus of the type, worst penalty of the type. BOTH can apply at once — a +2 item
    // bonus and a −1 item penalty net to +1; they do not cancel to "whichever is bigger".
    if (bonuses.length) {
      const best = bonuses.reduce((a, b) => (b.value > a.value ? b : a));
      applied.push(best);
      for (const b of bonuses) if (b !== best) suppressed.push(b);
    }
    if (penalties.length) {
      const worst = penalties.reduce((a, b) => (b.value < a.value ? b : a));
      applied.push(worst);
      for (const p of penalties) if (p !== worst) suppressed.push(p);
    }
  }

  return { total: applied.reduce((n, m) => n + m.value, 0), applied, suppressed };
}

// ── Runes ─────────────────────────────────────────────────────────────────────────────────────

/** What a set of equipped runes contributes.
 *
 *  PF2's item maths runs through runes rather than through named magic items: a "+1 striking
 *  longsword" is a longsword carrying a potency rune and a striking rune. Resolving them here
 *  means the sheet's stored `weaponBonus` / `acItemBonus` can be DERIVED rather than hand-entered
 *  and drifting out of sync with the runes the character actually has. */
export interface PF2RuneEffect {
  /** Item bonus to attack rolls (weapon potency) or AC (armor potency). */
  itemBonus: number;
  /** The striking line, for the Strike resolver's dice count. */
  striking: PF2StrikingRune;
  /** Resilient adds an item bonus to saves. */
  saveBonus: number;
  /** Property runes that carry effects the sheet should display rather than compute. */
  properties: string[];
  notes: string[];
}

const POTENCY = /^(\+[123])\s+(weapon|armor)\s+potency$/i;
const STRIKING_NAMES: Record<string, PF2StrikingRune> = {
  striking: 'striking',
  'greater striking': 'greater',
  'major striking': 'major',
};
const RESILIENT: Record<string, number> = { resilient: 1, 'greater resilient': 2, 'major resilient': 3 };

/** What a weapon's runes contribute, folded together with any hand-entered values.
 *
 *  Runes WIN over the manual fields when present, rather than adding to them: a weapon listing
 *  "+2 weapon potency" alongside a typed `weaponBonus: 1` has one potency rune, not three. Summing
 *  them is the obvious implementation and it is wrong — potency does not stack with itself.
 *  Absent runes leave the manual fields untouched, so nothing changes for a weapon that never
 *  listed any. */
export function pf2WeaponNumbers(weapon: { weaponBonus?: number; striking?: string; runes?: string[] }): {
  weaponBonus: number;
  striking: PF2StrikingRune;
  properties: string[];
  notes: string[];
} {
  const runes = weapon.runes ?? [];
  if (!runes.length) {
    return {
      weaponBonus: weapon.weaponBonus ?? 0,
      striking: (weapon.striking as PF2StrikingRune) ?? 'none',
      properties: [], notes: [],
    };
  }
  const r = pf2ResolveRunes(runes);
  return {
    weaponBonus: r.itemBonus,
    striking: r.striking,
    properties: r.properties,
    notes: r.notes,
  };
}

/** Resolve equipped rune NAMES into their mechanical contribution.
 *
 *  Unknown names are ignored rather than guessed at — a rune we do not have catalogued contributes
 *  nothing instead of contributing a made-up bonus (Ground Rule 3). */
export function pf2ResolveRunes(runeNames: string[]): PF2RuneEffect {
  const out: PF2RuneEffect = { itemBonus: 0, striking: 'none', saveBonus: 0, properties: [], notes: [] };

  for (const raw of runeNames) {
    const name = raw.trim();
    const lower = name.toLowerCase();

    const potency = lower.match(POTENCY);
    if (potency) {
      // Potency does not stack with itself — a weapon has ONE potency rune. Take the highest if a
      // sheet somehow lists two, rather than summing them into a +6.
      const value = Number(potency[1]);
      if (value > out.itemBonus) out.itemBonus = value;
      continue;
    }

    if (STRIKING_NAMES[lower]) {
      const next = STRIKING_NAMES[lower];
      // Same reasoning: one striking rune. Keep the strongest.
      const order: PF2StrikingRune[] = ['none', 'striking', 'greater', 'major'];
      if (order.indexOf(next) > order.indexOf(out.striking)) out.striking = next;
      continue;
    }

    if (RESILIENT[lower] != null) {
      out.saveBonus = Math.max(out.saveBonus, RESILIENT[lower]);
      continue;
    }

    // A property rune: catalogued ones contribute their described effect; uncatalogued names are
    // recorded so they are at least visible, but claim no mechanics.
    const def = PF2_RUNES.find((r) => r.name.toLowerCase() === lower);
    if (def) {
      out.properties.push(def.name);
      out.notes.push(`${def.name}: ${def.effect}`);
    } else if (name) {
      out.properties.push(name);
      out.notes.push(`${name}: not in the rune catalog — no mechanics applied.`);
    }
  }

  return out;
}
