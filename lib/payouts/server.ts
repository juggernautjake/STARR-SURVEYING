// lib/payouts/server.ts — the I/O half of payouts: settings, each person's pay details, and bank reads.
//
// The decisions live in pure modules (routing.ts, fees.ts, rails.ts); this file only fetches what they
// need and writes what they decided. Bank numbers are encrypted and decrypted inside the database
// (seed 677: save_payout_bank / read_payout_banks), every decryption is written to
// `payment_secret_reads` first, and no plaintext number is ever logged.

import { supabaseAdmin } from '@/lib/supabase';
import { currentOrgId } from '@/lib/saas/org-scope';
import { normalizeClassification } from './worker-classification';
import { isPayoutMethod, type PayoutMethod } from './methods';
import { normalizePolicy, type PayoutPolicy, type PersonPayInfo } from './routing';
import { originatorProblems, type NachaOriginator } from './nacha';
import { paypalConfig } from './paypal';
import { assertEncryptionKeyConfigured, scrubAchFromMessage } from '@/lib/payments/secrets';
import type { RailConfig } from './rails';
import type { MethodFee } from './fees';

export const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
export const orgId = (): string => currentOrgId() ?? DEFAULT_ORG;

export interface ChecksSettings {
  stock?: 'preprinted' | 'blank_micr';
  payer_name?: string;
  payer_address?: string;
  bank_name?: string;
  bank_address?: string;
  routing?: string;
  account_last4?: string;
  next_number?: number;
  void_after_days?: number;
  signature_lines?: 1 | 2;
  offset_x_mm?: number;
  offset_y_mm?: number;
}

export interface PayoutSettingsRow {
  org_id: string;
  enabled_methods: string[];
  default_method: string | null;
  fallback_method: string | null;
  fees: Record<string, MethodFee>;
  fee_scope: 'contractors' | 'everyone';
  fee_requires_consent: boolean;
  fee_max_percent: number;
  ach: Partial<NachaOriginator>;
  checks: ChecksSettings;
  has_check_account: boolean;
  two_person_approval: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

const COLS = 'org_id, enabled_methods, default_method, fallback_method, fees, fee_scope, fee_requires_consent, fee_max_percent, ach, checks, check_account_number_enc, two_person_approval, updated_by, updated_at';

export async function loadPayoutSettings(): Promise<PayoutSettingsRow> {
  const org = orgId();
  let { data } = await supabaseAdmin.from('payout_settings').select(COLS).eq('org_id', org).maybeSingle();
  if (!data) {
    await supabaseAdmin.from('payout_settings').upsert({ org_id: org }, { onConflict: 'org_id', ignoreDuplicates: true });
    ({ data } = await supabaseAdmin.from('payout_settings').select(COLS).eq('org_id', org).maybeSingle());
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    org_id: org,
    enabled_methods: Array.isArray(r.enabled_methods) ? (r.enabled_methods as string[]) : ['ach', 'venmo', 'cashapp', 'zelle', 'check', 'cash', 'account'],
    default_method: (r.default_method as string) ?? null,
    fallback_method: (r.fallback_method as string) ?? null,
    fees: (r.fees as Record<string, MethodFee>) ?? {},
    fee_scope: r.fee_scope === 'everyone' ? 'everyone' : 'contractors',
    fee_requires_consent: r.fee_requires_consent !== false,
    fee_max_percent: Number(r.fee_max_percent ?? 5),
    ach: (r.ach as Partial<NachaOriginator>) ?? {},
    checks: (r.checks as ChecksSettings) ?? {},
    has_check_account: r.check_account_number_enc != null,
    two_person_approval: r.two_person_approval === true,
    updated_by: (r.updated_by as string) ?? null,
    updated_at: (r.updated_at as string) ?? null,
  };
}

/** Are checks fully set up for the chosen stock? Null = yes; otherwise what is missing. */
export function checksProblems(s: PayoutSettingsRow): string[] {
  const c = s.checks;
  const out: string[] = [];
  if (!c.payer_name?.trim()) out.push('Company name to print on checks is missing.');
  if (c.stock === 'blank_micr') {
    if (!c.routing || !/^\d{9}$/.test(c.routing)) out.push('Bank routing number (for the MICR line) is missing.');
    if (!s.has_check_account) out.push('Bank account number (for the MICR line) is missing.');
    if (!c.bank_name?.trim()) out.push('Bank name is missing.');
  }
  return out;
}

export function railConfigFor(s: PayoutSettingsRow): RailConfig {
  return {
    paypal: paypalConfig() != null,
    ach: originatorProblems(s.ach).length === 0,
    checks: checksProblems(s).length === 0,
  };
}

export async function loadPolicy(): Promise<{ policy: PayoutPolicy; settings: PayoutSettingsRow }> {
  const settings = await loadPayoutSettings();
  return { policy: normalizePolicy(settings, railConfigFor(settings)), settings };
}

/** The fee wording a consent was given against must match today's rule, or it no longer counts. */
export function feeFingerprint(rule: MethodFee | undefined | null): string {
  if (!rule) return '';
  return JSON.stringify({ f: rule.flat_cents ?? 0, p: rule.percent_bps ?? 0, c: rule.cap_cents ?? 0 });
}

/** Everything routing needs to decide how each of these people is paid. */
export async function loadPeople(emails: string[], policy: PayoutPolicy): Promise<Map<string, PersonPayInfo>> {
  const out = new Map<string, PersonPayInfo>();
  if (emails.length === 0) return out;
  const lower = [...new Set(emails.map((e) => e.toLowerCase()))];
  const [profiles, banks, users, consents] = await Promise.all([
    supabaseAdmin.from('employee_profiles').select('user_email, payout_method, payout_handle').in('user_email', emails),
    supabaseAdmin.from('employee_payment_methods').select('user_email').eq('kind', 'ach').in('user_email', lower),
    supabaseAdmin.from('registered_users').select('email, worker_classification').in('email', emails),
    supabaseAdmin.from('payout_fee_consents').select('user_email, method, fee_snapshot').is('revoked_at', null).in('user_email', lower),
  ]);
  const prof = new Map(((profiles.data ?? []) as Array<{ user_email: string; payout_method: unknown; payout_handle: unknown }>).map((p) => [p.user_email.toLowerCase(), p]));
  const bankSet = new Set(((banks.data ?? []) as Array<{ user_email: string }>).map((b) => b.user_email.toLowerCase()));
  const cls = new Map(((users.data ?? []) as Array<{ email: string; worker_classification: string | null }>).map((u) => [u.email.toLowerCase(), u.worker_classification]));
  const consentBy = new Map<string, Set<PayoutMethod>>();
  for (const c of (consents.data ?? []) as Array<{ user_email: string; method: string; fee_snapshot: MethodFee }>) {
    if (!isPayoutMethod(c.method)) continue;
    // A consent covers only the fee it was given for. Change the fee and it has to be agreed again.
    if (feeFingerprint(c.fee_snapshot) !== feeFingerprint(policy.fees.fees[c.method])) continue;
    const s = consentBy.get(c.user_email.toLowerCase()) ?? new Set<PayoutMethod>();
    s.add(c.method);
    consentBy.set(c.user_email.toLowerCase(), s);
  }
  for (const email of emails) {
    const k = email.toLowerCase();
    const p = prof.get(k);
    out.set(email, {
      user_email: email,
      preferred: p && isPayoutMethod(p.payout_method) ? p.payout_method : null,
      handle: typeof p?.payout_handle === 'string' && p.payout_handle.trim() ? p.payout_handle.trim() : null,
      hasBank: bankSet.has(k),
      classification: normalizeClassification(cls.get(k) ?? null),
      consented: consentBy.get(k) ?? new Set(),
    });
  }
  return out;
}

export function encryptionKeyOrNull(): string | null {
  try { return assertEncryptionKeyConfigured(); } catch { return null; }
}

/** Decrypt bank details for these people, auditing every read FIRST. Throws in words, never with a number. */
export async function readBanks(emails: string[], reader: string, reason: 'payroll_dispatch' | 'admin_review'): Promise<Map<string, { routing: string; account: string; account_type: 'checking' | 'savings' }>> {
  const key = assertEncryptionKeyConfigured();
  const lower = [...new Set(emails.map((e) => e.toLowerCase()))];
  const { data: ids } = await supabaseAdmin.from('employee_payment_methods').select('id, user_email').eq('kind', 'ach').in('user_email', lower);
  const audit = ((ids ?? []) as Array<{ id: string; user_email: string }>).flatMap((m) => (['ach_account_number_enc', 'ach_routing_number_enc'] as const).map((field_name) => ({
    reader_email: reader, reader_ip: null, target_table: 'employee_payment_methods', target_id: m.id, subject_email: m.user_email,
    field_name, reason, succeeded: true, error_message: null,
  })));
  if (audit.length) {
    const { error } = await supabaseAdmin.from('payment_secret_reads').insert(audit);
    if (error) throw new Error(`Bank details not read — the access log could not be written (${error.message}).`);
  }
  const { data, error } = await supabaseAdmin.rpc('read_payout_banks', { p_emails: lower, p_key: key });
  if (error) throw new Error(`Bank details could not be decrypted: ${scrubAchFromMessage(error.message)}`);
  const out = new Map<string, { routing: string; account: string; account_type: 'checking' | 'savings' }>();
  for (const r of (data ?? []) as Array<{ user_email: string; routing: string; account: string; account_type: string }>) {
    out.set(r.user_email.toLowerCase(), { routing: r.routing, account: r.account, account_type: r.account_type === 'savings' ? 'savings' : 'checking' });
  }
  return out;
}

export async function readCheckAccount(reader: string): Promise<string | null> {
  const key = assertEncryptionKeyConfigured();
  await supabaseAdmin.from('payment_secret_reads').insert({
    reader_email: reader, reader_ip: null, target_table: 'payout_settings', target_id: null, subject_email: null,
    field_name: 'check_account_number_enc', reason: 'payroll_dispatch', succeeded: true, error_message: null,
  });
  const { data, error } = await supabaseAdmin.rpc('read_check_account', { p_org: orgId(), p_key: key });
  if (error) throw new Error(`Check account could not be decrypted: ${scrubAchFromMessage(error.message)}`);
  return (data as string | null) ?? null;
}

/** Append a line to what Commit did. Best-effort: the record must never block a payment. */
export async function logDispatch(batchId: string, actor: string, action: string, detail: Record<string, unknown> = {}, itemId: string | null = null, rail: string | null = null): Promise<void> {
  try {
    await supabaseAdmin.from('payout_dispatch_events').insert({ batch_id: batchId, item_id: itemId, rail, action, detail, actor });
  } catch { /* advisory */ }
}
