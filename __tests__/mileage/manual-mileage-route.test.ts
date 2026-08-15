// __tests__/mileage/manual-mileage-route.test.ts — the manual-odometer POST route + Work Mode Save wiring (D6).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/admin/mileage/manual/route.ts'), 'utf8');
const workspace = readFileSync(join(process.cwd(), 'app/admin/work-mode/field_crew/_components/FieldCrewWorkspace.tsx'), 'utf8');

describe('manual-mileage POST route', () => {
  it('requires auth and resolves the caller’s org', () => {
    expect(route).toContain('export const POST');
    expect(route).toMatch(/Unauthorized/);
    expect(route).toContain('default_org_id');
  });
  it('computes miles + reimbursement from the shared resolveOdometerEntry (no second rate)', () => {
    expect(route).toContain('resolveOdometerEntry');
    expect(route).toContain("if ('error' in resolved)"); // a bad entry is a 400, never a saved line
  });
  // ── CORRECTED 2026-08-15 (C0b3) ───────────────────────────────────────────────────────────────
  //
  // The two assertions removed here were asserting the BUG. This test demanded
  // `source: 'odometer'` and `total_cents: Math.round(…)`, and the live database rejects both:
  // `source` has CHECK (source IN ('manual','derived_pings','api_import')), and `total_cents` is
  // GENERATED ALWAYS. Every manual mileage save 500'd, and `mileage_entries` held 0 rows in
  // production — while this file stayed green, because a source scan only ever proves the source
  // says what the test says it says.
  //
  // Kept as a source scan rather than deleted (mocking Supabase would re-create the same blind
  // spot), but now pointed at the shape Postgres actually accepts. The odometer/typed/lookup
  // distinction moved to `distance_source`, which has a constraint that permits it.
  it('writes a mileage_entries row scoped to the caller, in a shape Postgres accepts', () => {
    expect(route).toContain("from('mileage_entries')");
    expect(route).toContain("source: 'manual'");
    expect(route).toContain('user_email: email');
    expect(route).toContain('rate_cents_per_mile:');
    expect(route).toContain('distance_source:');
  });

  it('never writes the generated total_cents column', () => {
    expect(route).not.toMatch(/total_cents\s*:\s*Math\.round/);
  });
});

describe('Work Mode mileage Save wiring', () => {
  it('the tracker POSTs the odometer readings and confirms the logged trip', () => {
    expect(workspace).toContain("fetch('/api/admin/mileage/manual'");
    expect(workspace).toContain('Log this trip');
    expect(workspace).toMatch(/to the mileage report/);
  });
});
