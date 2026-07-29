// lib/dnd/bestiary/eligibility.ts — which creatures earn weak/elite versions (P13-9).
//
// The owner's brief, verbatim: *"a woodland rabbit would likely not need multiple variant stat blocks for
// a weaker, normal, and tougher version, but for a lion or vampire, we might have multiple versions. You
// would have to determine which creatures would get versioning and which would not."*
//
// DERIVED, NOT HAND-MARKED. There will be roughly 1,500 catalogued creatures across the systems, and a
// per-creature human decision is both unaffordable and unreviewable — nobody can audit 1,500 judgement
// calls, but anyone can argue with four rules. So eligibility is a function of the row, `dnd_creatures.
// variant_eligible` stores its answer, and re-running the import re-derives it.
//
// WHAT MAKES A CREATURE WORTH THREE STAT BLOCKS is not "is it strong" — it is **would a DM plausibly want
// this same creature at a different power level in the same campaign**. That is why:
//
//   · A CR floor alone is wrong. A CR 5 giant frog is not a boss anyone re-tiers; a CR 1 vampire spawn is
//     part of a family a DM absolutely scales up and down.
//   · A type list alone is wrong too. "Dragon" earns versions because dragons come in age categories by
//     design; "beast" does not, even for a CR 8 beast.
//
// So the rule is a UNION of narrow, stated reasons, each of which can be pointed at and disagreed with —
// and `variantReason` returns which one fired, so the library can say WHY rather than showing a bare flag.
//
// Pure: no DB, no network. The importer calls it; the tests are the argument.

/** The fields eligibility reads. A subset of `dnd_creatures`, so a caller can pass a row straight in. */
export interface EligibilityInput {
  name: string;
  system: string;
  /** As written — '1/4', '13', '-1'. Parsed here, because CR is text for good reasons (see P13-1). */
  cr?: string | null;
  /** 'dragon' / 'undead' / 'beast', as the source prints it. */
  type?: string | null;
  size?: string | null;
  tags?: readonly string[] | null;
}

export type VariantReason = 'scaling-family' | 'boss-tier' | 'named-tier' | 'none';

/**
 * Creature types that come in POWER TIERS BY DESIGN, in their own source material. Not "types that are
 * strong" — types whose published entries already ladder, so a weak/elite version is continuing what the
 * book started rather than inventing a rung.
 *
 * `dragon` — age categories, wyrmling through ancient.
 * `giant` — hill/stone/frost/fire/cloud/storm is a power ladder wearing an element coat.
 * `undead` — the archetypal scaling family: skeleton → wight → wraith, spawn → vampire → lord.
 * `fiend` / `celestial` — hierarchies are the whole conceit of both.
 * `elemental` — published at several sizes of the same idea.
 *
 * Deliberately NOT here: beast, plant, ooze, humanoid. A dire wolf is not a tier of wolf in the way an
 * adult dragon is a tier of dragon — it is a different creature that happens to be bigger, and the brief's
 * rabbit is exactly this case.
 */
const SCALING_TYPES = new Set(['dragon', 'giant', 'undead', 'fiend', 'celestial', 'elemental']);

/**
 * Names that ARE a tier system regardless of the type field, because the source files them under types
 * that do not scale. A vampire is `undead` and caught above; a lion is `beast` and would not be, yet the
 * brief names the lion specifically — a dire/young/great lion is a thing a DM reaches for.
 *
 * Kept SHORT and literal on purpose. Every entry is a claim that this specific creature family ladders,
 * and a long list here would quietly become "everything is eligible", which is the outcome this whole
 * module exists to avoid. Matched as a whole word so "lionfish" does not qualify as a lion.
 */
const SCALING_NAMES = ['lion', 'tiger', 'bear', 'wolf', 'spider', 'serpent', 'drake', 'troll', 'ogre', 'golem'];

/** CR at or above which a creature is a set-piece worth re-tiering whatever its type. */
const BOSS_CR = 10;

/**
 * Parse a written CR into something comparable. Handles 5e's fractions ('1/8', '1/4', '1/2'), PF2/IG
 * integer levels including negatives ('-1'), and returns null for anything unparseable — which sorts and
 * compares as "unknown", never as zero. Treating an unreadable rating as 0 would silently make every
 * mis-scraped row ineligible.
 */
export function parseCr(cr: string | null | undefined): number | null {
  const s = (cr ?? '').trim();
  if (!s) return null;
  const frac = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d === 0 ? null : Number(frac[1]) / d;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Which rule makes this creature eligible, or 'none'. Returned rather than a bare boolean so the library
 *  can explain the decision — an unexplained flag is one nobody can argue with, and this one should be
 *  arguable. */
export function variantReason(c: EligibilityInput): VariantReason {
  const type = (c.type ?? '').trim().toLowerCase();
  const name = (c.name ?? '').toLowerCase();
  const tags = (c.tags ?? []).map((t) => t.toLowerCase());

  // 1. A family that already ladders in its own source.
  if (SCALING_TYPES.has(type)) return 'scaling-family';

  // 2. A named family that ladders despite a non-scaling type. Whole-word so 'lionfish' is not a lion.
  if (SCALING_NAMES.some((n) => new RegExp(`\\b${n}s?\\b`).test(name))) return 'named-tier';

  // 3. A set piece. Checked AFTER the family rules so the reason reported is the most specific one.
  const cr = parseCr(c.cr);
  if (cr !== null && cr >= BOSS_CR) return 'boss-tier';

  // 4. Explicitly tagged a boss by the taxonomy (P13-6), for the ones a CR alone misses.
  if (tags.includes('boss')) return 'boss-tier';

  return 'none';
}

/** The boolean the importer writes to `dnd_creatures.variant_eligible`. */
export function isVariantEligible(c: EligibilityInput): boolean {
  return variantReason(c) !== 'none';
}

/** One line for the library, so the flag is never shown bare. */
export function explainVariantReason(r: VariantReason): string {
  switch (r) {
    case 'scaling-family':
      return 'Its kind already comes in power tiers, so weaker and stronger versions continue the ladder rather than inventing a rung.';
    case 'named-tier':
      return 'This creature family is one DMs commonly scale up and down for a scene.';
    case 'boss-tier':
      return 'A set piece — worth having a version that fits a smaller or larger party.';
    case 'none':
      return 'A single stat block is enough; nothing here would be reached for at another power level.';
  }
}
