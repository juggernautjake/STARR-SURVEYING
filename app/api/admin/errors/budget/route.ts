// app/api/admin/errors/budget/route.ts — is anything on fire, and would anyone know? (E1-3)
//
//   GET ?days=7 → { budget, note }
//
// *"`/admin/error-log` exists; is anyone looking at it, and does anything alert?"* The viewer was real
// and the answer to both was no. This is the number a dashboard can carry without anybody opening the
// log — and its point is the CHANGE, not the count. Forty errors a week, steady, is a known quantity;
// forty against six is a deploy that broke something.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { describeBudget, errorBudget, type ErrorRow } from '@/lib/errors/budget';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = Number(req.nextUrl.searchParams.get('days'));
  const windowDays = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.round(raw))) : 7;

  // TWO windows are fetched, because the comparison is the signal. Bounded by the date rather than by a
  // row limit: a `limit(500)` would silently truncate exactly the busy week worth measuring.
  const since = new Date(Date.now() - windowDays * 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('error_reports')
    .select('id, created_at, severity, resolved_at, route_path, api_endpoint, error_message')
    .gte('created_at', since);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const budget = errorBudget((data ?? []) as ErrorRow[], { asOf: Date.now(), windowDays });
  return NextResponse.json({ budget, note: describeBudget(budget) });
});
