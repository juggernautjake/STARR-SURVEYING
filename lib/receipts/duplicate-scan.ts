// lib/receipts/duplicate-scan.ts — run the duplicate check against the database and record it.
//
// The scoring is lib/receipts/duplicates.ts (pure, calibrated on the live receipts). This file feeds
// it rows and keeps `receipt_duplicate_candidates` in step:
//   · a new or still-matching pair is written (or refreshed) while it is OPEN;
//   · a pair somebody DECIDED is never touched again — "keep both" means keep both, for good;
//   · an open pair that no longer matches (somebody corrected a total) is closed as 'gone'.
//
// Unlike the checks it supersedes, this compares across ALL employees — the same receipt filed by two
// people is exactly the duplicate a per-person check cannot see.

import { supabaseAdmin } from '@/lib/supabase';
import { compareReceipts, pairKey, type DupReceipt } from './duplicates';

const RECEIPT_COLS = 'id, user_id, vendor_name, transaction_at, total_cents, payment_last4, photo_url, ai_extras, superseded_by_receipt_id, status, deleted_at';

type Row = DupReceipt & { superseded_by_receipt_id: string | null; status: string | null; deleted_at: string | null };

async function loadRows(filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<Row[]> {
  const { data, error } = await filter(base());
  if (error) throw new Error(`receipts read failed: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => r.id as string);
  const items = new Map<string, DupReceipt['items']>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: li } = await supabaseAdmin
      .from('receipt_line_items')
      .select('receipt_id, description, amount_cents')
      .in('receipt_id', ids.slice(i, i + 200))
      .is('removed_at', null);
    for (const it of (li ?? []) as Array<{ receipt_id: string; description: string | null; amount_cents: number | null }>) {
      if (!items.has(it.receipt_id)) items.set(it.receipt_id, []);
      items.get(it.receipt_id)!.push({ description: it.description, amount_cents: it.amount_cents });
    }
  }
  return rows.map((r) => ({
    id: r.id as string,
    user_id: (r.user_id as string | null) ?? null,
    vendor_name: (r.vendor_name as string | null) ?? null,
    transaction_at: (r.transaction_at as string | null) ?? null,
    total_cents: (r.total_cents as number | null) ?? null,
    payment_last4: (r.payment_last4 as string | null) ?? null,
    receipt_number: ((r.ai_extras as { receipt_number?: string } | null)?.receipt_number) ?? null,
    photo_url: (r.photo_url as string | null) ?? null,
    items: items.get(r.id as string) ?? [],
    superseded_by_receipt_id: (r.superseded_by_receipt_id as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }));
}

function base() {
  return supabaseAdmin.from('receipts').select(RECEIPT_COLS).is('deleted_at', null);
}

/** Pairs that are a bill and its card slip are one purchase, not duplicates (same-purchase.ts). */
const linkedAsSamePurchase = (a: Row, b: Row) =>
  a.superseded_by_receipt_id === b.id || b.superseded_by_receipt_id === a.id;

/** Write the verdicts for `subject` against `others`. Returns how many pairs are open afterwards. */
async function record(subject: Row, others: Row[]): Promise<number> {
  const { data: existing } = await supabaseAdmin
    .from('receipt_duplicate_candidates')
    .select('id, receipt_a, receipt_b, status')
    .or(`receipt_a.eq.${subject.id},receipt_b.eq.${subject.id}`);
  const byPair = new Map<string, { id: string; status: string }>();
  for (const e of (existing ?? []) as Array<{ id: string; receipt_a: string; receipt_b: string; status: string }>) {
    byPair.set(`${e.receipt_a}|${e.receipt_b}`, { id: e.id, status: e.status });
  }

  let open = 0;
  const now = new Date().toISOString();
  for (const other of others) {
    if (other.id === subject.id || linkedAsSamePurchase(subject, other)) continue;
    // A receipt already rejected is not competing with anything for approval.
    if (subject.status === 'rejected' && other.status === 'rejected') continue;
    const verdict = compareReceipts(subject, other);
    const [a, b] = pairKey(subject.id, other.id);
    const key = `${a}|${b}`;
    const prior = byPair.get(key);
    if (prior && prior.status !== 'open') continue; // a person decided; never second-guess it
    if (!verdict) {
      if (prior) {
        await supabaseAdmin.from('receipt_duplicate_candidates')
          .update({ status: 'gone', updated_at: now, decision_note: 'No longer matches after an edit.' })
          .eq('id', prior.id);
      }
      continue;
    }
    const row = {
      receipt_a: a, receipt_b: b,
      confidence: verdict.confidence, score: verdict.score,
      reasons: verdict.reasons, matches: verdict.matches,
      updated_at: now,
    };
    if (prior) await supabaseAdmin.from('receipt_duplicate_candidates').update(row).eq('id', prior.id);
    else await supabaseAdmin.from('receipt_duplicate_candidates').insert(row);
    open += 1;
  }
  return open;
}

/** Check one receipt against every other live receipt within a year either side. Never throws. */
export async function scanReceiptForDuplicates(receiptId: string): Promise<{ open: number; error?: string }> {
  try {
    const [subject] = await loadRows((q) => q.eq('id', receiptId));
    if (!subject) return { open: 0 };
    const others = await loadRows((q) => q.neq('id', receiptId).order('created_at', { ascending: false }).limit(2000));
    return { open: await record(subject, others) };
  } catch (err) {
    return { open: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Check every live receipt against every other — the backfill, and the nightly sweep. */
export async function scanAllReceipts(): Promise<{ receipts: number; open: number }> {
  const rows = await loadRows((q) => q.order('created_at', { ascending: false }).limit(5000));
  let open = 0;
  // Each pair once: compare row i with the rows after it, but `record` writes both directions'
  // verdict into the one ordered row, so passing the later rows is enough.
  for (let i = 0; i < rows.length; i += 1) {
    open += await record(rows[i], rows.slice(i + 1));
  }
  return { receipts: rows.length, open };
}

/** Open duplicate pairs touching these receipts — for bulk approve, which must not wave one through. */
export async function openDuplicateIds(receiptIds: string[]): Promise<Set<string>> {
  if (receiptIds.length === 0) return new Set();
  const flagged = new Set<string>();
  for (let i = 0; i < receiptIds.length; i += 100) {
    const slice = receiptIds.slice(i, i + 100).join(',');
    const { data } = await supabaseAdmin
      .from('receipt_duplicate_candidates')
      .select('receipt_a, receipt_b')
      .eq('status', 'open')
      .or(`receipt_a.in.(${slice}),receipt_b.in.(${slice})`);
    for (const r of (data ?? []) as Array<{ receipt_a: string; receipt_b: string }>) {
      flagged.add(r.receipt_a);
      flagged.add(r.receipt_b);
    }
  }
  return flagged;
}
