// lib/dnd/feats/homebrew-adapter.ts — adapt a saved homebrew CustomFeat into the Feat shape the level
// builder's ASI picker consumes, so a custom feat a player designed + saved shows up at their ASI slots
// alongside the official ones (Slice 5). Pure + tested; the two shapes already share the FeatCategory
// enum, so this is a faithful field map, not a lossy conversion.
import type { Feat } from './dnd5e-2024';
import type { CustomFeat } from '@/lib/dnd/classes/custom';

/** One-line summary from a feat body (first sentence / line, trimmed). */
function summarize(body: string): string {
  const firstLine = (body || '').split(/\n/)[0].trim();
  const firstSentence = firstLine.split(/(?<=\.)\s/)[0];
  return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}…` : firstSentence || 'A homebrew feat.';
}

/** Adapt a homebrew feat into a Feat. The free-text prerequisite becomes a `text` gate (not
 *  machine-checked), and any ability increases become the choosable +1.
 *
 *  `system` is the literal `'dnd5e-2024'` because that is what the `Feat` TYPE declares — it is the shape
 *  of the 2024 catalogue, not a claim about where this feat came from. Nothing reads it at runtime
 *  (checked: no `.system ===` comparison exists over feats), which is why a 2014 character's homebrew can
 *  safely ride this shape into the picker. UPDATED 2026-07-27: the old comment here said homebrew
 *  "surface[s] only in the 2024 picker", which stopped being true when `asiFeatChoices` grew a 2014 branch
 *  — 2014 takes feats at the same ASI slot, and its official catalogue is one feat by licence, so a
 *  player's own content is that edition's only real feat route. */
export function customFeatToFeat(cf: CustomFeat): Feat {
  return {
    key: cf.key,
    name: cf.name,
    category: cf.category,
    system: 'dnd5e-2024',
    repeatable: cf.repeatable,
    prerequisites: cf.prerequisite ? [{ text: cf.prerequisite }] : undefined,
    abilityIncrease: cf.abilityIncrease?.length ? { choices: [...cf.abilityIncrease], amount: 1 } : undefined,
    summary: summarize(cf.body),
    benefit: cf.body,
  };
}

/** The homebrew feats that may be offered at an ASI slot: general feats (any level) and epic boons at
 *  19+, mirroring asiFeatChoices' category rule. Free-text prerequisites don't gate the level (they're
 *  advisory, shown in the picker), matching how homebrew is "your table's call". */
export function eligibleHomebrewFeats(feats: CustomFeat[], level: number): Feat[] {
  return feats
    .filter((cf) => cf.category === 'general' || (cf.category === 'epic-boon' && level >= 19))
    .map(customFeatToFeat);
}
