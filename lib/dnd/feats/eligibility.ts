// lib/dnd/feats/eligibility.ts — can THIS character take THIS feat, right now, in THIS slot?
//
// The rule the builder must enforce (per the user's directive): you only get feats — and ability
// score improvements — when the rules actually grant them, unless you're explicitly building custom.
// This is the pure gate the level builder and the API both consume, so a player can never pick a feat
// they don't qualify for through the official path.
//
// The three slots a feat can be granted through IN 2024:
//   · 'origin' — from a Background or the Human's Versatile trait, at level 1. Origin feats only.
//   · 'fighting-style' — from a class feature that grants a Fighting Style. Fighting Style feats only.
//   · 'asi' — an Ability Score Improvement slot (a class's asiLevels). General feats (and, at level 19+,
//             Epic Boons) — never an Origin or a bare Fighting Style feat.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO EDITIONS, TWO RULES — READ BEFORE ADDING A CALL SITE (14-S6b)
//
// Everything above the dispatcher at the bottom of this file is **2024 and only 2024**: `Feat`,
// `FeatCategory` and `SLOT_CATEGORIES` all encode 2024's origin / general / fighting-style /
// epic-boon TRACKS, which do not exist in the 2014 edition. 2014's whole rule is one sentence:
// *a feat is taken in place of an Ability Score Improvement, at the levels the character's class
// grants one.* No tracks, no categories, no level-1 background feat, no epic boon.
//
// So a 2014 character is judged by `featEligibilityForSystem()` — a SYSTEM-KEYED DISPATCHER — and
// NOT by widening `Feat`/`FeatCategory` to cover both editions. Widening was the tempting fix and
// it is the wrong one: it would force every 2014 feat to claim a category it does not have, which
// is precisely the edition bleed `feats/dnd5e-2014.ts`'s header warns about, and it would make
// "which edition's schedule applies" a runtime accident instead of a typed decision.
//
// This composes with CX-17 B1 one layer down: `resolveFeat(ref, system)` in `sheet-edits.ts` made
// `system` REQUIRED so the compiler names every call site that has to decide. Same idea, same
// reason, one layer up.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import type { Feat, FeatCategory } from './dnd5e-2024';
import { FEATS_2024, findFeat } from './dnd5e-2024';
import { FEATS_2014, FEAT_SLOT_2014, type Feat2014 } from './dnd5e-2014';
import { findClass } from '../classes/registry';

export type FeatSlot = 'origin' | 'fighting-style' | 'asi';

export interface FeatContext {
  slot: FeatSlot;
  /** Total character level, for minLevel prerequisites. */
  level: number;
  /** Current ability scores, for ability prerequisites. */
  abilities?: Partial<Record<AbilityKey, number>>;
  /** Feat keys the character already has — blocks retaking a non-repeatable feat. */
  takenFeatKeys?: string[];
  /** Named capabilities the character has, e.g. 'spellcasting' — satisfies `needs` prerequisites. */
  has?: string[];
}

export interface FeatEligibility {
  ok: boolean;
  reason?: string;
}

/** Which feat categories a given slot may grant. */
const SLOT_CATEGORIES: Record<FeatSlot, FeatCategory[]> = {
  origin: ['origin'],
  'fighting-style': ['fighting-style'],
  asi: ['general', 'epic-boon'],
};

/** Whether a feat is legal for a character in a given slot, and if not, why. */
export function featEligibility(feat: Feat, ctx: FeatContext): FeatEligibility {
  // 1. The slot gates the category — an Origin feat can't be taken at an ASI slot, etc.
  if (!SLOT_CATEGORIES[ctx.slot].includes(feat.category)) {
    return { ok: false, reason: `A ${labelFor(feat.category)} feat can't be taken through a ${labelFor2(ctx.slot)}.` };
  }

  // 2. Epic Boons are level 19+ regardless of what else the feat says.
  if (feat.category === 'epic-boon' && ctx.level < 19) {
    return { ok: false, reason: 'Epic Boon feats require level 19.' };
  }

  // 3. Already taken, and not repeatable.
  if (!feat.repeatable && (ctx.takenFeatKeys ?? []).includes(feat.key)) {
    return { ok: false, reason: `You already have ${feat.name}, which can't be taken again.` };
  }

  // 4. Each prerequisite must hold.
  for (const p of feat.prerequisites ?? []) {
    if (p.minLevel != null && ctx.level < p.minLevel) {
      return { ok: false, reason: `${feat.name} requires level ${p.minLevel}.` };
    }
    if (p.ability) {
      const score = ctx.abilities?.[p.ability.key];
      if (score == null || score < p.ability.min) {
        return { ok: false, reason: `${feat.name} requires ${p.ability.key.toUpperCase()} ${p.ability.min}+.` };
      }
    }
    if (p.needs && !(ctx.has ?? []).includes(p.needs)) {
      return { ok: false, reason: `${feat.name} requires: ${p.text ?? p.needs}.` };
    }
  }

  return { ok: true };
}

/** Every feat this character may legally take in the given slot. */
export function eligibleFeats(ctx: FeatContext, pool: Feat[]): Feat[] {
  return pool.filter((f) => featEligibility(f, ctx).ok);
}

/**
 * Validate a **2024** feat CHOSEN BY KEY. Unknown keys are treated as **custom/homebrew** and
 * allowed — the explicit-custom escape hatch — so this only blocks OFFICIAL feats taken where the
 * rules don't allow.
 *
 * SYSTEM-BLIND BY NAME, 2024 BY BEHAVIOUR. Any call site that can carry a character from another
 * edition must go through `featEligibilityForSystem()` instead; this is kept as the 2024 arm's
 * implementation (and for the tests that pin 2024's own behaviour).
 */
export function validateFeatKey(featKey: string, ctx: FeatContext): FeatEligibility {
  const feat = findFeat(featKey);
  if (!feat) return { ok: true }; // custom/homebrew feat — the rules-legal check doesn't apply
  return featEligibility(feat, ctx);
}

function labelFor(c: FeatCategory): string {
  return { origin: 'Origin', general: 'General', 'fighting-style': 'Fighting Style', 'epic-boon': 'Epic Boon' }[c];
}
function labelFor2(s: FeatSlot): string {
  return { origin: 'Background/Origin slot', 'fighting-style': 'Fighting Style feature', asi: 'Ability Score Improvement' }[s];
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SYSTEM-KEYED DISPATCHER (14-S6b)
// ─────────────────────────────────────────────────────────────────────────────

/** Everything a system's gate may need, on top of the 2024-shaped `FeatContext`. */
export interface SystemFeatContext extends FeatContext {
  /** The character's class NAME (or key) as shown on the sheet. 2014 needs it because a 2014 feat
   *  is legal exactly at the levels that class grants an ASI. 2024's rule ignores it. */
  className?: string;
  /** The class's ASI levels, when the CALLER already holds authoritative class data — a homebrew
   *  class, or a level-up route that has resolved the `ClassDefinition` anyway. Takes precedence
   *  over the registry lookup, which cannot see homebrew. */
  asiLevels?: number[];
  /** Feature names already on the sheet. Each system's gate resolves these against ITS OWN catalog
   *  to find already-taken feats — passing raw names rather than keys is what stops a caller having
   *  to know which catalog is in play, which is the whole point of the dispatcher. */
  takenFeatureNames?: string[];
}

/** A verdict, plus the catalogued display name when the ref resolved (absent for homebrew), so a
 *  refusal can be reported under the feat's real name instead of whatever string was sent. */
export interface SystemFeatVerdict extends FeatEligibility {
  name?: string;
}

type SystemFeatGate = (ref: string, ctx: SystemFeatContext) => SystemFeatVerdict;

/** Case-insensitive key-OR-name resolution, the same contract as `resolveFeat` in sheet-edits: the
 *  AI reliably produces the display name and only sometimes the key. */
const refMatches = (f: { key: string; name: string }, r: string) =>
  f.key.toLowerCase() === r || f.name.toLowerCase() === r;

/** Feat keys the character already holds, from names, resolved against ONE system's catalog. */
function takenKeysFrom<T extends { key: string; name: string }>(catalog: T[], names: string[] | undefined, keys: string[] | undefined): string[] {
  const have = (names ?? []).map((n) => n.trim().toLowerCase());
  const fromNames = catalog.filter((f) => have.includes(f.name.toLowerCase())).map((f) => f.key);
  return [...new Set([...(keys ?? []), ...fromNames])];
}

// ── 2024 ────────────────────────────────────────────────────────────────────

function gate2024(ref: string, ctx: SystemFeatContext): SystemFeatVerdict {
  const r = String(ref ?? '').trim().toLowerCase();
  const feat = r ? FEATS_2024.find((f) => refMatches(f, r)) : undefined;
  // Homebrew: 2024's slot rule is a question about the feat's CATEGORY, and an uncatalogued feat
  // has none — there is nothing to check, so the escape hatch opens. (2014 is different, and that
  // difference is real rather than an oversight: see gate2014.)
  if (!feat) return { ok: true };
  return {
    name: feat.name,
    ...featEligibility(feat, {
      ...ctx,
      takenFeatKeys: takenKeysFrom(FEATS_2024, ctx.takenFeatureNames, ctx.takenFeatKeys),
    }),
  };
}

// ── 2014 ────────────────────────────────────────────────────────────────────

/** The levels this 2014 character's class grants an ASI — the ONLY levels a feat can be taken at. */
function asiLevels2014(ctx: SystemFeatContext): number[] {
  if (ctx.asiLevels?.length) return [...ctx.asiLevels];
  const cls = ctx.className ? findClass('dnd5e-2014', ctx.className) : null;
  return cls?.asiLevels ? [...cls.asiLevels] : [];
}

function gate2014(ref: string, ctx: SystemFeatContext): SystemFeatVerdict {
  const r = String(ref ?? '').trim().toLowerCase();
  const feat: Feat2014 | undefined = r ? FEATS_2014.find((f) => refMatches(f, r)) : undefined;
  const name = feat?.name;
  const shown = feat?.name ?? (String(ref ?? '').trim() || 'that feat');

  // 1. THE SLOT. 2014 has exactly one route, and `FEAT_SLOT_2014` is that route written down.
  //    A 2024 sheet can offer a feat through a Background or a Fighting Style feature; a 2014 one
  //    cannot, and saying so is the single most important thing this gate does — it is the check
  //    that stops 2024's tracks being applied to a 2014 character.
  if (ctx.slot !== FEAT_SLOT_2014) {
    return {
      ...(name ? { name } : {}),
      ok: false,
      reason: `In the 2014 rules a feat is taken in place of an Ability Score Improvement — there is no ${labelFor2(ctx.slot)} to take ${shown} through. (Origin, Fighting Style and Epic Boon feats are a 2024 structure.)`,
    };
  }

  // 2. THE SCHEDULE. "In place of an ASI" is a real constraint, not flavour: a level-3 Wizard has
  //    no ASI to trade, so they cannot take a feat at all. THIS IS APPLIED TO HOMEBREW FEATS TOO —
  //    unlike 2024's category check, it asks nothing about the feat and everything about the
  //    character, so an uncatalogued feat is just as checkable as Grappler. That asymmetry is the
  //    point of the slice: authoring a homebrew 2014 feat must not become a way to hand a level-3
  //    character a feat 2014 never grants them.
  //
  //    An unresolvable class (homebrew, or a sheet with no class set) skips this check rather than
  //    failing it — the caller can pass `asiLevels` when it knows better. Refusing on missing data
  //    would block legal picks, and a player cannot work around a wrong refusal (the same posture
  //    `spells/eligibility.ts` takes about the exceptions it deliberately does not model).
  const levels = asiLevels2014(ctx);
  if (levels.length && !levels.includes(ctx.level)) {
    const cls = ctx.className?.trim() || 'This class';
    return {
      ...(name ? { name } : {}),
      ok: false,
      reason: `${cls} gains an Ability Score Improvement at levels ${levels.join(', ')}. Level ${ctx.level} is not one of them, so there is no ASI to trade for ${shown}.`,
    };
  }

  // 3. Past here the checks need the catalog entry. Homebrew has cleared everything 2014 can
  //    actually judge, so it passes — flagged as custom by the caller, never silently blessed.
  if (!feat) return { ok: true };

  // 4. Already taken, and not repeatable. 2014's default is not repeatable.
  const taken = takenKeysFrom(FEATS_2014, ctx.takenFeatureNames, ctx.takenFeatKeys);
  if (!feat.repeatable && taken.includes(feat.key)) {
    return { name: feat.name, ok: false, reason: `You already have ${feat.name}, which can't be taken again.` };
  }

  // 5. Prerequisites. 2014's are ability scores and named capabilities only — there is no
  //    `minLevel` on a 2014 prerequisite, because the ASI schedule above already IS the level rule.
  for (const p of feat.prerequisites ?? []) {
    if (p.ability) {
      const score = ctx.abilities?.[p.ability.key];
      if (score == null || score < p.ability.min) {
        return { name: feat.name, ok: false, reason: `${feat.name} requires ${p.ability.key.toUpperCase()} ${p.ability.min}+.` };
      }
    }
    if (p.needs && !(ctx.has ?? []).includes(p.needs)) {
      return { name: feat.name, ok: false, reason: `${feat.name} requires: ${p.text ?? p.needs}.` };
    }
  }

  return { name: feat.name, ok: true };
}

// ── The dispatch table ──────────────────────────────────────────────────────

/**
 * One gate per system that HAS a feat catalog in this codebase's shape. Pathfinder 2e and Intuitive
 * Games are deliberately absent: each owns a gate that knows its own rules
 * (each system's own `rules-gate.ts` under `lib/dnd/systems`), and this one judging them was
 * CX-17 bleed B1.
 */
const FEAT_GATES: Record<string, SystemFeatGate> = {
  'dnd5e-2024': gate2024,
  'dnd5e-2014': gate2014,
};

/** Whether this system is judged here at all — false means "another gate owns it", not "ungated". */
export function hasFeatGate(system: string): boolean {
  return system in FEAT_GATES;
}

/**
 * Can this character take this feat, under THEIR OWN edition's rules?
 *
 * `ref` is a feat key or display name; `system` decides which catalog it is resolved against and
 * which rule judges it. Unknown systems return `ok` — falling THROUGH to a gate that owns them, not
 * falling OPEN. That is the same decision `resolveFeat` makes by returning `[]` for a system with
 * no catalog here, and it is why 5e fails closed (both editions have a gate above) while PF2/IG do
 * not fail at all in this module.
 */
export function featEligibilityForSystem(system: string, ref: string, ctx: SystemFeatContext): SystemFeatVerdict {
  const gate = FEAT_GATES[system];
  if (!gate) return { ok: true };
  return gate(ref, ctx);
}
