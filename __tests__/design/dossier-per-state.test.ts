// __tests__/design/dossier-per-state.test.ts
//
// V6 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"I need each actual page to have a default for all tabs and everything."*
//
// ── WHAT V6 IS, AND WHY IT COULD NOT BE SKIPPED ─────────────────────────────────────────────────
//
// V4 gave every tab its own DEFAULT DESIGN. V5 taught the conformance check to follow it. Both
// stopped at the design. The DOSSIER — what is actually on the page, what it calls, what its
// checklist asks for — was still written once per route, so a tabbed page ended up in a state that
// looked finished and was not:
//
//   · six designs, one inventory. The invoices tab has 31 elements and the overview 18, and one row
//     had to report one of those numbers as both.
//   · six designs, ONE CHECKLIST — generated from whichever tab the walk happened to land on, so
//     the invoices tab was measured against the overview tab's requirements.
//
// The plan's own §8 called the checklist half of V5 blocked on this. It was not blocked; it was
// out of order. This is the slice that unblocks it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { code } from '../helpers/source';
import { generateChecklist, idFor } from '@/lib/design/checklist';
import { mergeDossier } from '@/lib/design/dossier';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SERVER = read('lib/design/dossier-server.ts');
const DESIGN_SERVER = read('lib/design/server.ts');
const DERIVER = read('scripts/derive-dossiers.mjs');
const OBSERVE = read('scripts/lib/design-observe.mjs');

// ── THE ID, WHICH IS WHERE THE DAMAGE WOULD HAVE BEEN ───────────────────────────────────────────

describe('a checklist item id carries its state', () => {
  it('two tabs of one route do not share an item', () => {
    // The id is the primary key of the item and the foreign key of every tick against it. Shared,
    // `/admin/settings`'s six tabs would generate six rows called `ck-admin-settings-universal-0`
    // and a tick on one tab would appear, already ticked, on the other five. A shared tick reads as
    // work already done — the worst failure a checklist has, because it does not lose the record,
    // it manufactures a false one.
    expect(idFor('/admin/billing', 'universal-0', 'invoices'))
      .not.toBe(idFor('/admin/billing', 'universal-0', 'overview'));
  });

  it('and the route as a whole keeps the id it already had', () => {
    // 468 dossiers predate V6 and their ticks point at ids with no state in them. A new suffix on
    // the empty state would have silently reset the entire product's checklist progress to zero —
    // and it would have looked like nobody had ever ticked anything, not like a bug.
    expect(idFor('/admin/jobs', 'universal-0')).toBe('ck-admin-jobs-universal-0');
    expect(idFor('/admin/jobs', 'universal-0', '')).toBe('ck-admin-jobs-universal-0');
  });

  it('so a generated checklist is different for each tab', () => {
    const at = (stateKey: string) => generateChecklist(
      mergeDossier('/admin/billing', null, { elements: [], functions: [] }, stateKey),
    );
    const overview = at('overview').map((i) => i.id);
    const invoices = at('invoices').map((i) => i.id);
    expect(overview.length).toBeGreaterThan(0);
    expect(overview.some((id) => invoices.includes(id))).toBe(false);
  });

  it('and every item says which state it belongs to', () => {
    // Read from the dossier rather than passed in beside it: one fact, one source. The row is what
    // `listItems` filters on, so an item whose `stateKey` disagreed with the row it was written to
    // would be invisible to every read.
    const items = generateChecklist(
      mergeDossier('/admin/billing', null, { elements: [], functions: [] }, 'invoices'),
    );
    expect(items.every((i) => i.stateKey === 'invoices')).toBe(true);
  });
});

// ── THE READS AND WRITES, WHICH ALL HAD TO MOVE TOGETHER ────────────────────────────────────────

describe('every read and write is scoped to the state', () => {
  it('getDossier no longer asks for "the route\'s" dossier', () => {
    // `.eq('route', route).maybeSingle()` was correct while `route` was the whole primary key, and
    // became a live fault the moment a second row existed for the same route: PostgREST answers
    // "multiple rows returned" and this throws. Every tabbed page's dossier panel would have broken
    // on the day its first tab was derived.
    expect(SERVER).toMatch(/export async function getDossier\(route: string, stateKey = ''\)/);
    expect(SERVER).toMatch(/\.eq\('route', route\)\.eq\('state_key', stateKey\)\.maybeSingle\(\)/);
  });

  it('listItems is scoped, or a tab would show every tab\'s items', () => {
    expect(SERVER).toMatch(/export async function listItems\(route: string, stateKey = ''\)/);
    expect(SERVER).toMatch(/\.eq\('route', route\)\.eq\('state_key', stateKey\)\s*\n\s*\.is\('deleted_at', null\)\.order\('sort'\)/);
  });

  it('regenerating one tab does not delete another tab\'s items', () => {
    // The single most destructive thing in this slice. `stale` is "every generated row for this
    // route the new list does not contain" — computed against the route, deriving the invoices tab
    // would have HARD-deleted the overview tab's items, and their ticks with them by cascade. Six
    // tabs derived in a row would leave one checklist, the last written, and no error anywhere.
    const block = SERVER.slice(SERVER.indexOf('export async function regenerateChecklist'));
    expect(block).toMatch(/\.eq\('route', dossier\.route\)\.eq\('state_key', dossier\.stateKey\)/);
    expect(block).toMatch(/state_key: g\.stateKey,/);
  });

  it('a custom item is added to the tab it was typed on', () => {
    const block = SERVER.slice(SERVER.indexOf('export async function addCustomItem'));
    expect(block).toMatch(/idFor\(route, label, stateKey\)/);
    expect(block).toMatch(/state_key: stateKey,/);
    // Numbered after this tab's last item, not after whichever tab has the most rows.
    expect(block).toMatch(/\.eq\('route', route\)\.eq\('state_key', stateKey\)\s*\n\s*\.order\('sort'/);
  });

  it('the authored half can be written for a tab too', () => {
    // "What the invoices tab is for" is a different sentence from "what the billing page is for",
    // and until V6 there was nowhere to put the first one — `saveAuthored` hardcoded `''`.
    expect(SERVER).toMatch(/state_key: stateKey, authored_by: email/);
  });
});

// ── THE DESIGN SIDE, WHERE THE SAME OMISSION WAS ALREADY LIVE ───────────────────────────────────

describe('cloning a tab\'s default gives you a design of that tab', () => {
  it('the clone copies the state', () => {
    // A live bug found while writing V6, not predicted. The owner's flow for a tab is exactly
    // "open its default, clone it, edit the clone" — and the clone came out attached to the ROUTE,
    // so an edited invoices tab would be offered as the design of record for the whole billing
    // page. Not an error and not an empty: a design filed one level up from where it was made.
    const block = DESIGN_SERVER.slice(DESIGN_SERVER.indexOf('export async function cloneMockup'));
    expect(block).toMatch(/state_key: source\.state_key \?\? '',/);
  });

  it('and a document knows which state it is of, so nobody has to be told', () => {
    // The checklist endpoint reads the state off the DESIGN rather than off a query parameter. A
    // design belongs to exactly one state, so asking the caller would be asking a question the data
    // already answers — and two answers to one question is how the conformance endpoint and its
    // sweep drifted apart in V4.
    expect(DESIGN_SERVER).toMatch(/stateKey: row\.state_key \?\? '',/);
    const api = read('app/api/admin/design/checklist/route.ts');
    expect(api).toMatch(/checklistFor\(doc\.route, designId, doc, doc\.stateKey \?\? ''\)/);
  });
});

// ── THE WALK ────────────────────────────────────────────────────────────────────────────────────

describe('the deriver visits each tab', () => {
  it('behind a flag, because it multiplies the walk', () => {
    expect(DERIVER).toMatch(/const WITH_STATES = process\.argv\.includes\('--states'\)/);
  });

  it('posts the state it verified it reached', () => {
    // The observation cannot say which tab it is of: the tab strip looks identical from every tab,
    // so `observed.states` lists all six whichever one you are standing in. Only the walker knows,
    // because it is the one that clicked and then checked.
    expect(DERIVER).toMatch(/const reached = await openState\(page, BASE, target\.route, st/);
    expect(DERIVER).toMatch(/could not reach it — not derived/);
    expect(DERIVER).toMatch(/stateKey: st\.key,/);
  });

  it('and does not let a tab claim states of its own', () => {
    // Stored, `/admin/settings?tab=billing` would report six states of its own and the page list
    // would draw tabs nested inside tabs, forever. A state's states are the route's states, and the
    // route already records them.
    const block = DERIVER.slice(DERIVER.indexOf('if (WITH_STATES && observed.states'));
    expect(block).toMatch(/states: \[\],/);
  });

  it('listens for each tab\'s OWN network calls', () => {
    // The endpoints are the most useful half of a dossier: `GET /api/admin/invoices` firing when
    // you open the invoices tab is the clearest single statement of what that tab is for. Collected
    // across the whole route they would be attributed to all six tabs equally, which says nothing
    // about any of them.
    const block = DERIVER.slice(DERIVER.indexOf('if (WITH_STATES && observed.states'));
    expect(block).toMatch(/const stateRequests = \[\]/);
    expect(block).toMatch(/requests: stateRequests,/);
  });

  it('and the endpoint refuses to take the walker\'s word for an unbounded key', () => {
    const derive = read('app/api/admin/design/dossier/derive/route.ts');
    expect(derive).toMatch(/body\.stateKey\.slice\(0, 64\)/);
    // `\s*` and not `\n\s*`: these files are CRLF, and `\n` immediately after the comma does not
    // match `\r\n`. My own assertion was the failure the first time this ran.
    expect(derive).toMatch(/stateKey,\s*\}\);/);
  });
});

describe('opening a state is one function', () => {
  it('the observer owns it, next to the rule it has to agree with', () => {
    expect(OBSERVE).toMatch(/export async function openState\(page, base, route, state/);
    expect(OBSERVE).toMatch(/export async function clickState\(page, state\)/);
    expect(OBSERVE).toMatch(/export async function selectedStateKey\(page\)/);
  });

  it('and returns false rather than throwing, because not reaching a tab is normal', () => {
    // `/admin/my-pay` has three states nested INSIDE another tab and no URL reaches them from the
    // outside. The tracer skips and says so; the sweep counts a failed check. What none of them may
    // do is proceed as though it worked.
    const block = OBSERVE.slice(OBSERVE.indexOf('export async function openState'));
    expect(block).toMatch(/on === state\.key/);
    expect(block).toMatch(/return false;/);
    expect(block).not.toMatch(/throw new Error/);
  });

  it('and waits for the state to arrive rather than sleeping a fixed guess', () => {
    // Three tabs came back "could not reach it" from a full sweep and then opened first try when
    // probed alone: equipment · cleanup-queue, jobs · activity, marketing · connection-uploads.
    // Nothing was wrong with any of them — a dev server compiling a panel on demand does not answer
    // inside a flat 1200ms, and the check read the tab that was still showing. The same fixed-wait
    // trap once made the route walk store 4 of 51 pages instead of 26. A sleep encodes a guess
    // about the slowest machine on its worst run, and its failure is indistinguishable from a tab
    // that genuinely cannot be opened — which is how three of these were nearly written down as a
    // structural finding.
    const block = OBSERVE.slice(OBSERVE.indexOf('export async function openState'));
    expect(block).toMatch(/while \(on !== want && Date\.now\(\) < deadline\)/);
  });

  it('and retries the click, because a strip can render late', () => {
    // The polling fix left a race the poll could not see. The code read
    // `if (on !== key && await clickState(...))`, so when `clickState` found no element the `&&`
    // short-circuited and the generous wait after it never ran — a late tab strip failed with a
    // budget it never touched.
    //
    // What proved it was not tab-specific: after the fix about one state per portal still failed and
    // THE FAILING TAB MOVED between runs — cleanup-queue, then maintenance, then activity. A failure
    // that changes address is a race, not a property of the thing it lands on.
    const block = OBSERVE.slice(OBSERVE.indexOf('export async function openState'));
    expect(block).toMatch(/for \(let attempt = 0; attempt < 3 && on !== state\.key; attempt \+= 1\)/);
    // The short-circuit must not come back: a failed click has to continue the loop, not end it.
    expect(block).not.toMatch(/on !== state\.key && await clickState/);
  });

  it('and reads the readiness answer instead of throwing it away', () => {
    // The residual flake, diagnosed by instrument rather than argument:
    //
    //   !! openState(/admin/equipment · templates) failed — showing "null"
    //      {"tabCount":0,"keys":[],"selected":[],"url":"?tab=templates","bodyChars":13}
    //
    // Thirteen characters of text in the content root and not one tab. The page had not arrived.
    // `openState` called `waitForPageReady` and DISCARDED its boolean, while the route walk twenty
    // lines away checks it — so a page that never rendered was treated as ready and the code went
    // hunting for a tab on it. Three earlier fixes all aimed at the last step of a sequence whose
    // first step had silently failed, and each looked like it worked because an intermittent fault
    // confirms whatever ships the moment it moves.
    const block = code(OBSERVE).slice(code(OBSERVE).indexOf('export async function openState'));
    expect(block).toMatch(/ready = await waitForPageReady\(page\)/);
    expect(block).toMatch(/if \(!ready\)/);
    // And it must not be able to go back to discarding it.
    expect(block).not.toMatch(/^\s*await waitForPageReady\(page\);\s*$/m);
  });
});
