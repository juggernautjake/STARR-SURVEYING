// __tests__/admin/payment-foundations.test.ts
//
// P1 of payment-infrastructure-2026-06-18.md — source-locks the
// five-table payment schema that everything else hangs off:
//   1. invoices             — the customer-facing record
//   2. payments             — completed payment records
//   3. payment_intents      — Stripe PaymentIntent shadow rows
//   4. payment_attempts     — every attempt incl. cash/check pledges
//   5. payment_receipts     — generated receipt PDFs / Resend sends
//
// CHECK constraints are used instead of Postgres ENUMs so future
// statuses ship without an ALTER TYPE dance.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const SRC = read('seeds/323_payment_foundations.sql');

describe('seed 323 — payment foundations: invoices', () => {
  it('creates the invoices table with the customer-facing keys', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.invoices/);
    expect(SRC).toMatch(/invoice_number\s+TEXT NOT NULL UNIQUE/);
    expect(SRC).toMatch(/public_slug\s+TEXT NOT NULL UNIQUE/);
    expect(SRC).toMatch(/job_id\s+UUID REFERENCES public\.jobs\(id\) ON DELETE SET NULL/);
  });

  it('snapshots the customer contact at invoice time', () => {
    expect(SRC).toMatch(/customer_email\s+TEXT/);
    expect(SRC).toMatch(/customer_name\s+TEXT/);
    expect(SRC).toMatch(/customer_phone\s+TEXT/);
    expect(SRC).toMatch(/billing_address\s+JSONB NOT NULL DEFAULT '\{\}'::JSONB/);
  });

  it('models line items + totals in cents (no float dollars)', () => {
    expect(SRC).toMatch(/line_items\s+JSONB NOT NULL DEFAULT '\[\]'::JSONB/);
    expect(SRC).toMatch(/subtotal_cents\s+INTEGER NOT NULL DEFAULT 0/);
    expect(SRC).toMatch(/tax_cents\s+INTEGER NOT NULL DEFAULT 0/);
    expect(SRC).toMatch(/total_cents\s+INTEGER NOT NULL DEFAULT 0/);
  });

  it("status CHECK covers the seven life-cycle states", () => {
    expect(SRC).toMatch(
      /status\s+TEXT NOT NULL DEFAULT 'draft'\s+CHECK \(status IN \('draft', 'issued', 'partial', 'paid', 'voided', 'overdue', 'refunded'\)\)/,
    );
  });

  it('defaults org_id to the Starr tenant uuid (multi-tenancy shim)', () => {
    expect(SRC).toMatch(/org_id\s+UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID/);
  });

  it('indexes invoice lookup paths used by /pay + admin', () => {
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_invoices_status_issued/);
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_invoices_job/);
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_invoices_customer_email/);
  });
});

describe('seed 323 — payment foundations: payments', () => {
  it('creates payments with the cents-only amount + method CHECK', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.payments/);
    expect(SRC).toMatch(/invoice_id\s+UUID NOT NULL REFERENCES public\.invoices\(id\) ON DELETE RESTRICT/);
    expect(SRC).toMatch(/amount_cents\s+INTEGER NOT NULL CHECK \(amount_cents >= 0\)/);
    expect(SRC).toMatch(
      /method\s+TEXT NOT NULL\s+CHECK \(method IN \('stripe', 'venmo', 'cashapp', 'zelle', 'ach', 'cash', 'check', 'other'\)\)/,
    );
  });

  it("status CHECK covers the five clearance states", () => {
    expect(SRC).toMatch(
      /status\s+TEXT NOT NULL DEFAULT 'pending'\s+CHECK \(status IN \('pending', 'succeeded', 'failed', 'refunded', 'voided'\)\)/,
    );
  });

  it('records the external provider id + the reconciler (cash/check)', () => {
    expect(SRC).toMatch(/external_id\s+TEXT/);
    expect(SRC).toMatch(/external_provider\s+TEXT/);
    expect(SRC).toMatch(/reconciled_by\s+TEXT/);
    expect(SRC).toMatch(/cleared_at\s+TIMESTAMPTZ/);
  });

  it('indexes the close-out + webhook + invoice lookups', () => {
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_payments_invoice/);
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_payments_status/);
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_payments_external/);
  });
});

describe('seed 323 — payment foundations: payment_intents', () => {
  it('shadows Stripe PaymentIntents with a unique external id', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.payment_intents/);
    expect(SRC).toMatch(/invoice_id\s+UUID NOT NULL REFERENCES public\.invoices\(id\) ON DELETE CASCADE/);
    expect(SRC).toMatch(/provider\s+TEXT NOT NULL DEFAULT 'stripe'/);
    expect(SRC).toMatch(/external_intent_id\s+TEXT NOT NULL UNIQUE/);
    expect(SRC).toMatch(/client_secret\s+TEXT/);
    expect(SRC).toMatch(/currency\s+TEXT NOT NULL DEFAULT 'usd'/);
  });

  it('indexes the lookup the Stripe webhook performs', () => {
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_intents_invoice/);
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_intents_status/);
  });
});

describe('seed 323 — payment foundations: payment_attempts', () => {
  it("creates payment_attempts with the six-state lifecycle", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.payment_attempts/);
    expect(SRC).toMatch(/invoice_id\s+UUID NOT NULL REFERENCES public\.invoices\(id\) ON DELETE CASCADE/);
    expect(SRC).toMatch(
      /status\s+TEXT NOT NULL DEFAULT 'started'\s+CHECK \(status IN \('started', 'pledged', 'pending_confirmation', 'succeeded', 'failed', 'abandoned'\)\)/,
    );
  });

  it("shares the method CHECK with payments (same eight methods)", () => {
    // Source-lock that both tables list the same method enum.
    const matches = SRC.match(
      /method\s+TEXT NOT NULL\s+CHECK \(method IN \('stripe', 'venmo', 'cashapp', 'zelle', 'ach', 'cash', 'check', 'other'\)\)/g,
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('links a successful attempt back to its payment row', () => {
    expect(SRC).toMatch(/resulted_in_payment_id\s+UUID REFERENCES public\.payments\(id\) ON DELETE SET NULL/);
  });

  it("has a partial index on the office close-out queue states", () => {
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_payment_attempts_pending/);
    expect(SRC).toMatch(/WHERE status IN \('pledged', 'pending_confirmation'\)/);
  });
});

describe('seed 323 — payment foundations: payment_receipts', () => {
  it('creates payment_receipts with the storage + Resend send columns', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.payment_receipts/);
    expect(SRC).toMatch(/payment_id\s+UUID NOT NULL REFERENCES public\.payments\(id\) ON DELETE CASCADE/);
    expect(SRC).toMatch(/invoice_id\s+UUID NOT NULL REFERENCES public\.invoices\(id\) ON DELETE CASCADE/);
    expect(SRC).toMatch(/storage_path\s+TEXT/);
    expect(SRC).toMatch(/sent_to_email\s+TEXT/);
    expect(SRC).toMatch(/sent_at\s+TIMESTAMPTZ/);
    expect(SRC).toMatch(/resend_id\s+TEXT/);
    expect(SRC).toMatch(/send_error\s+TEXT/);
  });
});

describe('seed 323 — RLS + triggers + idempotency', () => {
  it('wraps the schema in a single BEGIN/COMMIT transaction', () => {
    expect(SRC).toMatch(/^BEGIN;/m);
    expect(SRC).toMatch(/^COMMIT;/m);
  });

  it('uses CREATE TABLE IF NOT EXISTS for all five tables (re-runnable)', () => {
    const tables = ['invoices', 'payments', 'payment_intents', 'payment_attempts', 'payment_receipts'];
    for (const t of tables) {
      expect(SRC).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
    }
  });

  it('enables RLS on every table', () => {
    expect(SRC).toMatch(/ALTER TABLE public\.invoices\s+ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/ALTER TABLE public\.payments\s+ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/ALTER TABLE public\.payment_intents\s+ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/ALTER TABLE public\.payment_attempts ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/ALTER TABLE public\.payment_receipts ENABLE ROW LEVEL SECURITY/);
  });

  it('adds a service_role full-access policy on every table', () => {
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_invoices/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_payments/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_payment_intents/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_payment_attempts/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_payment_receipts/);
  });

  it("ships one shared updated_at trigger function across the mutable tables", () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.payments_set_updated_at\(\)/);
    expect(SRC).toMatch(
      /FOREACH t IN ARRAY ARRAY\['invoices', 'payments', 'payment_intents', 'payment_attempts'\]/,
    );
    expect(SRC).toMatch(/EXECUTE FUNCTION public\.payments_set_updated_at\(\)/);
  });
});

describe('P1 plan annotation locks the slice', () => {
  // Smoke test the plan still describes what the seed actually ships,
  // so a future reviewer reading completed/ can trace back to scope.
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');

  it("plan still references the five-table foundation", () => {
    expect(PLAN).toMatch(/invoices, payments, payment_intents, payment_attempts, payment_receipts/);
  });

  it("plan still requires the public_slug enumeration guard", () => {
    expect(PLAN).toMatch(/public-facing slug column/);
  });
});
