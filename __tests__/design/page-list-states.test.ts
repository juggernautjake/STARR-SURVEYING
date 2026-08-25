// __tests__/design/page-list-states.test.ts
//
// V3 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"we will have the main page, and then it will have multiple views available for each
// toggled option so that I can edit each one individually if needed."*
//
// ── THE MISTAKE THIS IS GUARDING ────────────────────────────────────────────────────────────────
//
// A design of the invoices TAB must not be counted as a design of the ROUTE. That conflation is
// exactly what V1 existed to end, and doing it here would put it straight back on the screen — with
// `/admin/billing` reporting four designs and a lifecycle assembled from four different things.
// `joinPages` keys by (route, state) for that reason, and this is where that stays true.

import { describe, it, expect } from 'vitest';
import { joinPages } from '@/lib/design/pages';

const REVIEWS: never[] = [];

/** The route the fixtures are about. Real, so a change to the inventory surfaces here. */
const ROUTE = '/admin/billing';

const design = (id: string, stateKey: string, status: string) => ({
  id, name: `${ROUTE} ${stateKey} ${status}`, route: ROUTE, status, locked: status === 'default', stateKey,
});

const dossier = (states: Array<{ key: string; label: string; kind: string }>) => ([{
  route: ROUTE, purpose: 'Pay for the software', summary: null, elementCount: 11, states,
}]);

const rowFor = (designs: Parameters<typeof joinPages>[1], dossiers: Parameters<typeof joinPages>[2]) =>
  joinPages(REVIEWS, designs, dossiers).find((p) => p.route === ROUTE)!;

describe('a tab is listed under its route, not beside it', () => {
  const STATES = [
    { key: 'overview', label: 'Overview', kind: 'tab' },
    { key: 'invoices', label: 'Invoices', kind: 'tab' },
    { key: 'history', label: 'Plan history', kind: 'tab' },
  ];

  it('gives each state its own row', () => {
    const row = rowFor([], dossier(STATES));
    expect(row.states.map((s) => s.key)).toEqual(['overview', 'invoices', 'history']);
  });

  it('keeps the label, because a key is not what a person reads', () => {
    expect(rowFor([], dossier(STATES)).states[2].label).toBe('Plan history');
  });

  it('is empty for a route with no states, which is most of them', () => {
    const row = rowFor([], [{ route: ROUTE, purpose: null, summary: null, elementCount: 0 }]);
    expect(row.states).toEqual([]);
  });
});

describe("a tab's design belongs to the tab", () => {
  const STATES = [{ key: 'invoices', label: 'Invoices', kind: 'tab' }];

  it('does not count toward the route', () => {
    // The whole point. Before V1 there was one design row per route and it described whichever tab
    // happened to be showing; counting a tab's design as the route's would restore that on screen.
    const row = rowFor([design('d-tab', 'invoices', 'default')], dossier(STATES));
    expect(row.designs).toEqual([]);
    expect(row.lifecycle.default).toBeNull();
    expect(row.states[0].lifecycle.default?.id).toBe('d-tab');
  });

  it('and the route\'s design does not count toward the tab', () => {
    const row = rowFor([design('d-route', '', 'default')], dossier(STATES));
    expect(row.lifecycle.default?.id).toBe('d-route');
    expect(row.states[0].lifecycle.default).toBeNull();
  });

  it('each carries its own alternatives and drafts', () => {
    const row = rowFor([
      design('d-route', '', 'default'),
      design('d-tab', 'invoices', 'default'),
      design('d-tab-alt', 'invoices', 'alternative'),
      design('d-tab-draft', 'invoices', 'draft'),
    ], dossier(STATES));
    expect(row.lifecycle.alternatives).toBe(0);
    expect(row.states[0].lifecycle.alternatives).toBe(1);
    expect(row.states[0].lifecycle.drafts).toBe(1);
  });
});

describe('the gaps a state can have', () => {
  const STATES = [{ key: 'invoices', label: 'Invoices', kind: 'tab' }];

  it('says when a tab has no trace', () => {
    // `/admin/my-pay` has three of these — states nested inside another tab, which the tracer
    // refuses rather than storing a wrong capture. A silent gap is one nobody schedules.
    expect(rowFor([], dossier(STATES)).states[0].gaps).toContain('no-default');
  });

  it('now DOES ask a tab for its own dossier, because V6 built the thing that answers', () => {
    // ── A DELIBERATE REVERSAL, AND WHY ────────────────────────────────────────────────────────
    //
    // V3 suppressed this gap and this test asserted the suppression. That was right at the time:
    // the dossier was written per ROUTE, so a `no-dossier` chip on every tab would have invented a
    // queue of 78 rows nobody could empty.
    //
    // V6 taught the deriver to visit one tab at a time, so the row can exist and the gap became
    // real work. A suppressed gap is only honest for as long as it is unfixable — left in place it
    // would now be hiding the queue instead of declining to invent one.
    const row = rowFor([], dossier(STATES));
    expect(row.states[0].gaps).toContain('no-dossier');
  });

  it('and stops saying it once that tab has been derived', () => {
    // The measured route-level dossier plus a measured dossier FOR THE TAB. The tab's own row is
    // what clears the tab's own gap: a measured route with an underived tab still has the gap,
    // which is the case the reversal above exists to surface.
    const withTab = [
      ...dossier(STATES),
      { route: ROUTE, stateKey: 'invoices', purpose: 'Every invoice', summary: null, elementCount: 31, states: [] },
    ];
    expect(rowFor([], withTab).states[0].gaps).not.toContain('no-dossier');
  });

  it('is clean once the tab has been traced, derived, and something is active', () => {
    const withTab = [
      ...dossier(STATES),
      { route: ROUTE, stateKey: 'invoices', purpose: 'Every invoice', summary: null, elementCount: 31, states: [] },
    ];
    const row = rowFor([
      design('d-tab', 'invoices', 'default'),
      design('d-tab-live', 'invoices', 'active'),
    ], withTab);
    expect(row.states[0].gaps).toEqual([]);
  });

  it("a tab's dossier is never mistaken for the route's", () => {
    // The Map that held these was keyed on `route` alone. Six rows sharing a key means the LAST one
    // wins, so `/admin/settings`'s own element count and purpose would silently have become
    // whichever tab came last out of the database — no error, no empty, just another page's numbers
    // under this page's name.
    const withTab = [
      ...dossier(STATES),
      { route: ROUTE, stateKey: 'invoices', purpose: 'Every invoice', summary: null, elementCount: 31, states: [] },
    ];
    const row = rowFor([], withTab);
    expect(row.dossier?.elementCount).toBe(11);
    expect(row.dossier?.purpose).toBe('Pay for the software');
    expect(row.states[0].dossier?.elementCount).toBe(31);
  });
});
