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
  const own = next === -1 ? rest : rest.slice(0, next);
  return own + inlinedHelpers(src, own);
}

/**
 * The bodies of same-file helper functions the DELETE actually CALLS.
 *
 * Added 2026-07-30, when M4-2's `map-objects` route failed this sweep while being correctly gated: it
 * factors its check into `nodeGate()`, which resolves the object's node, reads THAT node's campaign_id and
 * calls `getCampaignRole` on it — a stronger check than most routes here perform, and invisible to a scan
 * of the handler body alone.
 *
 * Left unfixed, this guard would have taught the codebase the wrong lesson: that shared auth must be
 * copy-pasted into each verb to look safe, when three verbs sharing one gate is exactly how you keep them
 * from drifting apart. The alternatives were worse — inlining the check to satisfy a text match, or adding
 * the route to an exemption list, which is the thing this file's own comment tells you not to do.
 *
 * DELIBERATELY ONE LEVEL AND SAME-FILE ONLY. A helper defined beside the handler is as readable as the
 * handler; following imports across the tree would turn a guard you can verify by eye into one that can be
 * satisfied from somewhere nobody looks.
 */
function inlinedHelpers(src: string, body: string): string {
  let out = '';
  // `async function nodeGate(` / `function place(` — module-scope helpers, not the exported handlers.
  const decl = /^(?:async )?function (\w+)\s*\(/gm;
  for (let m = decl.exec(src); m; m = decl.exec(src)) {
    const name = m[1];
    // Only if the DELETE calls it. A helper the handler never invokes protects nothing.
    if (!new RegExp(`\\b${name}\\s*\\(`).test(body)) continue;
    const from = m.index;
    const nextDecl = src.slice(from + 1).search(/^(?:export )?(?:async )?function \w+\s*\(/m);
    out += `\n${nextDecl === -1 ? src.slice(from) : src.slice(from, from + 1 + nextDecl)}`;
  }
  return out;
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
  // The delete is SCOPED to the caller's own rows — `.eq('owner_id', session.userId)` — so the
  // database answers "whose is it?" as part of the same statement that removes it. There is no
  // window between the check and the write for it to be wrong about.
  //
  // Added 2026-08-01 with standalone maps (/api/dnd/maps). Every DELETE this sweep knew about until
  // then hung off a campaign, and `getCampaignRole` was the only shape of authorization that
  // existed. A personal map has no campaign, so ownership IS the whole permission model.
  //
  // The pattern is deliberately narrow: it requires the owner column to be compared to the SESSION's
  // id. `.eq('owner_id', body.userId)` — the shape that actually goes wrong, where the client names
  // whose rows to delete — does not match, and would still fail this test.
  /\.eq\(\s*'(owner_id|user_id|created_by)'\s*,\s*session\.\w+/,
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

describe('following same-file helpers does not soften the guard', () => {
  // `inlinedHelpers` widens what counts as authorization, so it needs its own guard: a widening nobody
  // bounded is how a sweep becomes decorative.
  const AUTH_IN_HELPER = [
    'async function gate(id) { if (await getCampaignRole(x) !== "dm") return deny; }',
    'export async function DELETE(req) { const g = await gate(req); if (g) return g; }',
  ].join('\n');

  it('counts a helper the DELETE actually calls', () => {
    const body = 'export async function DELETE(req) { const g = await gate(req); }';
    expect(inlinedHelpers(AUTH_IN_HELPER, body)).toContain('getCampaignRole');
  });

  it('does NOT count a helper the DELETE never calls', () => {
    // The failure mode worth pinning: an auth'd helper sitting in the file next to a DELETE that ignores it.
    const body = 'export async function DELETE(req) { await db.delete(req.id); }';
    expect(inlinedHelpers(AUTH_IN_HELPER, body)).not.toContain('getCampaignRole');
  });

  it('does not reach into another exported handler', () => {
    // A gate in POST has never protected DELETE, and following helpers must not smuggle that back in.
    const src = [
      'export async function POST(req) { if (await getCampaignRole(x) !== "dm") return deny; }',
      'export async function DELETE(req) { await db.delete(req.id); }',
    ].join('\n');
    expect(inlinedHelpers(src, 'export async function DELETE(req) { await db.delete(req.id); }'))
      .not.toContain('getCampaignRole');
  });

  it('the real map-objects route passes because of its gate, not by accident', () => {
    const body = deleteBody('campaigns/[id]/map-objects/route.ts');
    expect(body).toMatch(/await nodeGate\(/);          // the DELETE calls it
    expect(body).toMatch(/getCampaignRole\(node\.campaign_id\)/); // and the gate is the real check
  });
});

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
