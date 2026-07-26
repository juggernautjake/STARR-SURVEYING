// lib/dnd/statgen/builder-choices.ts — the Foundations builder's picks, recorded in the SAME ledger the
// level walker reads (`character.data.build.choices`).
//
// WHAT THIS FIXES: the double-ask, and with it the "ASI slot ownership" question that has been sitting open
// as an owner decision (final-QA slices 5–6, "blocks 8 of 13 2024 classes").
//
// The two surfaces both collect the same choices and neither could see the other's:
//
//   · Foundations (`Dnd5eManualBuilder`) builds straight to level N. It knows the ladder — its own label
//     reads "Feats — N ASI/feat slots by level L" — and writes each pick as a `source: 'Feat'` feature.
//   · The level walker (`planLevelUp`) walks the ladder level by level, and treats a slot as filled only
//     when a `RecordedChoice` for that (level, kind) is present and satisfied.
//
// So a Fighter built to level 8 with two feats arrived with both feats on the sheet AND both ASI slots still
// listed as outstanding — `planLevelUp`'s own comment ("a character that skipped its level-4 ASI must
// resolve it before reaching 5") firing on choices the player had already made. Recording the same picks in
// the ledger dissolves the ownership question rather than answering it: Foundations fills the slots it
// collected, the walker fills whatever is left, and both read one source of truth.
//
// WHY EARLIEST-FIRST IS SAFE AND NOT A GUESS. Foundations offers exactly `asiLevels.filter(l <= level)`
// slots and collects an unordered list of that size or smaller. It never asks WHICH slot a feat belongs to,
// so no information is being discarded here — assigning the Nth feat to the Nth slot is the only mapping
// consistent with what the player was shown. It also cannot fabricate a slot: extra feats beyond the
// ladder's length are deliberately left as plain features (they are background/origin feats or DM grants,
// which do not spend an ASI).
import { dnd5eFeatLevelsFor, dnd5eSubclassLevelFor } from './builder5e';
import type { SlotException } from '../slots/entitlement';
import { normName, exceptionIndex, mergeOnRebuild } from '../slots/rebuild';

/** The ledger shape, structurally identical to `RecordedChoice` in lib/dnd/classes/levelup.ts. Declared
 *  here rather than imported so this module stays in the statgen layer, the same reason `types.ts` keeps
 *  `build.choices` loosely typed. */
export interface BuilderChoice {
  level: number;
  kind: 'asi' | 'subclass' | 'fighting-style' | 'expertise' | 'cantrip' | 'epic-boon' | 'other';
  value?: string;
  featKey?: string;
  /** Set when this pick came through the escape hatch — see `RecordedChoice.exception` (slot plan S6). */
  exception?: SlotException;
}

export interface BuilderChoiceInput {
  system: string;
  className?: string;
  level: number;
  /** The feat picks, in the order the player selected them. */
  feats?: string[];
  /** The chosen subclass KEY (the walker records keys, and `build.subclassKey` stores one). */
  subclass?: string;
  /** The class's own ASI levels, when the caller resolved a definition the registry can't see
   *  (a homebrew class). Same contract as `validateChoice`'s `asiLevels`. */
  asiLevels?: number[];
  /** The class's own subclass level, for a homebrew class. */
  subclassLevel?: number;
  /** Picks taken through the escape hatch (slot plan S6), stamped onto the slot each one occupies. */
  exceptions?: SlotException[];
}

/**
 * The ledger entries implied by a Foundations build.
 *
 * ASI slots are filled earliest-first from `feats`; a subclass choice is recorded when the build chose one
 * and the character is at or past the level that grants it.
 */

export function builderChoicesFor(input: BuilderChoiceInput): BuilderChoice[] {
  const level = Math.max(1, Math.min(20, Math.round(input.level || 1)));
  const out: BuilderChoice[] = [];

  const ladder = (input.asiLevels?.length ? input.asiLevels : dnd5eFeatLevelsFor(input.system, input.className))
    .filter((l) => l <= level)
    .sort((a, b) => a - b);
  const feats = (input.feats ?? []).map((f) => (f ?? '').trim()).filter(Boolean);
  // Only as many slots as there are feats to fill them: an unfilled slot must stay OUTSTANDING, because the
  // player really does still owe that choice. Recording a blank would mark it done — `isSatisfied` rejects a
  // record with neither a feat nor two ability points, but a blank entry is still a lie about what happened.
  const byName = exceptionIndex(input.exceptions);
  const stamped = new Set<string>();
  ladder.slice(0, feats.length).forEach((l, i) => {
    const exception = byName.get(normName(feats[i]));
    if (exception) stamped.add(normName(feats[i]));
    out.push({ level: l, kind: 'asi', featKey: feats[i], ...(exception ? { exception } : {}) });
  });

  // An exception on a feat BEYOND the ladder still has to be recorded. Those extra feats are deliberately
  // left as plain features above (they don't spend an ASI), so there is no slot to stamp — and dropping the
  // exception with them would let a character take an off-rules feat and stay badged "Vanilla", which is the
  // one outcome this whole slice exists to prevent. Recorded at `other` so it occupies no real slot.
  for (const [key, e] of byName) {
    if (!stamped.has(key)) out.push({ level: e.level ?? level, kind: 'other', value: e.name, exception: e });
  }

  const subLevel = input.subclassLevel ?? dnd5eSubclassLevelFor(input.system, input.className);
  const subclass = (input.subclass ?? '').trim();
  if (subclass && subLevel > 0 && subLevel <= level) {
    out.push({ level: subLevel, kind: 'subclass', value: subclass });
  }
  return out;
}

/**
 * Fold a Foundations build's choices into whatever the ledger already holds.
 *
 * The build REPLACES the kinds it owns, at levels it covers — it is a rebuild, and it already replaces its
 * own feats and class features on the sheet for the same reason. Everything else survives untouched: a
 * fighting style, an expertise pick or a cantrip recorded through the walker is not something Foundations
 * collects, so it has no business dropping them. Choices ABOVE the built level survive too — a player who
 * walked to 12 and then rebuilds the foundation at 8 keeps levels 9–12.
 */
export function mergeBuilderChoices(
  existing: BuilderChoice[] | undefined,
  builder: BuilderChoice[],
  builtLevel: number,
): BuilderChoice[] {
  // The rebuild rule now lives in `lib/dnd/slots/rebuild.ts` — it was byte-identical in all three
  // systems, which is the evidence S3 was waiting for. What each system still owns is its own slot MODEL;
  // only the mechanical rebuild filter is shared.
  return mergeOnRebuild(existing, builder, builtLevel);
}
