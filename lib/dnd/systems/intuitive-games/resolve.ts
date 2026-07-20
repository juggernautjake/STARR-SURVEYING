// lib/dnd/systems/intuitive-games/resolve.ts — the IG sheet's DISPLAYED numbers, resolved.
//
// S11 of DND_2024_COMPLETE_LIBRARY_2026-07-20.
//
// SCOPE, and why this file is narrow. The sheet's ROLL path already folds stances and conditions
// correctly — `igStanceRollEffect` / `igConditionRollEffect` / `igStanceDamageBonus` in
// lib/dnd/{stances,conditions}/intuitive-games.ts, wired into IGSheet's `rollLine`. A first cut
// of this file re-derived all of that from `modifiers.ts`, which would have been a THIRD
// implementation of the same rules; it now delegates to those canonical functions instead. One
// source of truth for "what does this stance do to a roll", and a regression in it shows up in
// both the roll and the display rather than only one.
//
// What was genuinely missing, and is what this adds: the DISPLAYED totals. The sheet shows base
// saves, base skills and gear-only DR while the rolls quietly apply more — so a Shaken character
// reads "+7 Reflex" on the card and rolls +5, and a Defensive stance at level 5 grants DR that
// appears in no number anywhere. The card should say what you are about to roll.

import type { IGCharacter, IGAttack, IGSaveKey } from './model';
import { igAbilityMod, igAttackBonus, igDamageBonus, igSaves, igSkillTotals } from './rules';
import { igStanceRollEffect, igStanceDamageBonus } from '@/lib/dnd/stances/intuitive-games';
import { igConditionRollEffect, type IgRollKind } from '@/lib/dnd/conditions/intuitive-games';

/** The ACTIVE stance. IG stores it as combat.stances[0] — entering a stance replaces any current
 *  one (edit.ts `set_active_stance`), so the list is a one-element slot, not a set. */
export function activeStanceOf(char: IGCharacter): string | null {
  return char.combat?.stances?.[0] ?? null;
}

/** Advantage state after everything is folded in. */
export type RollSwing = 'advantage' | 'disadvantage' | 'none';

/** Opposing advantage and disadvantage cancel to a straight roll — the same rule the roll path
 *  uses, kept here so the displayed swing matches what rolling will actually do. */
export function combineSwing(adv: boolean, dis: boolean): RollSwing {
  if (adv && dis) return 'none';
  if (adv) return 'advantage';
  if (dis) return 'disadvantage';
  return 'none';
}

/** Everything in force for one kind of roll, from the canonical effect functions. */
function effectsFor(char: IGCharacter, kind: IgRollKind) {
  const level = char.identity.level;
  const cond = igConditionRollEffect((char.combat?.conditions ?? []) as string[], kind);
  const stance = igStanceRollEffect(activeStanceOf(char), level, kind);
  return {
    penalty: cond.penalty,
    swing: combineSwing(stance.advantage, stance.disadvantage || cond.disadvantage),
    // Named sources plus any clause the sheet deliberately will NOT auto-apply, so the player
    // can see both what was counted and what is theirs to judge.
    sources: [...cond.sources, ...stance.sources],
    conditional: stance.conditional,
  };
}

export interface ResolvedAttack {
  /** To-hit INCLUDING condition penalties — what the card should show. */
  toHit: number;
  /** Damage with every unconditional flat bonus folded in, e.g. '1d8+6'. */
  damage: string;
  swing: RollSwing;
  sources: string[];
  /** Clauses the sheet will not decide for you ("advantage when flanking"). */
  conditional: string[];
}

/** One attack as it stands right now. */
export function igResolveAttackInPlay(char: IGCharacter, atk: IGAttack): ResolvedAttack {
  const level = char.identity.level;
  const mod = igAbilityMod(char.abilities[atk.ability]);
  const e = effectsFor(char, 'attack');

  const dmgStance = igStanceDamageBonus(activeStanceOf(char), level);
  const dmgBonus = igDamageBonus(atk, mod) + (dmgStance?.bonus ?? 0);
  const die = atk.damage || '1d6';

  return {
    toHit: igAttackBonus(atk, level, mod) + e.penalty,
    damage: dmgBonus === 0 ? die : `${die}${dmgBonus > 0 ? '+' : ''}${dmgBonus}`,
    swing: e.swing,
    sources: [...e.sources, ...(dmgStance ? [dmgStance.source] : [])],
    conditional: e.conditional,
  };
}

export interface ResolvedSave {
  key: IGSaveKey;
  total: number;
  swing: RollSwing;
  sources: string[];
}

const SAVE_KIND: Record<IGSaveKey, IgRollKind> = {
  Fortitude: 'fortitude_save',
  Reflex: 'reflex_save',
  Will: 'will_save',
};

/** Every save at its current value. */
export function igResolveSavesInPlay(char: IGCharacter): ResolvedSave[] {
  const base = igSaves(char);
  return (Object.keys(base) as IGSaveKey[]).map((key) => {
    const e = effectsFor(char, SAVE_KIND[key]);
    return { key, total: base[key] + e.penalty, swing: e.swing, sources: e.sources };
  });
}

/** Skill totals with the flat condition penalty applied. */
export function igResolveSkillsInPlay(char: IGCharacter): { name: string; total: number; combat: boolean }[] {
  const e = effectsFor(char, 'skill');
  return igSkillTotals(char).map((s) => ({ ...s, total: s.total + e.penalty }));
}

/** Damage Reduction in force: gear plus Advanced Defensive's "half your level".
 *  Derived here because no existing function combined the two — the sheet showed gear only. */
export function igResolveDamageReduction(char: IGCharacter): { dr: number; sources: string[] } {
  const level = char.identity.level;
  const gear = Number(char.combat?.damageReduction) || 0;
  const sources: string[] = [];
  if (gear) sources.push(`${gear} from gear`);

  // Advanced Defensive is the only stance granting DR, and only at level 5+.
  const stanceName = activeStanceOf(char);
  let stanceDr = 0;
  if (stanceName && /defensive/i.test(stanceName) && level >= 5) {
    stanceDr = Math.floor(level / 2);
    sources.push(`+${stanceDr} from Defensive stance (advanced)`);
  }
  return { dr: gear + stanceDr, sources };
}

export interface IGInPlayState {
  conditionPenalty: number;
  damageReduction: { dr: number; sources: string[] };
  saves: ResolvedSave[];
  skills: { name: string; total: number; combat: boolean }[];
}

/** Everything the sheet needs to display CURRENT numbers rather than base ones. */
export function igInPlayState(char: IGCharacter): IGInPlayState {
  return {
    conditionPenalty: effectsFor(char, 'any').penalty,
    damageReduction: igResolveDamageReduction(char),
    saves: igResolveSavesInPlay(char),
    skills: igResolveSkillsInPlay(char),
  };
}
