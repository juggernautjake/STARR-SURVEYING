// lib/dnd/character-card.ts — the one-line summary of a character, whatever system it is (P4-1).
//
// AUDIT D-1: there was no `/dnd/characters` page at all. The only list of a user's characters was a card
// grid on the lobby showing **name, portrait and campaign** — no system, no class, no level — with no
// search, filter, sort, duplicate or delete. Someone with twenty characters had no way to find one except
// by scrolling and recognising the portrait.
//
// The obstacle to fixing that was never the page; it was that "what class is this and what level" lives in
// three different places depending on the system, and every surface that wanted it re-derived it inline:
//
//   5e   → data.meta.className / .level / .subclass
//   PF2  → data.pf2e.identity.className / .level / .subclass
//   IG   → data.ig.identity.className / .level / .subclass
//
// So this reads all three and returns one shape. Pure and defensive — it is pointed at raw jsonb from the
// database, where any field may be absent or the wrong type, and a listing must never throw over a
// half-built character.
import { normalizeSystem, systemLabel, SYSTEM_AMBIGUOUS, type CharacterSystem } from './systems';

export interface CharacterCard {
  system: CharacterSystem;
  systemName: string;
  className: string;
  subclass: string;
  /** 0 when the character has no level yet — a blank sheet, not a level-0 character. */
  level: number;
  /** "Level 5 Fighter (Champion)" / "Level 3 Wizard" / "" when there is nothing worth saying. */
  line: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** The identity block for a system's own shape, or null when that sidecar is absent. */
function identityFor(data: Record<string, unknown>, system: CharacterSystem): Record<string, unknown> | null {
  // Read by SIDECAR first, falling back to the system column. The column can disagree with what is
  // actually stored — a character switched systems, a legacy row — and the sidecar cannot.
  const pf2 = data.pf2e as { identity?: Record<string, unknown> } | undefined;
  if (pf2?.identity) return pf2.identity;
  const ig = data.ig as { identity?: Record<string, unknown> } | undefined;
  if (ig?.identity) return ig.identity;
  if (data.meta && typeof data.meta === 'object') return data.meta as Record<string, unknown>;
  // Nothing recognisable. `system` is still honoured by the caller for the badge.
  void system;
  return null;
}

/**
 * Summarise a stored character for a listing. Never throws: a listing that dies on one malformed row shows
 * the user nothing, which is worse than showing them a name with no class beside it.
 */
export function characterCard(data: unknown, systemColumn: unknown): CharacterCard {
  const system = normalizeSystem(systemColumn);
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const identity = identityFor(d, system);

  const className = identity ? str(identity.className) : '';
  const subclass = identity ? str(identity.subclass) : '';
  const level = identity ? num(identity.level) : 0;

  // Built up from what is actually there rather than from a template with holes in it: a half-built
  // character reads "Level 1" or "Fighter" instead of "Level  ()".
  const parts: string[] = [];
  if (level) parts.push(`Level ${level}`);
  if (className) parts.push(className);
  const head = parts.join(' ');
  const line = head && subclass ? `${head} (${subclass})` : head;

  return {
    system,
    systemName: system === SYSTEM_AMBIGUOUS ? 'No system yet' : systemLabel(system),
    className,
    subclass,
    level,
    line,
  };
}

/** Does this character match a free-text search? Name, class, subclass and system, so "wiz" and "pathfinder"
 *  both work. Empty query matches everything. */
export function characterMatches(name: string, card: CharacterCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [name, card.className, card.subclass, card.systemName].filter(Boolean).join(' ').toLowerCase().includes(q);
}
