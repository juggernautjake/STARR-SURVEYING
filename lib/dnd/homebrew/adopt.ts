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
import type { ClassDefinition } from '@/lib/dnd/classes/types';
import type { CustomFeat } from '@/lib/dnd/classes/custom';
import { validateClassDefinition } from '@/lib/dnd/classes/engine';
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

/**
 * A homebrew `class`/`subclass` piece → the `ClassDefinition` to add to `char.homebrewClasses` (H4/H5 — the
 * non-effect half of adoption). The payload must be a structurally-VALID class for the piece's OWN system (the
 * class engine's `validateClassDefinition` must return []), or this refuses it (null) rather than storing a
 * broken class the level builder can't level. The creator is stamped as the author. Pure.
 */
export function homebrewToCharacterClass(c: HomebrewContent): ClassDefinition | null {
  if (c.kind !== 'class' && c.kind !== 'subclass') return null;
  const p = c.payload;
  if (!p || typeof p !== 'object') return null;
  const def = p as ClassDefinition;
  // Minimal structural shape + the hard system-match rule (a class is never valid outside its own system).
  if (typeof def.key !== 'string' || typeof def.name !== 'string' || typeof def.hitDie !== 'number' || def.system !== c.system) return null;
  let issues: unknown[];
  try { issues = validateClassDefinition(def); } catch { return null; }
  if (Array.isArray(issues) && issues.length > 0) return null; // the engine found it unlevelable — refuse it
  return { ...def, custom: { ...(def.custom ?? {}), authorName: c.creator.name } };
}

/**
 * A homebrew `feat` piece → the `CustomFeat` to add to `char.homebrewFeats`. Requires the core fields + a valid
 * category + a system match; refuses anything else (null). The creator is stamped as the author. Pure.
 */
export function homebrewToCharacterFeat(c: HomebrewContent): CustomFeat | null {
  if (c.kind !== 'feat') return null;
  const p = c.payload;
  if (!p || typeof p !== 'object') return null;
  const f = p as CustomFeat;
  const CATEGORIES = ['origin', 'general', 'fighting-style', 'epic-boon'];
  if (typeof f.key !== 'string' || typeof f.name !== 'string' || typeof f.body !== 'string' || f.system !== c.system || !CATEGORIES.includes(f.category)) return null;
  return { ...f, custom: { ...(f.custom ?? {}), authorName: c.creator.name } };
}
