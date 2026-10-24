// app/api/admin/payroll/my-payout-method/route.ts — "How I get paid", for the signed-in person.
//
//   GET → the methods the firm offers, any fee each carries for THIS person, the exact consent wording,
//         and what they have on file now (bank shown masked: "Checking ••5678").
//   PUT { method, handle?, bank?: { routing, account, account_type }, consent? } → save their choice.
//
// A method that carries a fee for this person (lib/payouts/fees.ts) can only be chosen with written
// consent to that fee's exact wording, which is stored (payout_fee_consents). Without it they pick a
// free method — so a fee is never waived by accident nor taken without agreement.
//
// Bank numbers go straight into encrypted storage (seed 677 save_payout_bank) and are never returned.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { isPayoutMethod, PAYOUT_METHOD_INFO, type PayoutMethod } from '@/lib/payouts/methods';
import { encryptionKeyOrNull, loadPeople, loadPolicy } from '@/lib/payouts/server';
import { consentTerms, describeRule, ruleAmount } from '@/lib/payouts/fees';
import { venmoRecipient } from '@/lib/payouts/rails';
import { isValidRouting } from '@/lib/payouts/nacha';
import { scrubAchFromMessage } from '@/lib/payments/secrets';

async function view(email: string) {
  const { policy } = await loadPolicy();
  const person = (await loadPeople([email], policy)).get(email)!;
  const [{ data: bank }, { data: consents }] = await Promise.all([
    supabaseAdmin.from('employee_payment_methods').select('display_name, ach_account_type').eq('kind', 'ach').eq('user_email', email.toLowerCase()).maybeSingle(),
    supabaseAdmin.from('payout_fee_consents').select('method, agreed_at').eq('user_email', email.toLowerCase()).is('revoked_at', null),
  ]);
  const feeApplies = policy.fees.scope === 'everyone' || person.classification === 'contractor_1099';
  return {
    current: { method: person.preferred, handle: person.handle, bank: bank ? (bank as { display_name: string }).display_name : null },
    canSaveBank: encryptionKeyOrNull() != null,
    defaultMethod: policy.defaultMethod,
    options: policy.enabled.map((m) => {
      const rule = policy.fees.fees[m];
      const fee = feeApplies ? describeRule(m, rule) : null;
      return {
        method: m,
        label: PAYOUT_METHOD_INFO[m].label,
        needsHandle: m === 'venmo' || m === 'cashapp' || m === 'zelle',
        fee,
        exampleFeeOn500: fee ? ruleAmount(rule, 50_000, policy.fees.maxPercent) : 0,
        consentRequired: !!fee && policy.fees.requiresConsent,
        consentTerms: fee ? consentTerms(m, rule, policy.fees.maxPercent) : null,
        consented: person.consented.has(m),
        consentedAt: ((consents ?? []) as Array<{ method: string; agreed_at: string }>).find((c) => c.method === m)?.agreed_at ?? null,
      };
    }),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await view(session.user.email));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { method?: unknown; handle?: unknown; bank?: { routing?: string; account?: string; account_type?: string }; consent?: unknown };
  if (!isPayoutMethod(b.method)) return NextResponse.json({ error: 'Choose how you want to be paid.' }, { status: 400 });
  const method: PayoutMethod = b.method;
  const { policy } = await loadPolicy();
  if (!policy.enabled.includes(method)) return NextResponse.json({ error: `${PAYOUT_METHOD_INFO[method].label} is not offered here.` }, { status: 400 });

  // Handle, checked per method
  let handle: string | null = null;
  if (method === 'venmo' || method === 'cashapp' || method === 'zelle') {
    handle = typeof b.handle === 'string' ? b.handle.trim().slice(0, 80) : '';
    if (!handle) return NextResponse.json({ error: `Add your ${PAYOUT_METHOD_INFO[method].label} ${method === 'cashapp' ? '$cashtag' : method === 'zelle' ? 'email or phone' : 'username, phone or email'}.` }, { status: 400 });
    if (method === 'venmo' && !venmoRecipient(handle)) return NextResponse.json({ error: 'That is not a Venmo username, phone number or email.' }, { status: 400 });
    if (method === 'cashapp' && !/^\$?[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(handle)) return NextResponse.json({ error: 'A Cash App $cashtag looks like $YourName.' }, { status: 400 });
    if (method === 'cashapp' && !handle.startsWith('$')) handle = `$${handle}`;
    if (method === 'zelle' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(handle) && handle.replace(/\D/g, '').length !== 10) {
      return NextResponse.json({ error: 'Zelle needs the email or 10-digit phone your bank uses for Zelle.' }, { status: 400 });
    }
  }

  // Bank details for direct deposit
  const person = (await loadPeople([email], policy)).get(email)!;
  if (method === 'ach') {
    const bank = b.bank;
    if (bank?.routing || bank?.account) {
      const routing = String(bank.routing ?? '').replace(/\D/g, '');
      const account = String(bank.account ?? '').replace(/[^\d]/g, '');
      if (!isValidRouting(routing)) return NextResponse.json({ error: 'That routing number is not valid — it is the 9-digit number at the bottom left of a check.' }, { status: 400 });
      if (account.length < 4 || account.length > 17) return NextResponse.json({ error: 'The account number should be 4 to 17 digits.' }, { status: 400 });
      const key = encryptionKeyOrNull();
      if (!key) return NextResponse.json({ error: 'Bank details cannot be saved yet — ask the office (the encryption key is not set up).' }, { status: 503 });
      const { error } = await supabaseAdmin.rpc('save_payout_bank', { p_email: email, p_routing: routing, p_account: account, p_type: bank.account_type === 'savings' ? 'savings' : 'checking', p_key: key });
      if (error) return NextResponse.json({ error: `Bank details not saved: ${scrubAchFromMessage(error.message)}` }, { status: 400 });
      try {
        await supabaseAdmin.from('activity_log').insert({ user_email: email, action_type: 'payout_bank_saved', entity_type: 'employee_payment_methods', entity_id: email, metadata: { last4: account.slice(-4) } });
      } catch { /* advisory */ }
    } else if (!person.hasBank) {
      return NextResponse.json({ error: 'Add your bank routing and account number for direct deposit.' }, { status: 400 });
    }
  }

  // A fee needs written consent to its exact wording
  const rule = policy.fees.fees[method];
  const feeApplies = (policy.fees.scope === 'everyone' || person.classification === 'contractor_1099') && !!describeRule(method, rule);
  if (feeApplies && policy.fees.requiresConsent && !person.consented.has(method)) {
    if (b.consent !== true) {
      return NextResponse.json({ error: `${PAYOUT_METHOD_INFO[method].label} carries a fee. Agree to it to choose it, or pick a free method.`, needsConsent: true }, { status: 400 });
    }
    await supabaseAdmin.from('payout_fee_consents').update({ revoked_at: new Date().toISOString() }).eq('user_email', email.toLowerCase()).eq('method', method).is('revoked_at', null);
    const { error } = await supabaseAdmin.from('payout_fee_consents').insert({
      user_email: email.toLowerCase(), method, terms: consentTerms(method, rule, policy.fees.maxPercent), fee_snapshot: rule ?? {},
    });
    if (error) return NextResponse.json({ error: `Your agreement could not be recorded: ${error.message}` }, { status: 500 });
  }

  const { error: pErr } = await supabaseAdmin.from('employee_profiles').upsert({ user_email: email, payout_method: method, payout_handle: handle }, { onConflict: 'user_email' });
  if (pErr) return NextResponse.json({ error: `Not saved: ${pErr.message}` }, { status: 500 });
  try {
    await supabaseAdmin.from('activity_log').insert({ user_email: email, action_type: 'payout_method_chosen', entity_type: 'employee_profiles', entity_id: email, metadata: { method } });
  } catch { /* advisory */ }
  return NextResponse.json(await view(email));
}
