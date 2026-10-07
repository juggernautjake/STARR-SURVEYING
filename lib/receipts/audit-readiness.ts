// lib/receipts/audit-readiness.ts — what must be checked before a tax period can be locked.
//
// Owner, 2026-10-07: "it needs to be able to compare the results to all other receipts in the system
// for the organization just to make sure that it isn't being uploaded twice, or isn't just a
// duplicate. It should flag all such uploads and should make it where they must be checked before a
// full audit can be done for taxes or anything like that."
//
// Two kinds of blocker, both raised automatically when a receipt is read:
//   1. an OPEN duplicate pair (receipt_duplicate_candidates, every receipt in the company compared
//      with every other — lib/receipts/duplicate-scan.ts). Cleared when a person decides it: "keep
//      both", or remove one.
//   2. a reading the two-read check could not settle (receipts.read_status = 'needs_review',
//      lib/receipts/zoom-read.ts). Cleared when a person approves the receipt or saves a review of
//      it after it was read.
// Locking the period (POST /api/admin/finances/mark-exported) refuses while either remains, and the
// Schedule C tab lists them with links, so "not ready" always comes with what to do about it.
import { supabaseAdmin } from '@/lib/supabase';

export interface AuditBlockers {
  ok: boolean;
  duplicates: Array<{ id: string; receiptA: string; receiptB: string; confidence: string; summary: string }>;
  needsReview: Array<{ id: string; vendor: string | null; date: string | null; totalCents: number | null; reason: string }>;
}

interface ReceiptRow {
  id: string;
  vendor_name: string | null;
  transaction_at: string | null;
  total_cents: number | null;
  status: string | null;
  read_status: string | null;
  read_at: string | null;
  user_reviewed_at: string | null;
  approved_at: string | null;
  ai_extras: { review_flags?: string[] } | null;
}

/** Is this receipt's doubtful reading still waiting on a person? Pure. */
export function readingStillDoubtful(r: Pick<ReceiptRow, 'read_status' | 'read_at' | 'user_reviewed_at' | 'approved_at' | 'status'>): boolean {
  if (r.read_status !== 'needs_review') return false;
  if (r.status === 'approved' || r.status === 'exported' || r.approved_at) return false;
  if (r.user_reviewed_at && (!r.read_at || Date.parse(r.user_reviewed_at) >= Date.parse(r.read_at))) return false;
  return true;
}

/** Blockers among receipts created in [fromIso, toIso] — the same window the lock uses. */
export async function auditBlockers(fromIso: string, toIso: string): Promise<AuditBlockers> {
  const { data, error } = await supabaseAdmin.from('receipts')
    .select('id, vendor_name, transaction_at, total_cents, status, read_status, read_at, user_reviewed_at, approved_at, ai_extras')
    .is('deleted_at', null)
    .neq('status', 'rejected')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .limit(10000);
  if (error) throw new Error(`receipts read failed: ${error.message}`);
  const rows = (data ?? []) as ReceiptRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const needsReview = rows.filter(readingStillDoubtful).map((r) => ({
    id: r.id,
    vendor: r.vendor_name,
    date: r.transaction_at,
    totalCents: r.total_cents,
    reason: (r.ai_extras?.review_flags ?? []).slice(-1)[0] ?? 'The reading could not be confirmed.',
  }));

  const duplicates: AuditBlockers['duplicates'] = [];
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 150) {
    const slice = ids.slice(i, i + 150).join(',');
    const { data: pairs } = await supabaseAdmin.from('receipt_duplicate_candidates')
      .select('id, receipt_a, receipt_b, confidence, reasons')
      .eq('status', 'open')
      .or(`receipt_a.in.(${slice}),receipt_b.in.(${slice})`);
    for (const p of (pairs ?? []) as Array<{ id: string; receipt_a: string; receipt_b: string; confidence: string; reasons: string[] | null }>) {
      if (duplicates.some((d) => d.id === p.id)) continue;
      const a = byId.get(p.receipt_a);
      duplicates.push({
        id: p.id, receiptA: p.receipt_a, receiptB: p.receipt_b, confidence: p.confidence,
        summary: `${a?.vendor_name ?? 'Receipt'}${a?.total_cents != null ? ` $${(a.total_cents / 100).toFixed(2)}` : ''} — ${(p.reasons ?? [])[0] ?? 'looks like the same receipt twice'}`,
      });
    }
  }

  return { ok: duplicates.length === 0 && needsReview.length === 0, duplicates, needsReview };
}
