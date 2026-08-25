// __tests__/design/observed-states.test.ts
//
// V2 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"each page that has tabs and things that close elements and reveals different info and
// stuff has its own like, sub page listed."*
//
// The walk finds a page's states so nobody has to type them out — a hand-maintained list of tabs is
// wrong the first time somebody adds one.
//
// ── WHAT THIS FILE IS REALLY GUARDING ───────────────────────────────────────────────────────────
//
// Every rule below was found by RUNNING it against the real product and reading what came back
// wrong. None of them was predicted:
//
//   `-tab` matched `-table`          → four table headers and a paragraph became "states"
//   requiring a boundary BEFORE      → `job-detail__tab` stopped matching, /admin/settings went 6→0
//   `payroll-tabs__btn`              → a third convention, plural stem with `__btn` items
//   `tabs__` alone                   → matched a hint paragraph inside the tab strip
//
// The DOM is the only source of truth about which of these shapes this codebase actually uses, so
// the rule is pinned here against the strings it has to accept and reject.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const OBSERVE_SRC = fs.readFileSync(path.join(ROOT, 'scripts/lib/design-observe.mjs'), 'utf8');
const DERIVE_ROUTE = fs.readFileSync(path.join(ROOT, 'app/api/admin/design/dossier/derive/route.ts'), 'utf8');
const SEED = fs.readFileSync(path.join(ROOT, 'seeds/616_design_dossier_states.sql'), 'utf8');

/** The class rule, lifted from the walk so it can be tested without a browser. */
const TAB_CLASS = /(__tab|-tab)([^a-z]|$)|tabs?__/;

describe('the tab-class rule', () => {
  const accepts = [
    'job-detail__tab',          // the stem itself — /admin/settings
    'job-detail__tab--active',  // with a modifier
    'billing-tab',              // a dashed stem
    'payroll-tabs__btn',        // plural container, `__btn` items — /admin/payroll
    'mkt-tabs__tab',            // both at once
  ];
  for (const c of accepts) {
    it(`accepts ${c}`, () => expect(TAB_CLASS.test(c)).toBe(true));
  }

  const rejects = [
    'mkt-table',        // the original false positive: `-tab` + a letter is a different word
    'data-table',
    'admin-table__row', // `table__` must not be read as `tabs__`
    'tabular-figures',
  ];
  for (const c of rejects) {
    it(`rejects ${c}`, () => expect(TAB_CLASS.test(c)).toBe(false));
  }
});

describe('a state is something you can click', () => {
  it('the walk requires a button, an anchor, or role=tab', () => {
    // `tabs__` matches every child of a tab strip, and /admin/marketing has a hint paragraph in
    // there — "Funnel, cost per stage, attribution coverage." was recorded as a tab. The class says
    // where an element lives; the tag says whether it is a control.
    // Anchored WITHOUT the trailing full stop: the heading gained a clause when rule 3 was gated,
    // `indexOf` returned -1, and `slice(-1)` handed the assertion the file's last character. A test
    // pinned to prose fails for the one reason that teaches nothing — the fourth time in this
    // plan that a comment edit broke an assertion about the code beneath it.
    const block = OBSERVE_SRC.slice(OBSERVE_SRC.indexOf("// 3 — the app's own tab convention"));
    expect(block).not.toBe('\n');
    expect(block).toMatch(/tag !== 'button' && tag !== 'a' && el\.getAttribute\('role'\) !== 'tab'/);
  });

  it('and rule 3 stands down when the page declares a real tablist', () => {
    // /admin/hours has six portal tabs and four more INSIDE its Approvals panel (`tl-tabs__btn`).
    // Rule 3 matched the inner four and the route was recorded as having ten states — four of them
    // unreachable by construction, because `?tab=pending` means nothing to the outer strip and
    // clicking one leaves Approvals selected. A state of a state is not a state of the route.
    expect(OBSERVE_SRC).toMatch(/const hasRealTablist = states\.length > 1;/);
    expect(OBSERVE_SRC).toMatch(/for \(const el of hasRealTablist \? \[\] : root\.querySelectorAll\(/);
  });
});

describe('addressable is honest', () => {
  it("is 'yes' or 'unknown', and never 'no'", () => {
    // A tab written as `<a href="?tab=x">` proves itself. A tab written as a `<button>` calling
    // `router.replace` — which is what /admin/billing does, correctly — is indistinguishable from
    // the DOM from one holding its state in a variable. Saying "not addressable" about the first
    // would be false, and /admin/billing had just been given `?tab=` on purpose.
    expect(OBSERVE_SRC).toMatch(/addressable: addressable \? 'yes' : 'unknown'/);
    expect(OBSERVE_SRC).not.toMatch(/addressable: 'no'/);
  });
});

describe('the states survive the trip to the database', () => {
  it('the sanitiser keeps them', () => {
    // The first run of V2 recorded ZERO states while reporting success on every page: the walk found
    // them, the type carried them, the column existed, and `sane()` — an allowlist, correctly —
    // dropped them on the way past. Third time this session a field added at one end of a pipeline
    // and not the other produced an empty that looked legitimate.
    expect(DERIVE_ROUTE).toMatch(/states: arr</);
    expect(DERIVE_ROUTE).toMatch(/stateParam:/);
  });

  it('and validates them rather than passing them through', () => {
    // `kind` and `addressable` are small closed sets. A row with a bad one would be stored forever.
    expect(DERIVE_ROUTE).toMatch(/st\.kind === 'tab' \|\| st\.kind === 'disclosure'/);
    expect(DERIVE_ROUTE).toMatch(/st\.addressable === 'yes' \|\| st\.addressable === 'unknown'/);
  });

  it('there is a column to keep them in', () => {
    expect(SEED).toMatch(/ADD COLUMN IF NOT EXISTS states JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("the upserts target the dossier's real key, which is composite now", () => {
    // Seed 615 changed the dossier PK from (route) to (route, state_key), and the upserts still said
    // ON CONFLICT (route). Every derive failed with "no unique or exclusion constraint matching" —
    // a break introduced by V1 that only running the deriver revealed.
    const server = fs.readFileSync(path.join(ROOT, 'lib/design/dossier-server.ts'), 'utf8');
    expect(server).not.toMatch(/onConflict: 'route'\s*\}/);
    expect((server.match(/onConflict: 'route,state_key'/g) ?? []).length).toBe(2);
  });
});

// ── V4: A DEFAULT PER STATE ─────────────────────────────────────────────────────────────────────
//
// Owner: *"I need each actual page to have a default for all tabs and everything."*
describe('tracing a state', () => {
  const TRACER = fs.readFileSync(path.join(ROOT, 'scripts/trace-defaults.mjs'), 'utf8');
  const SERVER = fs.readFileSync(path.join(ROOT, 'lib/design/server.ts'), 'utf8');

  it('checks it actually got there before storing anything', () => {
    // The whole risk of this slice. If a click misses or a `?tab=` is ignored, every state captures
    // the SAME tab and the product gets six identical defaults with six different names — worse than
    // none, because they look like a finished job. `/admin/settings` came back 28 / 31 / 18 / 21 /
    // 31 / 18 elements, which is what a working one looks like.
    //
    // The check moved into `openState` in V6, which returns false rather than throwing: not
    // reaching a tab is a normal outcome (`/admin/my-pay` nests three states inside another tab and
    // no URL reaches them from outside), and the caller decides what it means.
    const block = TRACER.slice(TRACER.indexOf('const states = WITH_STATES'));
    expect(block).toMatch(/if \(!await openState\(page, BASE, target\.route, st\)\) break;/);
    expect(block).toMatch(/could not reach it — not stored/);
  });

  it('asks the observer which state is showing, rather than deciding for itself', () => {
    // The first version had its own rule and returned "settings" on every tab of /admin/settings —
    // the first element in the content with `--active` in its class is the BREADCRUMB. Every state
    // was reported unreachable and none was stored. Fourth time in one session that two ends of a
    // pair answered the same question differently.
    //
    // V6 finished the job: the tracer no longer holds ANY of this, not the check and not the click.
    // Both live beside `SELECTED_STATE`, the rule they have to agree with.
    expect(TRACER).toMatch(/import \{ waitForPageReady, openState \}/);
    expect(TRACER).not.toMatch(/SELECTED_STATE/);
    expect(OBSERVE_SRC).toMatch(/export const SELECTED_STATE = \(\) => \{/);
    expect(OBSERVE_SRC).toMatch(/export async function openState\(page, base, route, state/);
  });

  it('and the opener matches a tab by label OR by slugged key, because its callers differ', () => {
    // The tracer holds a full state record (`{ key, label }`); the conformance sweep starts from a
    // stored design and has only the key. Each had its own click helper matching a different field
    // — `label.toLowerCase()` in one, `slug(text)` in the other. They happened to agree, which is
    // the setup for the bug rather than the absence of it.
    const block = OBSERVE_SRC.slice(OBSERVE_SRC.indexOf('export async function clickState'));
    expect(block).toMatch(/if \(label && t\.toLowerCase\(\) === String\(label\)\.toLowerCase\(\)\)/);
    expect(block).toMatch(/if \(slug\(t\) === key\)/);
  });

  it('requires a tab to be BOTH tab-classed and marked active', () => {
    const sel = OBSERVE_SRC.slice(OBSERVE_SRC.indexOf('export const SELECTED_STATE'));
    expect(sel).toMatch(/TAB_CLASS\.test\(c\)/);
    expect(sel).toMatch(/--active\|--on\|is-on\|is-active/);
  });

  it('re-tracing one tab does not retire another', () => {
    // `writeDefault` soft-deletes the design it replaces. Scoped to the route alone, tracing the
    // invoices tab would have retired the overview's default — six tabs would leave one design, the
    // last one written, and nothing would say why.
    const block = SERVER.slice(SERVER.indexOf('export async function writeDefault'));
    expect(block).toMatch(/\.eq\('state_key', stateKey\)/);
  });

  it('and the database enforces one default per state, not per route', () => {
    // Seed 615's comment claimed this rule lived in lifecycle.ts. It did not — seed 612 had made two
    // real unique indexes on (route), and they refused every per-tab default with "duplicate key
    // value violates unique constraint". Found by running the tracer, not by reading the schema.
    const s617 = fs.readFileSync(path.join(ROOT, 'seeds/617_design_one_default_per_state.sql'), 'utf8');
    expect(s617).toMatch(/DROP INDEX IF EXISTS public\.idx_design_mockups_one_default_per_route/);
    expect(s617).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_design_mockups_one_default_per_state[\s\S]{0,120}\(route, state_key\)/);
    // And the wrong claim is corrected where it was made, not just contradicted elsewhere.
    const s615 = fs.readFileSync(path.join(ROOT, 'seeds/615_design_state_key.sql'), 'utf8');
    expect(s615).toMatch(/CORRECTED 2026-08-25/);
  });
});
