// app/api/admin/leads/follow-ups/route.ts — the leads nobody has rung (D1-2).
//
//   GET ?horizon=7 → { followUps: [...], summary: { overdue, today, upcoming } }
//
// *"`follow_up_date` exists and nothing appears to chase it. A lead that nobody rings is the cheapest
// lost revenue in the business."* It was stored, and shown on one detail page, and asked about nowhere.
//
// Admin-gated like the rest of `/api/admin`.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  attributionOf, describeFollowUp, followUps, summarize,
  type AttributionRow, type LeadRow,
} from '@/lib/leads/follow-up';

const COLS =
  'id, name, email, phone, status, source, quote_amount, follow_up_date, converted_job_id, assigned_to, created_at, '
  + 'gclid, utm_source, utm_medium, utm_campaign, how_heard, referrer';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = Number(req.nextUrl.searchParams.get('horizon'));
  const horizonDays = Number.isFinite(raw) ? Math.min(60, Math.max(0, Math.round(raw))) : 7;

  // Only leads that HAVE a date, filtered in the query rather than in the page: most leads never get one,
  // and pulling the whole table to discard nine tenths of it is the kind of query that is free today.
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select(COLS)
    .not('follow_up_date', 'is', null)
    .is('converted_job_id', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<LeadRow & AttributionRow>;
  const list = followUps(rows, { asOf: Date.now(), horizonDays });

  return NextResponse.json({
    summary: summarize(list),
    followUps: list.map((f) => {
      const row = rows.find((r) => r.id === f.lead.id)!;
      return {
        id: f.lead.id,
        name: f.lead.name,
        email: f.lead.email,
        phone: f.lead.phone,
        status: f.lead.status,
        quoteAmount: f.lead.quote_amount,
        assignedTo: f.lead.assigned_to,
        due: f.due,
        daysOut: f.daysOut,
        // Built server-side so the API and any UI cannot word it two different ways.
        note: describeFollowUp(f),
        // D1-3 — the same attribution the board shows, from the same function, so the two surfaces
        // cannot disagree about where a lead came from.
        attribution: attributionOf(row),
      };
    }),
  });
});
