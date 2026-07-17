// lib/dnd/glossary/index.ts — every system's fully-explained terms, in one lookup.
//
// Glossaries are keyed by SYSTEM and never merged: the same word means different things in
// different games (a Blades "score" is a heist, a 5e "score" is an ability; PF2's Frightened is
// numeric where 5e's is binary). Looking a term up without saying which system is the exact
// mistake this platform exists to prevent, so there is no cross-system `findTerm`.
import type { GlossaryEntry, SystemGlossary } from './types';
import { DND5E_2014_GLOSSARY } from './dnd5e-2014';
import { DND5E_2024_GLOSSARY } from './dnd5e-2024';
import { PATHFINDER2E_GLOSSARY } from './pathfinder2e';
import { PATHFINDER1E_GLOSSARY } from './pathfinder1e';
import { STARFINDER1E_GLOSSARY } from './starfinder1e';
import { COC7E_GLOSSARY } from './coc7e';
import { BLADES_GLOSSARY } from './blades';
import { CYBERPUNK_RED_GLOSSARY } from './cyberpunk-red';
import { SHADOWRUN6E_GLOSSARY } from './shadowrun6e';
import { INTUITIVE_GAMES_GLOSSARY } from './intuitive-games';

export type { GlossaryEntry, GlossaryKind, SystemGlossary } from './types';

const BY_SYSTEM: Record<string, SystemGlossary> = {
  'dnd5e-2014': DND5E_2014_GLOSSARY,
  'dnd5e-2024': DND5E_2024_GLOSSARY,
  pathfinder2e: PATHFINDER2E_GLOSSARY,
  pathfinder1e: PATHFINDER1E_GLOSSARY,
  starfinder1e: STARFINDER1E_GLOSSARY,
  coc7e: COC7E_GLOSSARY,
  blades: BLADES_GLOSSARY,
  'cyberpunk-red': CYBERPUNK_RED_GLOSSARY,
  shadowrun6e: SHADOWRUN6E_GLOSSARY,
  // Intuitive Games has a builder-side content module (systems/intuitive-games/content.ts) AND, now,
  // a searchable glossary here — so the library search + Ask-the-Librarian cover it like the other
  // focus systems. The two are complementary: content.ts is builder data, this is the readable rules.
  'intuitive-games': INTUITIVE_GAMES_GLOSSARY,
};

/** Every defined term for a system (empty for a system with no glossary yet). */
export function glossaryFor(system: string): SystemGlossary {
  return BY_SYSTEM[system] ?? [];
}

export function systemsWithGlossary(): string[] {
  return Object.keys(BY_SYSTEM);
}

const norm = (s: string) => s.trim().toLowerCase();

/** Does this term (or one of its aliases) match `q`? */
function matches(e: GlossaryEntry, q: string): boolean {
  if (norm(e.term) === q) return true;
  return (e.aliases ?? []).some((a) => norm(a) === q);
}

/**
 * Look one term up WITHIN a system, in strict priority order:
 *   1. an exact TERM match  2. an exact ALIAS match  3. a term prefix  4. an alias prefix
 *
 * The ordering matters: a real entry must never lose to another entry that merely lists its name
 * as an alias. Cyberpunk RED's "Stats" entry aliases every stat abbreviation, so a flat
 * term-or-alias search resolved "Tech" to "Stats" — the wrong article.
 */
export function findTerm(system: string, term: string): GlossaryEntry | null {
  const q = norm(term || '');
  if (!q) return null;
  const g = glossaryFor(system);
  return (
    g.find((e) => norm(e.term) === q) ??
    g.find((e) => (e.aliases ?? []).some((a) => norm(a) === q)) ??
    g.find((e) => norm(e.term).startsWith(q)) ??
    g.find((e) => (e.aliases ?? []).some((a) => norm(a).startsWith(q))) ??
    null
  );
}

export interface GlossaryHit extends GlossaryEntry {
  system: string;
  score: number;
}

/**
 * Search a system's glossary. Every word must appear somewhere (AND), a term/alias hit outranks a
 * body hit, and an exact term wins outright. Pure and DB-free, so it works with no embeddings key.
 */
export function searchGlossary(system: string, query: string, limit = 25): GlossaryHit[] {
  const q = norm(query || '');
  if (!q) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return [];

  const hits: GlossaryHit[] = [];
  for (const e of glossaryFor(system)) {
    const hay = norm([e.term, ...(e.aliases ?? []), e.short, e.body].join('\n'));
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      if (norm(e.term).includes(w)) score += 4;
      else if ((e.aliases ?? []).some((a) => norm(a).includes(w))) score += 3;
      else if (norm(e.short).includes(w)) score += 2;
      else score += 1;
    }
    if (matches(e, q)) score += 20;
    hits.push({ ...e, system, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term)).slice(0, limit);
}

/** Search every system's glossary at once — each hit says which system it came from. */
export function searchAllGlossaries(query: string, limit = 40): GlossaryHit[] {
  return Object.keys(BY_SYSTEM)
    .flatMap((s) => searchGlossary(s, query, limit))
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
    .slice(0, limit);
}

/**
 * The terms referenced by a chunk of text, for making sheet content clickable: given a feature's
 * body, return the glossary entries it mentions. Longest terms first so "Sanity check" wins over
 * "Sanity", and each term is only reported once.
 */
export function termsMentionedIn(system: string, text: string, limit = 12): GlossaryEntry[] {
  const hay = norm(text || '');
  if (!hay) return [];
  const found: GlossaryEntry[] = [];
  const seen = new Set<string>();
  const byLength = [...glossaryFor(system)].sort((a, b) => b.term.length - a.term.length);
  for (const e of byLength) {
    if (found.length >= limit) break;
    if (seen.has(e.term)) continue;
    const candidates = [e.term, ...(e.aliases ?? [])];
    const hit = candidates.some((c) => {
      const esc = norm(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay);
    });
    if (hit) {
      found.push(e);
      seen.add(e.term);
    }
  }
  return found;
}
