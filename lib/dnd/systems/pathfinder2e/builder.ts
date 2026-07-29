// lib/dnd/systems/pathfinder2e/builder.ts — deterministic "build a legal PF2 character from picks". Given
// an ancestry + background + class + attribute boosts + skill/subclass choices, assemble a complete
// PF2Character sidecar (character.data.pf2e) with level-1 proficiency ranks, HP, saves, skills, and a
// default unarmed Strike. Everything is drawn from content.ts (the vanilla library), so a straight
// assemble is 100% rules-legal; a pick outside the library is still placed and simply flagged custom.
// Pure — no services — so the builder UI and the AI tools share one source of truth.
import {
  PF2_ATTRIBUTES, PF2_SAVES,
  type PF2Character, type PF2AttributeKey, type PF2Skill, type PF2Feat,
} from './model';
import {
  PF2_SKILLS, pf2Class, pf2Ancestry, pf2Background, pf2Armor, pf2Weapon,
  type PF2ClassDef, type PF2AncestryDef, type PF2WeaponDef,
} from './content';
import type { PF2Attack, PF2Rank } from './model';
import type { Character } from '@/app/dnd/_sheet/types';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { pf2MaxHp, pf2ArmorClass, pf2Derived, pf2SpellSlots } from './rules';
// Whether a class's slot table is really modelled is decided in ONE place — `spell-counts.ts` — so the
// builder and any future cap cannot disagree about which casters have countable slots. That module carries
// the reasoning; this file just honours the answer.
import { pf2SlotTableModelled, pf2ReducedSlots } from './spell-counts';
import { pf2AnyFeat, pf2AnySpell, pf2EffectiveTracks, pf2RankAtLevel, type PF2ProficiencyTrack } from './data';
import { pf2ApplyChosenSaves, type PF2ChosenSavePick } from './data/classes';
import { PF2_VANILLA_VARIANTS, type PF2RulesVariants } from './variants';

/** Apply a sequence of attribute boosts to a base modifier map, honoring the +4 partial-boost rule
 *  (at +4 or higher, a boost gives +½ — tracked here by only raising every other boost past +4). This
 *  matches PF2 attribute generation where boosts above +4 are "partial". */
export function pf2ApplyBoosts(base: Record<PF2AttributeKey, number>, boosts: PF2AttributeKey[]): Record<PF2AttributeKey, number> {
  const out = { ...base };
  const partial: Record<PF2AttributeKey, boolean> = { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false };
  for (const b of boosts) {
    if (out[b] >= 4) {
      // Partial boost: two partials = +1.
      if (partial[b]) { out[b] += 1; partial[b] = false; } else { partial[b] = true; }
    } else {
      out[b] += 1;
    }
  }
  return out;
}

export interface PF2Picks {
  name?: string;
  level?: number;
  ancestry?: string;
  heritage?: string;
  background?: string;
  className?: string;
  subclass?: string;
  deity?: string;
  /** The class key attribute the player chose (for classes offering a choice). */
  keyAttribute?: PF2AttributeKey;
  /** Final attribute modifiers. If omitted, computed from the boost picks below. */
  attributes?: Partial<Record<PF2AttributeKey, number>>;
  /** The four free level-1 boosts (plus any the UI wants applied). Used only when `attributes` is absent. */
  freeBoosts?: PF2AttributeKey[];
  /** Skills the player trained beyond the class's fixed skills. */
  trainedSkills?: string[];
  /** Worn armor (a PF2_ARMORS name). Sets the AC item bonus + Dex cap; defaults to Unarmored. */
  armor?: string;
  /** A wielded weapon (a PF2_WEAPONS name) added as the primary Strike, alongside the default Fist. */
  weapon?: string;
  languages?: string[];
  bio?: string;
  /** Feats chosen at build time, by catalog name. Gated by `gatePf2Picks` before assembly — the
   *  builder could not offer these at all until now, so a PF2 character could only gain feats
   *  after the fact via the sheet or the AI. */
  feats?: string[];
  /** Spells chosen at build time, by catalog name. */
  spells?: string[];
  photoUrl?: string;
}

const ZERO = (): Record<PF2AttributeKey, number> => ({ STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 });

const DAMAGE_TYPE: Record<'B' | 'P' | 'S', string> = { B: 'bludgeoning', P: 'piercing', S: 'slashing' };

/** Turn a weapon into a Strike: ranged weapons and finesse melee use DEX when it beats STR; melee adds
 *  STR to damage, ranged shows the die alone. The attack RANK is the character's class attack proficiency. */
export function pf2WeaponStrike(w: PF2WeaponDef, attributes: Record<PF2AttributeKey, number>, rank: PF2Rank): PF2Attack {
  const ranged = w.range > 0;
  const finesse = w.traits.includes('finesse');
  const attribute: PF2AttributeKey = ranged ? 'DEX' : finesse && attributes.DEX > attributes.STR ? 'DEX' : 'STR';
  const str = attributes.STR;
  const dmg = ranged ? `${w.damageDie} ${DAMAGE_TYPE[w.damageType]}` : `${w.damageDie}${str >= 0 ? '+' : ''}${str} ${DAMAGE_TYPE[w.damageType]}`;
  return { id: `wpn-${w.name.toLowerCase().replace(/\s+/g, '-')}`, name: w.name, attribute, rank, weaponBonus: 0, damage: dmg, traits: w.traits };
}

/** Compute the level-1 attribute modifiers from ancestry + background + class + free boosts (when the UI
 *  didn't hand us final numbers). Free boosts must go to four DIFFERENT attributes per the rules.
 *
 *  HONEST GAP — level-based attribute boosts: PF2 grants four more boosts at levels 5/10/15/20, so a
 *  level-9 character has had one such round. This computation applies the LEVEL-1 boosts only, because
 *  WHICH four attributes each round raises is a player choice this function has no input for. It is not
 *  a silent error: when the caller supplies a final `picks.attributes` map (the manual builder and the
 *  stored sheet both do), THAT is authoritative and already reflects every level's boosts — this
 *  fallback path is reached only when no attributes were provided. The partial-boost (>+4) rule IS
 *  modelled here, in pf2ApplyBoosts. */
export function pf2ComputeAttributes(cls: PF2ClassDef | null, anc: PF2AncestryDef | null, picks: PF2Picks): Record<PF2AttributeKey, number> {
  if (picks.attributes) {
    const a = ZERO();
    for (const k of PF2_ATTRIBUTES) a[k] = picks.attributes[k] ?? 0;
    return a;
  }
  let a = ZERO();
  const bg = pf2Background(picks.background || '');
  // Ancestry boosts (free ones default to STR/DEX filler only if the UI gave none — the UI should pick).
  if (anc) a = pf2ApplyBoosts(a, anc.boosts.filter((b): b is PF2AttributeKey => b !== 'free'));
  // Background: one fixed + one free (the UI resolves 'free' into a real key via freeBoosts if desired).
  if (bg) a = pf2ApplyBoosts(a, bg.boosts.filter((b): b is PF2AttributeKey => b !== 'free'));
  // Class key attribute.
  const key = picks.keyAttribute || cls?.keyAttribute[0];
  if (key) a = pf2ApplyBoosts(a, [key]);
  // Four free level-1 boosts.
  if (picks.freeBoosts?.length) a = pf2ApplyBoosts(a, picks.freeBoosts);
  return a;
}

/** Every proficiency rank a character of this class, doctrine and level holds. */
export interface PF2Ranks {
  perception: PF2Rank; fortitude: PF2Rank; reflex: PF2Rank; will: PF2Rank;
  defenses: PF2Rank; attacks: PF2Rank; classDc: PF2Rank; spell: PF2Rank;
}

/**
 * Resolve every proficiency rank for a class + subclass + level.
 *
 * Proficiency ranks ADVANCE with level in PF2 (trained → expert → master → legendary at class-defined
 * levels); content.ts's `initial` is ONLY the level-1 snapshot. Reading it alone froze every rank at level
 * 1, so a level-9 Wizard saved and cast as though freshly made — its Reflex (expert at 5), Fortitude
 * (expert at 9) and spell proficiency (expert at 7) each read two points low.
 *
 * The SUBCLASS can replace those tracks outright. The Cleric is the reason: its Fortitude, attack and
 * spellcasting tracks all carry `increases: []` on the base class, because the two doctrines disagree
 * about every one of them. Reading the base track was not conservative — it froze a level-20 warpriest at
 * trained Fortitude (they are expert at 1 and master at 15) and at a trained spell DC (expert at 11,
 * master at 19). The doctrine was collected by the builder, stored on the character and shown on the sheet
 * the whole time; nothing ever read it.
 *
 * Exported because the BUILDER is not the only place that needs it: `/api/dnd/characters/[id]/pf2-levels`
 * moves a character's level without rebuilding, so it must re-derive the ranks or the character keeps the
 * ones it was born with. When a className has no modelled progression (a custom class), fall back to the
 * level-1 initial — the honest best answer.
 */
export function pf2RanksAtLevel(
  className: string,
  subclass: string | undefined,
  rawLevel: number,
  /** The Monk's Path-to-Perfection picks (P5-10b). Absent ⇒ no step is applied, which leaves the saves
   *  where the class put them — the only honest answer for a choice nobody has made. */
  savePicks?: PF2ChosenSavePick[],
): PF2Ranks {
  const level = Math.max(1, Math.min(20, Math.round(rawLevel || 1)));
  const init = pf2Class(className || '')?.initial;
  const tracks = pf2EffectiveTracks(className || '', subclass);
  const rankAt = (track: PF2ProficiencyTrack | undefined, fallback: PF2Rank): PF2Rank =>
    track ? pf2RankAtLevel(track, level) : fallback;
  // The ATTACK track is the one exception: a step carrying a per-step `note` advances only a SUBSET
  // of weapons (the Fighter's level-5 Weapon Mastery raises one chosen weapon group to master, not
  // every Strike; the warpriest's level-19 master is favored-weapon-only). Applying such a step to the
  // whole attack proficiency would silently over-count Strikes with weapons outside that group. So
  // attacks advance through UNSCOPED steps only; a noted step is left unapplied, which UNDER-counts (a
  // Fighter stays expert past level 13) rather than over-counts. That is the safe direction here — a low
  // number is visible on the sheet and fixable, a silently high one is neither. See
  // PF2_CLASS_PROGRESSION_GAPS for the recorded Fighter general-attack gap this leaves open.
  const attacksRankAt = (track: PF2ProficiencyTrack | undefined, fallback: PF2Rank): PF2Rank => {
    if (!track) return fallback;
    let rank = track.initial;
    for (const step of track.increases) if (!step.note && step.level <= level) rank = step.rank;
    return rank;
  };
  // The Monk raises saves the player names, so its three tracks are empty and the picks are the only
  // thing that moves them. Applied AFTER the class tracks, and never downward, so a class that both
  // schedules a save and offers a chosen one would take whichever is higher rather than the later.
  const saves = pf2ApplyChosenSaves(className || '', level, {
    fortitude: rankAt(tracks.fortitude, init?.fortitude ?? 'trained'),
    reflex: rankAt(tracks.reflex, init?.reflex ?? 'trained'),
    will: rankAt(tracks.will, init?.will ?? 'trained'),
  }, savePicks);
  return {
    perception: rankAt(tracks.perception, init?.perception ?? 'trained'),
    fortitude: saves.fortitude,
    reflex: saves.reflex,
    will: saves.will,
    defenses: rankAt(tracks.defenses, init?.defense ?? 'trained'),
    attacks: attacksRankAt(tracks.attacks, init?.attacks ?? 'trained'),
    classDc: rankAt(tracks.classDc, init?.classDc ?? 'trained'),
    // The spellcasting DC/attack proficiency has its own track (Expert Spellcaster at 7, Master at 15,
    // Legendary at 19 for full casters). Frozen at 'trained' before, so every caster's spell DC and
    // spell attack read low from level 7 on.
    spell: rankAt(tracks.spellProficiency, 'trained'),
  };
}

/**
 * Re-derive a character's proficiency ranks for a (usually new) level, in place.
 *
 * The level walker moves `identity.level` and projects the feats earned, but every rank on the sheet was
 * written once, at build time — so a Wizard levelled 1→9 through the walker kept level-1 saves and a
 * level-1 spell DC, the very numbers `pf2RanksAtLevel` exists to fix. The builder path was correct and the
 * walker path was not, which is worse than both being wrong: the same character reads differently
 * depending on how it got there.
 *
 * Only touches the eight derived ranks. Everything else on the sidecar — chosen skills, items, HP spent,
 * hero points — is untouched, because none of it is a function of level.
 */
export function pf2ReprojectRanks(pf2: PF2Character, level: number, savePicks?: PF2ChosenSavePick[]): PF2Character {
  const r = pf2RanksAtLevel(pf2.identity.className || '', pf2.identity.subclass, level, savePicks);
  return {
    ...pf2,
    perception: { ...pf2.perception, rank: r.perception },
    saves: {
      ...pf2.saves,
      Fortitude: { ...pf2.saves.Fortitude, rank: r.fortitude },
      Reflex: { ...pf2.saves.Reflex, rank: r.reflex },
      Will: { ...pf2.saves.Will, rank: r.will },
    },
    combat: { ...pf2.combat, armorRank: r.defenses, attackRank: r.attacks, classDcRank: r.classDc },
    spellcasting: { ...pf2.spellcasting, rank: r.spell },
  };
}

/** Build a complete, level-1-legal PF2Character from the picks. */
export function buildPF2Character(picks: PF2Picks, variants?: PF2RulesVariants): PF2Character {
  const cls = pf2Class(picks.className || '');
  const anc = pf2Ancestry(picks.ancestry || '');
  const bg = pf2Background(picks.background || '');
  const level = Math.max(1, Math.min(20, Math.round(picks.level ?? 1)));
  const attributes = pf2ComputeAttributes(cls, anc, picks);
  const keyAttr = picks.keyAttribute || cls?.keyAttribute[0] || 'STR';

  // Skills: every core skill starts untrained; class fixed skills + background skill + free picks → trained.
  const trained = new Set<string>();
  (cls?.fixedSkills ?? []).forEach((s) => trained.add(s.toLowerCase()));
  if (bg?.skill) trained.add(bg.skill.toLowerCase());
  (picks.trainedSkills ?? []).forEach((s) => trained.add(s.toLowerCase()));
  const skills: PF2Skill[] = PF2_SKILLS.map((s) => ({
    name: s.name, attribute: s.attribute, rank: trained.has(s.name.toLowerCase()) ? 'trained' : 'untrained', itemBonus: 0,
    armorPenalty: !!s.armorPenalty,
  }));

  const {
    perception: perceptionRank, fortitude: fortRank, reflex: reflexRank, will: willRank,
    defenses: defenseRank, attacks: attacksRank, classDc: classDcRank, spell: spellRank,
  } = pf2RanksAtLevel(picks.className || '', picks.subclass, level);

  const con = attributes.CON;
  const armor = pf2Armor(picks.armor || 'Unarmored');
  // Meeting the armor's Strength requirement reduces the speed penalty by 5 ft (to a min of 0); not
  // meeting it applies the full penalty. (Check penalty is likewise waived when met — deferred to the
  // skill-penalty slice.)
  const meetsStr = armor ? attributes.STR >= armor.strength : true;
  const speedPenalty = armor ? (meetsStr ? Math.min(0, armor.speedPenalty + 5) : armor.speedPenalty) : 0;
  // The check penalty is waived entirely when the Strength requirement is met.
  const armorCheckPenalty = armor && !meetsStr ? armor.checkPenalty : 0;

  // HONEST GAP — feat SLOTS by level: a level-9 character has earned many feat slots (ancestry at
  // 1/5/9, class at 2/4/6/8 for Wizard, skill at every even level, general at 3/7). This assembles
  // only the level-1 class feature, the heritage, and whatever feats were explicitly PICKED — it does
  // not manufacture feats to fill the earned slots, because which feat fills each slot is a player
  // choice and the class-feat catalog is itself incomplete (see PF2_CATALOG_STATUS.feats). Inventing
  // feats to hit a count would violate Ground Rule 3. Picked feats already arrive with their real
  // catalog level/track/text (below); the eligibility layer, not the builder, owns "you have N
  // unspent feats". Recorded here so the count gap is not mistaken for a wiring bug.
  const feats: PF2Feat[] = [];
  if (cls) feats.push({ id: 'cls-key', name: `${cls.name} (${cls.subclassLabel})`, level: 1, track: 'feature', traits: [cls.name], body: cls.summary });
  if (anc && picks.heritage) feats.push({ id: 'heritage', name: `${picks.heritage} ${anc.name}`, level: 1, track: 'ancestry', traits: [anc.name, 'Heritage'], body: `${anc.summary}` });
  // Chosen feats, resolved against the catalog so they arrive with their real level, track and
  // rules text rather than as bare names. An uncatalogued name is still honoured — it is homebrew,
  // and dropping it would lose a deliberate choice — but it carries no invented mechanics.
  for (const name of picks.feats ?? []) {
    const def = pf2AnyFeat(name);
    feats.push(def
      ? { id: `feat-${def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: def.name, level: def.level, track: def.track, traits: def.traits, body: def.effect }
      : { id: `feat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, level, track: 'class', traits: [], body: '' });
  }

  return {
    identity: {
      name: picks.name || 'New Character', level,
      ancestry: anc?.name || picks.ancestry || '', heritage: picks.heritage || '',
      background: bg?.name || picks.background || '', className: cls?.name || picks.className || '',
      subclass: picks.subclass || '', deity: picks.deity || '',
      size: anc?.size || 'Medium', alignment: '', bio: picks.bio || '', photoUrl: picks.photoUrl || '',
    },
    attributes,
    perception: { rank: perceptionRank },
    saves: Object.fromEntries(PF2_SAVES.map((s) => {
      const rank = s === 'Fortitude' ? fortRank : s === 'Reflex' ? reflexRank : willRank;
      return [s, { rank, itemBonus: 0 }];
    })) as PF2Character['saves'],
    skills,
    combat: {
      ancestryHp: anc?.hp ?? 8,
      classHpPerLevel: cls?.hpPerLevel ?? 8,
      currentHp: (anc?.hp ?? 8) + ((cls?.hpPerLevel ?? 8) + con) * level,
      // PF2 RAW: start play with 1 Hero Point. A table may set a different starting count (S-4b), which is
      // the one variant that has to land at BUILD time rather than at resolve time — Hero Points are stored
      // state a player spends down, not a derived number, so it cannot be recomputed from preferences later.
      tempHp: 0, dyingValue: 0, woundedValue: 0, heroPoints: (variants ?? PF2_VANILLA_VARIANTS).startingHeroPoints,
      speed: (anc?.speed ?? 25) + speedPenalty,
      armorRank: defenseRank, dexCap: armor ? armor.dexCap : null, acItemBonus: armor?.acBonus ?? 0, armorName: armor?.name || 'Unarmored', armorCheckPenalty,
      attackRank: attacksRank,
      classDcRank, classDcAttribute: keyAttr,
    },
    attacks: [
      ...(picks.weapon && pf2Weapon(picks.weapon) ? [pf2WeaponStrike(pf2Weapon(picks.weapon)!, attributes, attacksRank)] : []),
      { id: 'unarmed', name: 'Fist', attribute: 'STR', rank: attacksRank, weaponBonus: 0, damage: '1d4 bludgeoning', traits: ['agile', 'finesse', 'nonlethal', 'unarmed'] },
    ],
    spellcasting: cls?.spellcasting
      ? {
          tradition: cls.spellcasting.tradition, kind: cls.spellcasting.kind,
          attribute: cls.spellcasting.attribute, rank: spellRank,
          // HONOUR `slotTableModelled`. This handed `pf2SpellSlots(level)` — the FULL-caster table — to
          // every class carrying a spellcasting block, including the reduced casters the data file marks
          // `slotTableModelled: false` precisely so nothing would invent one for them. Its own note says
          // "reduced casters carry `slotTableModelled: false` RATHER THAN a plausible table", and
          // `pf2MaxSpellRank` honours that by returning a ceiling of 0.
          //
          // So a built Magus or Summoner contradicted itself on its own sheet: the spells panel printed
          // "Rank 3: 3" from these slots while the rules said their maximum castable rank was 0. A
          // fabricated table is the worse half of that — `pf2MaxSpellRank`'s comment makes the call
          // already ("a refused legal spell is visible and fixable; a silently over-generous ceiling is
          // neither"), and this is the same choice for counts.
          //
          // Empty means "not modelled", which the panel already renders as no slot pills, rather than as
          // a wrong number presented as fact. It fills in the day someone models those two tables.
          //
          // Suppressed ONLY where the rich data says so explicitly. `pf2Class` returns a thin level-1
          // projection whose `spellcasting` has no such flag, so reading it there is `undefined` for every
          // class — which would have emptied the slots of every full caster too. The flag lives on
          // `PF2_CLASS_PROGRESSIONS`; absent an entry, the previous behaviour stands.
          // RESOLVED 2026-07-27 — the reduced tables were published all along. Magus and Summoner now get
          // their OWN slots (`pf2ReducedSlots`) instead of an empty array, so a built Magus stops showing
          // no slot pills at all. Everything above still holds for any class we genuinely cannot model:
          // the fallback is emptiness, never a plausible-looking full-caster table.
          slots: [...(pf2ReducedSlots(picks.className, level)
            ?? (pf2SlotTableModelled(picks.className) ? pf2SpellSlots(level) : []))],
          // Chosen spells resolved against the catalog for their real rank. A prepared caster's
          // build-time picks start prepared — they are what the character is carrying today.
          ...(picks.spells?.length
            ? {
                spells: picks.spells.map((n) => {
                  const def = pf2AnySpell(n);
                  return {
                    name: def?.name ?? n,
                    rank: def?.rank ?? 0,
                    ...(def?.focus ? { focus: true } : {}),
                    ...(cls.spellcasting!.kind === 'prepared' ? { prepared: true } : {}),
                  };
                }),
              }
            : {}),
        }
      : { tradition: 'none', kind: 'none', attribute: keyAttr, rank: 'untrained', slots: [] },
    feats,
    languages: [...new Set([...(anc?.languages ?? ['Common']), ...(picks.languages ?? [])])],
    senses: anc?.senses ? [anc.senses] : [],
  };
}

/** The kinded record of what a PF2 character was built from (stored alongside the sidecar). */
export interface PF2Build {
  ancestry?: string; heritage?: string; background?: string;
  className?: string; subclass?: string; deity?: string;
  /** Per-level choices the guided level-by-level builder has recorded (B9). Additive: absent on characters
   *  built before this, and the planner treats absent as "nothing recorded yet". */
  choices?: import('./levelup').PF2RecordedChoice[];
}

let _uid = 0;
const uid = (p: string) => `${p}-${(_uid++).toString(36)}`;
/** Project a PF2 modifier onto a 5e-style ability score so the shared sheet renders something sane
 *  (score = 10 + 2×modifier, clamped). The PF2 sidecar remains the source of truth for real math. */
const modToScore = (mod: number) => Math.max(1, Math.min(30, 10 + mod * 2));

/**
 * Assemble a PF2 character from picks: a shared-engine `Character` projection (so the sheet, provenance,
 * and switcher keep working) PLUS the authoritative `pf2e` sidecar the bespoke PF2 sheet reads. A straight
 * assemble from the vanilla library is rules-legal; anything outside it is still placed (flagged custom).
 */
export function assemblePF2VanillaCharacter(picks: PF2Picks, variants?: PF2RulesVariants): Character & { pf2Build: PF2Build; pf2e: PF2Character } {
  const pf2 = buildPF2Character(picks, variants);
  const char = blankCharacter(pf2.identity.name) as Character & { pf2Build: PF2Build; pf2e: PF2Character };
  char.meta.species = pf2.identity.ancestry;
  char.meta.className = pf2.identity.className;
  char.meta.subclass = pf2.identity.subclass;
  char.meta.level = pf2.identity.level;

  const chips: Character['meta']['chips'] = [];
  if (pf2.identity.heritage) chips.push({ text: `Heritage: ${pf2.identity.heritage}`, tone: 'teal' });
  if (pf2.identity.background) chips.push({ text: `Background: ${pf2.identity.background}`, tone: 'gold' });
  if (pf2.identity.deity) chips.push({ text: `Deity: ${pf2.identity.deity}`, tone: 'pink' });
  char.meta.chips = chips;

  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
    char.abilities[k] = modToScore(pf2.attributes[k.toUpperCase() as keyof typeof pf2.attributes]);
  }

  const derived = pf2Derived(pf2);
  char.combat.maxHp = pf2MaxHp(pf2);
  char.combat.currentHp = pf2.combat.currentHp || char.combat.maxHp;
  char.combat.ac = pf2ArmorClass(pf2);
  char.combat.acNote = `Class DC ${derived.classDc}`;
  char.combat.speed = pf2.combat.speed;

  char.features = pf2.feats.map((f) => ({
    id: uid('feat'), name: f.name, source: f.track.charAt(0).toUpperCase() + f.track.slice(1),
    body: [f.body || `${f.track} feature.`], tone: f.track === 'class' || f.track === 'feature' ? 'gold' : 'teal',
  }));
  char.attacks = pf2.attacks.map((a) => ({
    id: uid('atk'), name: a.name, ability: a.attribute.toLowerCase() as Character['attacks'][number]['ability'],
    proficient: true, range: a.traits.includes('ranged') ? 'Ranged' : 'Melee', damage: a.damage, damageType: 'physical',
  }));

  char.pf2Build = {
    ancestry: pf2.identity.ancestry, heritage: pf2.identity.heritage, background: pf2.identity.background,
    className: pf2.identity.className, subclass: pf2.identity.subclass, deity: pf2.identity.deity,
  };
  char.pf2e = pf2;
  return char;
}
