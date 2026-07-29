// lib/dnd/systems/pathfinder2e/adopt.ts — the PF2 engine bridge for shared homebrew (P6-9a).
//
// THE DEFECT THIS FIXES. `lib/dnd/homebrew/adopt.ts` speaks 5e shapes: it turns a piece into a
// `ClassDefinition`, a `CustomFeat`, or an `ActiveEffect` on the 5e `Character`. A Pathfinder 2e character
// keeps its real state in the `data.pf2e` sidecar, so adopting onto one wrote into a blank 5e projection —
// the save succeeded, the sheet showed nothing, and nothing said why. That is the worst shape a bug can
// have: it looks like it worked.
//
// WHAT THIS BRIDGE CAN AND CANNOT CARRY, stated rather than discovered. It converts a piece into PF2's own
// `PF2Edit` vocabulary, and it is HONEST about the ones it refuses:
//
//   ✓ item / armor / potion / weapon(non-attack) → an inventory line (possible only since P5-1 gave PF2 an
//     inventory at all — before that there was nowhere to put a rope)
//   ✓ weapon with damage                          → a Strike
//   ✓ feat / ability                              → a PF2 feat, on the `archetype` track
//   ✓ spell                                       → a known spell
//   ✗ class / subclass                            → REFUSED. PF2's class model is not a `ClassDefinition`;
//     there is no honest conversion, and inventing one would produce a class that levels wrongly.
//   ✗ arbitrary 5e `effects[]`                    → NOT translated. See below.
//
// WHY 5e EFFECTS ARE NOT TRANSLATED, which is the interesting decision. A homebrew belt authored with
// `{ target: 'str_score', operation: 'add', value: 2 }` is a 5e statement: PF2 has no ability *scores* in
// play, only modifiers, and a "+2 STR" in PF2 is an untyped bonus of a completely different magnitude.
// Mapping the two would silently rebalance every piece of content that crossed. The transposer (P6-18) is
// the honest route between systems, and it says out loud that it is producing a new variant. So this bridge
// carries the piece's IDENTITY and rules text, and lets the numbers be re-authored deliberately.
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';
import { bulkOf } from './inventory';
import type { PF2Edit } from './edit';

export interface PF2AdoptResult {
  edits: PF2Edit[];
  /** What the character actually gained, for the audit line. */
  adopted: 'item' | 'strike' | 'feat' | 'spell';
  /** Anything the piece carried that this bridge could NOT bring across, in plain words. Shown to the
   *  player: "your item is on the sheet, but its mechanical effects were written for D&D 5e" is a useful
   *  sentence, and silence in its place is how someone concludes the feature is broken. */
  notes: string[];
}

/** A piece's own payload, read defensively — it is authored by a user through a generic form. */
function payloadOf(c: HomebrewContent): Record<string, unknown> {
  return c.payload && typeof c.payload === 'object' && !Array.isArray(c.payload)
    ? (c.payload as Record<string, unknown>)
    : {};
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Did the author attach 5e-shaped mechanics? Used only to WARN, never to translate. */
function hasFiveEEffects(c: HomebrewContent): boolean {
  const p = c.payload;
  if (Array.isArray(p)) return p.length > 0;
  const eff = (p as { effects?: unknown } | null)?.effects;
  return Array.isArray(eff) && eff.length > 0;
}

/**
 * Convert a shared homebrew piece into PF2 edits.
 *
 * Returns null when the piece has no honest PF2 representation — a class, or content with nothing but
 * prose. Null is a REFUSAL the caller reports, not a silent no-op: the whole point of this slice is that a
 * PF2 player stops getting a successful save with an unchanged sheet.
 */
export function pf2AdoptEdits(c: HomebrewContent): PF2AdoptResult | null {
  const p = payloadOf(c);
  const notes: string[] = [];
  if (hasFiveEEffects(c)) {
    notes.push(
      'Its mechanical effects were authored for D&D 5e and are not applied here — Pathfinder 2e counts '
      + 'those numbers differently. Use “Translate to another system” on the piece to get a Pathfinder version.',
    );
  }

  switch (c.kind) {
    // A class cannot cross. PF2 advancement is four feat tracks and proficiency ranks, not a hit die and an
    // ASI ladder; converting would produce something that levels wrongly, which is worse than a refusal.
    case 'class':
    case 'subclass':
      return null;

    case 'feat':
    case 'ability': {
      // The `archetype` track, deliberately: a homebrew feat is not one of the four official tracks, and
      // filing it as `class` would let it be counted against a budget it was never granted by.
      return {
        edits: [{
          op: 'add_feat',
          name: c.name,
          track: 'archetype',
          traits: c.tags ?? [],
          body: c.description ?? c.summary ?? '',
          level: Number(p.level) || 1,
        }],
        adopted: 'feat',
        notes,
      };
    }

    case 'spell': {
      const rank = Number(p.level);
      return {
        edits: [{
          op: 'add_spell',
          name: c.name,
          // PF2 calls it a rank, and it runs 0–10 like 5e's levels, so the field maps directly.
          rank: Number.isFinite(rank) ? Math.max(0, Math.min(10, Math.round(rank))) : 1,
          focus: false,
        }],
        adopted: 'spell',
        notes,
      };
    }

    case 'weapon': {
      const damage = str(p.damage);
      // A weapon with a damage die is a Strike; one without is just gear, and pretending otherwise puts an
      // attack on the sheet that rolls nothing.
      if (damage) {
        return {
          edits: [{
            op: 'add_attack',
            name: c.name,
            damage,
            ...(str(p.damageType) ? { damageType: str(p.damageType) } : {}),
            traits: Array.isArray(p.properties) ? (p.properties as string[]) : (c.tags ?? []),
          }],
          adopted: 'strike',
          notes,
        };
      }
      return { edits: [inventoryEdit(c, p)], adopted: 'item', notes };
    }

    case 'armor':
    case 'item':
    case 'potion':
      return { edits: [inventoryEdit(c, p)], adopted: 'item', notes };

    // Everything else — conditions, rules, backgrounds, creatures, stances — is real content with no
    // per-character PF2 slot to land in. Refused rather than forced somewhere it does not belong.
    default:
      return null;
  }
}

/** An inventory line for a piece of gear. Possible only since P5-1 — before it, PF2 had nowhere to put a
 *  rope, which is exactly why this bridge waited on that slice. */
function inventoryEdit(c: HomebrewContent, p: Record<string, unknown>): PF2Edit {
  // The author wrote weight in whatever their system uses; `bulkOf` reads PF2's own notation, and anything
  // it cannot parse becomes negligible rather than an invented number on an encumbrance total.
  const raw = p.bulk ?? p.weight;
  const bulk = typeof raw === 'string' || typeof raw === 'number' ? raw : undefined;
  return {
    op: 'add_inventory_item',
    name: c.name,
    quantity: 1,
    ...(bulk != null && bulk !== '' ? { bulk: bulkOf(bulk) === 0 ? '—' : String(bulk) } : {}),
    ...(c.summary ? { notes: c.summary } : {}),
  };
}

/** A one-line explanation for a refusal, so the player is told WHY rather than seeing nothing happen. */
export function pf2AdoptRefusal(c: HomebrewContent): string {
  if (c.kind === 'class' || c.kind === 'subclass') {
    return `Pathfinder 2e builds classes from feat tracks and proficiency ranks, so a ${c.kind} written for another system cannot be applied directly. Use “Translate to another system” on the piece to get a Pathfinder version you can review.`;
  }
  return `“${c.name}” is written as rules text, so there is nothing for the sheet to apply. Read it on its page and use it at the table.`;
}
