import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan RESEARCH_SYSTEM_COMPLETION F2 — the per-project all-phases spend endpoint reads the ledger,
// not the worker's in-memory accumulator, so gather + analyze cost is never invisible.
const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/research/[projectId]/cost/route.ts'), 'utf8');

describe('the per-project cost route', () => {
  it('sums the research_usage_events ledger by research_project_id', () => {
    expect(route).toMatch(/from\('research_usage_events'\)/);
    expect(route).toMatch(/\.eq\('research_project_id', projectId\)/);
    expect(route).toMatch(/cost_usd/);
  });
  it('returns a total plus a per-event_type breakdown', () => {
    expect(route).toMatch(/totalUsd/);
    expect(route).toMatch(/byEventType/);
  });
  it('requires auth', () => {
    expect(route).toMatch(/await auth\(\)/);
    expect(route).toMatch(/401/);
  });
});
