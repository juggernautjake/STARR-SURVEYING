// lib/dnd/effects/ledger.ts — the spine of Part II (Slice 10).
//
// ONE pure function that answers, for every number on the sheet: what is it, and WHY?
//
// The bug this exists to fix: app/dnd/_sheet/engine/effects.ts already resolves effects correctly,
// and deriveCharacter() already pools them — but nothing the player looks at calls either. The
// components read char.abilities / char.combat.ac / char.meta.name straight off the stored model,
// so an item's effects are stored and then ignored. The ledger is what the sheet reads instead.
//
// THE ARCHITECTURAL RULE: effects are OVERLAYS. They are never baked into the base character.
// A pendant that renames you does not write meta.name; it contributes an identity effect that the
// ledger overlays. Everything good follows from that:
//   · Taking it off is free and always correct — drop the source, re-derive, you are you again.
//     No undo bookkeeping, no snapshot, no drift.
//   · Two items touching one field resolve by one documented rule, not by whoever wrote last.
//   · The ledger can always explain a number, because it never lost the base.
// The tempting shortcut (mutate on equip, restore on unequip) is how a character ends up
// permanently renamed because an autosave landed between the two halves of the swap.
import type { Character, InvItem, ActiveEffect } from '@/app/dnd/_sheet/types';
import type { Effect } from '@/app/dnd/_sheet/engine/effects';
import { findTarget, describeEffect } from './targets';
import { findSpecies } from '@/lib/dnd/species/dnd5e-2024';
import { resolveRace2014 } from '@/lib/dnd/species/dnd5e-2014';
import { speciesEffects, race2014Effects } from '@/lib/dnd/species/apply';
import { exhaustionSpeedFactor, exhaustionHpMaxFactor, type Edition } from '@/lib/dnd/mechanics/exhaustion';
import type { ExhaustionModel, ShapeshiftStats } from '@/lib/dnd/preferences';
import { conditionMechanics5e } from '@/lib/dnd/conditions/dnd5e';

export type SourceKind =
  | 'item' // worn/equipped gear
  | 'attuned' // attuned magic item
  | 'consumed' // a potion that was drunk — the effect OUTLIVES the item
  | 'spell' // cast on you
  | 'feature' // a class/species feature that carries mechanics
  | 'species' // the character's species itself (size, creature type, darkvision, walk speed)
  | 'form' // an active form/transformation
  | 'condition' // a condition's own mechanical rider
  | 'dm'; // a DM boon

/** One effect from one source, and what it actually did (not what it advertised). */
export interface Contribution {
  source: string;
  sourceKind: SourceKind;
  sourceId?: string;
  effect: Effect;
  /** Plain-English, from the single renderer in targets.ts. */
  label: string;
  /** How much this added to the final number. Only meaningful for `add`. */
  delta?: number;
  /**
   * Present but contributing NOTHING — an `add` beaten by nothing, or more usually a `set` that
   * lost to a higher `set`. Surfaced rather than hidden: "my belt says +2 but my STR didn't move"
   * is exactly the confusion the Active Effects panel exists to end.
   */
  suppressed?: boolean;
}

export interface TargetLedger {
  target: string;
  /**
   * The character's own value before any effect, when the ledger can read one off the sheet
   * (abilities, AC, walk speed, max HP). Null for DERIVED targets — a spell save DC or a skill
   * total isn't stored anywhere, the caller computes it and passes it to `value()`.
   */
  base: number | null;
  final: number | null;
  contributions: Contribution[];
  advantage: boolean;
  disadvantage: boolean;
  /**
   * The resolved pieces, kept separately from `final` so `value(target, callerBase)` can re-resolve
   * against a base the ledger never knew about. Without this, a `+1 spell save DC` item resolved to
   * a DC of 1 — the caller's 15 was thrown away — because `final` had already collapsed to
   * `0 + bonus`. Every derived number would have been silently wrong the moment it was wired up.
   */
  override: number | null;
  bonus: number;
  /** True when the winning `set` came from an active FORM (a shape-shift). A form REPLACES the base — a
   *  weak form lowers your scores, not just raises them (RAW). So this override bypasses the "highest wins,
   *  base is a candidate" rule that protects a strong character from a weak item. Ability-only in practice. */
  formOverride?: boolean;
  /**
   * True when the winning `set` came from the character's own SPECIES/RACE. A species defines an
   * INTRINSIC base (its walk speed), not a buff competing to raise you — so like a form it REPLACES the
   * base rather than only raising it. Without this, a 2014 Small race (Dwarf/Gnome/Halfling, all 25 ft)
   * whose `speed_walk set 25` overlays the sheet's default 30 resolved to `max(30, 25) = 30`, silently
   * dropping the reduced racial speed the catalog took care to record — a race contribution that should be
   * wired but wasn't. (2024 species are 30/35, so the miss only ever showed on the SLOWER 2014 races.) */
  speciesOverride?: boolean;
}

export interface LedgerSource {
  id: string;
  kind: SourceKind;
  name: string;
  effects: Effect[];
}

export interface EffectLedger {
  byTarget: Record<string, TargetLedger>;
  /** Every source currently contributing anything (what the Active Effects panel lists). */
  sources: LedgerSource[];
  /** Numeric value for a target, or the passed base when nothing touches it. */
  value(target: string, base?: number): number;
  /** Is anything modifying this target right now? (drives the ★ marker) */
  isModified(target: string): boolean;
  /** Every contribution to a target (drives the ★ tooltip). */
  explain(target: string): Contribution[];
  rollFlags(target: string): { advantage: boolean; disadvantage: boolean };
  /** Distinct values collected by a collection op (resistances, granted proficiencies…). */
  collected(operation: Effect['operation']): { value: string; source: string }[];
  /** Identity overlay: the name/species/etc an effect is imposing, if any. */
  identity(target: string): { value: string; source: string } | null;
  /** The form an active `transform` effect is imposing (Slice 18), if any — the effective active
   *  form the sheet should render, overlaying the character's own `activeFormId`. */
  transform(): { value: string; source: string } | null;
}

export interface LedgerContext {
  /** Conditions currently true, gating conditional effects ('raging', 'bloodied', …). */
  active?: string[];
  /** Base values keyed by target, when the caller knows better than the defaults. */
  bases?: Record<string, number>;
  /** The character's game system. Required for system-scoped sources like species — "elf" means
   *  different things across games (Ground Rule 1), so species mechanics only apply when this is the
   *  matching system. Omitted → no species source (safe default: a bare character is unchanged). */
  system?: string;
  /** The effective exhaustion model (Area M1). Omitted → 'vanilla' (per-edition RAW). With the 2014 edition
   *  + vanilla, exhaustion halves/zeroes Speed by tier and halves max HP at tier 4; otherwise it's −5 ft/level
   *  and no HP change. */
  exhaustionModel?: ExhaustionModel;
  /** When true, active 5e conditions contribute their own roll effects (Poisoned → disadvantage on attacks &
   *  skill checks, etc.) as ledger sources — so they fold into rolls AND explain themselves (★/explain).
   *  Gated by the auto-mechanics toggle: OFF (default) is the "vanilla roller" with straight rolls. */
  foldConditions?: boolean;
  /** How an active form treats ability scores (Area shapeshift). 'full' (default) — the form's `set`
   *  ability effects replace yours, up OR down (RAW). 'partial' — each form ability score is pulled to the
   *  midpoint of your base and the form's value (a sensible middle ground). 'none' — the form never touches
   *  ability scores (its shape/senses/movement effects still apply). Mental scores dropped by `keepMental`
   *  are already gone before this runs. */
  shapeshiftStats?: ShapeshiftStats;
  /** Auto-attune (Area attune). When true (default), an item that needs attunement applies as soon as it's
   *  equipped — the attune step is automatic. When false the player must attune by hand before its effects
   *  count. Equipping is always required either way. */
  autoAttune?: boolean;
  /** Feat auto-apply (Area feat). When true (default), a feat feature's ability-score effects fold into the
   *  sheet automatically (Resilient's +1 CON just applies). When false those ability effects are NOT folded —
   *  the player applies the increase to their base score by hand. Only ability effects on feat-source
   *  features are gated; a feat's other effects (a granted proficiency, a resource) always apply. */
  featAutoApply?: boolean;
}

const isEquipped = (i: InvItem) => i.equipped === true || i.tags?.includes('equipped') === true;

/** Is this item's grant currently applying? An attuned item needs BOTH equipped and attuned;
 *  a plain item just needs to be equipped. Exported so render paths that surface a structured
 *  grant (e.g. a granted resource) use the SAME active-rule as the effect collector below, rather
 *  than inventing a second one that could disagree. */
export const isItemActive = (i: InvItem, autoAttune = true): boolean => {
  // An item "needs attunement" iff it carries an attunement state (`attuned` defined). Such an item
  // applies only when equipped AND its attunement is satisfied — either it's explicitly attuned, or
  // auto-attune is on (attunement granted automatically). A plain item (no `attuned` field) just needs
  // equipping. Equipping is ALWAYS required; auto-attune only waives the manual attune step.
  const needsAttunement = i.attuned !== undefined;
  if (needsAttunement) return isEquipped(i) && (i.attuned === true || autoAttune);
  return isEquipped(i);
};

/**
 * Collect every source of effects on a character.
 *
 * Deliberately explicit rather than clever: each source kind is listed, so adding one is a visible
 * change here rather than an emergent surprise somewhere downstream.
 */
/** Every NON-form effect source: equipped/attuned items, active effects (consumed/spell/DM), and
 *  level-gated features. Split out so both `collectSources` and `imposedTransform` read the same set
 *  (a transform effect can live on any of them). */
function baseSources(char: Character, autoAttune = true, featAutoApply = true): LedgerSource[] {
  const out: LedgerSource[] = [];
  const level = char.meta?.level ?? 1;

  for (const item of char.inventory ?? []) {
    if (!item?.effects?.length) continue;
    // Attunement gating (the autoAttune preference). An item that needs attunement (`attuned` defined)
    // applies only when equipped AND its attunement is satisfied — explicitly attuned, or auto-attune on.
    // With auto-attune OFF a not-yet-attuned item does nothing until the player attunes it by hand. A
    // plain item (no `attuned` field) just needs equipping. isItemActive owns the single rule.
    const needsAttunement = item.attuned !== undefined;
    if (needsAttunement) {
      if (isItemActive(item, autoAttune)) out.push({ id: item.id, kind: 'attuned', name: item.name, effects: item.effects });
      continue;
    }
    if (isEquipped(item)) out.push({ id: item.id, kind: 'item', name: item.name, effects: item.effects });
  }

  // Consumed potions / spells cast on you / DM boons. These carry a SNAPSHOT of what they grant
  // and outlive whatever produced them — the potion is long gone from the inventory.
  for (const ae of (char.activeEffects ?? []) as ActiveEffect[]) {
    if (!ae?.effects?.length) continue;
    out.push({ id: ae.id, kind: sourceKindOf(ae), name: ae.label, effects: ae.effects });
  }

  // Features only count once the character is high enough level to have them. Otherwise a level-20
  // capstone would be silently buffing a level-3 character.
  for (const f of char.features ?? []) {
    if (!f?.effects?.length) continue;
    if ((f.unlockLevel ?? 1) > level) continue;
    let effs = f.effects;
    // Feat auto-apply gating: with the pref OFF, a FEAT feature's ability-score effects don't fold (the
    // player applies the increase to their base by hand). A feat's non-ability effects still apply, and a
    // non-feat feature (class/species/background) is never gated — its ability grants always fold.
    if (!featAutoApply && /feat/i.test(f.source ?? '')) {
      effs = effs.filter((e) => !e.target.startsWith('ability_'));
      if (!effs.length) continue;
    }
    out.push({ id: f.id, kind: 'feature', name: f.name, effects: effs });
  }

  return out;
}

/**
 * A form IMPOSED by an active effect (Slice 18) — a `transform` effect on an item/spell/potion that
 * turns you into a form ("Potion of Bear Form" → the `bear` form). Last one wins (two transforms is a
 * table call). It OVERLAYS the character's own `activeFormId` without writing it, so dropping the
 * source reverts exactly — the whole point of the overlay rule for the strongest case, "you are a
 * bear now". Returns the target form id + the source imposing it, or null.
 */
export function imposedTransform(char: Character): { value: string; source: string } | null {
  let last: { value: string; source: string } | null = null;
  for (const src of baseSources(char)) {
    for (const e of src.effects) {
      if (e.target === 'transform' && e.operation === 'set' && typeof e.value === 'string' && e.value.trim()) {
        last = { value: e.value, source: src.name };
      }
    }
  }
  return last;
}

/** Source kinds imposed on you from OUTSIDE — a spell cast on you, a DM boon, a drunk potion's lingering
 *  effect, a condition. These survive a true polymorph; your own gear + features do not. */
const EXTERNAL_KINDS = new Set<SourceKind>(['consumed', 'spell', 'dm', 'condition']);

/** The mental ability targets a `keepMental` form must not touch — your mind is your own. */
const MENTAL_TARGETS = new Set<string>(['ability_int', 'ability_wis', 'ability_cha']);

export function collectSources(char: Character, ctx: LedgerContext = {}): LedgerSource[] {
  let base = baseSources(char, ctx.autoAttune ?? true, ctx.featAutoApply ?? true);

  // The character's SPECIES as a ledger source (Slice 4 follow-up). System-gated: "elf" is a
  // different thing in another game, so this only fires for a 2024 sheet whose species resolves in
  // the 2024 list — a custom/unknown species contributes nothing (its grants are the player's to
  // define). Its size/type/darkvision/(differing) walk speed then render + explain like any source.
  if (ctx.system === 'dnd5e-2024' && char.meta?.species) {
    const sp = findSpecies(char.meta.species);
    if (sp) {
      const effs = speciesEffects(sp, char.combat?.speed);
      if (effs.length) base = [...base, { id: `species:${sp.key}`, kind: 'species', name: sp.name, effects: effs }];
    }
  }

  // The same, for a 2014 RACE (Slice 14-S7). A separate arm rather than a shared one, because the
  // two editions' catalogs are separate types on purpose and — more to the point — the numbers
  // differ: a 2014 dwarf walks 25 feet and sees 60 in the dark, where a 2024 Dwarf walks 30 and sees
  // 120. Serving one edition's block to the other would be plausible, well-formed and wrong, which
  // is the failure shape `system-bleed.test.ts` exists to catch. Note `race2014Effects` deliberately
  // emits no ability increases — see its doc comment for why that is a decision, not an omission.
  if (ctx.system === 'dnd5e-2014' && char.meta?.species) {
    const hit = resolveRace2014(char.meta.species);
    if (hit) {
      const effs = race2014Effects(hit, char.combat?.speed);
      const name = hit.subrace ? hit.subrace.name : hit.race.name;
      if (effs.length) base = [...base, { id: `species:${hit.race.key}`, kind: 'species', name, effects: effs }];
    }
  }

  // Exhaustion Speed + HP tiers (Area M1c). The d20 −2/level (or 2014 tiered disadvantage) is applied at roll
  // time (store.rollCheck); Speed and max HP are stored/derived numbers, so model them as a condition source
  // here so the Combat panel reflects them and the ★ explains the source. Edition + model decide the shape:
  //   · 2024 / the flat option → −5 ft Speed per level; HP max untouched.
  //   · 2014 vanilla → Speed halved at tiers 2–4 and 0 at tier 5+ (a computed `add`); max HP halved at tier 4+.
  // Only when exhausted, and only non-zero effects are added (no false marker on a fresh sheet).
  const exhaustion = char.combat?.exhaustion ?? 0;
  if (exhaustion > 0) {
    const edition: Edition = ctx.system?.includes('2014') ? '2014' : '2024';
    const model: ExhaustionModel = ctx.exhaustionModel ?? 'vanilla';
    const baseSpeed = char.combat?.speed ?? 30;
    const exhEffects: Effect[] = [];
    if (model === 'flat-2-per-level' || edition === '2024') {
      exhEffects.push({ target: 'speed_walk', operation: 'add', value: -5 * exhaustion });
    } else {
      // 2014 tiered: express the Speed factor as an `add` down to the halved/zero value, and halve max HP.
      const factor = exhaustionSpeedFactor(exhaustion, edition, model);
      const speedPenalty = -(baseSpeed - Math.floor(baseSpeed * factor));
      if (speedPenalty !== 0) exhEffects.push({ target: 'speed_walk', operation: 'add', value: speedPenalty });
      const hpFactor = exhaustionHpMaxFactor(exhaustion, edition, model);
      if (hpFactor < 1) {
        const baseHp = char.combat?.maxHp ?? 0;
        const hpPenalty = -(baseHp - Math.floor(baseHp * hpFactor));
        if (hpPenalty !== 0) exhEffects.push({ target: 'hp_max', operation: 'add', value: hpPenalty });
      }
    }
    if (exhEffects.length) {
      base = [...base, { id: 'exhaustion', kind: 'condition', name: `Exhaustion ${exhaustion}`, effects: exhEffects }];
    }
  }

  // Active 5e conditions as their own effect sources (opt-in via `foldConditions` = the auto-mechanics toggle).
  // One source PER condition so `explain('attack_roll')` reads "Poisoned", "Frightened" separately — the player
  // sees exactly which condition moved the roll. Only for 5e; IG/PF2 carry their own condition penalty models.
  if (ctx.foldConditions && (ctx.system ?? '').startsWith('dnd5e')) {
    const active = [...new Set([...(ctx.active ?? []), ...((char.combat?.conditions ?? []) as string[])])];
    for (const name of active) {
      const cm = conditionMechanics5e(name);
      if (cm?.effects.length) base = [...base, { id: `cond-${name}`, kind: 'condition', name, effects: cm.effects }];
    }
  }

  // The ACTIVE form's effects (Slice 15/25) — a Titan form's +STR, a beast form's fly speed. The
  // active form is the one a `transform` effect IMPOSES (Slice 18), else the character's own
  // `activeFormId`. Only it contributes, and the base ('base'/none) never does, so dropping the
  // transform re-derives you as yourself. The bespoke strikeDie/form-attack fields keep their own
  // paths; this is only the ledger-resolved half.
  const effectiveFormId = imposedTransform(char)?.value ?? char.activeFormId;
  const activeForm = (char.forms ?? []).find((f) => f.id === effectiveFormId);

  // Carry-over policy (Slice 18, Ground Rule 1). `keepFeatures: false` is a true polymorph: your own
  // equipped gear + class/species features stop applying while you wear the form, but anything imposed
  // ON you (a Bless still on you, a DM boon, a condition) persists. Omitted = Wild Shape-style "keep
  // everything" — today's behaviour, so existing forms are unaffected. Always an overlay: the moment
  // the form drops, the full unfiltered base is derived again.
  if (activeForm && activeForm.carryOver?.keepFeatures === false) {
    base = base.filter((s) => EXTERNAL_KINDS.has(s.kind));
  }

  const out = [...base];
  if (activeForm?.effects?.length) {
    let formEffects = activeForm.effects;
    // `keepMental: true` — the form doesn't change your MIND (5e Wild Shape keeps INT/WIS/CHA even
    // though the beast has its own). So the form's own effects on mental abilities are dropped; your
    // base mental scores stand. Omitted = the form sets whatever it sets (today's behaviour).
    if (activeForm.carryOver?.keepMental) {
      formEffects = formEffects.filter((e) => !MENTAL_TARGETS.has(e.target));
    }
    // Shapeshift stat policy (the shapeshiftStats preference). 'full' is the default (leave the form's
    // `set` scores alone — they replace up or down). 'none' strips the form's ability-score effects so
    // your own scores stand (the form still changes shape/senses/movement). 'partial' pulls each form
    // ability score to the midpoint of your base and the form's value — a sensible middle ground.
    const policy: ShapeshiftStats = ctx.shapeshiftStats ?? 'full';
    if (policy !== 'full') {
      formEffects = formEffects.flatMap((e) => {
        const isAbilitySet = e.operation === 'set' && e.target.startsWith('ability_');
        if (!isAbilitySet) return [e];
        if (policy === 'none') return []; // drop → your base ability score stands
        const base = char.abilities?.[e.target.slice('ability_'.length) as keyof Character['abilities']];
        if (typeof base !== 'number' || typeof e.value !== 'number') return [e];
        return [{ ...e, value: Math.round((base + e.value) / 2) }]; // partial → midpoint
      });
    }
    if (formEffects.length) {
      out.push({ id: activeForm.id, kind: 'form', name: activeForm.name, effects: formEffects });
    }
  }

  return out;
}

/** An ActiveEffect's kind, from its recorded source. Defaults to 'consumed' (the common case). */
function sourceKindOf(ae: ActiveEffect): SourceKind {
  const s = (ae.source ?? '').toLowerCase();
  if (s.includes('spell')) return 'spell';
  if (s.includes('dm')) return 'dm';
  if (s.includes('form') || s.includes('transform')) return 'form';
  if (s.includes('condition')) return 'condition';
  return 'consumed';
}

/** Default bases read off the stored character, for targets that have one. */
function defaultBases(char: Character): Record<string, number> {
  const c = char.combat ?? ({} as Character['combat']);
  const bases: Record<string, number> = {};
  for (const [k, v] of Object.entries(char.abilities ?? {})) {
    if (typeof v === 'number') bases[`ability_${k}`] = v;
  }
  if (typeof c.ac === 'number') bases.ac = c.ac;
  if (typeof c.speed === 'number') bases.speed_walk = c.speed;
  if (typeof c.maxHp === 'number') bases.hp_max = c.maxHp;
  if (typeof c.exhaustion === 'number') bases.exhaustion = c.exhaustion;
  if (typeof c.initiativeMisc === 'number') bases.initiative = c.initiativeMisc;
  return bases;
}

const num = (v: Effect['value']): number => (typeof v === 'number' ? v : 0);

/**
 * Combine a base with a target's resolved effects.
 *
 * The base is a CANDIDATE for the `set` contest, not a value that `set` replaces outright: Storm
 * Giant Strength sets STR to 29, but a 30-STR character must not be dragged down to 29. Then every
 * `add` stacks on whatever won.
 */
function resolveAgainst(entry: Pick<TargetLedger, 'override' | 'bonus' | 'formOverride' | 'speciesOverride'>, base: number): number {
  // A form OR species override REPLACES the base outright (a weak form lowers you; a species defines your
  // intrinsic base speed, which can be below the sheet's default 30); every other `set` is a candidate that
  // can only RAISE the base (Storm Giant Strength never drags a stronger character down).
  const replaces = entry.formOverride || entry.speciesOverride;
  const winner = entry.override !== null ? (replaces ? entry.override : Math.max(base, entry.override)) : base;
  return winner + entry.bonus;
}

/**
 * Build the ledger.
 *
 * Resolution order, documented because it must not be emergent:
 *   1. `set_base` / `set` — the HIGHEST wins (Storm Giant Strength sets 29; a lesser potion
 *      setting 21 must not drag a 29 down). The base counts as a candidate, so an effect can only
 *      raise a `set`, never lower it.
 *   2. `add` — every one stacks, on top of the winning override.
 *   3. advantage / disadvantage — collected; both present cancel to a flat roll (5e's rule, and
 *      the sensible default elsewhere).
 * `speed_all` fans out to every movement mode the character has, since it means exactly that.
 */
export function buildLedger(char: Character, ctx: LedgerContext = {}): EffectLedger {
  const activeConditions = new Set([...(ctx.active ?? []), ...((char.combat?.conditions ?? []) as string[])]);
  const sources = collectSources(char, ctx);
  const bases = { ...defaultBases(char), ...(ctx.bases ?? {}) };

  const byTarget: Record<string, TargetLedger> = {};
  const ensure = (target: string): TargetLedger => {
    if (!byTarget[target]) {
      const base = bases[target];
      byTarget[target] = {
        target,
        base: typeof base === 'number' ? base : null,
        final: typeof base === 'number' ? base : null,
        contributions: [],
        advantage: false,
        disadvantage: false,
        override: null,
        bonus: 0,
      };
    }
    return byTarget[target];
  };

  // Pass 1 — file every effect under its target, gated by its condition.
  const filed: { src: LedgerSource; effect: Effect; target: string }[] = [];
  for (const src of sources) {
    for (const effect of src.effects) {
      if (effect.condition && !activeConditions.has(effect.condition)) continue; // not active now
      const targets = effect.target === 'speed_all' ? movementModesOf(char, byTarget, bases) : [effect.target];
      for (const target of targets) {
        ensure(target);
        filed.push({ src, effect, target });
      }
    }
  }

  // Pass 2 — resolve each target. Overrides first (highest wins), then stack the adds.
  //
  // `override` here is the highest `set` AMONG THE EFFECTS ONLY — the base is deliberately not
  // folded in yet, because a derived target's base isn't known until the caller supplies it.
  // `resolveAgainst()` combines the two.
  for (const target of Object.keys(byTarget)) {
    const entry = byTarget[target];
    const mine = filed.filter((f) => f.target === target);

    let override: number | null = null;
    let formOverride = false;
    // Which source kind produced the WINNING (highest) set — a species defining an intrinsic base (its walk
    // speed) replaces the base like a form does, but ONLY when its set actually wins, so a faster buff item
    // still beats it. Tracked separately from formOverride because a form replaces even when it isn't the
    // highest set (a weak form lowers you), whereas a species only replaces when it's the surviving value.
    let winningSetKind: SourceKind | null = null;
    for (const { src, effect } of mine) {
      if (effect.operation !== 'set' && effect.operation !== 'set_base') continue;
      const v = num(effect.value);
      if (override === null || v > override) { override = v; winningSetKind = src.kind; }
      // A form's set (a shape-shift) replaces the base outright, even downward. Tracked so resolveAgainst
      // skips the "base is a candidate" protection for this target.
      if (src.kind === 'form') formOverride = true;
    }
    const speciesOverride = winningSetKind === 'species';

    let bonus = 0;
    for (const { effect } of mine) {
      if (effect.operation === 'add') bonus += num(effect.value);
      else if (effect.operation === 'advantage') entry.advantage = true;
      else if (effect.operation === 'disadvantage') entry.disadvantage = true;
    }

    entry.override = override;
    entry.bonus = bonus;
    entry.formOverride = formOverride;
    entry.speciesOverride = speciesOverride;

    const isNumeric = findTarget(target)?.valueType === 'number';
    entry.final =
      isNumeric && entry.base !== null
        ? resolveAgainst(entry, entry.base)
        : isNumeric && (override !== null || bonus !== 0)
          ? (override ?? 0) + bonus
          : entry.base;

    // Pass 3 — annotate each contribution with what it ACTUALLY did. A `set` that lost to a higher
    // `set` is marked suppressed rather than dropped: the panel must be able to say "your belt is
    // contributing nothing", which is the confusion it exists to end.
    for (const { src, effect } of mine) {
      const c: Contribution = {
        source: src.name,
        sourceKind: src.kind,
        sourceId: src.id,
        effect,
        label: describeEffect({ target, operation: effect.operation, value: effect.value, condition: effect.condition }),
      };
      if (effect.operation === 'add') {
        c.delta = num(effect.value);
        if (c.delta === 0) c.suppressed = true;
      } else if (effect.operation === 'set' || effect.operation === 'set_base') {
        if (override !== null && num(effect.value) < override) c.suppressed = true;
      }
      entry.contributions.push(c);
    }
  }

  const collectedCache = new Map<string, { value: string; source: string }[]>();

  return {
    byTarget,
    sources,
    value(target, base) {
      const e = byTarget[target];
      // Nothing touches this target → the caller's own number stands.
      if (!e) return base ?? bases[target] ?? 0;
      // Resolve against whichever base applies. The caller's wins when given, because DERIVED
      // targets (spell save DC, a skill total, initiative) are computed by the caller and the
      // ledger has no way to know them. Reading `final` here instead is the bug this replaced:
      // for a derived target `final` is `0 + bonus`, so a +1 DC item turned a DC of 15 into 1.
      const b = base ?? e.base ?? bases[target] ?? 0;
      return resolveAgainst(e, b);
    },
    isModified(target) {
      const e = byTarget[target];
      // A contribution that is suppressed still counts as "something is going on here" — the
      // reader deserves the tooltip explaining why their belt did nothing.
      return !!e && e.contributions.length > 0;
    },
    explain(target) {
      return byTarget[target]?.contributions ?? [];
    },
    rollFlags(target) {
      const e = byTarget[target];
      return { advantage: e?.advantage ?? false, disadvantage: e?.disadvantage ?? false };
    },
    collected(operation) {
      const hit = collectedCache.get(operation);
      if (hit) return hit;
      const seen = new Set<string>();
      const out: { value: string; source: string }[] = [];
      for (const { src, effect } of filed) {
        if (effect.operation !== operation || typeof effect.value !== 'string') continue;
        const k = effect.value.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ value: effect.value, source: src.name });
      }
      collectedCache.set(operation, out);
      return out;
    },
    identity(target) {
      const t = findTarget(target);
      if (!t || t.group !== 'identity') return null;
      // Last writer wins for identity: two items both renaming you is a table decision, not a
      // number to maximise. The panel shows both, so the player can see the conflict and choose.
      const hits = filed.filter((f) => f.target === target && typeof f.effect.value === 'string');
      const last = hits[hits.length - 1];
      return last ? { value: String(last.effect.value), source: last.src.name } : null;
    },
    transform() {
      return imposedTransform(char);
    },
  };
}

/** Which movement modes exist for this character, for `speed_all` to fan out across. */
function movementModesOf(char: Character, byTarget: Record<string, TargetLedger>, bases: Record<string, number>): string[] {
  const modes = new Set<string>(['speed_walk']);
  for (const k of Object.keys(bases)) if (k.startsWith('speed_') && k !== 'speed_all') modes.add(k);
  for (const k of Object.keys(byTarget)) if (k.startsWith('speed_') && k !== 'speed_all') modes.add(k);
  for (const item of char.inventory ?? []) {
    for (const e of item.effects ?? []) if (e.target.startsWith('speed_') && e.target !== 'speed_all') modes.add(e.target);
  }
  for (const ae of char.activeEffects ?? []) {
    for (const e of ae.effects ?? []) if (e.target.startsWith('speed_') && e.target !== 'speed_all') modes.add(e.target);
  }
  return [...modes];
}
