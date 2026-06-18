// lib/payments/secrets.ts
//
// P17 of payment-infrastructure-2026-06-18.md — app-layer wrapper
// for the pgcrypto helpers seed 324 ships. Every decryption goes
// through `readAchSecret` which:
//   1. Resolves PAYMENT_ENCRYPTION_KEY from env (refuses if unset).
//   2. Calls public.decrypt_ach_secret(ciphertext, key) via RPC.
//   3. Inserts a payment_secret_reads audit row BEFORE returning
//      the plaintext.
//   4. Never logs the plaintext anywhere — error messages exclude it.
//
// The split between pure helpers (validation, redaction, audit shape)
// and the Supabase-talking wrappers keeps vitest happy without
// spinning up the DB.

export interface SecretAuditEntry {
  reader_email: string;
  reader_ip: string | null;
  target_table: string;
  target_id: string | null;
  subject_email: string | null;
  field_name: string;
  reason: string;
  succeeded: boolean;
  error_message: string | null;
}

export interface RotationPlanRow {
  id: string;
  field_name: string;
  ciphertext: Buffer | null;
}

/** Pure helper — never let a UI return the raw account number. Mask
 *  to last-4 for display ("•••1234"). */
export function maskAchAccount(plaintext: string | null | undefined): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) return '';
  const digits = plaintext.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 4) return `•${'•'.repeat(Math.max(0, digits.length - 1))}${digits.slice(-1)}`;
  return `•••${digits.slice(-4)}`;
}

/** Pure helper — verify the env key is present + non-trivial. The
 *  pgcrypto helper itself will accept any key, but a placeholder
 *  like "changeme" is a footgun. */
export function assertEncryptionKeyConfigured(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.PAYMENT_ENCRYPTION_KEY;
  if (!key || key.length < 16 || key === 'changeme' || key === 'your_encryption_key') {
    throw new Error('PAYMENT_ENCRYPTION_KEY must be set to a strong (≥16 chars) value.');
  }
  return key;
}

/** Pure helper — known-good reason codes. The audit log accepts any
 *  string but the office should pick from this list whenever
 *  possible so reports stay scannable. */
export const ACH_READ_REASONS = [
  'payroll_dispatch',     // dispatch route reads to drive ACH transfer
  'employee_self_view',   // employee viewing their own profile
  'admin_review',         // office checking an employee's payment method
  'audit',                // compliance officer running periodic audit
  'rotation',             // key rotation script — bulk decrypt/re-encrypt
] as const;
export type AchReadReason = (typeof ACH_READ_REASONS)[number];

/** Pure helper — shape the audit row. Lives separately so vitest
 *  can lock the shape without going through Supabase. */
export function buildAuditEntry(args: {
  reader_email: string;
  reader_ip: string | null;
  target_id: string | null;
  subject_email: string | null;
  field_name: 'ach_account_number_enc' | 'ach_routing_number_enc';
  reason: string;
  succeeded: boolean;
  error_message?: string | null;
}): SecretAuditEntry {
  return {
    reader_email: args.reader_email,
    reader_ip: args.reader_ip,
    target_table: 'employee_payment_methods',
    target_id: args.target_id,
    subject_email: args.subject_email,
    field_name: args.field_name,
    reason: args.reason,
    succeeded: args.succeeded,
    error_message: args.error_message ?? null,
  };
}

/** Pure helper — redact any value that LOOKS LIKE an ACH digit
 *  string from a log message. Defense-in-depth: even if a future
 *  bug logs a stray exception with the plaintext embedded, this
 *  scrubs digits before they hit the console. */
export function scrubAchFromMessage(msg: string): string {
  if (typeof msg !== 'string') return '';
  // Strings of 8+ consecutive digits → mask all but last 4.
  return msg.replace(/\d{8,}/g, (m) => `***${m.slice(-4)}`);
}
