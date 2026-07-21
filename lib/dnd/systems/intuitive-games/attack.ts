// lib/dnd/systems/intuitive-games/attack.ts — IG weapon PROPERTIES, and what the maths does with them.
//
// IG-S4 of IG_FULL_PARITY_2026-07-21, which asked: do IG attacks resolve through the rules engine with
// their properties, the way PF2 Strikes do via `pf2ResolveStrike`?
//
// The NUMBERS half of that answer is yes, and it was already true before this file existed:
//   • `igAttackBonus` folds ability modifier + proficiency (= level) + Weapon Focus (+1) + `bonusToHit`.
//   • `igDamageBonus` folds the STR modifier on melee + Weapon Specialization (+2) + `bonusDamage`.
//   • `igResolveAttackInPlay` adds the active stance and the character's conditions on top.
//   • The sheet's roller feeds that to `resolveD20Roll` / `rollDiceExpr`, so tapping the number rolls it.
// __tests__/dnd/ig-attack-maths.test.ts asserts those RESOLVED TOTALS end to end, so "it computes" is a
// checked claim rather than a remembered one.
//
// The PROPERTIES half was not. `IGAttack.properties` is one free-text string that the sheet printed in a
// table cell and nothing else ever read — it reached no computation at all, and nothing even checked that
// what a player typed there was a real IG property. That is what this file fixes, and it deliberately
// stops short of applying any of them to the numbers.
//
// WHY NOT APPLY THEM. Every one of the nine published properties fails one of three tests, and the
// per-property reason is recorded below rather than resolved by guessing (Ground Rule 2 — a recorded gap
// beats a plausible invention). The short version:
//   1. Some are not roll maths at all (range, damage type, a free action) — there is no number to fold.
//   2. Two are crit rules whose published wording does not reconcile with the crit rule this engine
//      actually implements (`fourStepDegree`: crit by beating the DC by 10). Applying either would mean
//      picking a winner between two IG statements, silently, inside a die roll.
//   3. One depends on a choice the model does not record (Engineered names no skill).
// A property that cannot be computed is still worth STRUCTURING: naming it, carrying its rules text, and
// flagging a typo'd one, is the difference between "the sheet shows a string" and "the sheet knows what
// you are holding".
import { IG_WEAPON_PROPERTIES, type IGWeaponProperty } from './items';

/** One published weapon property, plus whether the resolver folds it into the numbers, and why not. */
export interface IGAttackProperty extends IGWeaponProperty {
  /** True when `igResolveAttackInPlay` folds this property into the to-hit or damage it returns. */
  computed: boolean;
  /** For an uncomputed property, the reason — the thing the player would otherwise have to guess at. */
  why: string;
}

/** Why each published property is or is not folded into the resolved numbers.
 *
 *  Keyed by name and merged with `IG_WEAPON_PROPERTIES` below rather than restating the rules text, so
 *  the text can never drift from the transcription in items.ts — there is one copy of what the site says
 *  and one copy of what we do about it. */
const APPLICATION: Record<string, { computed: boolean; why: string }> = {
  'Alternate Damage': { computed: false, why: 'Changes the damage TYPE, not the amount, and the IG attack model has no damage-type field to switch — `damage` is a bare die string. Nothing to compute.' },
  'Double-Ended': { computed: false, why: '"Deals damage on both ends" does not say whether that is a second attack, a second damage roll, or flavour for a reach/parry allowance. Guessing would double someone\'s damage on a hunch.' },
  'Expanded Critical': { computed: false, why: 'Blocked on a genuine source conflict, not on missing data. The property says "critical on a total 15+ higher than the target instead of 20+", and system-rules.ts\'s own IG `coreResolution` agrees with it — IG crits by beating the opposed roll by 20. But the roll engine implements the ±10 four-step ladder (`fourStepDegree`, shared with PF2), so the "20+" this property modifies is not the threshold any IG roll currently uses. Wiring 15 into a ±10 ladder produces a number that is wrong under both readings. See IG_ATTACK_MATH_GAPS.' },
  Nonlethal: { computed: false, why: 'Routes damage to `hitPoints.nonlethal` instead of `lethal`. That is an APPLY-damage concern, and `apply_damage` takes the pool as an argument — the attack that dealt it is not in scope by then. Left to the damage path rather than half-wired here.' },
  'Powerful Critical': { computed: false, why: 'Triples critical damage, and IG does publish the base it multiplies (coreResolution: a critical success deals double damage) — but nothing in the roll path applies that base. `rollDamage` rolls the expression flat and never doubles on a crit, because damage is rolled separately from the d20 that decided the degree. Tripling a doubling that does not happen is not a number; this unblocks the day crit damage is wired.' },
  Throwing: { computed: false, why: 'Range, not a roll modifier. IG has no range/geometry model, so there is no number for this to move.' },
  Reach: { computed: false, why: 'Range, not a roll modifier — 10 feet instead of 5. Same absent geometry model as Throwing.' },
  Engineered: { computed: false, why: 'Grants trained status with ONE combat skill, chosen per weapon — and the model records no such choice, so the resolver cannot know which of the nine combat skills to raise. Surfaced so the player can apply it; not invented.' },
  'Additional Range': { computed: false, why: 'Multiplies range by 1.5×. Range again — no geometry model, no number.' },
};

/** The published properties, each carrying whether the maths folds it in. Derived, never hand-listed, so a
 *  property added to `IG_WEAPON_PROPERTIES` shows up here immediately (with an explicit "not yet judged"
 *  reason) instead of vanishing. */
export const IG_ATTACK_PROPERTIES: IGAttackProperty[] = IG_WEAPON_PROPERTIES.map((p) => ({
  ...p,
  computed: APPLICATION[p.name]?.computed ?? false,
  why: APPLICATION[p.name]?.why
    ?? 'Not yet judged against the resolver — a property was added to IG_WEAPON_PROPERTIES without a matching entry in attack.ts. Treated as not computed, which is the safe direction.',
}));

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The published property of that name, or null. Case- and spacing-insensitive, because `properties` is
 *  typed by a human into a free-text box. */
export function igAttackProperty(name: string | null | undefined): IGAttackProperty | null {
  const n = norm(name);
  if (!n) return null;
  return IG_ATTACK_PROPERTIES.find((p) => norm(p.name) === n) ?? null;
}

export interface IGParsedProperties {
  /** Published properties the attack carries, in the order written. */
  recognized: IGAttackProperty[];
  /** Anything written that is NOT a published property — a typo, or the player's own note.
   *
   *  Reported rather than dropped, and rather than refused: a homebrew weapon is allowed to have a
   *  property the book does not (Ground Rule 4), so an unrecognized entry is information, not an error. */
  unrecognized: string[];
}

/** Split an `IGAttack.properties` string into published properties and everything else.
 *
 *  Splits on commas and semicolons — the two separators the sheet's weapon editor and the AI's
 *  `add_attack` both produce. A slash is NOT a separator: "Piercing/Bludgeoning" is one phrase in IG's
 *  own damage-type wording, and splitting it would manufacture two unrecognized entries out of one. */
export function igParseAttackProperties(properties: string | null | undefined): IGParsedProperties {
  const parts = String(properties ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const recognized: IGAttackProperty[] = [];
  const unrecognized: string[] = [];
  for (const part of parts) {
    const hit = igAttackProperty(part);
    if (hit) recognized.push(hit);
    else unrecognized.push(part);
  }
  return { recognized, unrecognized };
}

/** One line per property the resolver did NOT fold in, for the sheet's "yours to judge" list.
 *
 *  Shaped like `ResolvedAttack.conditional` on purpose: the sheet already has a place for "this is in
 *  force but I will not decide it for you", and a property nobody applied is exactly that. */
export function igUncomputedPropertyNotes(properties: string | null | undefined): string[] {
  return igParseAttackProperties(properties).recognized
    .filter((p) => !p.computed)
    .map((p) => `${p.name}: ${p.text}`);
}

/** Attack maths that IG publishes but this repo cannot yet compute, in one searchable place.
 *
 *  Same purpose as `PF2_KNOWN_GAPS`: the next person to touch this finds the gaps next to the code
 *  rather than in a planning doc they were never told about. Each of these is a real published rule
 *  that is NOT reaching a number, with the specific missing piece named. */
export const IG_ATTACK_MATH_GAPS: string[] = [
  'Weapon properties: none of the nine are folded into the resolved to-hit or damage. Per-property reasons are on IG_ATTACK_PROPERTIES[].why; the two that a source reconciliation could unblock are Expanded Critical and Powerful Critical.',
  'THE CRIT RULE IS STATED TWO WAYS IN THIS REPO AND THEY DISAGREE. system-rules.ts describes IG resolution as an OPPOSED d20 with critical success at beat-by-20 (double damage) and critical failure at miss-by-20; rules.ts (igDegreeOfSuccess) and roll.ts (fourStepDegree) implement a beat-the-DC-by-10 ladder shared with PF2. The Expanded Critical weapon property sides with the ±20 reading. Nothing here changes either — the ±10 ladder is what every IG roll, test and sheet currently uses, and swapping it is a rules decision for the owner, not a slice. It is recorded because two weapon properties are unwireable until it is settled.',
  'Critical hits do not affect damage at all. The published rule (coreResolution: critical success deals double damage, partial success deals minimum damage) reaches no number, because the sheet rolls the d20 and the damage expression through separate buttons — the damage roll never learns what the attack roll scored.',
  'Multi-property weapons "lose damage dice for each property beyond the first" (IG_WEAPON_RULES), but the site does not state the step size, and IG has no published die ladder. The companion size table (IG_COMPANION_SIZES) uses a "damage dice decreased once" step for the same idea, which SUGGESTS one step per property — suggests, not states, so it is recorded here rather than implemented.',
  'The weapon CLASS taxonomy exists twice and the two do not agree: IG_WEAPON_TYPES is {Light, One-Handed, Two-Handed, Heavy, Ranged} × damage type, while IG_WEAPON_CLASS_DATA is {Light, One-Handed, Two-Handed, Heavy} melee plus {One-Handed, Two-Handed, Heavy, Ammunition} ranged. "Heavy Ranged" is therefore not expressible as an IGAttack.weaponType, so its published rule — "adds Strength modifier to damage" — has no way to fire. igDamageBonus adds the ability modifier only when `ability === STR`, which is right for melee and wrong for a heavy ranged weapon fired off DEX.',
  'Ranged weapon classes publish default damage dice (One-Handed Ranged 1d6, Two-Handed Ranged 1d8) and ranges (50 ft, 80 ft). Neither is defaulted or validated when an attack is created — add_attack falls back to a flat 1d6 for everything.',
  'Armor and shield non-proficiency penalties are published and computable in principle ("Reflex penalty equal to the DR the armor grants"; "attack penalty equal to the shield\'s Reflex bonus") but the model has neither an armor-proficiency flag nor a structured equipped-armor slot — IGEquipment holds free-text strings — so there is nothing to read them from.',
  'Companion size modifiers (IG_COMPANION_SIZES: strMod/dexMod/stealthMod/damageStep) are transcribed but never applied to a companion\'s attacks or skills. damageStep needs the same unpublished die ladder as the multi-property rule above.',
  'IGSheet\'s attack table resolves with igResolveAttack (the base function) rather than igResolveAttackInPlay, so the DISPLAYED to-hit omits the condition penalty that the roll then applies — the S11 "card says +7, rolls +5" problem, fixed for saves/skills/DR and still open for attacks. The roll itself is correct and does NOT double-count: rollLine adds the condition penalty to the base number it is handed.',
];
