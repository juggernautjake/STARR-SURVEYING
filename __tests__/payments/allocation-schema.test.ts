// __tests__/payments/allocation-schema.test.ts
//
// Phase-2 Slice 7 source-lock for
// seeds/374_financial_allocation_categories.sql.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'seeds', '374_financial_allocation_categories.sql'),
  'utf8',
);

describe('seeds/374 — financial_allocation_categories', () => {
  it('creates the table', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.financial_allocation_categories/);
  });

  it('has every column the engine reads', () => {
    for (const col of [
      'category_key',
      'label',
      'description',
      'target_percent',
      'color',
      'sort_order',
      'is_active',
    ]) {
      expect(SRC).toContain(col);
    }
  });

  it('CHECK constraint clamps target_percent to [0, 100]', () => {
    expect(SRC).toMatch(/target_percent >= 0 AND target_percent <= 100/);
  });

  it('partial index on (is_active, sort_order) for the dashboard read path', () => {
    expect(SRC).toMatch(
      /idx_financial_allocation_categories_active_sort[\s\S]*?WHERE is_active = TRUE/,
    );
  });
});

describe('seeds/374 — financial_allocations ledger', () => {
  it('creates the table', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.financial_allocations/);
  });

  it('FKs payment_id → payments(id) with ON DELETE CASCADE', () => {
    expect(SRC).toMatch(
      /payment_id\s+UUID NOT NULL REFERENCES public\.payments\(id\) ON DELETE CASCADE/,
    );
  });

  it('FKs category_id → categories(id) with ON DELETE RESTRICT (can\'t delete a used category)', () => {
    expect(SRC).toMatch(
      /category_id\s+UUID NOT NULL REFERENCES public\.financial_allocation_categories\(id\) ON DELETE RESTRICT/,
    );
  });

  it('CHECK constraint refuses negative amounts', () => {
    expect(SRC).toMatch(/CHECK \(amount_cents >= 0\)/);
  });

  it('UNIQUE (payment_id, category_id) prevents duplicate ledger rows', () => {
    expect(SRC).toMatch(
      /uniq_financial_allocations_payment_category[\s\S]*?ON public\.financial_allocations\(payment_id, category_id\)/,
    );
  });
});

describe('seeds/374 — default categories', () => {
  it('seeds the 5 categories the user named verbatim', () => {
    for (const key of [
      "'equipment_supplies'",
      "'travel_food_gas'",
      "'employee_salaries'",
      "'savings'",
      "'investing'",
    ]) {
      expect(SRC).toContain(key);
    }
  });

  it('seeds every §2.2 proposed addition', () => {
    for (const key of [
      "'insurance'",
      "'office_overhead'",
      "'vehicle_maintenance'",
      "'professional_dev'",
      "'licenses_renewals'",
      "'accounting'",
      "'legal'",
      "'marketing'",
      "'quarterly_taxes'",
      "'emergency_reserve'",
      "'owner_draw'",
      "'healthcare'",
      "'charitable'",
    ]) {
      expect(SRC).toContain(key);
    }
  });

  it('every default category starts at target_percent = 0 (dad sets the actual split)', () => {
    // Every row's percentage column appears just before the color
    // column. Look for the pattern (0, '#XXXXXX').
    const matches = SRC.match(/0,\s+'#[0-9A-Fa-f]{6}'/g) ?? [];
    // 5 user-named + 13 §2.2 = 18 default rows
    expect(matches.length).toBeGreaterThanOrEqual(18);
  });

  it('uses ON CONFLICT (category_key) DO NOTHING for idempotency', () => {
    expect(SRC).toMatch(/ON CONFLICT \(category_key\) DO NOTHING/);
  });
});

describe('seeds/374 — migration hygiene', () => {
  it('is wrapped in a transaction', () => {
    expect(SRC).toMatch(/^BEGIN;/m);
    expect(SRC).toMatch(/COMMIT;\s*$/m);
  });

  it('is idempotent', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS/);
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(SRC).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL/);
  });

  it('declares the updated_at trigger function', () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.financial_allocation_set_updated_at/);
  });
});
