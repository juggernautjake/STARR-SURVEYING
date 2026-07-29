// lib/dnd/homebrew/adopt.ts — the mechanical half of "use homebrew on a character" (Area H4/H5).
//
// A shared homebrew piece can carry a mechanical payload of engine `Effect`s (a Belt of X that sets STR, a
// trinket that grants +1 AC, …). Adopting the piece turns that payload into an `ActiveEffect` the sheet's
// ledger resolves EXACTLY like an item/potion buff — so a posted piece round-trips to real, resolving numbers
// (not just prose), and its creator attribution rides along onto the effect's `source`. Pure: the DM-gate
// (policy.ts) decides IF a character may adopt; this decides WHAT it grants.
import type { Effect } from '@/app/dnd/_sheet/engine/effects';
import type { ActiveEffect, Character } from '@/app/dnd/_sheet/types';
import { validateEffect } from '@/lib/dnd/effects/targets';
import type { ClassDefinition, SubclassDefinition } from '@/lib/dnd/classes/types';
import type { CustomFeat } from '@/lib/dnd/classes/custom';
import { validateClassDefinition } from '@/lib/dnd/classes/engine';
import { classesForSystem } from '@/lib/dnd/classes/registry';
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
 * A homebrew `class` piece → the `ClassDefinition` to add to `char.homebrewClasses` (H4/H5 — the non-effect
 * half of adoption). The payload must be a structurally-VALID class for the piece's OWN system (the class
 * engine's `validateClassDefinition` must return []), or this refuses it (null) rather than storing a broken
 * class the level builder can't level. The creator is stamped as the author. Pure.
 *
 * NO LONGER ACCEPTS `subclass` (P12-5). It used to, and the result was worse than an unwired feature: an
 * adopted subclass was stored as a standalone CLASS, so "Way of the Open Hand" became something you take
 * levels in rather than an option under Monk — while its required `parentClass` field was read by nothing
 * at all. Subclasses now go through `homebrewToCharacterSubclass` into `char.homebrewSubclasses`, which is
 * the store the level walker already reads via `subclassesFor(..., extra)`.
 */
export function homebrewToCharacterClass(c: HomebrewContent): ClassDefinition | null {
  if (c.kind !== 'class') return null;
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

/** Normalised for matching a free-text parent against a class key or name. */
const normKey = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * A homebrew `subclass` piece → the `SubclassDefinition` to add to `char.homebrewSubclasses` (P12-5).
 *
 * THE PARENT BINDING IS THE POINT. The Studio has always required a `parentClass` on this kind, and until
 * now nothing anywhere read it — the field was collected and discarded. Here it is resolved to a real
 * `classKey`, so the subclass appears under its class in the level-up chooser instead of nowhere.
 *
 * Resolution is deliberately forgiving about SPELLING and strict about EXISTENCE: `parentClass` is free
 * text an author typed ("Way of the Open Hand" belongs to "Monk", "monk", or "monk " equally), so it is
 * matched normalised against each candidate's key and name. But an unresolvable parent returns null rather
 * than guessing or defaulting — a subclass bound to the wrong class is worse than one that refuses to
 * adopt, because the second is visible and the first quietly gives a Wizard a Rogue's features.
 *
 * `candidates` are the classes this character could actually have: the system's own plus any homebrew
 * classes already on the sheet, so a homebrew subclass of a homebrew class works.
 */
export function homebrewToCharacterSubclass(
  c: HomebrewContent,
  candidates: readonly { key: string; name: string }[],
): SubclassDefinition | null {
  if (c.kind !== 'subclass') return null;
  const p = c.payload;
  if (!p || typeof p !== 'object') return null;
  const sub = p as SubclassDefinition & { parentClass?: unknown };
  if (typeof sub.key !== 'string' || typeof sub.name !== 'string') return null;
  // A subclass is never valid outside its own system — the same hard rule the class converter applies.
  if (sub.system !== c.system) return null;
  if (!Array.isArray(sub.features)) return null;

  // An explicit `classKey` on the payload wins; otherwise resolve the authored free-text parent.
  const wanted = typeof sub.classKey === 'string' && sub.classKey
    ? sub.classKey
    : typeof sub.parentClass === 'string' ? sub.parentClass : '';
  if (!wanted) return null;
  const want = normKey(wanted);
  const match = candidates.find((k) => normKey(k.key) === want) ?? candidates.find((k) => normKey(k.name) === want);
  if (!match) return null;

  return {
    key: sub.key,
    name: sub.name,
    classKey: match.key,
    system: sub.system,
    description: typeof sub.description === 'string' ? sub.description : '',
    features: sub.features,
    ...(sub.alwaysPrepared ? { alwaysPrepared: sub.alwaysPrepared } : {}),
    custom: { ...(sub.custom ?? {}), authorName: c.creator.name },
  };
}

/** What kind of thing an adoption added to the character. */
export type AdoptedKind = 'class' | 'subclass' | 'feat' | 'effect';

/**
 * The single top-level "use this homebrew piece on this character" (H4/H5) — routes by content kind to the
 * right converter and returns the UPDATED character (immutable) plus what was added, or null when the piece
 * grants nothing adoptable (pure prose, or a payload that failed validation). Re-adopting the same piece
 * REPLACES its prior copy (dedup by class/feat key or effect id), so it's idempotent. The DM gate
 * (`canAdoptHomebrew` in policy.ts) decides IF this may run; this decides WHAT it does.
 */
export function adoptHomebrew(char: Character, content: HomebrewContent): { char: Character; adopted: AdoptedKind } | null {
  const cls = homebrewToCharacterClass(content);
  if (cls) {
    const kept = (char.homebrewClasses ?? []).filter((c) => c.key !== cls.key);
    return { char: { ...char, homebrewClasses: [...kept, cls] }, adopted: 'class' };
  }
  // Candidates = the system's own classes plus any homebrew class already on this sheet, so a homebrew
  // subclass OF a homebrew class resolves. Read from the registry here rather than threaded through the
  // signature: every other converter in this file reaches for the engine it validates against.
  const sub = homebrewToCharacterSubclass(content, [
    ...classesForSystem(content.system).map((k) => ({ key: k.key, name: k.name })),
    ...(char.homebrewClasses ?? []).map((k) => ({ key: k.key, name: k.name })),
  ]);
  if (sub) {
    const kept = (char.homebrewSubclasses ?? []).filter((s) => s.key !== sub.key);
    return { char: { ...char, homebrewSubclasses: [...kept, sub] }, adopted: 'subclass' };
  }
  const feat = homebrewToCharacterFeat(content);
  if (feat) {
    const kept = (char.homebrewFeats ?? []).filter((f) => f.key !== feat.key);
    return { char: { ...char, homebrewFeats: [...kept, feat] }, adopted: 'feat' };
  }
  const eff = homebrewToActiveEffect(content);
  if (eff) {
    const kept = (char.activeEffects ?? []).filter((e) => e.id !== eff.id);
    return { char: { ...char, activeEffects: [...kept, eff] }, adopted: 'effect' };
  }
  return null;
}

/**
 * Author-time validation of a homebrew piece's mechanical PAYLOAD (Area H3, the counterpart to the identity
 * `validateHomebrew` in model.ts). Returns human-readable problems the creation form shows before a piece can
 * be posted — the adopt converters silently REJECT invalid payloads (return null); this explains WHY. A piece
 * with NO payload is pure prose and valid (returns []). Reuses the same validators adoption uses, so the
 * "shows an error at authoring" and "silently refused at adopt" surfaces can never disagree.
 */
export function validateHomebrewPayload(c: HomebrewContent): string[] {
  const errs: string[] = [];
  const p = c.payload;
  if (p == null) return errs; // prose-only piece — nothing mechanical to validate

  if (c.kind === 'class' || c.kind === 'subclass') {
    if (typeof p !== 'object' || typeof (p as ClassDefinition).key !== 'string' || typeof (p as ClassDefinition).name !== 'string') {
      errs.push('The class payload is not a class definition.');
      return errs;
    }
    const def = p as ClassDefinition;
    if (def.system !== c.system) errs.push(`The class is scoped to "${def.system}" but this piece is "${c.system}" — a class is never valid outside its own system.`);
    if (typeof def.hitDie !== 'number') errs.push('The class needs a hit die.');
    try { validateClassDefinition(def).forEach((v) => errs.push(`${v.field}: ${v.message}`)); }
    catch { errs.push('The class definition could not be validated.'); }
  } else if (c.kind === 'feat') {
    if (typeof p !== 'object' || typeof (p as CustomFeat).name !== 'string') { errs.push('The feat payload is not a feat.'); return errs; }
    const f = p as CustomFeat;
    if (f.system !== c.system) errs.push(`The feat is scoped to "${f.system}" but this piece is "${c.system}".`);
    if (!['origin', 'general', 'fighting-style', 'epic-boon'].includes(f.category)) errs.push(`"${f.category}" is not a valid feat category (origin / general / fighting-style / epic-boon).`);
    if (!f.body || !f.body.trim()) errs.push('The feat needs rules text (body).');
  } else {
    // Effect-bearing kinds (item, weapon, armor, potion, effect, …): a PRESENT effects payload must all validate.
    const raw = Array.isArray(p) ? p : (typeof p === 'object' && Array.isArray((p as { effects?: unknown }).effects) ? (p as { effects: unknown[] }).effects : null);
    if (raw) {
      raw.forEach((e, i) => {
        const v = validateEffect((e ?? {}) as Record<string, unknown>);
        if (v) errs.push(`Effect ${i + 1}: ${v.reason ?? 'invalid'}`);
      });
    }
  }
  return errs;
}
