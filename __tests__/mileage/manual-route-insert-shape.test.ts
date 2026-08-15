// __tests__/mileage/manual-route-insert-shape.test.ts
//
// C0b3 — a regression guard on the INSERT shape of /api/admin/mileage/manual.
//
// ── WHY THIS TEST IS A SOURCE SCAN AND NOT A UNIT TEST ──────────────────────────────────────────
//
// The bug it guards was invisible to every kind of test that does not touch Postgres. The route
// listed `total_cents` in its insert; that column is `GENERATED ALWAYS AS (...) STORED` (seed 282),
// and Postgres rejects any non-DEFAULT write to a generated column. It also sent
// `source: 'odometer'`, which the table's CHECK constraint does not permit.
//
// Both failures live entirely in the shape of an object handed to the Supabase client. Mocking that
// client — the only way to unit-test this route — asserts the mock accepted the object, which it
// always will. The real database was the only thing that ever objected, and it objected on every
// single save: `mileage_entries` held 0 rows in production, verified 2026-08-15.
//
// So the check is: does the source still name the columns that made it fail? Cheap, and it fails
// loudly the moment someone re-adds them.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(
  join(process.cwd(), 'app/api/admin/mileage/manual/route.ts'),
  'utf8',
);

/** The object literal passed to `.insert({ … })`, which is the only part that reaches Postgres. */
const insertBlock = (() => {
  const start = route.indexOf('.insert({');
  expect(start, 'the route should still insert a mileage_entries row').toBeGreaterThan(-1);
  const end = route.indexOf('})', start);
  return route.slice(start, end);
})();

describe('the manual mileage insert', () => {
  it('does not write total_cents — the database generates it', () => {
    // `GENERATED ALWAYS AS ((miles * rate_cents_per_mile)::INTEGER) STORED`. Sending it is not a
    // redundancy that Postgres tolerates; it is an error that fails the whole statement.
    expect(insertBlock).not.toMatch(/\btotal_cents\s*:/);
  });

  it("uses a source the CHECK constraint permits", () => {
    // CHECK (source IN ('manual','derived_pings','api_import')). 'odometer' was not among them —
    // that distinction now lives in `distance_source`, which has its own constraint allowing it.
    expect(insertBlock).not.toMatch(/source\s*:\s*'odometer'/);
    expect(insertBlock).toMatch(/source\s*:\s*'manual'/);
  });

  it('records how the distance was arrived at', () => {
    expect(insertBlock).toMatch(/distance_source\s*:/);
  });

  it('persists the address pair and the fuel snapshot the owner asked for', () => {
    for (const col of [
      'start_address',
      'end_address',
      'vehicle_id',
      'mpg_snapshot',
      'fuel_price_cents',
      'fuel_cost_cents',
    ]) {
      expect(insertBlock, `${col} should be written`).toMatch(new RegExp(`\\b${col}\\s*:`));
    }
  });

  it('still writes the IRS rate, so reimbursement and the tax report are unaffected', () => {
    // D9: the fuel figures are ADDITIVE. If this ever stops being written, total_cents — which the
    // payouts tax report reads — silently becomes 0 for every new trip.
    expect(insertBlock).toMatch(/rate_cents_per_mile\s*:/);
  });
});

describe('the two ways to enter a trip', () => {
  it('accepts a typed/looked-up distance as well as odometer readings', () => {
    expect(route).toMatch(/body\?\.distance/);
    expect(route).toMatch(/resolveOdometerEntry/);
  });

  it('only claims a lookup when the client says so', () => {
    // A typed number and a provider-derived number must not be conflated in the audit trail.
    expect(route).toMatch(/distanceSource\s*===\s*'lookup'|body\?\.distanceSource\s*===\s*'lookup'/);
  });
});
