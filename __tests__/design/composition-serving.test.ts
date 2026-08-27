// __tests__/design/composition-serving.test.ts
//
// W4 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"I also need a way to totally design pages and set them as the page for the different
// routes."*
//
// ── THE ONE PROPERTY THAT MATTERS HERE ──────────────────────────────────────────────────────────
//
// The plan names it: *"a composition that fails to load must leave the page working."*
//
// A portal is a page people do their jobs on. Putting a resolver in front of one means a bad row, a
// slow query or a typo in a scope key can take that page away — and take it away for exactly the
// group whose composition was broken, which is the hardest failure to notice and the worst one to
// have. Every assertion below is some version of "and the page is still there".
//
// These are source assertions, not behaviour: `composition-server.ts` cannot be imported without a
// Supabase client, and a mocked Postgres proving a fallback is a test of the mock. What CAN be
// tested for real — the cascade that decides which composition wins — is pure and lives in
// `composition-scope.test.ts` with twenty of its own.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SERVER = read('lib/design/composition-server.ts');
const SLOT = read('lib/design/CompositionSlot.tsx');
const API = read('app/api/design/composition/route.ts');

describe('nothing about a composition may break a page', () => {
  it('a failed query falls back instead of throwing', () => {
    expect(SERVER).toMatch(/if \(error\) \{[\s\S]{0,200}return null;/);
    expect(SERVER).toMatch(/serving the page as written/);
  });

  it('and so does anything else at all', () => {
    // The catch is the point: a client that could not connect, a JSON parse, a shape nobody
    // predicted. `compositionFor` has exactly one way to fail, and it is "the page stays as it was".
    //
    // ── REWRITTEN 2026-08-27: this asserted a CHARACTER DISTANCE and had gone red ────────────────
    //
    // It was `/\} catch \(err\) \{[\s\S]{0,240}return null;\s*\}/` — the catch and its `return null`
    // within 240 characters of each other. The gap is now **244**, because somebody added a line of
    // explanation inside the catch. The handler is exactly as correct as it was; a comment grew.
    //
    // Raising 240 to 300 would have been the quick fix and would have left the same trap armed, one
    // comment further out. The property actually worth protecting is not proximity — it is that the
    // catch swallows and returns rather than rethrowing. So that is what is asserted now, and the
    // prose inside it can grow to any length.
    const start = SERVER.indexOf('} catch (err) {');
    expect(start, 'the catch-all handler is gone').toBeGreaterThan(-1);
    const body = SERVER.slice(start, SERVER.indexOf('\n}', start));

    expect(body, 'the catch must return null, not fall through').toContain('return null;');
    expect(body, 'a rethrow here takes the whole page down with it').not.toMatch(/\bthrow\b/);

    // And every one of those is recorded, or a broken table would hide behind the fallback forever.
    expect((SERVER.match(/console\.error\('\[design\]/g) ?? []).length).toBe(2);
  });

  it('a row with no views is refused rather than rendered empty', () => {
    // An older write, a truncated JSONB. Falling back beats replacing a working page with an empty
    // grid — the grid would look like the composition, correctly served and containing nothing.
    expect(SERVER).toMatch(/if \(!views\?\.desktop \|\| !views\?\.mobile\) return null;/);
  });

  it('the slot renders the page FIRST and swaps only on success', () => {
    // The children are not a loading state, they are the PAGE. Written the other way round — a
    // spinner first, children as the error case — every portal would flash empty on a slow
    // connection and go blank on a bad row.
    expect(SLOT).toMatch(/if \(!loaded\) return <>\{children\}<\/>;/);
    expect(SLOT).toMatch(/if \(!res\.ok\) return;/);
  });

  it('an empty composition is not a reason to show an empty page', () => {
    // Somebody set the kind and has not placed anything yet. The written page is still the better
    // answer, and it is the only one that is not a regression.
    expect(SLOT).toMatch(/if \(widgets\.length === 0\) return <>\{children\}<\/>;/);
  });

  it('and a caught fetch says why it does nothing', () => {
    // An empty catch block is normally a smell. Here it is the correct behaviour and the comment is
    // what stops somebody "fixing" it into a thrown error that blanks a portal.
    const block = SLOT.slice(SLOT.indexOf('} catch {'));
    expect(block).toMatch(/hand-built page is still on screen/);
  });
});

describe('only what is live is served', () => {
  it('drafts never reach a real page', () => {
    // The studio's flow is clone-to-edit, so at any moment there are half-finished layouts sitting
    // against a route. Serving one would put somebody's work-in-progress in front of the crew.
    expect(SERVER).toMatch(/\.eq\('status', 'active'\)/);
    expect(SERVER).toMatch(/\.eq\('kind', 'composition'\)/);
    expect(SERVER).toMatch(/\.is\('deleted_at', null\)/);
  });

  it('and the query is keyed the way the index is', () => {
    expect(SERVER).toMatch(/\.eq\('route', route\)\s*\n\s*\.eq\('state_key', stateKey\)/);
  });

  it('the cascade is not reimplemented next to the query', () => {
    // This module fetches; `resolveComposition` decides. That split is why the part that actually
    // chooses which page somebody sees is pure and has twenty tests, rather than being three
    // conditions tangled into a query builder.
    expect(SERVER).toMatch(/import \{ resolveComposition/);
    expect(SERVER).toMatch(/const chosen = resolveComposition\(rows, viewer, route, stateKey\);/);
    expect(SERVER).not.toMatch(/scope === 'user' \?/);
  });
});

describe('the endpoint answers about the caller and nobody else', () => {
  it('takes the viewer from the session, never from a parameter', () => {
    // `?as=someone@else` would be a way to read the layout somebody built for themselves. Small,
    // and it is a permission hole that would exist purely because nobody tried it.
    expect(API).toMatch(/viewerFrom\(session\)/);
    expect(API).not.toMatch(/searchParams\.get\('as'\)/);
    expect(API).not.toMatch(/searchParams\.get\('email'\)/);
  });

  it('requires a session but NOT the developer role', () => {
    // Every other design endpoint is `isDeveloper`, because they are build tools. This one is read
    // by a portal on behalf of whoever has it open — a field crew member, a bookkeeper. Gating it on
    // developer would mean compositions serve only to developers, which is the opposite of the point.
    expect(API).toMatch(/if \(!session\?\.user\?\.email\) return NextResponse\.json\(\{ error: 'Unauthorized' \}/);
    // The CALL, not the word: the header of that file explains at length why this endpoint is not
    // gated like its neighbours, so a bare /isDeveloper/ matches the prose and fails on a file that
    // is correct. My own comment is what failed this the first time it ran.
    expect(API).not.toMatch(/isDeveloper\(/);
    expect(API).not.toMatch(/import \{[^}]*isDeveloper/);
  });

  it('and "nothing applies" is a 200, because it is the normal state of the world', () => {
    // A 404 there would make every portal's console noisy for the common case, and noise is how a
    // real 404 gets ignored.
    expect(API).toMatch(/return NextResponse\.json\(\{ composition \}\);/);
  });
});

describe('switching tabs does not show the previous tab\'s layout', () => {
  it('the slot clears what it had before fetching again', () => {
    // Without the reset, a tab switch keeps the old composition on screen until the new fetch lands
    // — a page briefly showing another page's layout, which reads as a rendering bug rather than a
    // stale fetch.
    const effect = SLOT.slice(SLOT.indexOf('useEffect('));
    expect(effect).toMatch(/setLoaded\(null\);/);
    expect(effect).toMatch(/let cancelled = false;/);
    expect(effect).toMatch(/return \(\) => \{ cancelled = true; \};/);
    expect(effect).toMatch(/\}, \[route, state\]\);/);
  });
});

// ── W5: THE PLAN SAID THIS CAME FREE ────────────────────────────────────────────────────────────
//
// The slice reads: *"A composition stores widgets; each widget already declares `allowedRoles`; the
// served page renders the intersection. … it comes free."*
//
// The first half is true and the conclusion is false. `allowedRoles` is consulted in exactly ONE
// place in the hub — `widgetsForRoles()`, which filters the **Add Widget modal**. `WidgetCell`
// renders whatever instance it is handed and never looks at the definition's roles.
//
// That is correct for the hub and ONLY for the hub: a personal layout can only contain widgets you
// were allowed to add, so the modal is the gate. A composition breaks that assumption entirely — it
// is authored by one person and served to many, so what the AUTHOR could add says nothing about
// what the VIEWER may see.
//
// Found by building it and looking: a firm composition carrying the admin-only pending-receipts
// widget rendered it in full for an account without the admin role. Fifth premise in this project's
// planning docs to turn out false when checked rather than assumed.
//
// Verified in a browser after the fix, two accounts, one live composition:
//   admin        → weather ✓  pending-receipts ✓
//   employee     → weather ✓  pending-receipts ✗
describe('a viewer only gets the widgets they may see', () => {
  const PALETTE = read('lib/design/widget-palette.ts');

  it('the filter exists and is shared, not inlined twice', () => {
    // The preview and the real page must filter identically. A preview showing MORE than the page
    // would be worse than none: it tells a designer their layout is fine when a third of it is
    // invisible to the people it was built for.
    expect(PALETTE).toMatch(/export function visibleWidgets</);
    expect(SLOT).toMatch(/visibleWidgets\(all, roles, defs\)/);
    expect(read('app/admin/design/serve/ServedDesign.tsx')).toMatch(/visibleWidgets\(viewToGrid\(/);
  });

  it('an ungated widget reaches everyone', () => {
    const block = PALETTE.slice(PALETTE.indexOf('export function visibleWidgets'));
    expect(block).toMatch(/if \(def\.allowedRoles\.length === 0\) return true;/);
  });

  it('and an UNKNOWN widget is kept, because unknown is not forbidden', () => {
    // `WidgetCell` already renders a clear "no longer in the catalog" frame for one. Dropping it
    // here would turn a removed widget into a silent hole nobody could diagnose — and the two
    // failures must not look the same.
    const block = PALETTE.slice(PALETTE.indexOf('export function visibleWidgets'));
    expect(block).toMatch(/if \(!def\) return true;/);
  });

  it('the false claim is corrected where it was made, not only contradicted elsewhere', () => {
    // A comment in ServedDesign said widgets "hide themselves if they may not see it". That was the
    // same false belief W5 was planned on, sitting in the file that would have relied on it.
    const served = read('app/admin/design/serve/ServedDesign.tsx');
    expect(served).toMatch(/CORRECTED, W5/);
    expect(served).not.toMatch(/hides itself if\s+\/\/ they may not see it/);
  });
});
