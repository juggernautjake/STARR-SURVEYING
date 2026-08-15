// __tests__/cad/cad-integrations-reach-a-surface.test.ts
//
// C44b — the orphan check, made permanent at the level that matters.
//
// `cad-modules-are-reachable` already asks whether any production file imports a module. That is a
// necessary condition and a weak one: a module imported only by another module that nothing mounts
// passes it, and so does a parser imported by a component that is never rendered. C44a found
// exactly that case — `lib/cad/export/landxml-writer.ts` had importers in tests, a thorough test
// suite, and no path to any page or route at all.
//
// So this asks the stronger question, over the integration surface: starting at this module, can
// you get to a page or an API route — something a person or another system can invoke?
//
// **It runs the audit script's own function rather than a second copy of the walk.** Two
// implementations of one measurement is the drift this codebase keeps paying for under other names,
// and a ratchet that disagrees with the report it guards is worse than no ratchet.

import { describe, it, expect } from 'vitest';
import { auditIntegrationPoints } from '../../scripts/cad-integration-audit.mjs';

interface Row {
  module: string;
  area: string;
  entry: 'PAGE' | 'ROUTE' | 'WORKER' | 'ORPHAN';
  via: string | null;
  hops: number;
}

/**
 * Integration modules with no path to a surface, each with the reason it is allowed to stay.
 *
 * **An inventory, not an amnesty** — the same rule the sibling ratchet states. `mock-proposer` is
 * the only entry, and it is a test double: giving it a surface would mean shipping a fake AI to
 * production, which is the opposite of what the check is for.
 */
const KNOWN_UNREACHABLE: Record<string, string> = {
  'lib/cad/ai/mock-proposer.ts': 'test/dev double for the AI proposer — a surface would ship a fake AI',
};

const rows = auditIntegrationPoints() as Row[];

describe('C44b — every CAD integration point reaches a surface', () => {
  it('found the integration surface at all', () => {
    // A walk that silently returns nothing would make every assertion below vacuously true — the
    // failure mode where a guard passes because it checked nothing.
    expect(rows.length).toBeGreaterThan(50);
    expect(new Set(rows.map((r) => r.area)).size).toBeGreaterThanOrEqual(5);
  });

  it('has no unreachable module that is not written down', () => {
    const orphans = rows.filter((r) => r.entry === 'ORPHAN').map((r) => r.module);
    const undocumented = orphans.filter((m) => !(m in KNOWN_UNREACHABLE));
    expect(undocumented, `unreachable and unexplained:\n  ${undocumented.join('\n  ')}`).toEqual([]);
  });

  it('has no entry in the inventory that is no longer unreachable', () => {
    // The other half, and the half that rots. An inventory nobody prunes becomes a list of
    // permanent excuses — `cad-modules-are-reachable` has had three entries go stale this way, each
    // caught only because the guard checks both directions.
    const orphans = new Set(rows.filter((r) => r.entry === 'ORPHAN').map((r) => r.module));
    const stale = Object.keys(KNOWN_UNREACHABLE).filter((m) => !orphans.has(m));
    expect(stale, `now reachable — remove from KNOWN_UNREACHABLE:\n  ${stale.join('\n  ')}`).toEqual([]);
  });

  it('names a real file for every module it resolved', () => {
    for (const r of rows) {
      if (r.entry === 'ORPHAN') continue;
      expect(r.via, `${r.module} claims ${r.entry} with no path`).toBeTruthy();
      expect(r.hops, `${r.module} resolved in zero hops`).toBeGreaterThan(0);
    }
  });

  it('records that the second LandXML writer is gone', () => {
    // C44b's decision, pinned so it cannot quietly come back: two writers for one format is the
    // "two vocabularies for one job" pattern, and the surviving one is the one that ships.
    expect(rows.some((r) => r.module.startsWith('lib/cad/export/'))).toBe(false);
    expect(rows.some((r) => r.module === 'lib/cad/delivery/landxml-writer.ts')).toBe(true);
  });
});
