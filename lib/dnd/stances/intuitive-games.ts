// lib/dnd/stances/intuitive-games.ts — fold the ACTIVE IG stance into a d20 roll, the mirror of
// lib/dnd/conditions/intuitive-games.ts for conditions (owner: "real mechanics affecting checks/rolls";
// BLOCKERS §C — IG gets an in-app roller). The IGSheet already auto-folds conditions at roll time; this closes
// the B5 remainder — the active stance's advantage/disadvantage was displayed but the player applied it by hand.
//
// The stance's precise per-level effect comes from the tested `igStanceMechanic` (Basic below Lv 5, Advanced at
// 5+). Here we only translate its `advantage`/`disadvantage` prose into whether THIS roll kind is affected —
// strictly, and skipping CONDITIONAL effects ("when flanking", "vs a flanked target") which the sheet can't
// know are in play, surfacing those as a note instead. Nothing is invented (an unknown stance folds to nothing).
import { igStanceMechanic } from '@/lib/dnd/systems/intuitive-games/modifiers';
import type { IgRollKind } from '@/lib/dnd/conditions/intuitive-games';

/** A stance effect is conditional when it only applies in a situation off the sheet (flanking, target state). */
function isConditional(text: string): boolean {
  return /\bwhen\b|\bvs\b|\bagainst\b|flank|unconscious|entangled|paralyzed|blinded target/i.test(text);
}

/** Whether a stance's category prose ("attack rolls", "Reflex saves", "all combat skills") applies to a roll of
 *  `kind` — 'yes' (unconditional), 'conditional' (matches but situational), or 'no'. Strict so a "combat skills"
 *  stance never bleeds onto a plain skill check when the sheet rolls a generic skill. */
function stanceMatch(prose: string, kind: IgRollKind): 'yes' | 'conditional' | 'no' {
  const t = prose.toLowerCase();
  let hit = false;
  switch (kind) {
    case 'attack': hit = /attack/.test(t); break;
    case 'reflex_save': hit = /reflex/.test(t); break;
    case 'fortitude_save': hit = /fortitude|\bfort\b/.test(t); break;
    case 'will_save': hit = /\bwill\b/.test(t); break;
    case 'save': hit = /reflex|fortitude|\bwill\b|\bsave/.test(t); break;
    case 'skill': hit = /skill/.test(t); break; // includes "combat skills" — the sheet rolls combat skills as 'skill'
    case 'perception': hit = /perception/.test(t); break;
    case 'str_dex_check': hit = /strength|dexterity|str|dex/.test(t); break;
    case 'ability_check': hit = /ability check/.test(t); break;
    case 'any': hit = true; break;
  }
  if (!hit) return 'no';
  return isConditional(prose) ? 'conditional' : 'yes';
}

export interface IgStanceRollEffect {
  advantage: boolean;
  disadvantage: boolean;
  /** Named sources ("Offensive stance") for the applied advantage/disadvantage. */
  sources: string[];
  /** Conditional stance effects that matched this kind but need the player to adjudicate (kept, not applied). */
  conditional: string[];
}

const EMPTY: IgStanceRollEffect = { advantage: false, disadvantage: false, sources: [], conditional: [] };

/**
 * Fold the active stance into a roll of category `kind`. Returns whether the roll gains advantage / takes
 * disadvantage from the stance (unconditional, kind-matching only), the named source, and any conditional
 * stance effect surfaced for the player. The caller combines this with the condition effect + cancels an
 * opposing advantage/disadvantage to a straight roll (the 5e rule the platform already uses).
 */
export function igStanceRollEffect(stance: string | null | undefined, level: number, kind: IgRollKind): IgStanceRollEffect {
  const m = igStanceMechanic(stance ?? null, level);
  if (!m) return EMPTY;
  const out: IgStanceRollEffect = { advantage: false, disadvantage: false, sources: [], conditional: [] };
  const label = `${m.name} stance`;
  if (m.advantage) {
    const r = stanceMatch(m.advantage, kind);
    if (r === 'yes') { out.advantage = true; out.sources.push(label); }
    else if (r === 'conditional') out.conditional.push(`${label}: advantage on ${m.advantage}`);
  }
  if (m.disadvantage) {
    const r = stanceMatch(m.disadvantage, kind);
    if (r === 'yes') { out.disadvantage = true; if (!out.sources.includes(label)) out.sources.push(label); }
    else if (r === 'conditional') out.conditional.push(`${label}: disadvantage on ${m.disadvantage}`);
  }
  return out;
}
