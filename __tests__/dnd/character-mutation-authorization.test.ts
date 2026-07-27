// __tests__/dnd/character-mutation-authorization.test.ts — nothing writes to a character on a session alone.
//
// The third and last of the access sweeps, and the one with the most at stake. Slice 39 found a GET handing
// out data on read access; the DELETE sweep came back clean; this covers the 55 POST/PATCH/PUT handlers
// under `characters/[id]` — the surface where a stranger modifying someone else's character would be worse
// than reading it.
//
// **The sweep came back clean.** Every one already answers "whose character is this?" before writing.
// Recorded for the same reason the DELETE sweep was: a clean result leaves no artefact, and the property
// then survives only as long as nobody adds a route in a hurry. /dnd is public by direct link, so a
// character-scoped write with only a session check would be reachable by anyone with an account.
//
// WHY THE PREDICATE LIST IS LONGER THAN IT LOOKS. These routes answer the ownership question in several
// legitimate shapes, and the failure mode of a guard like this is demanding ONE spelling of a correct thing
// — which the DELETE suite did on its first run, flagging three properly-gated routes. Each entry below is
// a real authorization helper, not a keyword that happens to appear nearby.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'app/api/dnd/characters/[id]');
const METHODS = ['POST', 'PATCH', 'PUT'] as const;

function routeFiles(dir = ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...routeFiles(full)); continue; }
    if (entry === 'route.ts') out.push(relative(ROOT, full).split('\\').join('/'));
  }
  return out.sort();
}

/** One handler's body. A gate in a SIBLING export does not protect this one, so the slice stops at the
 *  next `export async function`. Helper DEFINITIONS may sit above — that is fine and expected: what has to
 *  appear here is the CALL. */
function handlerBody(rel: string, method: string): string | null {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const start = src.indexOf(`export async function ${method}`);
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const next = rest.indexOf('\nexport async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every shape in which these routes legitimately ask "whose is it?". */
const AUTH_PREDICATES: Array<string | RegExp> = [
  'requireCharacterWrite',   // owner, assigned player, or a DM of a campaign the character is in
  'canWrite',
  'isOwner',
  'isDM',
  'requireDm',               // the DM of a campaign this character is in
  'getCampaignRole',         // the caller's role in the owning campaign
  'canManage',               // may manage this character's stream
  'isDndOwner',              // the platform owner (suggestions board)
  'donorFor',                // resolves the caller's OWN character in the campaign (`.eq('owner_user_id')`)
  /own[A-Z]\w*\(/,           // ownAlias(…) and friends — the caller owns this specific row
];
// Not listed, on purpose: `load(` from `levels/route.ts`. It is a LOADER, not a gate — that route
// authorizes with `!r.access.canWrite` one line later, which the `canWrite` entry already matches. Adding
// the loader would have made the suite pass by naming a function that checks nothing, which is the failure
// this list has to resist.

// NOTE: there is deliberately NO separate "did it resolve a caller?" assertion.
//
// The DELETE suite had one and it flagged three correctly-gated routes on its first run; this suite's first
// run made it four (`POST levels/route.ts` resolves access through a local `load()` helper, so neither
// `getDndSession` nor `getCharacterAccess` appears in the handler body). Three strikes is the answer: that
// assertion tested a PROXY — which function name appears — rather than the property.
//
// It is also redundant. Every predicate below answers "whose character is this?", and none of them can be
// answered without first establishing who is asking. Authorization subsumes identity, so checking identity
// separately bought nothing and cost three false alarms — each of which invited loosening a guard to make a
// correct route pass, which is how a guard like this dies.
const handlers = routeFiles().flatMap((rel) =>
  METHODS.map((m) => ({ rel, m, body: handlerBody(rel, m) })).filter((h) => h.body !== null),
) as Array<{ rel: string; m: string; body: string }>;

describe('the sweep covers what it claims', () => {
  it('finds the character-scoped mutation handlers', () => {
    // A lower bound: adding routes never breaks this, but a scan that silently stops finding them does.
    expect(handlers.length).toBeGreaterThanOrEqual(55);
  });

  it('including the ones this session touched', () => {
    const names = handlers.map((h) => `${h.m} ${h.rel}`);
    expect(names).toContain('POST ig-edit/route.ts');
    expect(names).toContain('POST pf2-edit/route.ts');
    expect(names).toContain('POST levels/route.ts');
    expect(names).toContain('PATCH route.ts');
  });
});

describe('every character-scoped write answers "whose character is this?"', () => {
  for (const h of handlers) {
    it(`${h.m} ${h.rel}`, () => {
      const authorized = AUTH_PREDICATES.some((p) => (typeof p === 'string' ? h.body.includes(p) : p.test(h.body)));
      // If this fails on a NEW route: add the real check to the route. Widening the list above is only
      // correct when the route genuinely authorizes in a shape not yet listed — verify that by reading it,
      // not by pattern-matching the failure away.
      expect(authorized).toBe(true);
    });
  }
});

describe('the sheet-write chokepoint stays the strictest form', () => {
  it('PATCH on the character gates before it parses the body', () => {
    // Every in-place editor autosaves through here. Checking access first means an unreadable payload
    // cannot reach the gate at all.
    const body = handlerBody('route.ts', 'PATCH')!;
    const gate = body.indexOf('!res.access.canWrite');
    const parse = body.indexOf('await req.json()');
    expect(gate).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(gate);
  });

  it('the tip route funds from the CALLER’s own character, not the streamer’s', () => {
    // The one route whose authorization is entirely inside a helper. `donorFor` scopes to
    // `.eq('owner_user_id', userId)` and refuses a non-member — without that, tipping would be a way to
    // spend someone else's currency.
    const src = readFileSync(join(ROOT, 'stream/tip/route.ts'), 'utf8');
    expect(src).toContain("eq('owner_user_id', userId)");
    expect(src).toMatch(/notMember[\s\S]{0,120}status: 403/);
  });
});
