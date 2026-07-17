// lib/dnd/feats/eligibility.ts — can THIS character take THIS feat, right now, in THIS slot?
//
// The rule the builder must enforce (per the user's directive): you only get feats — and ability
// score improvements — when the rules actually grant them, unless you're explicitly building custom.
// This is the pure gate the level builder and the API both consume, so a player can never pick a feat
// they don't qualify for through the official path.
//
// The three slots a feat can be granted through:
//   · 'origin' — from a Background or the Human's Versatile trait, at level 1. Origin feats only.
//   · 'fighting-style' — from a class feature that grants a Fighting Style. Fighting Style feats only.
//   · 'asi' — an Ability Score Improvement slot (a class's asiLevels). General feats (and, at level 19+,
//             Epic Boons) — never an Origin or a bare Fighting Style feat.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import type { Feat, FeatCategory } from './dnd5e-2024';
import { findFeat } from './dnd5e-2024';

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
 * Validate a feat CHOSEN BY KEY. Unknown keys are treated as **custom/homebrew** and allowed — the
 * explicit-custom escape hatch — so this only blocks OFFICIAL feats taken where the rules don't allow.
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
