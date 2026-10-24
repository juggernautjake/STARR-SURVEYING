// app/api/admin/payouts/runs/[id]/bank-uploaded/route.ts — the office uploaded the bank file to PNC.
//
//   POST { reference? } → every waiting direct-deposit line becomes `sent`. A line becomes `paid` when the
//   office confirms the money landed.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { markPayoutItem } from '@/lib/payouts/mark-item';
import { logDispatch } from '@/lib/payouts/server';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { reference?: string };
  const { data: items } = await supabaseAdmin.from('payout_batch_items').select('id')
    .eq('batch_id', params.id).eq('method', 'ach').in('status', ['pending', 'failed']);
  let marked = 0;
  for (const it of (items ?? []) as Array<{ id: string }>) {
    const r = await markPayoutItem(params.id, it.id, { status: 'sent', external_ref: body.reference?.trim() || 'Bank file uploaded to PNC' });
    if (r.ok) marked++;
  }
  await logDispatch(params.id, session.user.email, 'bank_file_uploaded', { lines: marked, reference: body.reference ?? null }, null, 'file');
  return NextResponse.json({ marked });
}
