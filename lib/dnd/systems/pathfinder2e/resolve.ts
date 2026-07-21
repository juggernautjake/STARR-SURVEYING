// lib/dnd/systems/pathfinder2e/resolve.ts — ONE resolution path for every number on the PF2 sheet.
//
// WHY THIS MODULE EXISTS, and it is not a refactor for tidiness:
//
// Before it, the sheet DISPLAYED `pf2SaveTotal(save, char)` and then ROLLED
// `modifier + pf2ConditionRollEffect(...).penalty`. Those are two different numbers. A Frightened 2
// character read "+7 Will" off the card and rolled a 5. That is the "card says +7, rolls +5" failure
// already recorded against the IG sheet (IG-S4), and it is worse than an unimplemented condition:
// the player trusts the card, and the card is wrong.
//
// The fix is structural rather than a matched pair of edits. Two call sites that each add the
// penalty themselves will drift again the moment a third statistic is added. So every statistic
// resolves HERE, once, and the sheet reads `.total` for the card and `.total` for the roll. They
// cannot disagree, because there is only one of them.
//
// The second thing this module exists for: `pf2StackModifiers` was written for S13b, tested in
// isolation, and consumed by NOTHING. PF2's stacking rule — highest of each TYPE, not the sum — was
// implemented and then never reached a number a player could see. Runes had the same problem: the
// resilient line resolved a `saveBonus` that no save ever read. Both are wired through here.
//
// WHAT IS DELIBERATELY *NOT* FOLDED, because folding it would be wrong:
// PF2 feat bonuses are overwhelmingly CONDITIONAL — "+1 circumstance bonus to saves against
// inhaled threats", "+2 circumstance bonus to AC against the triggering attack". A survey of the
// whole feat catalog found NOT ONE unconditional bonus. Adding "+1 vs poison" into the Fortitude
// card would apply it against everything, which is a silently wrong number of exactly the kind
// Ground Rule 3 exists to prevent. Conditional modifiers are therefore CARRIED, typed and valued,
// in `conditional[]` — surfaced as "in force, you decide when it applies", the same treatment
// IG-S4 established for weapon properties — and never summed into the total.
import {
  PF2_SAVE_ATTRIBUTE,
  type PF2AttributeKey, type PF2Character, type PF2SaveKey, type PF2Skill, type PF2Attack,
} from './model';
import { pf2Level, pf2Proficiency } from './rules';
import { pf2StackModifiers, pf2ResolveRunes, pf2WeaponNumbers, type PF2Modifier } from './bonuses';
import { pf2ResolveStrike, type PF2StrikeResult } from './strike';
import { PF2_CONDITION_MECHANICS, type Pf2ActiveCondition } from '@/lib/dnd/conditions/pathfinder2e';

/** The statistics this module can resolve. Broader than the shared `Pf2RollKind` because AC and the
 *  two spell statistics are not "rolls" at all — AC is a DC, and PF2 conditions explicitly reach
 *  both. The shared conditions module lives outside this subsystem's lane, so the extra targeting
 *  is derived here from the mechanics data it already publishes rather than by editing it. */
export type PF2StatKind =
  | 'ac' | 'fortitude' | 'reflex' | 'will' | 'perception' | 'skill'
  | 'attack' | 'spell-attack' | 'spell-dc' | 'class-dc';

/** A modifier that is real, typed and valued, but whose APPLICABILITY the rules leave to the
 *  moment of play. Never summed — shown, so the player can apply it when it bites. */
export interface PF2ConditionalModifier extends PF2Modifier {
  /** The circumstance the bonus is scoped to, in the source's own words ("against poisons"). */
  when: string;
}

export interface PF2ResolvedStat {
  /** The number the card shows AND the number the roll uses. There is exactly one. */
  total: number;
  applied: PF2Modifier[];
  /** Same-type modifiers that lost to a bigger one. Named so "why isn't my +1 counting?" has an
   *  answer other than "the sheet says so". */
  suppressed: PF2Modifier[];
  conditional: PF2ConditionalModifier[];
  /** "+2 DEX +7 expert (rank 4 + level 3) −2 Frightened 2" — the roller showing its work. */
  breakdown: string;
}

// ── Conditions → typed modifiers ──────────────────────────────────────────────────────────────

/** Which attribute a condition keys off, for the statistics that are attribute-scoped.
 *
 *  Read straight out of `PF2_CONDITION_MECHANICS[].note`, which states each one: Clumsy is
 *  "Dexterity-based rolls", Enfeebled "Strength-based", Drained "Constitution-based", Stupefied
 *  "Intelligence-, Wisdom-, and Charisma-based". The shared module flattens all of those to the
 *  single bucket 'skill', so a Clumsy character took the penalty on Athletics — a Strength skill it
 *  has nothing to do with. Keying them to attributes here makes the penalty land where the
 *  condition actually says it lands. */
const CONDITION_ATTRIBUTES: Record<string, PF2AttributeKey[]> = {
  Clumsy: ['DEX'],
  Enfeebled: ['STR'],
  Drained: ['CON'],
  Stupefied: ['INT', 'WIS', 'CHA'],
};

/** Conditions that reach AC, and the magnitude to use for the UNVALUED ones.
 *
 *  Frightened and Sickened say "all your checks and DCs" — and AC *is* a DC in PF2 (it is the DC an
 *  attack roll is made against), so they reach it. Clumsy's note says "and to AC" outright, and
 *  Off-Guard's says "−2 circumstance penalty to your AC". Every one of these is stated by the data
 *  already in the repo; none is inferred.
 *
 *  Off-Guard needs the explicit 2 because the shared module stores it as `fixed: 0`. That is
 *  CORRECT there and not a bug: `pf2ConditionRollEffect` answers "what does this do to a roll I
 *  make?", and Off-Guard does nothing to your own rolls — it lowers the AC that attacks are rolled
 *  against. AC was not a statistic that module modelled, so zero was the truthful answer to the
 *  only question it was asked. Now that AC IS modelled, the −2 its own note states has somewhere to
 *  land. Encoded here rather than by editing `fixed`, which would make every existing roll caller
 *  subtract 2 from checks Off-Guard does not touch. */
const AC_CONDITION_MAGNITUDE: Record<string, number | 'valued'> = {
  Frightened: 'valued',
  Sickened: 'valued',
  Clumsy: 'valued',
  'Off-Guard': 2,
};

/** Does this condition bite this statistic? */
function conditionApplies(name: string, kind: PF2StatKind, attribute?: PF2AttributeKey): boolean {
  const cm = PF2_CONDITION_MECHANICS.find((c) => c.name === name);
  if (!cm) return false;

  if (kind === 'ac') return AC_CONDITION_MAGNITUDE[name] !== undefined;

  // Attribute-scoped conditions only bite statistics governed by that attribute. Without the
  // attribute (a generic request), fall back to the coarse published bucket.
  const attrs = CONDITION_ATTRIBUTES[name];
  if (attrs) {
    if (attribute) return attrs.includes(attribute);
    // Spell statistics run off a mental attribute, so Stupefied reaches them — its note says so
    // explicitly, "including spell attacks and spell DCs".
    if (kind === 'spell-attack' || kind === 'spell-dc') return attrs.some((a) => a === 'INT' || a === 'WIS' || a === 'CHA');
    if (kind === 'fortitude') return attrs.includes('CON');
    if (kind === 'reflex') return attrs.includes('DEX');
    if (kind === 'will') return attrs.includes('WIS');
    if (kind === 'attack') return attrs.includes('STR') || attrs.includes('DEX');
    return false;
  }

  // 'any' — Frightened and Sickened, which hit every check and DC the character has.
  if (cm.appliesTo.includes('any')) return true;
  if (kind === 'attack') return cm.appliesTo.includes('attack');
  if (kind === 'perception') return cm.appliesTo.includes('perception');
  return false;
}

/** Turn the character's active conditions into typed modifiers for one statistic.
 *
 *  Returned as modifiers rather than a pre-summed penalty precisely so they stack under the SAME
 *  rule as everything else. Pre-summing them (the shared helper's shape) is correct on its own but
 *  cannot see a rune or a spell of the same type, so a status penalty and a status bonus would both
 *  apply instead of the better one winning. */
export function pf2ConditionModifiers(
  conditions: Pf2ActiveCondition[], kind: PF2StatKind, attribute?: PF2AttributeKey,
): PF2Modifier[] {
  const out: PF2Modifier[] = [];
  for (const active of conditions ?? []) {
    const cm = PF2_CONDITION_MECHANICS.find((c) => c.name.toLowerCase() === active.name.trim().toLowerCase());
    if (!cm) continue;
    if (!conditionApplies(cm.name, kind, attribute)) continue;
    // AC has its own magnitude table for the unvalued conditions — see AC_CONDITION_MAGNITUDE for
    // why Off-Guard's roll-facing `fixed: 0` is right there and wrong here.
    const acOverride = kind === 'ac' ? AC_CONDITION_MAGNITUDE[cm.name] : undefined;
    const magnitude = cm.valued || acOverride === 'valued'
      ? (active.value ?? 1)
      : typeof acOverride === 'number' ? acOverride : Math.abs(cm.fixed ?? 0);
    if (magnitude <= 0) continue;
    out.push({
      type: cm.type,
      value: -magnitude,
      source: `${cm.name}${cm.valued ? ` ${active.value ?? 1}` : ''}`,
    });
  }
  return out;
}

// ── Feats → typed modifiers, all of them conditional ──────────────────────────────────────────

/** Pull typed bonuses out of a feat's own rules text.
 *
 *  PF2 always names the TYPE of a bonus, which is what makes this parseable at all rather than a
 *  guess: "+2 circumstance bonus to …" carries value, type and scope in the printed sentence. What
 *  it does NOT carry is whether the bonus is always on, and in practice it never is — every match
 *  in the catalog is scoped to a circumstance ("against poisons", "in that terrain", "until the
 *  start of your next turn").
 *
 *  So this returns CONDITIONAL modifiers only, with the scope preserved verbatim. A feat whose text
 *  states no typed bonus yields nothing and stays prose, which is the honest outcome for the large
 *  majority of feats: they grant actions, reactions and permissions, not numbers. */
const TYPED_BONUS = /\+(\d+)\s+(circumstance|status|item)\s+bonus\s+to\s+([^.;]{1,90})/gi;

export function pf2FeatModifiers(feat: { name: string; body?: string }): PF2ConditionalModifier[] {
  const text = feat.body ?? '';
  const out: PF2ConditionalModifier[] = [];
  for (const m of text.matchAll(TYPED_BONUS)) {
    out.push({
      type: m[2].toLowerCase() as PF2Modifier['type'],
      value: Number(m[1]),
      source: feat.name,
      when: m[3].trim().replace(/\s+/g, ' '),
    });
  }
  return out;
}

/** Every conditional modifier the character's feats carry, for one statistic.
 *
 *  Matching is deliberately loose — it is selecting what to SHOW a player, not deciding a number.
 *  A false positive costs a line of text the player ignores; a false negative hides a bonus they
 *  are entitled to and will never find. */
function featConditionals(char: PF2Character, kind: PF2StatKind, skillName?: string): PF2ConditionalModifier[] {
  const wanted: Record<PF2StatKind, string[]> = {
    'ac': ['ac'],
    'fortitude': ['fortitude', 'save', 'saving throw'],
    'reflex': ['reflex', 'save', 'saving throw'],
    'will': ['will', 'save', 'saving throw'],
    'perception': ['perception', 'initiative'],
    'skill': skillName ? [skillName.toLowerCase(), 'skill'] : ['skill'],
    'attack': ['attack', 'strike'],
    'spell-attack': ['spell attack', 'attack'],
    'spell-dc': ['spell dc', 'dc'],
    'class-dc': ['class dc', 'dc'],
  };
  const keys = wanted[kind] ?? [];
  const out: PF2ConditionalModifier[] = [];
  for (const feat of char.feats ?? []) {
    for (const mod of pf2FeatModifiers(feat)) {
      const hay = mod.when.toLowerCase();
      if (keys.some((k) => hay.includes(k))) out.push(mod);
    }
  }
  return out;
}

// ── The resolver ──────────────────────────────────────────────────────────────────────────────

function render(base: { label: string; value: number }[], stacked: ReturnType<typeof pf2StackModifiers>): string {
  const parts = [
    ...base.map((b) => `${b.value >= 0 ? '+' : '−'}${Math.abs(b.value)} ${b.label}`),
    ...stacked.applied.map((m) => `${m.value >= 0 ? '+' : '−'}${Math.abs(m.value)} ${m.source}`),
  ];
  return parts.join(' ') || '+0';
}

/** Fold a statistic: untyped base parts (attribute, proficiency) plus typed modifiers that stack
 *  under PF2's rule. The base parts are NOT run through the stacking rule — an attribute modifier
 *  and a proficiency bonus are neither typed nor suppressible, and feeding them in as 'untyped'
 *  would be a category error that happens to produce the right number today and the wrong one the
 *  first time something untyped is genuinely added. */
function resolve(
  base: { label: string; value: number }[],
  typed: PF2Modifier[],
  conditional: PF2ConditionalModifier[],
): PF2ResolvedStat {
  const stacked = pf2StackModifiers(typed);
  const baseTotal = base.reduce((n, b) => n + b.value, 0);
  return {
    total: baseTotal + stacked.total,
    applied: stacked.applied,
    suppressed: stacked.suppressed,
    conditional,
    breakdown: render(base, stacked),
  };
}

/** The armor runes' contribution. Runes WIN over the hand-entered `acItemBonus` when present,
 *  exactly as `pf2WeaponNumbers` already does for weapons — a suit listing "+2 armor potency" beside
 *  a typed bonus of 1 has one potency rune, not three. Same rule, same precedent, so the two item
 *  paths cannot disagree about what a rune means. */
function armorItemBonus(char: PF2Character): { ac: number; save: number; notes: string[] } {
  const runes = char.combat.armorRunes ?? [];
  if (!runes.length) return { ac: char.combat.acItemBonus || 0, save: 0, notes: [] };
  const r = pf2ResolveRunes(runes);
  return { ac: r.itemBonus, save: r.saveBonus, notes: r.notes };
}

/** Armor Class. 10 + capped Dex + proficiency + item, then conditions.
 *
 *  AC was previously the ONE headline number no condition could touch — an Off-Guard character's AC
 *  card read exactly the same as an unafflicted one, despite Off-Guard being a −2 to precisely that
 *  number and one of the most common states in PF2 combat. */
export function pf2ResolveAc(char: PF2Character): PF2ResolvedStat {
  const dex = char.attributes.DEX ?? 0;
  const cappedDex = char.combat.dexCap == null ? dex : Math.min(dex, char.combat.dexCap);
  const armor = armorItemBonus(char);
  const base = [
    { label: 'base', value: 10 },
    { label: 'DEX', value: cappedDex },
    { label: `${char.combat.armorRank}`, value: pf2Proficiency(char.combat.armorRank, char.identity.level) },
  ];
  const typed: PF2Modifier[] = [
    ...(armor.ac ? [{ type: 'item' as const, value: armor.ac, source: char.combat.armorName || 'armor' }] : []),
    ...pf2ConditionModifiers(char.combat.conditions ?? [], 'ac'),
  ];
  return resolve(base, typed, featConditionals(char, 'ac'));
}

/** A saving throw. Resilient armor runes reach it here — the rune line resolved a `saveBonus` that
 *  nothing read until now, so a character in +2 resilient armor saved as though it were mundane. */
export function pf2ResolveSave(save: PF2SaveKey, char: PF2Character): PF2ResolvedStat {
  const s = char.saves[save];
  const attr = PF2_SAVE_ATTRIBUTE[save];
  const armor = armorItemBonus(char);
  const kind = save.toLowerCase() as PF2StatKind;
  const base = [
    { label: attr, value: char.attributes[attr] ?? 0 },
    { label: s.rank, value: pf2Proficiency(s.rank, char.identity.level) },
  ];
  const typed: PF2Modifier[] = [
    // The hand-entered item bonus and the resilient rune are BOTH item bonuses, so the stacking
    // rule picks the better rather than adding them — which is the entire point of routing them
    // through `pf2StackModifiers` instead of summing.
    ...(s.itemBonus ? [{ type: 'item' as const, value: s.itemBonus, source: 'item bonus' }] : []),
    ...(armor.save ? [{ type: 'item' as const, value: armor.save, source: 'resilient rune' }] : []),
    ...pf2ConditionModifiers(char.combat.conditions ?? [], kind, attr),
  ];
  return resolve(base, typed, featConditionals(char, kind));
}

/** A skill. The armor check penalty is untyped — it always applies and never competes with an item
 *  bonus, so it must not be typed as one or a magic item would suppress it. */
export function pf2ResolveSkill(skill: PF2Skill, char: PF2Character): PF2ResolvedStat {
  const acp = skill.armorPenalty ? (char.combat.armorCheckPenalty || 0) : 0;
  const base = [
    { label: skill.attribute, value: char.attributes[skill.attribute] ?? 0 },
    { label: skill.rank, value: pf2Proficiency(skill.rank, char.identity.level) },
  ];
  const typed: PF2Modifier[] = [
    ...(skill.itemBonus ? [{ type: 'item' as const, value: skill.itemBonus, source: 'item bonus' }] : []),
    ...(acp ? [{ type: 'untyped' as const, value: acp, source: 'armor check penalty' }] : []),
    ...pf2ConditionModifiers(char.combat.conditions ?? [], 'skill', skill.attribute),
  ];
  return resolve(base, typed, featConditionals(char, 'skill', skill.name));
}

/** Perception, which is also PF2's initiative in the default case. */
export function pf2ResolvePerception(char: PF2Character): PF2ResolvedStat {
  const base = [
    { label: 'WIS', value: char.attributes.WIS ?? 0 },
    { label: char.perception.rank, value: pf2Proficiency(char.perception.rank, char.identity.level) },
  ];
  const typed = pf2ConditionModifiers(char.combat.conditions ?? [], 'perception', 'WIS');
  return resolve(base, typed, featConditionals(char, 'perception'));
}

/** Spell DC (10 + attribute + proficiency) and spell attack. Stupefied reaches both — its own text
 *  says "including spell attacks and spell DCs" — and neither moved before. */
export function pf2ResolveSpellDc(char: PF2Character): PF2ResolvedStat | null {
  if (char.spellcasting.kind === 'none') return null;
  const attr = char.spellcasting.attribute;
  const base = [
    { label: 'base', value: 10 },
    { label: attr, value: char.attributes[attr] ?? 0 },
    { label: char.spellcasting.rank, value: pf2Proficiency(char.spellcasting.rank, char.identity.level) },
  ];
  const typed = pf2ConditionModifiers(char.combat.conditions ?? [], 'spell-dc', attr);
  return resolve(base, typed, featConditionals(char, 'spell-dc'));
}

export function pf2ResolveSpellAttack(char: PF2Character): PF2ResolvedStat | null {
  if (char.spellcasting.kind === 'none') return null;
  const attr = char.spellcasting.attribute;
  const base = [
    { label: attr, value: char.attributes[attr] ?? 0 },
    { label: char.spellcasting.rank, value: pf2Proficiency(char.spellcasting.rank, char.identity.level) },
  ];
  const typed = pf2ConditionModifiers(char.combat.conditions ?? [], 'spell-attack', attr);
  return resolve(base, typed, featConditionals(char, 'spell-attack'));
}

/** Class DC. */
export function pf2ResolveClassDc(char: PF2Character): PF2ResolvedStat {
  const attr = char.combat.classDcAttribute;
  const base = [
    { label: 'base', value: 10 },
    { label: attr, value: char.attributes[attr] ?? 0 },
    { label: char.combat.classDcRank, value: pf2Proficiency(char.combat.classDcRank, char.identity.level) },
  ];
  const typed = pf2ConditionModifiers(char.combat.conditions ?? [], 'class-dc', attr);
  return resolve(base, typed, featConditionals(char, 'class-dc'));
}

// ── Strikes ───────────────────────────────────────────────────────────────────────────────────

export interface PF2ResolvedStrike extends PF2ResolvedStat {
  /** The full trait/rune resolution — damage, crit damage, notes. */
  strike: PF2StrikeResult;
  /** The multiple attack penalty included in `total` (0 on the first Strike of the turn). */
  map: number;
}

/** Resolve a Strike AS IT WILL BE ROLLED, including the multiple attack penalty.
 *
 *  MAP is the piece the sheet was missing entirely. `pf2Map` existed and was tested, but the sheet
 *  never passed a `strikeIndex`, so every Strike displayed and rolled as though it were the first
 *  of the turn. In PF2 the second Strike is −5 (−4 agile) and the third −10 (−8): a Fighter's third
 *  attack was reading ten points too high, which is not a rounding error, it is a different game.
 *
 *  Conditions fold in as typed modifiers, and the attack attribute decides which ones bite — a
 *  Clumsy character takes the penalty on a Dexterity-based Strike and not on a Strength-based one. */
export function pf2ResolveStrikeInPlay(
  attack: PF2Attack, char: PF2Character, strikeIndex = 0,
): PF2ResolvedStrike {
  const runes = pf2WeaponNumbers(attack);
  const traits = attack.traits ?? [];
  const ranged = traits.some((t) => t.toLowerCase().startsWith('thrown') || t.toLowerCase() === 'ranged');

  const strike = pf2ResolveStrike(
    { name: attack.name, damageDie: attack.damage, damageType: attack.damageType ?? '', traits },
    {
      level: char.identity.level,
      attributes: char.attributes,
      proficiency: pf2Proficiency(attack.rank, char.identity.level),
      itemBonus: runes.weaponBonus,
      striking: runes.striking,
      strikeIndex,
      ranged,
    },
  );

  // The attribute the Strike actually uses, which `pf2ResolveStrike` has already decided (finesse
  // can switch it to Dexterity). Re-deriving it here rather than guessing keeps the condition
  // targeting honest.
  const attackAttr: PF2AttributeKey = strike.notes.some((n) => n.startsWith('finesse')) || ranged ? 'DEX' : 'STR';

  const base = [
    { label: attackAttr, value: char.attributes[attackAttr] ?? 0 },
    { label: attack.rank, value: pf2Proficiency(attack.rank, char.identity.level) },
    ...(strike.map ? [{ label: `MAP${strikeIndex >= 2 ? ' (3rd+)' : ' (2nd)'}`, value: strike.map }] : []),
  ];
  const typed: PF2Modifier[] = [
    ...(runes.weaponBonus ? [{ type: 'item' as const, value: runes.weaponBonus, source: 'potency rune' }] : []),
    ...pf2ConditionModifiers(char.combat.conditions ?? [], 'attack', attackAttr),
  ];

  const resolved = resolve(base, typed, featConditionals(char, 'attack'));
  return { ...resolved, strike, map: strike.map };
}

/** Every number the sheet header shows, resolved once.
 *
 *  Deliberately parallel to `pf2Derived` in rules.ts, which stays as the pure unconditioned maths —
 *  the builder and the AI grounding want a character's numbers WITHOUT the transient combat state,
 *  and the sheet wants them with it. Two callers, two genuinely different questions, rather than
 *  one function with a boolean. */
export function pf2ResolveAll(char: PF2Character) {
  return {
    ac: pf2ResolveAc(char),
    perception: pf2ResolvePerception(char),
    classDc: pf2ResolveClassDc(char),
    spellDc: pf2ResolveSpellDc(char),
    spellAttack: pf2ResolveSpellAttack(char),
    saves: {
      Fortitude: pf2ResolveSave('Fortitude', char),
      Reflex: pf2ResolveSave('Reflex', char),
      Will: pf2ResolveSave('Will', char),
    } as Record<PF2SaveKey, PF2ResolvedStat>,
    level: pf2Level(char.identity.level),
  };
}
