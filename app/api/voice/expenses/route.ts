// app/api/voice/expenses/route.ts — logging what went out.
//
// The whole value of this endpoint is that it is FAST. An expense that takes ninety seconds to record
// is an expense that gets recorded "later", and later is where receipts go to die. So the only
// genuinely required fields are a description and an amount; everything else has a sensible default
// and can be corrected afterwards.
//
// `business_pct` defaults to 100 because for a voice actor most purchases genuinely are wholly
// business — a microphone, a pop filter, a plugin. The exceptions (a shared laptop, a phone bill) are
// the ones worth stopping to think about, and they are the ones the form asks about.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { EXPENSE_CATEGORIES } from '@/lib/voice/expenses';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

const METHODS = ['card', 'bank', 'cash', 'paypal', 'venmo', 'other'] as const;

export async function GET(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');

  let query = supabaseAdmin.from('va_expenses').select('*').order('spent_on', { ascending: false });
  if (year && /^\d{4}$/.test(year)) {
    query = query.gte('spent_on', `${year}-01-01`).lte('spent_on', `${year}-12-31`);
  }

  const { data, error } = await query.limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const description = String(body.description ?? '').trim();
  const amount = Math.round(Number(body.amountCents) || 0);

  if (!description) return NextResponse.json({ error: 'What was it for?' }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: 'Enter an amount.' }, { status: 400 });

  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(String(body.category))
    ? String(body.category)
    : 'other';

  const spentOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.spentOn ?? ''))
    ? String(body.spentOn)
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('va_expenses')
    .insert({
      description: description.slice(0, 300),
      vendor: body.vendor ? String(body.vendor).slice(0, 200) : null,
      amount_cents: amount,
      spent_on: spentOn,
      category,
      payment_method: (METHODS as readonly string[]).includes(String(body.paymentMethod))
        ? String(body.paymentMethod)
        : 'card',
      // Clamped rather than validated: a slider or a typo producing 150 should become 100, not an
      // error message on a form whose entire job is to be quick.
      business_pct: Math.max(0, Math.min(100, Math.round(Number(body.businessPct ?? 100)))),
      is_capital: body.isCapital === true,
      billable: body.billable === true,
      client_id: body.clientId ? String(body.clientId) : null,
      receipt_media_id: body.receiptMediaId ? String(body.receiptMediaId) : null,
      notes: body.notes ? String(body.notes).slice(0, 1000) : null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}
