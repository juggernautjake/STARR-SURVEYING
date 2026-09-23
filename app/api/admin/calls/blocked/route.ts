// app/api/admin/calls/blocked/route.ts — the block list, and the calls it has stopped.
//
// Owner, 2026-09-23: "I want you to make it so that we have a list of blocked calls that we can
// unblock as well. It should register the area code and show whatever info can be garnered from the
// call even if a call is blocked."
//
// GET    the rules, each with its area code, hit count, and the calls it stopped
// POST   block a number (or a prefix)
// DELETE unblock — by rule id
//
// ── UNBLOCKING DEACTIVATES, IT DOES NOT DELETE ──────────────────────────────────────────────────
//
// A rule carries why it was added, who added it and what it stopped. Deleting the row throws that
// away exactly when it is most wanted: the number rings again, somebody asks "didn't we block
// this?", and there is nothing to read. `active = false` keeps the history and stops the blocking,
// which are two different things.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { normaliseNumber } from '@/lib/receptionist/blocklist';

export const dynamic = 'force-dynamic';

/** +13182091951 -> 318. What a person recognises before they recognise the number. */
function areaCodeOf(e164: string | null): string | null {
  if (!e164) return null;
  const m = e164.match(/^\+1(\d{3})/);
  return m ? m[1] : null;
}

interface Rule {
  id: string; number: string | null; pattern: string | null; reason: string | null;
  notes: string | null; blocked_by: string | null; auto_blocked: boolean | null;
  hit_count: number | null; last_hit_at: string | null; active: boolean | null; created_at: string;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeInactive = req.nextUrl.searchParams.get('all') === '1';
  let q = supabaseAdmin
    .from('blocked_numbers')
    .select('id, number, pattern, reason, notes, blocked_by, auto_blocked, hit_count, last_hit_at, active, created_at')
    .order('created_at', { ascending: false });
  if (!includeInactive) q = q.eq('active', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'Could not read the block list', details: error.message }, { status: 500 });
  const rules = (data ?? []) as unknown as Rule[];

  // ── WHAT THE BLOCKED CALLS THEMSELVES SAID ──────────────────────────────────────────────────
  //
  // A blocked call keeps its `phone_calls` row, so the list can show what was learned before the
  // block AND what is still arriving now. That is the difference between "we blocked it" and
  // "we blocked it and it has tried nine more times since".
  const numbers = rules.map((r) => r.number).filter(Boolean) as string[];
  const { data: callRows } = numbers.length
    ? await supabaseAdmin
      .from('phone_calls')
      .select('from_number, created_at, answered_by, summary, duration_seconds')
      .in('from_number', numbers)
      .order('created_at', { ascending: false })
      .limit(400)
    : { data: [] };

  const byNumber = new Map<string, Array<Record<string, unknown>>>();
  for (const c of (callRows ?? []) as unknown as Array<{ from_number: string }>) {
    const list = byNumber.get(c.from_number) ?? [];
    list.push(c as unknown as Record<string, unknown>);
    byNumber.set(c.from_number, list);
  }

  return NextResponse.json({
    rules: rules.map((r) => {
      const calls = r.number ? (byNumber.get(r.number) ?? []) : [];
      return {
        ...r,
        areaCode: areaCodeOf(r.number) ?? (r.pattern?.match(/^\+1(\d{3})/)?.[1] ?? null),
        target: r.number ?? `${r.pattern}… (prefix)`,
        callsSeen: calls.length,
        // The last thing this caller actually said, so a mistaken block is obvious on sight.
        lastSummary: (calls[0]?.summary as string | undefined) ?? null,
        lastCallAt: (calls[0]?.created_at as string | undefined) ?? null,
        blockedSince: calls.filter((c) => c.answered_by === 'blocked').length,
      };
    }),
  });
}, { routeName: 'admin/calls/blocked' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as
    { number?: string; pattern?: string; reason?: string; notes?: string };

  const number = body.number ? normaliseNumber(body.number) : null;
  const pattern = body.pattern?.trim() || null;
  if (!number && !pattern) return NextResponse.json({ error: 'A number or a pattern is required.' }, { status: 400 });
  if (number && pattern) return NextResponse.json({ error: 'Block a number or a prefix, not both.' }, { status: 400 });
  if (number && !/^\+\d{8,15}$/.test(number)) {
    return NextResponse.json({ error: `"${body.number}" is not a phone number we can block.` }, { status: 400 });
  }
  // A one- or two-digit prefix would block most of the country from one careless form submission.
  if (pattern && pattern.replace(/\D/g, '').length < 4) {
    return NextResponse.json({ error: 'A prefix needs at least four digits — anything shorter blocks most of the country.' }, { status: 400 });
  }

  // Re-blocking a number that was unblocked reactivates its row rather than making a second one,
  // so its history and hit count survive the round trip.
  const existing = await supabaseAdmin
    .from('blocked_numbers').select('id')
    .eq(number ? 'number' : 'pattern', (number ?? pattern) as string).maybeSingle();

  if (existing.data) {
    const { error } = await supabaseAdmin.from('blocked_numbers').update({
      active: true, reason: body.reason || 'spam', notes: body.notes ?? null,
      blocked_by: session.user.email, auto_blocked: false, updated_at: new Date().toISOString(),
    }).eq('id', (existing.data as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: (existing.data as { id: string }).id, reactivated: true });
  }

  const { data, error } = await supabaseAdmin.from('blocked_numbers').insert({
    number, pattern, reason: body.reason || 'spam', notes: body.notes ?? null,
    blocked_by: session.user.email, auto_blocked: false,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}, { routeName: 'admin/calls/blocked' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Deactivated, not deleted — the rule's notes and hit count are the answer to "didn't we block
  // this?" when the number rings again.
  const { error } = await supabaseAdmin.from('blocked_numbers')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, unblocked: id });
}, { routeName: 'admin/calls/blocked' });
