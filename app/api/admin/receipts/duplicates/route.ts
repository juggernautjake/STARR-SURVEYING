// app/api/admin/receipts/duplicates/route.ts — review possible duplicate receipts, side by side.
//
//   GET  ?status=open|all         → { pairs: [...], counts }  each pair carries BOTH receipts in full
//   POST { id, action: 'keep_both' }                → not a duplicate; never flagged again
//   POST { id, action: 'remove', remove: 'a' | 'b' } → that receipt is removed (soft — `deleted_at`,
//                                                       restorable), with the reason recorded
//   POST { action: 'rescan' }                        → check every receipt again (backfill)
//
// Owner, 2026-10-06: "flag the receipts and let the user review them together and decide what to do."
// Admin only, like approving a receipt — removing one is a bookkeeping decision.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { RECEIPTS_BUCKET } from '@/worker/src/services/receipt-extraction-core';
import { scanAllReceipts } from '@/lib/receipts/duplicate-scan';

const SIGNED_URL_TTL_SEC = 60 * 30;

const DETAIL_COLS =
  'id, user_id, vendor_name, vendor_address, transaction_at, subtotal_cents, tax_cents, tip_cents, total_cents, ' +
  'payment_method, payment_last4, category, status, photo_url, ai_extras, created_at, job_id, notes, deleted_at';

async function receiptDetails(ids: string[]) {
  if (ids.length === 0) return new Map<string, Record<string, unknown>>();
  const { data: rows } = await supabaseAdmin.from('receipts').select(DETAIL_COLS).in('id', ids);
  const list = (rows ?? []) as unknown as Array<Record<string, unknown>>;

  const { data: items } = await supabaseAdmin
    .from('receipt_line_items')
    .select('receipt_id, description, amount_cents, quantity, position')
    .in('receipt_id', ids)
    .is('removed_at', null)
    .order('position');
  const itemsBy = new Map<string, unknown[]>();
  for (const it of (items ?? []) as Array<{ receipt_id: string }>) {
    if (!itemsBy.has(it.receipt_id)) itemsBy.set(it.receipt_id, []);
    itemsBy.get(it.receipt_id)!.push(it);
  }

  // Who submitted each — a duplicate filed by two different people is the case a per-person check missed.
  const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
  const people = new Map<string, { email: string | null; name: string | null }>();
  if (userIds.length) {
    const { data: users } = await supabaseAdmin.from('registered_users').select('id, email, name').in('id', userIds);
    for (const u of (users ?? []) as Array<{ id: string; email: string | null; name: string | null }>) people.set(u.id, u);
  }

  const out = new Map<string, Record<string, unknown>>();
  await Promise.all(list.map(async (r) => {
    let photo: string | null = null;
    if (r.photo_url) {
      const { data } = await supabaseAdmin.storage.from(RECEIPTS_BUCKET).createSignedUrl(r.photo_url as string, SIGNED_URL_TTL_SEC);
      photo = data?.signedUrl ?? null;
    }
    const who = people.get(r.user_id as string);
    out.set(r.id as string, {
      ...r,
      receipt_number: (r.ai_extras as { receipt_number?: string } | null)?.receipt_number ?? null,
      ai_extras: undefined,
      photo_signed_url: photo,
      submitted_by: who?.name || who?.email || null,
      items: itemsBy.get(r.id as string) ?? [],
    });
  }));
  return out;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = new URL(req.url).searchParams.get('status') ?? 'open';
  let q = supabaseAdmin
    .from('receipt_duplicate_candidates')
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pairs = (data ?? []) as Array<Record<string, unknown>>;
  const ids = [...new Set(pairs.flatMap((p) => [p.receipt_a as string, p.receipt_b as string]))];
  const details = await receiptDetails(ids);

  const { count: openCount } = await supabaseAdmin
    .from('receipt_duplicate_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  return NextResponse.json({
    pairs: pairs
      .map((p) => ({ ...p, a: details.get(p.receipt_a as string) ?? null, b: details.get(p.receipt_b as string) ?? null }))
      // A pair whose receipt has since been removed elsewhere has nothing left to decide.
      .filter((p) => p.a && p.b && (status !== 'open' || (!p.a.deleted_at && !p.b.deleted_at))),
    counts: { open: openCount ?? 0 },
  });
}, { routeName: 'receipts/duplicates' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string; remove?: 'a' | 'b'; note?: string };
  const actor = session.user.email.toLowerCase();
  const now = new Date().toISOString();

  if (body.action === 'rescan') {
    const result = await scanAllReceipts();
    return NextResponse.json(result);
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { data: pair } = await supabaseAdmin.from('receipt_duplicate_candidates').select('*').eq('id', body.id).maybeSingle();
  if (!pair) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (pair.status !== 'open') return NextResponse.json({ error: `Already decided (${pair.status}).` }, { status: 409 });

  if (body.action === 'keep_both') {
    await supabaseAdmin.from('receipt_duplicate_candidates')
      .update({ status: 'keep_both', decided_by: actor, decided_at: now, decision_note: body.note ?? null, updated_at: now })
      .eq('id', body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove' && (body.remove === 'a' || body.remove === 'b')) {
    const removeId = body.remove === 'a' ? pair.receipt_a : pair.receipt_b;
    const keepId = body.remove === 'a' ? pair.receipt_b : pair.receipt_a;
    // Soft, like every receipt delete: the row and its photo stay, out of the queue and the totals.
    const { error } = await supabaseAdmin.from('receipts')
      .update({ deleted_at: now, deletion_reason: `Duplicate of receipt ${keepId} — removed by ${actor}${body.note ? `: ${body.note}` : ''}`, updated_at: now })
      .eq('id', removeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabaseAdmin.from('receipt_duplicate_candidates')
      .update({ status: body.remove === 'a' ? 'removed_a' : 'removed_b', decided_by: actor, decided_at: now, decision_note: body.note ?? null, updated_at: now })
      .eq('id', body.id);
    // Any other open pair involving the removed receipt has nothing left to decide.
    // Two plain updates, not one `.or()`: PostgREST rejects an OR filter on UPDATE (see
    // __tests__/receipts/update-filters-cannot-use-or.test.ts), and the rejection is silent here.
    const gone = { status: 'gone', updated_at: now, decision_note: 'The other receipt was removed as a duplicate.' };
    await supabaseAdmin.from('receipt_duplicate_candidates').update(gone).eq('status', 'open').eq('receipt_a', removeId);
    await supabaseAdmin.from('receipt_duplicate_candidates').update(gone).eq('status', 'open').eq('receipt_b', removeId);
    return NextResponse.json({ ok: true, removed: removeId, kept: keepId });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}, { routeName: 'receipts/duplicates' });
