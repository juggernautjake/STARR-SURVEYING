// lib/dnd/systems/intuitive-games/builder.ts — deterministic "build as-is from the vanilla library" for the
// Intuitive Games system (IG builder Slice 7b). Given a set of picks (ancestry, class, subclass, stances,
// powers, feats, weapons), assemble a valid Character on the shared sheet engine AND record the picks as a
// kinded `igBuild` block so provenance flags each element with the correct kind (a stance as a stance, a
// power as a power) rather than mis-reading them as generic features. Everything here is drawn from the
// vanilla catalog, so a straight assemble is 100% VANILLA; a pick that isn't in the catalog is flagged CUSTOM
// by the provenance classifier — no special-casing needed. Pure — no services.
import type { Character } from '@/app/dnd/_sheet/types';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { IG_STANCES, IG_POWERS, IG_FEATS, IG_DEFENSIVE_POWERS, IG_COMBAT_SKILLS, igClassPowerEffect, IG_BACKGROUND_DEFS, findIGClassDetail } from './content';
import { blankIGCharacter, blankIGCompanion, type IGCharacter, type IGAttack, type IGAbilityKey } from './model';
import { igAbilityMod } from './rules';
import { systemSkills } from '../../system-rules';

/** The kinded record of what an Intuitive Games character was built from (stored on the character data).
 *  Mirrors the template's build fields — Class / Subclass / Specialization / Background (Sheet 1), the
 *  Stances / Powers / Feats picks (Sheet 2/5), the Defensive Power (Sheet 3), and Weapon Groups/Types. */
export interface IGBuild {
  ancestry?: string;
  className?: string;
  subclass?: string;
  specialization?: string;
  background?: string;
  stances?: string[];
  powers?: string[];
  feats?: string[];
  weapons?: string[];
  weaponTypes?: string[];
  defensivePower?: string;
  /** Companion creature type (from the bestiary) — flagged as a vanilla creature-type when recognized. */
  companionType?: string;
  /** Per-level choices the guided level-by-level builder has recorded (IG-3). Additive: absent on characters
   *  built before this; the planner treats absent as "nothing recorded yet". */
  choices?: import('./levelup').IGRecordedChoice[];
}

export interface IGPicks extends IGBuild {
  name?: string;
  level?: number;
  /** Optional ability scores (default all 10); the guided builder collects these. */
  abilities?: Partial<Record<'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA', number>>;
  /** Optional identity fields (Sheet 1). */
  alignment?: string;
  culture?: string;
  bio?: string;
  /** Optional companion creature name (paired with `companionType`). */
  companionName?: string;
}

const effectOf = (list: { name: string; effect?: string }[], name: string): string => {
  const hit = list.find((e) => e.name.trim().toLowerCase() === String(name ?? '').trim().toLowerCase());
  return hit?.effect ?? '';
};

const featCategory = (name: string): 'general' | 'combat' =>
  (IG_FEATS.find((f) => f.name.trim().toLowerCase() === String(name ?? '').trim().toLowerCase())?.category ?? 'General').toLowerCase().startsWith('combat') ? 'combat' : 'general';

/** Build the full IGCharacter model (all tabs) from the picks — the sidecar the bespoke IG sheet reads. */
export function buildIGModel(picks: IGPicks): IGCharacter {
  const ig = blankIGCharacter(picks.name || 'New Character');
  ig.identity.level = picks.level ?? 1;
  ig.identity.className = picks.className || '';
  ig.identity.subclass = picks.subclass || '';
  ig.identity.specialization = picks.specialization || '';
  ig.identity.background = picks.background || '';
  // Wire the character's HP BASE — its class base plus its background's HP. `igMaxHp =
  // classBackgroundHp + CON mod × level`, so without this every IG character read as though it had
  // NO base HP (only the CON×level portion) — the exact "a stat that should be there defaults to
  // nothing" bug. IG states class HP as a string like "12 + Background HP" (Fighter 12, Wizard 8),
  // and each background carries its own flat `hp` (Soldier 12, Academic 8, …); the model's single
  // `classBackgroundHp` field holds their SUM. The subclass detail wins over the parent class when
  // both resolve (a subclass may state its own base). An off-catalog class or background contributes
  // 0 — the honest outcome when we have no published figure, and one the player can set on the sheet.
  const classDetail = findIGClassDetail(picks.subclass) ?? findIGClassDetail(picks.className);
  const classBaseHp = classDetail ? (parseInt(String(classDetail.hp), 10) || 0) : 0;
  const bgDef = IG_BACKGROUND_DEFS.find((b) => b.name.trim().toLowerCase() === String(picks.background ?? '').trim().toLowerCase());
  ig.combat.hitPoints.classBackgroundHp = classBaseHp + (bgDef ? bgDef.hp : 0);
  ig.identity.ancestry = picks.ancestry || '';
  ig.identity.alignment = picks.alignment || '';
  ig.identity.culture = picks.culture || '';
  ig.identity.bio = picks.bio || '';
  if (picks.abilities) for (const [k, v] of Object.entries(picks.abilities)) if (v != null) ig.abilities[k as keyof typeof ig.abilities] = v;

  ig.stances = [...(picks.stances ?? [])];
  ig.combat.stances = [...(picks.stances ?? [])];
  ig.powers = [...(picks.powers ?? [])];
  ig.weaponGroups = [...(picks.weaponTypes ?? [])];
  ig.combat.defensivePower = picks.defensivePower || '';
  for (const f of picks.feats ?? []) ig.feats[featCategory(f)].push(f);

  // Seed the full Intuitive Games skill list (Sheet 4) so the Skills tab shows every skill grouped by
  // ability, with the 9 Combat Skills flagged. Ranks (the player's rank budget) are the player's to
  // assign; the PROFICIENT flag, however, is a concrete grant — a background trains specific skills — and
  // is wired below rather than left uniformly false.
  ig.skills = systemSkills('intuitive-games').map((s) => ({
    name: s.name, ability: s.ability as IGAbilityKey, ranks: 0, proficient: false, misc: 0, combat: IG_COMBAT_SKILLS.has(s.name),
  }));

  // ── Concrete automatic grants from the class, subclass and background ────────────────────────────────
  // The same bug class the HP fix closed, applied to every OTHER published-and-concrete grant: a
  // contributor states a value the builder must fold into the model, and leaving it unset makes the
  // character read as though that contributor gave nothing (the "a stat that should be there defaults to
  // nothing" bug). Only CONCRETE, published grants are wired here — a single named stance, a fixed
  // defensive power, a named starting power, a list of proficiencies. The player CHOICES the same
  // contributors also carry (a background's/class's ability boosts, which class power a subclass grants,
  // which of an ancestry's two traits you take) are deliberately NOT wired: those are the player's to make
  // on the sheet, and inventing them would be the mirror-image bug (a stat present that shouldn't be).
  const g = (s: string) => s.trim().toLowerCase();

  // (a) KNOWN stances. A background grants one stance (IG_BUILD_STEPS: "Background — grants one stance"),
  //     and each subclass has a fixed granted stance (IG_CLASS_DETAILS.grantedStance). These are LEARNED
  //     stances — they belong in `ig.stances` (the known set), NOT `ig.combat.stances` (the one-element
  //     ACTIVE slot, [0] = currently held). A stance costs an action to adopt, so a granted one is known
  //     but not auto-activated; this is exactly the split edit.ts `add_stance` vs `set_active_stance` draws.
  for (const st of [bgDef?.stance, classDetail?.grantedStance]) {
    if (st && !ig.stances.some((s) => g(s) === g(st))) ig.stances.push(st);
  }

  // (b) BACKGROUND PROFICIENCIES (IG_BACKGROUND_DEFS.proficiencies) → mark the matching skill trained.
  //     Most backgrounds grant SKILL proficiencies (Academic → Arcane/Lore/Linguistics/Religion) that map
  //     straight onto a seeded skill. A few name ITEM proficiencies instead (Soldier → Armor, Shields)
  //     that are not skills AND have no home in the model — there is no armor-proficiency field (recorded
  //     in IG_KNOWN_GAPS) — so an unmatched name is left unwired rather than forced onto a wrong skill.
  if (bgDef) for (const p of bgDef.proficiencies) {
    const skill = ig.skills.find((s) => g(s.name) === g(p));
    if (skill) skill.proficient = true;
  }

  // (c) DEFENSIVE POWER. Each subclass grants a fixed one (IG_CLASS_DETAILS.defensivePower). Default to it
  //     only when the player picked none — an explicit pick always wins.
  if (!ig.combat.defensivePower && classDetail?.defensivePower) ig.combat.defensivePower = classDetail.defensivePower;

  // (d) CLASS STARTING POWER (IG_CLASS_DETAILS.startingPower — e.g. the Wizard's Elemental Blast, the
  //     Conduit's Redistribution). The field is a descriptive sentence ("Elemental Blast — a 2-action
  //     ranged attack…" or "Elemental Blast (inherited from Wizard)"); the leading phrase before an
  //     em-dash or parenthesis is the power NAME. Added to `ig.powers` (the character's known powers) so
  //     the sheet lists it. NOT added to `igBuild.powers` (the record of what the PLAYER picked): a class
  //     feature like Redistribution / Direct Companion is not on the spell-list roster, so recording it
  //     as a pick would have provenance mis-flag it CUSTOM — an automatic grant is not a pick.
  const startingPowerName = classDetail?.startingPower ? classDetail.startingPower.split(/[—(]/)[0].trim() : '';
  if (startingPowerName && !ig.powers.some((p) => g(p) === g(startingPowerName))) ig.powers.push(startingPowerName);

  // (e) SKILL-RANK BUDGET. IG grants "2 + Intelligence modifier ranks per level" (IG_SKILL_RULES), not the
  //     flat 2 a blank character carries — which read as "a level-6 character has 2 ranks to spend". Guard
  //     at 0 so a deeply-negative Intelligence cannot produce a negative budget (the site states no floor,
  //     so 0 is the honest clamp rather than an invented minimum).
  ig.skillRanksAvailable = Math.max(0, 2 + igAbilityMod(ig.abilities.INT)) * (ig.identity.level || 1);

  ig.combat.attacks = (picks.weapons ?? []).map((w, i): IGAttack => ({
    id: `atk-${i}`, name: w, weaponType: '', properties: '', proficient: true, weaponFocus: false,
    weaponSpecialization: false, ability: 'STR', bonusToHit: 0, bonusDamage: 0, damage: '1d6',
  }));

  // Companion creature (Sheet 7) — seeded when a creature type is picked.
  if (picks.companionType) ig.companion = blankIGCompanion(picks.companionName || `${picks.companionType} Companion`, picks.companionType);
  return ig;
}

let _uid = 0;
const uid = (p: string) => `${p}-${(_uid++).toString(36)}`;

/**
 * Assemble an Intuitive Games character from vanilla picks. The returned Character carries the picks both as
 * displayable sheet content (features for stances/powers/feats, attacks for weapons) and as a kinded
 * `igBuild` block for accurate provenance. Custom (non-catalog) picks are still placed on the sheet — they'll
 * simply be flagged CUSTOM by the provenance classifier.
 */
export function assembleIGVanillaCharacter(picks: IGPicks): Character & { igBuild: IGBuild; ig: IGCharacter } {
  const char = blankCharacter(picks.name || 'New Character') as Character & { igBuild: IGBuild; ig: IGCharacter };
  char.meta.species = picks.ancestry || '';
  char.meta.className = picks.className || '';
  char.meta.subclass = picks.subclass || '';
  char.meta.level = picks.level ?? 1;
  // Specialization + Background have no dedicated meta field; surface them as chips (Sheet 1 header fields).
  const chips: Character['meta']['chips'] = [];
  if (picks.specialization) chips.push({ text: `Specialization: ${picks.specialization}`, tone: 'gold' });
  if (picks.background) chips.push({ text: `Background: ${picks.background}`, tone: 'teal' });
  if (picks.weaponTypes?.length) chips.push({ text: `Weapon Groups: ${picks.weaponTypes.join(', ')}` });
  char.meta.chips = chips;

  const features: Character['features'] = [];
  for (const s of picks.stances ?? []) features.push({ id: uid('stance'), name: s, source: 'Stance', body: [effectOf(IG_STANCES, s) || 'Stance.'], tone: 'teal' });
  if (picks.defensivePower) features.push({ id: uid('defpow'), name: picks.defensivePower, source: 'Defensive Power', body: [effectOf(IG_DEFENSIVE_POWERS, picks.defensivePower) || 'Defensive power (reaction).'], tone: 'gold' });
  // Effect text: prefer the spell/power roster (IG_POWERS), then the class power ladder
  // (IG_CLASS_POWER_EFFECTS via igClassPowerEffect) so a class power like Surge/Challenge/Aspect lands
  // with its rules text on the sheet, not a bare "Power." A genuinely unknown/custom one stays name-only.
  for (const pw of picks.powers ?? []) features.push({ id: uid('power'), name: pw, source: 'Power', body: [effectOf(IG_POWERS, pw) || igClassPowerEffect(pw) || 'Power.'], tone: 'pink' });
  for (const f of picks.feats ?? []) features.push({ id: uid('feat'), name: f, source: 'Feat', body: [effectOf(IG_FEATS, f) || 'Feat.'] });
  char.features = features;

  char.attacks = (picks.weapons ?? []).map((w) => ({
    id: uid('atk'), name: w, ability: 'str' as const, proficient: true, range: 'Melee', damage: '1d6', damageType: 'physical',
  }));

  char.igBuild = {
    ancestry: picks.ancestry, className: picks.className, subclass: picks.subclass,
    specialization: picks.specialization, background: picks.background, defensivePower: picks.defensivePower,
    companionType: picks.companionType,
    stances: [...(picks.stances ?? [])], powers: [...(picks.powers ?? [])], feats: [...(picks.feats ?? [])],
    weapons: [...(picks.weapons ?? [])], weaponTypes: [...(picks.weaponTypes ?? [])],
  };
  // The full IGCharacter model sidecar the bespoke IG sheet reads (the 5e projection above keeps the shared
  // sheet + provenance working).
  char.ig = buildIGModel(picks);
  return char;
}
