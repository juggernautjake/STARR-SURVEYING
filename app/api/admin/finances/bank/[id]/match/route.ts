// app/api/admin/finances/bank/[id]/match/route.ts
//
// G3 / Phase 2.3b — confirm or ignore a bank transaction.
//
//   POST { action: 'confirm', kind, matched_id }  → status='matched'
//   POST { action: 'ignore' }                      → status='ignored'
//   POST { action: 'reset' }                       → back to 'unmatched'

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const KINDS = new Set(['payout', 'expense', 'payment']);

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // …/finances/bank/<id>/match — id is the second-to-last path segment.
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = decodeURIComponent(parts[parts.length - 2] ?? '');
  if (!id) return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; kind?: string; matched_id?: string };
  const actor = session.user.email ?? null;
  const now = new Date().toISOString();

  if (body.action === 'confirm') {
    if (!KINDS.has(body.kind ?? '') || !body.matched_id) {
      return NextResponse.json({ error: 'confirm requires a valid kind + matched_id' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('bank_transactions')
      .update({ status: 'matched', matched_kind: body.kind, matched_id: body.matched_id, matched_at: now, matched_by: actor })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: 'matched' });
  }

  if (body.action === 'ignore') {
    const { error } = await supabaseAdmin
      .from('bank_transactions')
      .update({ status: 'ignored', matched_at: now, matched_by: actor })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: 'ignored' });
  }

  if (body.action === 'reset') {
    const { error } = await supabaseAdmin
      .from('bank_transactions')
      .update({ status: 'unmatched', matched_kind: null, matched_id: null, matched_at: null, matched_by: null })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: 'unmatched' });
  }

  return NextResponse.json({ error: 'action must be confirm, ignore, or reset' }, { status: 400 });
});
