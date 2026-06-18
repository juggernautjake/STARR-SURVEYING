// __tests__/admin/payment-secrets-rotation.test.ts
//
// P17 of payment-infrastructure-2026-06-18.md — locks the secrets-
// handling slice:
//   - seeds/327 payment_secret_reads audit table
//   - lib/payments/secrets.ts pure helpers
//   - scripts/rotate-payment-encryption-key.mjs key-rotation script
//   - docs/security/payments-pci-scope.md docs

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACH_READ_REASONS,
  assertEncryptionKeyConfigured,
  buildAuditEntry,
  maskAchAccount,
  scrubAchFromMessage,
} from '@/lib/payments/secrets';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('maskAchAccount (pure)', () => {
  it("masks to last-4 of digits only", () => {
    expect(maskAchAccount('123456789')).toBe('•••6789');
    expect(maskAchAccount('5678')).toMatch(/8$/);
    expect(maskAchAccount('')).toBe('');
    expect(maskAchAccount(null)).toBe('');
  });

  it("strips non-digits before masking", () => {
    expect(maskAchAccount('1234-5678')).toBe('•••5678');
  });
});

describe('assertEncryptionKeyConfigured (pure)', () => {
  it("returns the key when valid", () => {
    expect(assertEncryptionKeyConfigured({
      PAYMENT_ENCRYPTION_KEY: 'a-strong-key-of-many-chars-and-bits',
    } as unknown as NodeJS.ProcessEnv))
      .toBe('a-strong-key-of-many-chars-and-bits');
  });

  it("throws when missing / too short / placeholder", () => {
    expect(() => assertEncryptionKeyConfigured({} as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() => assertEncryptionKeyConfigured({ PAYMENT_ENCRYPTION_KEY: 'short' } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() => assertEncryptionKeyConfigured({ PAYMENT_ENCRYPTION_KEY: 'changeme' } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() => assertEncryptionKeyConfigured({ PAYMENT_ENCRYPTION_KEY: 'your_encryption_key' } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('ACH_READ_REASONS (pure)', () => {
  it("publishes the canonical reason codes", () => {
    expect(ACH_READ_REASONS).toEqual([
      'payroll_dispatch',
      'employee_self_view',
      'admin_review',
      'audit',
      'rotation',
    ]);
  });
});

describe('buildAuditEntry (pure)', () => {
  it("hard-codes target_table to employee_payment_methods + carries every field", () => {
    expect(buildAuditEntry({
      reader_email: 'admin@x.com',
      reader_ip: '203.0.113.1',
      target_id: 'item-1',
      subject_email: 'mary@x.com',
      field_name: 'ach_account_number_enc',
      reason: 'payroll_dispatch',
      succeeded: true,
    })).toEqual({
      reader_email: 'admin@x.com',
      reader_ip: '203.0.113.1',
      target_table: 'employee_payment_methods',
      target_id: 'item-1',
      subject_email: 'mary@x.com',
      field_name: 'ach_account_number_enc',
      reason: 'payroll_dispatch',
      succeeded: true,
      error_message: null,
    });
  });

  it("carries an error_message verbatim on failures", () => {
    expect(buildAuditEntry({
      reader_email: 'a@x.com',
      reader_ip: null,
      target_id: 'i',
      subject_email: 's@x.com',
      field_name: 'ach_routing_number_enc',
      reason: 'rotation',
      succeeded: false,
      error_message: 'bad key',
    }).error_message).toBe('bad key');
  });
});

describe('scrubAchFromMessage (pure)', () => {
  it("masks runs of 8+ digits to ***LAST4", () => {
    expect(scrubAchFromMessage('account 123456789 rejected')).toBe('account ***6789 rejected');
    expect(scrubAchFromMessage('routing 021000021 ok')).toBe('routing ***0021 ok');
  });

  it("leaves short numbers alone", () => {
    expect(scrubAchFromMessage('code 1234')).toBe('code 1234');
  });

  it("non-string input returns empty", () => {
    expect(scrubAchFromMessage(null as unknown as string)).toBe('');
  });
});

describe('seed 327 — payment_secret_reads audit table', () => {
  const SRC = read('seeds/327_payment_secret_audit.sql');

  it("creates the table with reader + target + reason + result columns", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.payment_secret_reads/);
    expect(SRC).toMatch(/reader_email\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/reader_ip\s+TEXT/);
    expect(SRC).toMatch(/target_table\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/subject_email\s+TEXT/);
    expect(SRC).toMatch(/field_name\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/reason\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/succeeded\s+BOOLEAN NOT NULL DEFAULT TRUE/);
    expect(SRC).toMatch(/error_message\s+TEXT/);
  });

  it("indexes the subject / reader / target lookups", () => {
    expect(SRC).toMatch(/idx_payment_secret_reads_subject/);
    expect(SRC).toMatch(/idx_payment_secret_reads_reader/);
    expect(SRC).toMatch(/idx_payment_secret_reads_target/);
  });

  it("RLS — service role only (no employee-self-read)", () => {
    expect(SRC).toMatch(/ALTER TABLE public\.payment_secret_reads ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_payment_secret_reads/);
    expect(SRC).not.toMatch(/employee_self_read_payment_secret_reads/);
  });
});

describe('rotation script — source-lock', () => {
  const SRC = read('scripts/rotate-payment-encryption-key.mjs');

  it("refuses to run unless both PAYMENT_ENCRYPTION_KEY + PAYMENT_ENCRYPTION_KEY_OLD are strong", () => {
    // Script builds the message dynamically via the strong() helper.
    expect(SRC).toMatch(/strong\(oldKey, 'PAYMENT_ENCRYPTION_KEY_OLD'\)/);
    expect(SRC).toMatch(/strong\(newKey, 'PAYMENT_ENCRYPTION_KEY'\)/);
    expect(SRC).toMatch(/must be set to a strong/);
  });

  it("rejects same-key rotation (old === new)", () => {
    expect(SRC).toMatch(/PAYMENT_ENCRYPTION_KEY must differ from PAYMENT_ENCRYPTION_KEY_OLD/);
  });

  it("calls the SQL helpers (decrypt_ach_secret + encrypt_ach_secret) via RPC", () => {
    expect(SRC).toMatch(/\.rpc\('decrypt_ach_secret'/);
    expect(SRC).toMatch(/\.rpc\('encrypt_ach_secret'/);
  });

  it("round-trip-verifies the new ciphertext before writing", () => {
    expect(SRC).toMatch(/round-trip verify failed/);
    expect(SRC).toMatch(/verify !== plaintextRow/);
  });

  it("writes a payment_secret_reads audit row with reason='rotation' per touched row", () => {
    expect(SRC).toMatch(/reason: 'rotation'/);
    expect(SRC).toMatch(/\.from\('payment_secret_reads'\)\.insert/);
  });

  it("supports --dry-run (counts + verifies, no UPDATEs)", () => {
    expect(SRC).toMatch(/--dry-run/);
    expect(SRC).toMatch(/dryRun: true/);
  });

  it("exits non-zero when there were errors", () => {
    expect(SRC).toMatch(/process\.exit\(2\)/);
  });
});

describe('docs/security/payments-pci-scope.md', () => {
  const SRC = read('docs/security/payments-pci-scope.md');

  it("documents the PCI scope table per method", () => {
    expect(SRC).toMatch(/PCI scope/);
    expect(SRC).toMatch(/SAQ A/);
    expect(SRC).toMatch(/Out of scope/);
  });

  it("references the env-var name + rotation script", () => {
    expect(SRC).toMatch(/PAYMENT_ENCRYPTION_KEY/);
    expect(SRC).toMatch(/rotate-payment-encryption-key/);
  });

  it("calls out that no card numbers ever land in the DB", () => {
    expect(SRC).toMatch(/No card numbers are ever stored/);
  });

  it("documents the PAYMENTS_LIVE live-money gate", () => {
    expect(SRC).toMatch(/PAYMENTS_LIVE/);
  });
});

describe('P17 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');
  it("plan still references secrets handling scope", () => {
    expect(PLAN).toMatch(/Secrets handling/);
  });
  it("plan still references PAYMENT_ENCRYPTION_KEY env-var rotation", () => {
    expect(PLAN).toMatch(/PAYMENT_ENCRYPTION_KEY/);
  });
});
