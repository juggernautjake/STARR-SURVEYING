// app/api/admin/payouts/settings/route.ts — how this firm pays people.
//
//   GET → the settings, plus a readiness report: what each method still needs before it can be used.
//   PUT → save. Every value is validated; nothing half-valid is stored.
//
// Owner, 2026-10-11: "The org needs to be able to have full control over how payouts work. They can just
// provide a single way to payout, or multiple. They can put extra charges for using different types of
// payouts."

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { isPayoutMethod, PAYOUT_METHOD_INFO, type PayoutMethod } from '@/lib/payouts/methods';
import { checksProblems, encryptionKeyOrNull, loadPayoutSettings, orgId, railConfigFor } from '@/lib/payouts/server';
import { originatorProblems, isValidRouting } from '@/lib/payouts/nacha';
import { paypalConfig } from '@/lib/payouts/paypal';
import { micrFontAvailable } from '@/lib/checks/render';
import { describePolicy, normalizePolicy, ALL_OFFERABLE } from '@/lib/payouts/routing';
import { FEEABLE_METHODS, describeRule, type MethodFee } from '@/lib/payouts/fees';
import { scrubAchFromMessage } from '@/lib/payments/secrets';

async function report() {
  const settings = await loadPayoutSettings();
  const rails = railConfigFor(settings);
  const policy = normalizePolicy(settings, rails);
  const pp = paypalConfig();
  return {
    settings,
    policy: describePolicy(policy),
    readiness: {
      paypal: pp ? { ready: true, mode: pp.live ? 'live' : 'sandbox' } : { ready: false, missing: 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set in the environment.' },
      encryption: encryptionKeyOrNull() ? { ready: true } : { ready: false, missing: 'PAYMENT_ENCRYPTION_KEY is not set — bank details cannot be saved or read.' },
      ach: { ready: rails.ach, problems: originatorProblems(settings.ach) },
      checks: { ready: rails.checks, problems: checksProblems(settings), micr_font: micrFontAvailable() },
    },
    methods: ALL_OFFERABLE.map((m) => ({
      method: m,
      label: PAYOUT_METHOD_INFO[m].label,
      enabled: settings.enabled_methods.includes(m),
      fee: describeRule(m, settings.fees[m]),
    })),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await report());
}

const int = (v: unknown, max: number): number | null => {
  if (v === '' || v == null) return 0;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const errors: string[] = [];
  const cur = await loadPayoutSettings();
  const upd: Record<string, unknown> = { updated_by: session.user.email, updated_at: new Date().toISOString() };

  // Methods offered, default, fallback
  let enabled = cur.enabled_methods as PayoutMethod[];
  if (b.enabled_methods !== undefined) {
    const list = Array.isArray(b.enabled_methods) ? (b.enabled_methods as unknown[]).filter(isPayoutMethod).filter((m) => (ALL_OFFERABLE as readonly string[]).includes(m)) : [];
    if (list.length === 0) errors.push('Offer at least one way to be paid.');
    else { enabled = list; upd.enabled_methods = list; }
  }
  for (const key of ['default_method', 'fallback_method'] as const) {
    const v = b[key] !== undefined ? b[key] : cur[key];
    if (v === null || v === '' || v === undefined) { if (b[key] !== undefined) upd[key] = null; continue; }
    if (!isPayoutMethod(v) || !enabled.includes(v)) errors.push(`${key === 'default_method' ? 'The default' : 'The fallback'} must be one of the methods you offer.`);
    else upd[key] = v;
  }

  // Fees
  if (b.fees !== undefined) {
    const fees: Record<string, MethodFee> = {};
    const raw = (b.fees && typeof b.fees === 'object' ? b.fees : {}) as Record<string, Record<string, unknown>>;
    for (const m of FEEABLE_METHODS) {
      const f = raw[m];
      if (!f) continue;
      const flat = int(f.flat_cents, 5000), bps = int(f.percent_bps, 1000), cap = int(f.cap_cents, 10000);
      if (flat === null) errors.push(`${PAYOUT_METHOD_INFO[m].label} fee: the flat amount must be between $0 and $50.`);
      if (bps === null) errors.push(`${PAYOUT_METHOD_INFO[m].label} fee: the percentage must be between 0% and 10%.`);
      if (cap === null) errors.push(`${PAYOUT_METHOD_INFO[m].label} fee: the cap must be between $0 and $100.`);
      if (flat || bps) fees[m] = { flat_cents: flat ?? 0, percent_bps: bps ?? 0, cap_cents: cap ?? 0 };
    }
    upd.fees = fees;
  }
  if (b.fee_scope !== undefined) {
    if (b.fee_scope !== 'contractors' && b.fee_scope !== 'everyone') errors.push('Fee scope must be contractors or everyone.');
    else upd.fee_scope = b.fee_scope;
  }
  if (b.fee_requires_consent !== undefined) {
    // Consent can be switched off only for contractors-only fees: a fee from W-2 wages needs written authorisation.
    const scope = (upd.fee_scope ?? cur.fee_scope) as string;
    if (b.fee_requires_consent === false && scope === 'everyone') errors.push('When fees apply to employees, each person\'s written consent is required.');
    else upd.fee_requires_consent = b.fee_requires_consent !== false;
  }
  if (b.fee_max_percent !== undefined) {
    const p = Number(b.fee_max_percent);
    if (!Number.isFinite(p) || p < 0 || p > 25) errors.push('The maximum fee must be between 0% and 25% of a payment.');
    else upd.fee_max_percent = p;
  }
  if (b.two_person_approval !== undefined) upd.two_person_approval = b.two_person_approval === true;

  // ACH originator
  if (b.ach !== undefined) {
    const a = (b.ach ?? {}) as Record<string, unknown>;
    const ach = {
      company_name: str(a.company_name, 16) ?? '',
      company_id: str(a.company_id, 10) ?? '',
      odfi_routing: (str(a.odfi_routing, 9) ?? '').replace(/\D/g, ''),
      immediate_destination: (str(a.immediate_destination, 9) ?? '').replace(/\D/g, ''),
      immediate_destination_name: str(a.immediate_destination_name, 23) ?? 'PNC BANK',
      immediate_origin: (str(a.immediate_origin, 10) ?? '').replace(/\D/g, ''),
      immediate_origin_name: str(a.immediate_origin_name, 23) ?? '',
      entry_description: str(a.entry_description, 10) || 'PAYROLL',
    };
    if (ach.odfi_routing && !isValidRouting(ach.odfi_routing)) errors.push('ACH: the bank routing number is not valid.');
    upd.ach = ach;
  }

  // Checks
  if (b.checks !== undefined) {
    const c = (b.checks ?? {}) as Record<string, unknown>;
    const routing = (str(c.routing, 9) ?? '').replace(/\D/g, '');
    if (routing && !isValidRouting(routing)) errors.push('Checks: the bank routing number is not valid.');
    const next = c.next_number === undefined || c.next_number === '' ? cur.checks.next_number : Number(c.next_number);
    if (next !== undefined && (!Number.isInteger(next) || next < 1 || next > 99_999_999)) errors.push('Checks: the next check number must be a whole number.');
    upd.checks = {
      ...cur.checks,
      stock: c.stock === 'blank_micr' ? 'blank_micr' : 'preprinted',
      payer_name: str(c.payer_name, 60) ?? cur.checks.payer_name ?? '',
      payer_address: str(c.payer_address, 120) ?? cur.checks.payer_address ?? '',
      bank_name: str(c.bank_name, 60) ?? cur.checks.bank_name ?? '',
      bank_address: str(c.bank_address, 120) ?? cur.checks.bank_address ?? '',
      routing,
      next_number: next,
      void_after_days: int(c.void_after_days, 365) || 90,
      signature_lines: Number(c.signature_lines) === 2 ? 2 : 1,
      offset_x_mm: Math.max(-10, Math.min(10, Number(c.offset_x_mm) || 0)),
      offset_y_mm: Math.max(-10, Math.min(10, Number(c.offset_y_mm) || 0)),
    };
  }

  if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });

  const { error } = await supabaseAdmin.from('payout_settings').update(upd).eq('org_id', orgId());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The check account number goes straight into encrypted storage, never into the settings JSON.
  if (typeof b.check_account === 'string' && b.check_account.trim()) {
    const key = encryptionKeyOrNull();
    if (!key) return NextResponse.json({ error: 'Saved, except the account number: PAYMENT_ENCRYPTION_KEY is not set.' }, { status: 400 });
    const { error: aErr } = await supabaseAdmin.rpc('save_check_account', { p_org: orgId(), p_account: b.check_account.trim(), p_key: key });
    if (aErr) return NextResponse.json({ error: `Saved, except the account number: ${scrubAchFromMessage(aErr.message)}` }, { status: 400 });
  }

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email, action_type: 'payout_settings_updated', entity_type: 'payout_settings', entity_id: orgId(),
      metadata: { fields: Object.keys(upd).filter((k) => k !== 'updated_by' && k !== 'updated_at'), check_account_changed: typeof b.check_account === 'string' && !!b.check_account.trim() },
    });
  } catch { /* advisory */ }

  return NextResponse.json(await report());
}
