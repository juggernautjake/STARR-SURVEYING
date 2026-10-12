// app/api/admin/payouts/runs/[id]/checks/route.ts — the batch's checks, printed.
//
//   GET  ?copy=1   → the same checks watermarked "COPY — NOT NEGOTIABLE" (a reprint never reuses a number
//                   as a live check; to replace one, void it and reissue — see /api/admin/payouts/checks/[id])
//   GET  ?test=1   → an alignment test on plain paper
//   GET            → the PDF to print on check stock
//   POST { action: 'printed' } → the checks came out fine: their lines become `sent` (handed over = paid).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { batchChecksPdf } from '@/lib/payouts/checks-server';
import { markPayoutItem } from '@/lib/payouts/mark-item';
import { logDispatch } from '@/lib/payouts/server';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  try {
    const pdf = await batchChecksPdf(params.id, session.user.email, { copy: q.get('copy') === '1', test: q.get('test') === '1' });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="checks-${params.id.slice(0, 8)}.pdf"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== 'printed') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const { data: items } = await supabaseAdmin.from('payout_batch_items').select('id, external_ref')
    .eq('batch_id', params.id).eq('method', 'check').not('check_id', 'is', null).in('status', ['pending', 'failed']);
  let marked = 0;
  for (const it of (items ?? []) as Array<{ id: string; external_ref: string | null }>) {
    const r = await markPayoutItem(params.id, it.id, { status: 'sent', external_ref: it.external_ref });
    if (r.ok) marked++;
  }
  await logDispatch(params.id, session.user.email, 'checks_printed_ok', { lines: marked }, null, 'print');
  return NextResponse.json({ marked });
}
