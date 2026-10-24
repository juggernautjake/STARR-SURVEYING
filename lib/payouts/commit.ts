// lib/payouts/commit.ts — "Commit payout": approve the batch and send every line its own way.
//
// Owner, 2026-10-11: "whenever the boss confirms the hours and is ready to payout for the confirmed
// hours, then he can commit the payout and it will automatically pay out everyone according to their
// preferred payment methods … make it so that it works every time!"
//
// ── HOW "EVERY TIME" IS KEPT ───────────────────────────────────────────────────────────────────
//
// 1. PREFLIGHT, per line, against TODAY's settings and details (lib/payouts/routing.ts). If the person
//    fixed their bank details after the batch was built, Commit uses the fix; if a method was switched
//    off, the fallback applies. A line that still cannot be paid is HELD with its reason — everyone
//    else is paid. Nothing is ever sent to a guess.
// 2. ONE KEY PER LINE, stamped before any send (`idempotency_key`, unique in seed 677). PayPal gets a
//    batch id derived from the exact set of lines it carries, and PayPal refuses a repeat. So pressing
//    Commit twice, a timeout, or a redeploy mid-send cannot pay anybody twice.
// 3. EACH RAIL ON ITS OWN. A PayPal outage marks the Venmo lines failed (with the reason, and the
//    tap-to-pay link still there) and does not stop the bank file, the checks or the cash sheet.
// 4. RE-RUNNABLE. Commit only acts on lines still `pending`, so after fixing a held line you press
//    Commit again and it pays just that line.
// 5. EVERYTHING RECORDED in `payout_dispatch_events`.

import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { disbursedCents } from '@/lib/payroll/disbursement';
import { buildPayoutDeepLink, buildPayoutNote, type DispatchItem } from './dispatch';
import { isPayoutMethod, PAYOUT_METHOD_INFO, type PayoutMethod } from './methods';
import { resolvePayout } from './routing';
import { railFor, RAIL_ORDER, type RailKind } from './rails';
import { createVenmoPayout, getVenmoPayoutStatus, mapPayPalItemStatus, paypalConfig } from './paypal';
import { loadPolicy, loadPeople, logDispatch, orgId, readBanks } from './server';
import { markPayoutItem, rollBatchStatus } from './mark-item';
import type { PayoutBatchStatus } from './dispatch';

export interface CommitLine {
  id: string;
  user_email: string;
  user_name: string | null;
  method: PayoutMethod | null;
  handle: string | null;
  send_cents: number;
  fee_cents: number;
  status: string;
  rail: RailKind;
  /** What happened / what to do next for this line. */
  outcome: string;
  /** Commit has already taken this line (it has its once-only key). */
  committed: boolean;
  link?: string | null;
  check_number?: number | null;
}

export interface CommitGroup {
  method: PayoutMethod | 'unassigned';
  label: string;
  rail: RailKind;
  automatic: boolean;
  summary: string;
  setup: string | null;
  total_cents: number;
  lines: CommitLine[];
  /** Downloads/prints for this group: the bank file, the checks PDF, the cash sheet. */
  artefacts: Array<{ label: string; href: string }>;
}

export interface CommitResult {
  ok: boolean;
  batch_status: PayoutBatchStatus;
  groups: CommitGroup[];
  held: Array<{ id: string; user_email: string; reason: string }>;
  errors: string[];
}

interface ItemRow {
  id: string; batch_id: string; user_email: string; user_name: string | null; total_cents: number; recovered_cents: number | null;
  fee_cents: number | null; fee_note: string | null; method: string | null; method_handle: string | null; status: 'pending' | 'sent' | 'paid' | 'failed';
  rail: string | null; idempotency_key: string | null; provider_batch_id: string | null; check_id: string | null; external_ref: string | null; failure_reason: string | null;
  /** Why this line is paid the way it is (fallback used, fee waived …) — from routing, for the screen. */
  notes?: string[];
}

const ITEM_COLS = 'id, batch_id, user_email, user_name, total_cents, recovered_cents, fee_cents, fee_note, method, method_handle, status, rail, idempotency_key, provider_batch_id, check_id, external_ref, failure_reason';
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

async function loadBatch(batchId: string) {
  const { data: batch } = await supabaseAdmin.from('payout_batches').select('id, label, status, created_by, total_cents').eq('id', batchId).maybeSingle();
  const { data: items } = await supabaseAdmin.from('payout_batch_items').select(ITEM_COLS).eq('batch_id', batchId).order('user_email');
  return { batch: batch as { id: string; label: string; status: PayoutBatchStatus; created_by: string; total_cents: number } | null, items: (items ?? []) as ItemRow[] };
}

/**
 * Re-resolve every PENDING line against today's settings and details. Returns the lines that can be
 * paid and the ones held, and writes any change (method, handle, fee) back to the line with a note.
 * `write: false` for the preview — it changes nothing.
 */
async function preflight(items: ItemRow[], write: boolean) {
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'failed');
  const { policy, settings } = await loadPolicy();
  const people = await loadPeople(pending.map((i) => i.user_email), policy);
  const ready: ItemRow[] = [];
  const held: CommitResult['held'] = [];
  for (const it of pending) {
    const person = people.get(it.user_email)!;
    const r = resolvePayout(person, policy, it.total_cents - Math.max(0, it.recovered_cents ?? 0));
    if (r.problems.length || !r.method) {
      held.push({ id: it.id, user_email: it.user_email, reason: r.problems.join(' ') || 'No payment method.' });
      continue;
    }
    const changed = r.method !== it.method || (r.handle ?? null) !== (it.method_handle ?? null) || r.feeCents !== (it.fee_cents ?? 0);
    if (changed && write) {
      const { error } = await supabaseAdmin.from('payout_batch_items')
        .update({ method: r.method, method_handle: r.handle, fee_cents: r.feeCents, fee_note: r.feeNote })
        .eq('id', it.id).in('status', ['pending', 'failed']);
      if (error) { held.push({ id: it.id, user_email: it.user_email, reason: `Could not update the line: ${error.message}` }); continue; }
      await logDispatch(it.batch_id, 'system', 'line_re_resolved', { from: { method: it.method, fee: it.fee_cents }, to: { method: r.method, fee: r.feeCents }, notes: r.notes }, it.id);
    }
    ready.push({ ...it, method: r.method, method_handle: r.handle, fee_cents: r.feeCents, fee_note: r.feeNote, notes: r.notes });
  }
  return { ready, held, policy, settings };
}

function groupLines(items: ItemRow[], held: CommitResult['held'], policy: Awaited<ReturnType<typeof loadPolicy>>['policy'], batchId: string, batchLabel: string, artefactsFor: (m: PayoutMethod | 'unassigned') => CommitGroup['artefacts'], outcomeFor: (i: ItemRow) => string): CommitGroup[] {
  const heldIds = new Set(held.map((h) => h.id));
  const byMethod = new Map<PayoutMethod | 'unassigned', ItemRow[]>();
  for (const it of items) {
    const m = heldIds.has(it.id) || !isPayoutMethod(it.method) ? 'unassigned' : it.method;
    byMethod.set(m, [...(byMethod.get(m) ?? []), it]);
  }
  return RAIL_ORDER.filter((m) => byMethod.has(m)).map((m) => {
    const rows = byMethod.get(m)!;
    const rail = railFor(m === 'unassigned' ? null : m, policy.rails);
    return {
      method: m,
      label: m === 'unassigned' ? 'Held — needs attention' : PAYOUT_METHOD_INFO[m].label,
      rail: rail.kind, automatic: rail.automatic, summary: m === 'unassigned' ? 'These lines are not sent until fixed. Everyone else is paid.' : rail.summary, setup: rail.setup,
      total_cents: rows.reduce((s, r) => s + disbursedCents(r), 0),
      artefacts: artefactsFor(m),
      lines: rows.map((r) => ({
        id: r.id, user_email: r.user_email, user_name: r.user_name, method: isPayoutMethod(r.method) ? r.method : null, handle: r.method_handle,
        send_cents: disbursedCents(r), fee_cents: r.fee_cents ?? 0, status: r.status, rail: rail.kind, committed: !!r.idempotency_key,
        outcome: heldIds.has(r.id) ? held.find((h) => h.id === r.id)!.reason : outcomeFor(r),
        link: (r.method === 'venmo' || r.method === 'cashapp' || r.method === 'zelle') && r.status !== 'paid'
          ? buildPayoutDeepLink({ ...(r as unknown as DispatchItem), method: r.method as PayoutMethod, method_handle: r.method_handle }, batchLabel)
          : null,
      })),
    };
  });
}

function artefacts(batchId: string, rails: { ach: boolean; checks: boolean }) {
  return (m: PayoutMethod | 'unassigned'): CommitGroup['artefacts'] => {
    if (m === 'ach') return rails.ach
      ? [{ label: 'Download bank file (NACHA) for PNC', href: `/api/admin/payouts/runs/${batchId}/nacha` }]
      : [{ label: 'Download bank list (CSV)', href: `/api/admin/payouts/runs/${batchId}/ach-csv` }];
    if (m === 'check') return [{ label: 'Print checks (PDF)', href: `/api/admin/payouts/runs/${batchId}/checks` }];
    if (m === 'cash') return [{ label: 'Print cash sheet', href: `/admin/payouts/runs/${batchId}/cash-sheet` }];
    return [];
  };
}

function plainOutcome(i: ItemRow): string {
  if (i.status === 'paid') return 'Paid.';
  if (i.status === 'failed') return `Failed: ${i.failure_reason ?? 'unknown reason'}`;
  if (i.status === 'sent') {
    if (i.method === 'venmo' && i.provider_batch_id) return 'Sent through PayPal — waiting for Venmo to confirm.';
    if (i.method === 'ach') return 'In the bank file — the bank is paying it.';
    if (i.method === 'check') return 'Check printed — mark paid when handed over.';
    return 'Sent.';
  }
  switch (i.method) {
    case 'ach': return 'In the bank file — upload it to PNC, then press "Uploaded".';
    case 'check': return i.check_id ? 'Check numbered — print, sign, then hand over.' : 'Check to print.';
    case 'cash': return 'Hand over cash and have them sign the sheet, then mark paid.';
    case 'cashapp': return 'Tap the link to pay in Cash App, then mark paid.';
    case 'zelle': return 'Send from the bank\'s Zelle, then mark paid.';
    case 'venmo': return 'Tap the link to pay in Venmo, then mark paid.';
    default: return 'Pay, then mark paid.';
  }
}

/** What Commit would do, without doing it. */
export async function previewCommit(batchId: string): Promise<CommitResult & { batch_label?: string }> {
  const { batch, items } = await loadBatch(batchId);
  if (!batch) return { ok: false, batch_status: 'draft', groups: [], held: [], errors: ['Batch not found.'] };
  const { ready, held, policy } = await preflight(items, false);
  const readyById = new Map(ready.map((r) => [r.id, r]));
  const view = items.map((i) => readyById.get(i.id) ?? i);
  return {
    ok: true, batch_status: batch.status, batch_label: batch.label, held, errors: [],
    // Before Commit: what WILL happen. After: the next step for each line (or what already happened).
    groups: groupLines(view, held, policy, batchId, batch.label, artefacts(batchId, policy.rails),
      (i) => (batch.status === 'draft'
        ? [`Will be: ${railFor(i.method as PayoutMethod, policy.rails).summary}`, ...(i.notes ?? [])].join(' ')
        : [plainOutcome(i), ...(i.status === 'pending' ? i.notes ?? [] : [])].join(' '))),
  };
}

export interface CommitOptions { actor: string; canApprove: boolean; ip: string | null }

export async function commitBatch(batchId: string, opts: CommitOptions): Promise<CommitResult> {
  const errors: string[] = [];
  const { batch, items } = await loadBatch(batchId);
  if (!batch) return { ok: false, batch_status: 'draft', groups: [], held: [], errors: ['Batch not found.'] };
  if (batch.status === 'voided' || batch.status === 'completed') {
    return { ok: false, batch_status: batch.status, groups: [], held: [], errors: [`This batch is ${batch.status}; there is nothing to commit.`] };
  }

  // ── Approve, if it is still a draft ──
  if (batch.status === 'draft') {
    if (!opts.canApprove) return { ok: false, batch_status: 'draft', groups: [], held: [], errors: ['Only a payout admin can commit a payout.'] };
    const { settings } = await loadPolicy();
    if (settings.two_person_approval && batch.created_by === opts.actor && !process.env.PAYOUT_ADMIN_SELF_APPROVE) {
      return { ok: false, batch_status: 'draft', groups: [], held: [], errors: ['Two-person approval is on: a different admin must commit a batch they did not build.'] };
    }
    const { error } = await supabaseAdmin.from('payout_batches')
      .update({ status: 'approved', approved_by: opts.actor, approved_at: new Date().toISOString(), approval_ip: opts.ip })
      .eq('id', batchId).eq('status', 'draft');
    if (error) return { ok: false, batch_status: 'draft', groups: [], held: [], errors: [`Could not approve: ${error.message}`] };
    await logDispatch(batchId, opts.actor, 'approved');
  }

  const { ready, held, policy } = await preflight(items, true);
  for (const h of held) await logDispatch(batchId, opts.actor, 'held', { reason: h.reason }, h.id);

  // ── One key per line, before anything is sent ──
  for (const it of ready) {
    if (!it.idempotency_key) {
      const key = `${batchId}:${it.id}`;
      await supabaseAdmin.from('payout_batch_items').update({ idempotency_key: key, rail: railFor(it.method as PayoutMethod, policy.rails).kind }).eq('id', it.id).is('idempotency_key', null);
      it.idempotency_key = key;
    }
  }
  const by = (m: PayoutMethod) => ready.filter((i) => i.method === m && (i.status === 'pending' || i.status === 'failed'));

  // ── Account: credited now ──
  for (const it of by('account')) {
    const r = await markPayoutItem(batchId, it.id, { status: 'paid', external_ref: 'Credited to pay account' });
    if (!r.ok) errors.push(`${it.user_email}: ${r.error}`);
    await logDispatch(batchId, opts.actor, r.ok ? 'account_credited' : 'account_failed', { error: r.error ?? null }, it.id, 'ledger');
  }

  // ── Venmo: PayPal Payouts when connected ──
  const venmo = by('venmo').filter((i) => !i.provider_batch_id && disbursedCents(i) > 0);
  const pp = paypalConfig();
  if (venmo.length && pp) {
    // The PayPal batch id is derived from the exact set of lines: a repeat of the same set is refused
    // by PayPal as a duplicate; a later Commit for newly-fixed lines gets its own id.
    const setHash = createHash('sha256').update(venmo.map((i) => i.id).sort().join(',')).digest('hex').slice(0, 16);
    const senderBatchId = `starr-${batchId}-venmo-${setHash}`;
    try {
      const res = await createVenmoPayout(pp, senderBatchId, venmo.map((i) => ({
        itemId: i.id, handle: i.method_handle ?? '', amountCents: disbursedCents(i), note: buildPayoutNote(batch.label, i),
      })), `Payout: ${batch.label}`);
      for (const it of venmo) {
        await markPayoutItem(batchId, it.id, { status: 'sent', external_ref: res.payoutBatchId, extra: { provider_batch_id: res.payoutBatchId, provider_status: res.batchStatus } });
      }
      await logDispatch(batchId, opts.actor, 'paypal_sent', { payout_batch_id: res.payoutBatchId, lines: venmo.length, sender_batch_id: senderBatchId }, null, 'api');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Venmo (PayPal): ${msg}`);
      for (const it of venmo) await markPayoutItem(batchId, it.id, { status: 'failed', failure_reason: `${msg} — use the Venmo link instead, or Commit again.` });
      await logDispatch(batchId, opts.actor, 'paypal_failed', { error: msg }, null, 'api');
    }
  }

  // ── Bank: check every bank line can be put in the file now, so the download cannot fail later ──
  const ach = by('ach');
  if (ach.length && policy.rails.ach) {
    try {
      const banks = await readBanks(ach.map((i) => i.user_email), opts.actor, 'payroll_dispatch');
      for (const it of ach) {
        if (!banks.has(it.user_email.toLowerCase())) {
          held.push({ id: it.id, user_email: it.user_email, reason: 'Bank details could not be read for the bank file.' });
        }
      }
      await logDispatch(batchId, opts.actor, 'bank_file_ready', { lines: ach.length }, null, 'file');
    } catch (e) {
      errors.push(`Bank file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Checks: number every check line that has no check yet ──
  const checkLines = by('check').filter((i) => !i.check_id && disbursedCents(i) > 0);
  if (checkLines.length) {
    try {
      const { data: nums, error } = await supabaseAdmin.rpc('take_payout_check_numbers', { p_org: orgId(), p_count: checkLines.length });
      if (error) throw new Error(error.message);
      const numbers = (nums ?? []) as number[];
      for (let k = 0; k < checkLines.length; k++) {
        const it = checkLines[k];
        const { data: chk, error: cErr } = await supabaseAdmin.from('payout_checks').insert({
          org_id: orgId(), check_number: numbers[k], batch_id: batchId, payout_batch_item_id: it.id, payee_email: it.user_email,
          payee_name: it.user_name ?? it.user_email, amount_cents: disbursedCents(it), memo: batch.label.slice(0, 60), status: 'printed',
          stub: { total_cents: it.total_cents, recovered_cents: it.recovered_cents ?? 0, fee_cents: it.fee_cents ?? 0, fee_note: it.fee_note }, created_by: opts.actor,
        }).select('id').single();
        if (cErr || !chk) throw new Error(cErr?.message ?? 'check not recorded');
        await supabaseAdmin.from('payout_batch_items').update({ check_id: chk.id, external_ref: `Check #${numbers[k]}` }).eq('id', it.id);
        it.check_id = chk.id;
      }
      await logDispatch(batchId, opts.actor, 'checks_numbered', { numbers }, null, 'print');
    } catch (e) {
      errors.push(`Checks: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const status = await rollBatchStatus(batchId, 'approved');
  await logDispatch(batchId, opts.actor, 'committed', { ready: ready.length, held: held.length, errors });
  const { items: after } = await loadBatch(batchId);
  return {
    ok: errors.length === 0,
    batch_status: status,
    held,
    errors,
    groups: groupLines(after, held, policy, batchId, batch.label, artefacts(batchId, policy.rails), plainOutcome),
  };
}

/** Pull Venmo statuses back from PayPal and settle the lines. Safe to run any time. */
export async function syncProviderStatuses(batchId: string): Promise<{ updated: number; error?: string }> {
  const pp = paypalConfig();
  if (!pp) return { updated: 0 };
  const { items } = await loadBatch(batchId);
  const providerBatches = [...new Set(items.filter((i) => i.provider_batch_id && i.status === 'sent').map((i) => i.provider_batch_id!))];
  let updated = 0;
  for (const pb of providerBatches) {
    try {
      const statuses = await getVenmoPayoutStatus(pp, pb);
      for (const s of statuses) {
        const it = items.find((i) => i.id === s.senderItemId);
        if (!it) continue;
        const m = mapPayPalItemStatus(s.transactionStatus);
        await supabaseAdmin.from('payout_batch_items').update({ provider_item_id: s.payoutItemId, provider_status: s.transactionStatus }).eq('id', it.id);
        if (m.status !== it.status) {
          await markPayoutItem(batchId, it.id, m.status === 'failed' ? { status: m.status, failure_reason: `Venmo: ${s.error ?? s.transactionStatus}` } : { status: m.status, external_ref: s.payoutItemId });
          updated++;
        }
      }
    } catch (e) {
      return { updated, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { updated };
}

export { money as formatCents };
