// lib/payouts/checks-server.ts — printing, voiding and reissuing payroll checks.
//
// Plan: docs/planning/pending/CHECK_PRINTING_2026-10-11.md. Numbers come from
// `take_payout_check_numbers` (seed 677), which locks the counter, so a number is used once ever; a
// spoiled or lost check is VOIDED and its line gets a NEW number — never the same one again.

import { supabaseAdmin } from '@/lib/supabase';
import { disbursedCents } from '@/lib/payroll/disbursement';
import { renderChecksPdf } from '@/lib/checks/render';
import { stubLinesFor, type CheckBank, type CheckDoc } from '@/lib/checks/layout';
import { checksProblems, loadPayoutSettings, logDispatch, orgId, readCheckAccount } from './server';

interface CheckRow {
  id: string; check_number: number; batch_id: string | null; payout_batch_item_id: string | null; payee_email: string | null; payee_name: string;
  amount_cents: number; issue_date: string; memo: string | null; status: string; void_reason: string | null; reissue_of: string | null;
  stub: Record<string, unknown>; created_at: string; issued_at: string | null; voided_at: string | null;
}
const CHECK_COLS = 'id, check_number, batch_id, payout_batch_item_id, payee_email, payee_name, amount_cents, issue_date, memo, status, void_reason, reissue_of, stub, created_at, issued_at, voided_at';

async function bankFor(actor: string): Promise<CheckBank> {
  const s = await loadPayoutSettings();
  const problems = checksProblems(s);
  if (problems.length) throw new Error(`Checks are not set up yet: ${problems.join(' ')}`);
  const c = s.checks;
  return {
    stock: c.stock === 'blank_micr' ? 'blank_micr' : 'preprinted',
    payer_name: c.payer_name ?? '',
    payer_address: c.payer_address,
    bank_name: c.bank_name,
    bank_address: c.bank_address,
    routing: c.routing,
    account: c.stock === 'blank_micr' ? (await readCheckAccount(actor)) ?? undefined : undefined,
    signature_lines: c.signature_lines === 2 ? 2 : 1,
    offset_x_mm: Number(c.offset_x_mm ?? 0) || 0,
    offset_y_mm: Number(c.offset_y_mm ?? 0) || 0,
  };
}

/** The PDF for a batch's live (not voided) checks. */
export async function batchChecksPdf(batchId: string, actor: string, opts: { copy?: boolean; test?: boolean } = {}): Promise<Buffer> {
  const bank = await bankFor(actor);
  const s = await loadPayoutSettings();
  const { data: batch } = await supabaseAdmin.from('payout_batches').select('label').eq('id', batchId).maybeSingle();
  const { data: checks } = await supabaseAdmin.from('payout_checks').select(CHECK_COLS).eq('batch_id', batchId).neq('status', 'void').order('check_number');
  const rows = (checks ?? []) as CheckRow[];
  if (rows.length === 0 && !opts.test) throw new Error('This batch has no checks to print. Commit the payout first.');
  const itemIds = rows.map((r) => r.payout_batch_item_id).filter(Boolean) as string[];
  const { data: items } = itemIds.length
    ? await supabaseAdmin.from('payout_batch_items').select('id, hours_cents, bonuses_cents, reimbursements_cents, adjustments_cents, total_cents, recovered_cents, fee_cents, fee_note').in('id', itemIds)
    : { data: [] };
  const byItem = new Map(((items ?? []) as Array<{ id: string } & Parameters<typeof stubLinesFor>[0]>).map((i) => [i.id, i]));
  const docs: CheckDoc[] = (opts.test && rows.length === 0
    ? [{ id: 'test', check_number: 1000, payee_name: 'ALIGNMENT TEST', amount_cents: 123_456, issue_date: new Date().toISOString().slice(0, 10), memo: 'Alignment test', payout_batch_item_id: null, payee_email: null } as unknown as CheckRow]
    : rows
  ).map((r) => {
    const item = r.payout_batch_item_id ? byItem.get(r.payout_batch_item_id) : undefined;
    return {
      check_number: r.check_number,
      issue_date: r.issue_date,
      payee_name: opts.test ? 'ALIGNMENT TEST' : r.payee_name,
      payee_email: r.payee_email,
      amount_cents: r.amount_cents,
      memo: r.memo ?? '',
      period_label: (batch as { label?: string } | null)?.label ?? 'Payroll',
      stub_lines: item ? stubLinesFor(item, r.amount_cents) : [{ label: 'Pay', amount_cents: r.amount_cents, kind: 'total' as const }],
      void_after_days: Number(s.checks.void_after_days ?? 90) || 90,
    };
  });
  await logDispatch(batchId, actor, opts.test ? 'checks_alignment_test' : opts.copy ? 'checks_copy_printed' : 'checks_pdf', { numbers: rows.map((r) => r.check_number) }, null, 'print');
  return renderChecksPdf(docs, bank, { copyWatermark: opts.copy, alignmentTest: opts.test });
}

export async function listChecks(limit = 300): Promise<CheckRow[]> {
  const { data } = await supabaseAdmin.from('payout_checks').select(CHECK_COLS).eq('org_id', orgId()).order('check_number', { ascending: false }).limit(limit);
  return (data ?? []) as CheckRow[];
}

/** Void a check, and optionally reissue its payment on a NEW number. */
export async function voidCheck(checkId: string, actor: string, reason: string, reissue: boolean): Promise<{ ok: boolean; error?: string; newNumber?: number }> {
  const { data: chk } = await supabaseAdmin.from('payout_checks').select(CHECK_COLS).eq('id', checkId).maybeSingle();
  const c = chk as CheckRow | null;
  if (!c) return { ok: false, error: 'Check not found.' };
  if (c.status === 'void') return { ok: false, error: `Check #${c.check_number} is already void.` };
  if (c.status === 'cleared') return { ok: false, error: `Check #${c.check_number} has cleared the bank; it cannot be voided here.` };
  const { error } = await supabaseAdmin.from('payout_checks')
    .update({ status: 'void', void_reason: reason.slice(0, 300) || 'Voided', voided_by: actor, voided_at: new Date().toISOString() })
    .eq('id', checkId).neq('status', 'void');
  if (error) return { ok: false, error: error.message };
  if (c.batch_id) await logDispatch(c.batch_id, actor, 'check_voided', { number: c.check_number, reason }, c.payout_batch_item_id, 'print');

  if (!reissue || !c.payout_batch_item_id) {
    if (c.payout_batch_item_id) await supabaseAdmin.from('payout_batch_items').update({ check_id: null }).eq('id', c.payout_batch_item_id);
    return { ok: true };
  }
  const { data: item } = await supabaseAdmin.from('payout_batch_items').select('id, batch_id, status, total_cents, recovered_cents, fee_cents').eq('id', c.payout_batch_item_id).maybeSingle();
  if (!item || (item as { status: string }).status === 'paid') return { ok: true, error: 'Voided. Not reissued: the payment is already marked paid.' };
  const { data: nums, error: nErr } = await supabaseAdmin.rpc('take_payout_check_numbers', { p_org: orgId(), p_count: 1 });
  if (nErr || !(nums as number[])?.length) return { ok: false, error: `Voided, but no new number: ${nErr?.message ?? 'none returned'}` };
  const num = (nums as number[])[0];
  const { data: fresh, error: iErr } = await supabaseAdmin.from('payout_checks').insert({
    org_id: orgId(), check_number: num, batch_id: c.batch_id, payout_batch_item_id: c.payout_batch_item_id, payee_email: c.payee_email,
    payee_name: c.payee_name, amount_cents: disbursedCents(item as { total_cents: number }), memo: c.memo, status: 'printed', reissue_of: c.id, stub: c.stub, created_by: actor,
  }).select('id').single();
  if (iErr || !fresh) return { ok: false, error: `Voided, but the reissue was not recorded: ${iErr?.message}` };
  await supabaseAdmin.from('payout_batch_items').update({ check_id: fresh.id, external_ref: `Check #${num}`, status: 'pending' }).eq('id', c.payout_batch_item_id).neq('status', 'paid');
  if (c.batch_id) await logDispatch(c.batch_id, actor, 'check_reissued', { voided: c.check_number, number: num }, c.payout_batch_item_id, 'print');
  return { ok: true, newNumber: num };
}
