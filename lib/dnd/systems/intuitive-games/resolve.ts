// lib/dnd/systems/intuitive-games/resolve.ts — the IG character sheet's maths, actually hooked up.
//
// S11 of DND_2024_COMPLETE_LIBRARY_2026-07-20 (owner 2026-07-20): "the stances should be fully
// taken into account as well as everything else, and all of the math hooked up correctly on the
// character sheet to account for everything."
//
// THE GAP THIS CLOSES. `modifiers.ts` already models stances and conditions, and `rules.ts`
// already computes attack bonuses, saves and skills — but the two never met. A Shaken character
// showed "-2 to rolls" as a NOTE while their attack bonus on the sheet stayed unchanged, and a
// Defensive stance at level 5 granted DR that appeared nowhere in the numbers. Everything was
// displayed for the player to apply by hand, which is the thing a character sheet exists to
// stop you doing.
//
// Kept pure and separate from rules.ts so the base maths stays independently testable: rules.ts
// answers "what is this character's attack bonus", this answers "what is it RIGHT NOW, given
// what they're standing in and suffering from".

import type { IGCharacter, IGAttack, IGSaveKey } from './model';
import { igAbilityMod, igAttackBonus, igDamageBonus, igSaves, igSkillTotals } from './rules';
import { igConditionSummary, igStanceMechanic, type IGStanceMechanic } from './modifiers';

/** The ACTIVE stance. IG stores it as combat.stances[0] — entering a stance replaces any
 *  current one (see edit.ts set_active_stance), so the list is a one-element slot, not a set. */
function activeStanceOf(char: IGCharacter): string | null {
  return char.combat?.stances?.[0] ?? null;
}

/** Advantage state on a roll after everything is folded in. */
export type RollSwing = 'advantage' | 'disadvantage' | 'none';

/** Combine advantage sources the way IG (and 5e) do: they don't stack, and one of each cancels. */
export function combineSwing(adv: boolean, dis: boolean): RollSwing {
  if (adv && dis) return 'none';
  if (adv) return 'advantage';
  if (dis) return 'disadvantage';
  return 'none';
}

/** Half your level, rounded down — the IG scaling term used by several advanced stances. */
export function halfLevel(level: number): number {
  return Math.floor(Math.max(0, level) / 2);
}

export interface ResolvedAttack {
  /** Total to-hit bonus INCLUDING condition penalties. */
  toHit: number;
  /** Damage string with every flat bonus already folded in, e.g. '1d8+6'. */
  damage: string;
  /** Net advantage state from stance and conditions together. */
  swing: RollSwing;
  /** Plain-language reasons, so the number is explicable rather than mysterious. */
  reasons: string[];
}

/** Whether a stance's advantage/disadvantage clause mentions attack rolls.
 *  The clauses are prose ("attack rolls when flanking"), so this is a substring test — but a
 *  conditional clause is reported as a REASON rather than silently applied, because "when
 *  flanking" is a table decision the sheet cannot make. */
function mentionsAttacks(clause?: string): { applies: boolean; conditional: boolean } {
  if (!clause || !/attack roll/i.test(clause)) return { applies: false, conditional: false };
  const conditional = /\bwhen\b|\bif\b|\bvs\b|\bagainst\b/i.test(clause);
  return { applies: !conditional, conditional };
}

function mentionsSave(clause: string | undefined, save: IGSaveKey): boolean {
  if (!clause) return false;
  const names: Record<IGSaveKey, RegExp> = {
    Fortitude: /fortitude/i,
    Reflex: /reflex/i,
    Will: /will/i,
  };
  return names[save]?.test(clause) ?? false;
}

/** Resolve one attack against the character's CURRENT state: stance, conditions and all. */
export function igResolveAttackInPlay(char: IGCharacter, atk: IGAttack): ResolvedAttack {
  const level = char.identity.level;
  const mod = igAbilityMod(char.abilities[atk.ability]);
  const cond = igConditionSummary(char.combat?.conditions);
  const stance = igStanceMechanic(activeStanceOf(char), level);

  const reasons: string[] = [];

  // ── To-hit ──
  let toHit = igAttackBonus(atk, level, mod);
  if (cond.flatD20 !== 0) {
    toHit += cond.flatD20;
    reasons.push(`${cond.flatD20} from ${cond.flatSources.join(', ')}`);
  }

  // ── Damage ──
  let dmgBonus = igDamageBonus(atk, mod);
  // Advanced Offensive: "+half your level to damage rolls".
  if (stance?.bonus && /damage roll/i.test(stance.bonus) && /half your level/i.test(stance.bonus)) {
    const add = halfLevel(level);
    dmgBonus += add;
    reasons.push(`+${add} damage from ${stance.name} (advanced)`);
  }
  const die = atk.damage || '1d6';
  const damage = dmgBonus === 0 ? die : `${die}${dmgBonus > 0 ? '+' : ''}${dmgBonus}`;

  // ── Advantage / disadvantage ──
  const stanceAdv = mentionsAttacks(stance?.advantage);
  const stanceDis = mentionsAttacks(stance?.disadvantage);
  if (stanceAdv.applies) reasons.push(`advantage from ${stance!.name}`);
  if (stanceDis.applies) reasons.push(`disadvantage from ${stance!.name}`);
  // A conditional clause is surfaced, never auto-applied — the sheet cannot know if you are
  // flanking, and quietly assuming it would inflate every attack.
  if (stanceAdv.conditional) reasons.push(`${stance!.name}: advantage on ${stance!.advantage} — apply if it holds`);
  if (stanceDis.conditional) reasons.push(`${stance!.name}: disadvantage on ${stance!.disadvantage} — apply if it holds`);

  const condDis = cond.disadvantages.some((d) => /attack roll/i.test(d));
  if (condDis) reasons.push('disadvantage from a condition');

  return {
    toHit,
    damage,
    swing: combineSwing(stanceAdv.applies, stanceDis.applies || condDis),
    reasons,
  };
}

export interface ResolvedSave {
  key: IGSaveKey;
  total: number;
  swing: RollSwing;
  reasons: string[];
}

/** Every save at its current value, with stance and condition effects folded in. */
export function igResolveSavesInPlay(char: IGCharacter): ResolvedSave[] {
  const level = char.identity.level;
  const cond = igConditionSummary(char.combat?.conditions);
  const stance = igStanceMechanic(activeStanceOf(char), level);
  const base = igSaves(char);

  return (Object.keys(base) as IGSaveKey[]).map((key) => {
    const reasons: string[] = [];
    let total = base[key];
    if (cond.flatD20 !== 0) {
      total += cond.flatD20;
      reasons.push(`${cond.flatD20} from ${cond.flatSources.join(', ')}`);
    }
    const adv = mentionsSave(stance?.advantage, key);
    const dis = mentionsSave(stance?.disadvantage, key);
    if (adv) reasons.push(`advantage from ${stance!.name}`);
    if (dis) reasons.push(`disadvantage from ${stance!.name}`);
    const condDis = cond.disadvantages.some((d) => mentionsSave(d, key));
    if (condDis) reasons.push('disadvantage from a condition');
    return { key, total, swing: combineSwing(adv, dis || condDis), reasons };
  });
}

/** Damage Reduction currently in force. Advanced Defensive grants "half your level". */
export function igResolveDamageReduction(char: IGCharacter): { dr: number; reasons: string[] } {
  const level = char.identity.level;
  const stance = igStanceMechanic(activeStanceOf(char), level);
  const reasons: string[] = [];
  let dr = Number(char.combat?.damageReduction) || 0;
  if (dr) reasons.push(`${dr} from gear`);
  if (stance?.damageReduction && /half your level/i.test(stance.damageReduction)) {
    const add = halfLevel(level);
    dr += add;
    reasons.push(`+${add} from ${stance.name} (advanced)`);
  }
  return { dr, reasons };
}

/** Skill totals with the flat condition penalty applied — the same penalty the sheet was
 *  previously only describing in a note. */
export function igResolveSkillsInPlay(char: IGCharacter): { name: string; total: number; combat: boolean }[] {
  const cond = igConditionSummary(char.combat?.conditions);
  return igSkillTotals(char).map((s) => ({ ...s, total: s.total + cond.flatD20 }));
}

export interface IGInPlayState {
  stance: IGStanceMechanic | null;
  conditionPenalty: number;
  damageReduction: { dr: number; reasons: string[] };
  saves: ResolvedSave[];
  skills: { name: string; total: number; combat: boolean }[];
}

/** Everything the sheet needs to show CURRENT numbers rather than base ones. */
export function igInPlayState(char: IGCharacter): IGInPlayState {
  return {
    stance: igStanceMechanic(activeStanceOf(char), char.identity.level),
    conditionPenalty: igConditionSummary(char.combat?.conditions).flatD20,
    damageReduction: igResolveDamageReduction(char),
    saves: igResolveSavesInPlay(char),
    skills: igResolveSkillsInPlay(char),
  };
}
