// __tests__/admin/payment-employee-methods.test.ts
//
// P2 of payment-infrastructure-2026-06-18.md — source-locks the
// per-employee payout-method schema:
//   - public handles (venmo / cashapp / zelle) live plaintext on
//     `handle`
//   - ACH account + routing are encrypted via pgcrypto's
//     pgp_sym_encrypt on `ach_account_number_enc` / `ach_routing_number_enc`
//   - `cash` is the marker row (no handle, no ACH bytes)
//   - exactly one `is_primary = TRUE` per user enforced by partial
//     unique index
//   - employee can read their own row via authenticated RLS policy

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const SRC = read('seeds/324_employee_payment_methods.sql');

describe('seed 324 — employee_payment_methods table', () => {
  it('creates the table with the five payment kinds', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.employee_payment_methods/);
    expect(SRC).toMatch(/user_email\s+TEXT NOT NULL/);
    expect(SRC).toMatch(
      /kind\s+TEXT NOT NULL\s+CHECK \(kind IN \('venmo', 'cashapp', 'zelle', 'ach', 'cash'\)\)/,
    );
  });

  it('stores plaintext handle column for public-handle methods', () => {
    expect(SRC).toMatch(/handle\s+TEXT,/);
  });

  it('stores ACH account + routing as encrypted BYTEA blobs', () => {
    expect(SRC).toMatch(/ach_account_number_enc\s+BYTEA/);
    expect(SRC).toMatch(/ach_routing_number_enc\s+BYTEA/);
    expect(SRC).toMatch(/ach_account_type\s+TEXT CHECK \(ach_account_type IN \('checking', 'savings'\)\)/);
  });

  it('tracks verification + primary-method flags', () => {
    expect(SRC).toMatch(/is_primary\s+BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(SRC).toMatch(/verified\s+BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(SRC).toMatch(/verified_at\s+TIMESTAMPTZ/);
    expect(SRC).toMatch(/verified_by\s+TEXT/);
  });

  it('defaults org_id to the Starr tenant uuid (multi-tenancy shim)', () => {
    expect(SRC).toMatch(/org_id\s+UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID/);
  });
});

describe('seed 324 — shape constraints (CHECK)', () => {
  it("public-handle methods require handle; cash/ach must NOT carry handle", () => {
    expect(SRC).toMatch(/CONSTRAINT employee_payment_methods_handle_shape/);
    expect(SRC).toMatch(/kind IN \('venmo', 'cashapp', 'zelle'\) AND handle IS NOT NULL/);
    expect(SRC).toMatch(/kind = 'cash' AND handle IS NULL/);
    expect(SRC).toMatch(/kind = 'ach' AND handle IS NULL/);
  });

  it("ACH columns travel together (or not at all)", () => {
    expect(SRC).toMatch(/CONSTRAINT employee_payment_methods_ach_shape/);
    expect(SRC).toMatch(
      /kind = 'ach' AND ach_account_number_enc IS NOT NULL AND ach_routing_number_enc IS NOT NULL/,
    );
    expect(SRC).toMatch(/kind <> 'ach' AND ach_account_number_enc IS NULL AND ach_routing_number_enc IS NULL/);
  });
});

describe('seed 324 — uniqueness + indexes', () => {
  it("enforces ONE primary method per user via partial unique index", () => {
    expect(SRC).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_payment_methods_primary/);
    expect(SRC).toMatch(/WHERE is_primary = TRUE/);
  });

  it("prevents duplicate (user, kind, handle) public-handle rows", () => {
    expect(SRC).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_payment_methods_kind_handle/);
    expect(SRC).toMatch(/\(user_email, kind, handle\)\s*\n\s*WHERE handle IS NOT NULL/);
  });

  it("indexes user_email for the per-employee lookup", () => {
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_employee_payment_methods_user/);
  });
});

describe('seed 324 — pgcrypto integration', () => {
  it("enables the pgcrypto extension idempotently", () => {
    expect(SRC).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto/);
  });

  it("ships encrypt + decrypt SQL helpers keyed by an env-driven key", () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.encrypt_ach_secret\(plaintext TEXT, key TEXT\)/);
    expect(SRC).toMatch(/SELECT pgp_sym_encrypt\(plaintext, key\)/);
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.decrypt_ach_secret\(ciphertext BYTEA, key TEXT\)/);
    expect(SRC).toMatch(/SELECT pgp_sym_decrypt\(ciphertext, key\)/);
  });
});

describe('seed 324 — shared updated_at trigger from seed 323', () => {
  it("reuses payments_set_updated_at instead of redefining the function", () => {
    expect(SRC).toMatch(
      /CREATE TRIGGER employee_payment_methods_updated_at[\s\S]{0,200}EXECUTE FUNCTION public\.payments_set_updated_at\(\)/,
    );
  });
});

describe('seed 324 — RLS + idempotency', () => {
  it("wraps the schema in a single BEGIN/COMMIT transaction", () => {
    expect(SRC).toMatch(/^BEGIN;/m);
    expect(SRC).toMatch(/^COMMIT;/m);
  });

  it("enables RLS on the table", () => {
    expect(SRC).toMatch(/ALTER TABLE public\.employee_payment_methods ENABLE ROW LEVEL SECURITY/);
  });

  it("adds the service_role full-access policy", () => {
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_employee_payment_methods/);
  });

  it("adds the employee-self-read policy gated by Supabase JWT email", () => {
    expect(SRC).toMatch(/CREATE POLICY employee_self_read_payment_methods/);
    expect(SRC).toMatch(/FOR SELECT TO authenticated/);
    expect(SRC).toMatch(/user_email = \(auth\.jwt\(\) ->> 'email'\)/);
  });
});

describe('P2 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');

  it("plan still describes the encrypted-ACH posture", () => {
    expect(PLAN).toMatch(/Encrypted-at-rest handles for ACH/);
    expect(PLAN).toMatch(/pgcrypto/);
  });
});
