// __tests__/dnd/delete-route-authorization.test.ts — no DELETE is reachable on a session alone.
//
// The destructive counterpart to `character-route-access-classes.test.ts`. That file classified every
// character-scoped GET after slice 39 found one handing out data on read access; this one sweeps the other
// direction — the routes that DESTROY something — and pins the result.
//
// THE SWEEP'S RESULT WAS CLEAN: all 19 DELETE handlers under /api/dnd already authorize beyond "is signed
// in", via one of five predicates. That is worth recording precisely because it is a negative: a clean sweep
// leaves no artefact, so the next reader has no way to tell it was ever run, and the property quietly
// depends on nobody adding a route in a hurry.
//
// "Signed in" is never sufficient for a DELETE here. Every one of these deletes something belonging to
// someone else's game — a campaign's map, an encounter, a member, a character, a grant, a stream alias —
// so the question is always *whose* it is, never merely *who* is asking.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'app/api/dnd');

/** Every route.ts under /api/dnd exporting a DELETE, relative to that folder. */
function deleteRoutes(dir = ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...deleteRoutes(full)); continue; }
    if (entry !== 'route.ts') continue;
    if (!readFileSync(full, 'utf8').includes('export async function DELETE')) continue;
    out.push(relative(ROOT, full).split('\\').join('/'));
  }
  return out.sort();
}

/** Just the DELETE handler's body — a gate in some OTHER handler in the same file does not protect it. */
function deleteBody(rel: string): string {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const start = src.indexOf('export async function DELETE');
  const rest = src.slice(start + 1);
  const next = rest.indexOf('\nexport async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

/** The authorization predicates this codebase actually uses. Each answers "whose is it?", not "who are you?".
 *
 *  · getCampaignRole  — the DM of the campaign that owns the thing
 *  · requireDm        — the DM of the campaign a CHARACTER is in
 *  · requireCharacterWrite / canWrite — owner, assigned player, or DM of that character
 *  · isOwner          — strictly the owner (used where the act is irreversible, e.g. deleting a character)
 *  · isDndOwner       — the platform owner, for the suggestions board
 *  · ownAlias/own…    — the caller owns the specific row (returns 404, not 403, so absence stays ambiguous) */
const AUTH_PREDICATES = [
  'getCampaignRole',
  'requireDm',
  'requireCharacterWrite',
  'canWrite',
  'isOwner',
  'isDndOwner',
  'isDM',
  // The caller may manage this character's stream (its owner or the DM of a campaign it is in).
  'canManage',
  /own[A-Z]\w*\(/,
];

/** How a handler establishes WHO is asking. `getDndSession` is the direct form; the character-access
 *  helpers resolve the session themselves and return the caller's permissions with it, so a route using
 *  one does not also call `getDndSession` — requiring both would have flagged two correctly-gated routes.
 *  (It did, on this suite's first run.) */
const CALLER_PREDICATES = [
  'getDndSession', 'getCharacterAccess', 'requireCharacterWrite', 'requireDm',
  // `getCampaignRole` reads the session itself and returns null for anyone not signed in, so a route
  // gated on it has established the caller — it is a STRICTLY STRONGER check than `getDndSession`, not a
  // weaker one, because it also answers "whose is it?". Added 2026-07-29 when the world route (M4-4) was
  // flagged: it authorizes correctly on `getCampaignRole(...) !== 'dm'` and named no other predicate.
  //
  // This does not soften the guard. The point is that identity ALONE is insufficient, and every entry here
  // still has to be paired with an AUTH_PREDICATES match below.
  'getCampaignRole',
];

describe('the sweep still covers what it claims', () => {
  it('finds the DELETE routes', () => {
    const routes = deleteRoutes();
    // A lower bound, so adding routes never breaks this, but deleting the whole scan does.
    expect(routes.length).toBeGreaterThanOrEqual(19);
    expect(routes).toContain('characters/[id]/route.ts');
    expect(routes).toContain('campaigns/[id]/maps/route.ts');
  });
});

describe('every DELETE authorizes beyond being signed in', () => {
  for (const rel of deleteRoutes()) {
    it(rel, () => {
      const body = deleteBody(rel);
      // It must establish WHO is asking...
      expect(CALLER_PREDICATES.some((p) => body.includes(p))).toBe(true);
      // ...and then answer "whose is it?".
      const authorized = AUTH_PREDICATES.some((p) => (typeof p === 'string' ? body.includes(p) : p.test(body)));
      // If this fails on a NEW route: add the real check to the route. If the route genuinely needs none,
      // that is a claim worth arguing in review — not a line to add to this list.
      expect(authorized).toBe(true);
    });
  }
});

describe('the two strictest cases stay strict', () => {
  it('deleting a CHARACTER is owner-only, not merely writable', () => {
    // A DM can edit your character; a DM must not be able to erase it. `canWrite` here would be a
    // catastrophic loosening that reads as a tidy-up.
    const body = deleteBody('characters/[id]/route.ts');
    expect(body).toMatch(/if \(!res\.access\.isOwner\)[\s\S]{0,140}status: 403/);
  });

  it('deleting a stream alias 404s rather than 403s when it is not yours', () => {
    // Deliberate: a 403 would confirm the alias exists. Absence and denial look identical to a stranger.
    const body = deleteBody('stream/aliases/[aliasId]/route.ts');
    expect(body).toMatch(/ownAlias[\s\S]{0,120}status: 404/);
  });
});
