// app/api/admin/receipts/batch-review/route.ts — what the AI made of the stack you just sent.
//
// Owner, 2026-08-12: *"The user will be able to review the photos, and the AI will determine if there
// are any duplicates or if any information is missing and needs clarification."*
//
// The queue answers the pixel half of that in the browser before anything is uploaded: two shots of
// the same slip look the same, and `findLikelyDuplicates` says so instantly. This answers the half
// that only exists after the model has read the paper —
//
//   * the same purchase photographed twice on DIFFERENT days, or once as a card slip and once as an
//     itemised bill. Different pixels, same vendor + total + date, which is what
//     `dedup_fingerprint` (seed 229) is for and what `extract.ts` already records as
//     `dedup_match_id`.
//   * a receipt the model could not fully read: no vendor, no date, an illegible total.
//
// Neither is known at upload time, and both are the kind of thing that gets fixed in ten seconds
// while the paper is still in somebody's hand and never afterwards.
//
// ── SECURITY SHAPE ────────────────────────────────────────────────────────────────────────────────
//
// Same as `mine`: identity comes from the session, and the query is pinned to it. The ids in the
// request are a FILTER, not an authorisation — asking about somebody else's receipt id returns
// nothing rather than their vendor and total, because the `user_id` predicate is not conditional on
// anything the caller sent.

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const runtime = 'nodejs';

/** A receipt is only ever asked about right after it was sent, so the cap is generous but finite. */
const MAX_IDS = 60;

export interface BatchReviewRow {
  id: string;
  vendor_name: string | null;
  total_cents: number | null;
  transaction_at: string | null;
  category: string | null;
  extraction_status: string | null;
  /** Flags the model and the reconciler raised — an inferred tip, a card not on file. */
  review_flags: string[];
  /** Set when this receipt matches an earlier one of yours on vendor + total + date. */
  duplicateOf: { id: string; vendor_name: string | null; total_cents: number | null } | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ receipts: [] });

  const { data: users, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersErr) {
    console.error('[receipts/batch-review] listUsers failed', { error: usersErr.message });
    return NextResponse.json({ error: 'Could not resolve your account.' }, { status: 500 });
  }
  const me = users?.users.find((u) => u.email?.toLowerCase() === session.user!.email!.toLowerCase());
  if (!me) return NextResponse.json({ receipts: [] });

  const { data: rows, error } = await supabaseAdmin
    .from('receipts')
    .select('id, vendor_name, total_cents, transaction_at, category, extraction_status, ai_extras, dedup_match_id')
    .in('id', ids)
    // The predicate that makes the ids a filter rather than a key. Not conditional on anything.
    .eq('user_id', me.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (rows ?? []) as Array<{
    id: string;
    vendor_name: string | null;
    total_cents: number | null;
    transaction_at: string | null;
    category: string | null;
    extraction_status: string | null;
    ai_extras: { review_flags?: string[] } | null;
    dedup_match_id: string | null;
  }>;

  // One lookup for every duplicate, not one per row: naming the receipt this repeats ("the Buc-ee's
  // for $42.10 you filed on Tuesday") is the difference between a warning somebody can act on and a
  // warning they dismiss.
  const matchIds = Array.from(new Set(list.map((r) => r.dedup_match_id).filter((v): v is string => !!v)));
  const matches = new Map<string, { id: string; vendor_name: string | null; total_cents: number | null }>();
  if (matchIds.length > 0) {
    const { data: m } = await supabaseAdmin
      .from('receipts')
      .select('id, vendor_name, total_cents')
      .in('id', matchIds)
      .eq('user_id', me.id);
    for (const row of (m ?? []) as Array<{ id: string; vendor_name: string | null; total_cents: number | null }>) {
      matches.set(row.id, row);
    }
  }

  const receipts: BatchReviewRow[] = list.map((r) => ({
    id: r.id,
    vendor_name: r.vendor_name,
    total_cents: r.total_cents,
    transaction_at: r.transaction_at,
    category: r.category,
    extraction_status: r.extraction_status,
    review_flags: r.ai_extras?.review_flags ?? [],
    duplicateOf: r.dedup_match_id ? (matches.get(r.dedup_match_id) ?? null) : null,
  }));

  return NextResponse.json({ receipts });
}, { routeName: 'admin/receipts/batch-review' });
