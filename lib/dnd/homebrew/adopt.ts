// lib/dnd/homebrew/adopt.ts — the mechanical half of "use homebrew on a character" (Area H4/H5).
//
// A shared homebrew piece can carry a mechanical payload of engine `Effect`s (a Belt of X that sets STR, a
// trinket that grants +1 AC, …). Adopting the piece turns that payload into an `ActiveEffect` the sheet's
// ledger resolves EXACTLY like an item/potion buff — so a posted piece round-trips to real, resolving numbers
// (not just prose), and its creator attribution rides along onto the effect's `source`. Pure: the DM-gate
// (policy.ts) decides IF a character may adopt; this decides WHAT it grants.
import type { Effect } from '@/app/dnd/_sheet/engine/effects';
import type { ActiveEffect } from '@/app/dnd/_sheet/types';
import { validateEffect } from '@/lib/dnd/effects/targets';
import type { HomebrewContent } from './model';

/** The engine effects a homebrew piece grants. Reads `payload.effects` (or a bare `Effect[]` payload),
 *  DROPPING any effect that fails validation at the boundary — an unparseable bonus is refused, never coerced,
 *  so a bad payload can't inject a fake number. */
export function homebrewPayloadEffects(c: HomebrewContent): Effect[] {
  const p = c.payload;
  if (!p) return [];
  const raw = Array.isArray(p) ? p : (typeof p === 'object' && Array.isArray((p as { effects?: unknown }).effects) ? (p as { effects: unknown[] }).effects : null);
  if (!raw) return [];
  return raw.filter((e): e is Effect => !!e && typeof e === 'object' && validateEffect(e as Record<string, unknown>) === null);
}

/** Turn a homebrew piece into an `ActiveEffect` the ledger resolves (H5). Returns null when the piece grants
 *  no valid effects (its mechanics are pure prose, or the payload didn't validate). The creator is preserved
 *  in `source` so provenance survives adoption. */
export function homebrewToActiveEffect(c: HomebrewContent): ActiveEffect | null {
  const effects = homebrewPayloadEffects(c);
  if (!effects.length) return null;
  return {
    id: `hb-${c.id}`,
    label: c.name,
    source: `Homebrew · by ${c.creator.name}`, // attribution persists onto the resolved effect
    effects,
  };
}
