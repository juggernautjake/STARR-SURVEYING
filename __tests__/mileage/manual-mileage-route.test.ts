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
  it('writes a source="odometer" mileage_entries row scoped to the caller', () => {
    expect(route).toContain("from('mileage_entries')");
    expect(route).toContain("source: 'odometer'");
    expect(route).toContain('user_email: email');
    expect(route).toContain('rate_cents_per_mile: Math.round(resolved.rate * 100)');
    expect(route).toContain('total_cents: Math.round(resolved.reimbursement * 100)');
  });
});

describe('Work Mode mileage Save wiring', () => {
  it('the tracker POSTs the odometer readings and confirms the logged trip', () => {
    expect(workspace).toContain("fetch('/api/admin/mileage/manual'");
    expect(workspace).toContain('Log this trip');
    expect(workspace).toMatch(/to the mileage report/);
  });
});
