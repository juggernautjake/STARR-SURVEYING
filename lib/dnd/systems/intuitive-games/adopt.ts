// lib/dnd/systems/intuitive-games/adopt.ts — the IG engine bridge for shared homebrew (P6-9b).
//
// The mirror of `pathfinder2e/adopt.ts`, and it fixes the same defect: `lib/dnd/homebrew/adopt.ts` writes
// 5e shapes onto the shared `Character`, while an Intuitive Games character keeps its real state in the
// `data.ig` sidecar. Adopting onto one wrote into a blank 5e projection — the save succeeded, the sheet
// showed nothing, and nothing explained why.
//
// WHERE IG DIFFERS FROM PF2, and why this is not the same file twice:
//
//  · IG has **stances**, a first-class mechanic with no equivalent in either other system. A homebrew
//    stance can land natively here and nowhere else, which is exactly the sort of thing a per-system bridge
//    exists to notice.
//  · IG's gear is **slots plus a loose list** (`equipment.other`), not a Bulk-tracked inventory. So a piece
//    of gear becomes a line in that list rather than an item row with a weight — modelling Bulk here would
//    be importing a Pathfinder concept IG does not use.
//  · IG **powers and spells are the same list**. A spell is a power; there is no separate spellcasting
//    block to file it under, so both kinds converge on `add_power`.
//
// As with PF2, 5e `effects[]` are FLAGGED, never translated — see the note in the PF2 bridge for the full
// reasoning. Short version: a number authored in one system is not the same number in another, and mapping
// them silently rebalances every piece that crosses.
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';
import type { IGEdit } from './edit';

export interface IGAdoptResult {
  edits: IGEdit[];
  adopted: 'equipment' | 'attack' | 'feat' | 'power' | 'stance' | 'condition';
  /** What could not be brought across, in plain words. Silence here is how a player concludes the whole
   *  feature is broken. */
  notes: string[];
}

function payloadOf(c: HomebrewContent): Record<string, unknown> {
  return c.payload && typeof c.payload === 'object' && !Array.isArray(c.payload)
    ? (c.payload as Record<string, unknown>)
    : {};
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Did the author attach 5e-shaped mechanics? Used only to WARN. */
function hasFiveEEffects(c: HomebrewContent): boolean {
  const p = c.payload;
  if (Array.isArray(p)) return p.length > 0;
  const eff = (p as { effects?: unknown } | null)?.effects;
  return Array.isArray(eff) && eff.length > 0;
}

/**
 * Convert a shared homebrew piece into IG edits, or null when there is no honest representation.
 *
 * Null is a REFUSAL the caller reports, not a silent no-op — the entire point of this slice is that an IG
 * player stops getting a successful save with an unchanged sheet.
 */
export function igAdoptEdits(c: HomebrewContent): IGAdoptResult | null {
  const p = payloadOf(c);
  const notes: string[] = [];
  if (hasFiveEEffects(c)) {
    notes.push(
      'Its mechanical effects were authored for D&D 5e and are not applied here — Intuitive Games counts '
      + 'those numbers differently. Use “Translate to another system” on the piece to get an IG version.',
    );
  }

  switch (c.kind) {
    // Same refusal as PF2, for the same reason: IG advancement is a scraped per-level schedule of powers,
    // feats and specializations, not a hit die and an ASI ladder. A converted class would level wrongly.
    case 'class':
    case 'subclass':
      return null;

    // IG's own mechanic. A homebrew stance lands NATIVELY here and in no other system — the payoff of
    // writing a bridge per system rather than one generic converter.
    case 'stance':
      return { edits: [{ op: 'add_stance', name: c.name }], adopted: 'stance', notes };

    case 'condition':
      return { edits: [{ op: 'add_condition', name: c.name }], adopted: 'condition', notes };

    case 'feat':
      return { edits: [{ op: 'add_feat', name: c.name }], adopted: 'feat', notes };

    // Powers and spells are ONE list in IG — a spell IS a power, and there is no separate spellcasting
    // block to file it under.
    case 'spell':
    case 'ability':
      return { edits: [{ op: 'add_power', name: c.name }], adopted: 'power', notes };

    case 'weapon': {
      const damage = str(p.damage);
      // A weapon with a damage die is an attack; one without is gear. Putting an attack on the sheet that
      // rolls nothing is worse than filing it correctly as equipment.
      if (damage) {
        return {
          edits: [{
            op: 'add_attack',
            name: c.name,
            damage,
            ...(str(p.range) ? { weaponType: str(p.range) } : {}),
            ...(Array.isArray(p.properties) ? { properties: (p.properties as string[]).join(', ') } : {}),
          }],
          adopted: 'attack',
          notes,
        };
      }
      return { edits: [{ op: 'add_equipment', name: c.name }], adopted: 'equipment', notes };
    }

    case 'armor':
    case 'item':
    case 'potion':
      return { edits: [{ op: 'add_equipment', name: c.name }], adopted: 'equipment', notes };

    // Backgrounds, creatures, rules, skills and the rest are real content with no per-character IG slot.
    // Refused rather than forced somewhere they do not belong.
    default:
      return null;
  }
}

/** Why a refusal happened, so the player is told rather than seeing nothing change. */
export function igAdoptRefusal(c: HomebrewContent): string {
  if (c.kind === 'class' || c.kind === 'subclass') {
    return `Intuitive Games builds classes from its own per-level schedule of powers and specializations, so a ${c.kind} written for another system cannot be applied directly. Use “Translate to another system” on the piece to get an IG version you can review.`;
  }
  return `“${c.name}” is written as rules text, so there is nothing for the sheet to apply. Read it on its page and use it at the table.`;
}
