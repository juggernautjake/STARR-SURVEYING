// app/api/admin/payouts/runs/[id]/nacha/route.ts — the bank file (NACHA) for every direct-deposit line.
//
//   GET ?date=YYYY-MM-DD → the file to upload to PNC (defaults to the next business day).
//
// Built fresh each time from the lines still waiting (anything not yet paid), so a line that was held
// and then fixed is in the next download. Bank numbers are decrypted inside the database and every
// read is logged (lib/payouts/server.ts → payment_secret_reads). The file is never stored.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildNachaFile, type NachaEntry, type NachaOriginator } from '@/lib/payouts/nacha';
import { disbursedCents } from '@/lib/payroll/disbursement';
import { loadPayoutSettings, readBanks, logDispatch } from '@/lib/payouts/server';

function nextBusinessDay(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data: batch } = await supabaseAdmin.from('payout_batches').select('id, label, status').eq('id', params.id).maybeSingle();
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved' && batch.status !== 'dispatched') {
    return NextResponse.json({ error: `Commit the payout first (it is ${batch.status}).` }, { status: 409 });
  }
  const { data: items } = await supabaseAdmin.from('payout_batch_items')
    .select('id, user_email, user_name, total_cents, recovered_cents, fee_cents, status')
    .eq('batch_id', params.id).eq('method', 'ach').neq('status', 'paid');
  const lines = ((items ?? []) as Array<{ id: string; user_email: string; user_name: string | null; total_cents: number; recovered_cents: number | null; fee_cents: number | null }>)
    .filter((i) => disbursedCents(i) > 0);
  if (lines.length === 0) return NextResponse.json({ error: 'No bank payments are waiting in this batch.' }, { status: 409 });

  const settings = await loadPayoutSettings();
  try {
    const banks = await readBanks(lines.map((l) => l.user_email), session.user.email, 'payroll_dispatch');
    const entries: NachaEntry[] = [];
    const missing: string[] = [];
    for (const l of lines) {
      const b = banks.get(l.user_email.toLowerCase());
      if (!b) { missing.push(l.user_name ?? l.user_email); continue; }
      entries.push({
        routing: b.routing, account: b.account, account_type: b.account_type, amount_cents: disbursedCents(l),
        name: l.user_name ?? l.user_email, individual_id: l.id.replace(/-/g, '').slice(0, 15),
      });
    }
    if (missing.length) return NextResponse.json({ error: `No bank details on file for: ${missing.join(', ')}.` }, { status: 409 });
    const date = new URL(req.url).searchParams.get('date') ?? nextBusinessDay();
    const file = buildNachaFile(settings.ach as NachaOriginator, entries, { effective_date: date });
    await logDispatch(params.id, session.user.email, 'bank_file_downloaded', { entries: file.entryCount, total_cents: file.totalCreditCents, effective_date: date }, null, 'file');
    return new NextResponse(file.text, {
      headers: {
        'Content-Type': 'text/plain; charset=us-ascii',
        'Content-Disposition': `attachment; filename="payroll-${date}-${params.id.slice(0, 8)}.ach"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
