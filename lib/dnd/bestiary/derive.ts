// lib/dnd/bestiary/derive.ts — everything the importer computes from one raw creature, in one call.
//
// P13-6 (tags), P13-9 (variant eligibility) and P13-10 (weak/elite arithmetic) are separate modules
// because each is a separate argument to have. This is the seam that composes them, so the P13-3/4/5
// importers call ONE function and cannot accidentally apply two of the three — writing a creature with
// tags but no eligibility flag, or variants for something ineligible, is the shape of bug that only shows
// up hundreds of rows later.
//
// ORDER MATTERS AND IS ENFORCED HERE: tags are derived first, because `variantReason` reads the `boss`
// tag. Deriving eligibility from an untagged row would silently miss every creature that qualifies on the
// tag rather than on its rating.
import { creatureTags, type CreatureTag } from './taxonomy';
import { isVariantEligible, variantReason, type EligibilityInput, type VariantReason } from './eligibility';
import { deriveVariant, type VariantResult } from './variants';
import type { Statblock } from '@/lib/dnd/homebrew/statblock';

export interface DerivedCreature {
  tags: CreatureTag[];
  variantEligible: boolean;
  reason: VariantReason;
  /** Weak and elite, in that order. Empty when the creature is not eligible — never a partial pair. */
  variants: VariantResult[];
}

export function deriveCreature(raw: EligibilityInput & { statblock: Statblock }): DerivedCreature {
  const tags = creatureTags(raw);
  // Re-read eligibility against the TAGGED row, not the raw one — see the note above.
  const tagged = { ...raw, tags };
  const reason = variantReason(tagged);
  const variantEligible = isVariantEligible(tagged);

  const variants = variantEligible
    ? (['weak', 'elite'] as const)
      .map((t) => deriveVariant(tagged, t, reason))
      .filter((v): v is VariantResult => v !== null)
    : [];

  return { tags, variantEligible, reason, variants };
}
