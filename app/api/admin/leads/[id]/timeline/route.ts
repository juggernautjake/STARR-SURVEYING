// app/api/admin/leads/[id]/timeline/route.ts — one lead's whole story, in order. A12.
//
// GET → { events: [...] }
//
// Reads A4's lifecycle stream and nothing else (ground rule G2), plus the lead's own first-click record,
// which is prepended as a synthetic entry.
//
// ── THE CLICK IS AN ENTRY, NOT A FIELD ─────────────────────────────────────────────────────────────
//
// It is the first thing that happened. Returning it separately would make the caller reassemble a story
// that is already in order here, and every caller would reassemble it slightly differently.
//
// ── GAPS ARE COMPUTED SERVER-SIDE ──────────────────────────────────────────────────────────────────
//
// So the number on screen and any future export agree. A gap recomputed in the browser is a gap computed
// in the browser's timezone, and the same lead would read differently to two people.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { STAGE_LABELS } from '@/lib/pipeline/funnel';

const DAY_MS = 24 * 60 * 60 * 1000;

interface EventRow {
  id: string; milestone: string; occurred_at: string;
  value_cents: number | null; actor: string | null; metadata: Record<string, unknown> | null;
}

/** Path is /api/admin/leads/{id}/timeline. Same approach as the sibling `reply` route — `withErrorHandler`
 *  passes only the request, so `ctx.params` is not available here. */
function leadIdFromPath(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idIdx = segments.indexOf('timeline') - 1;
  return idIdx >= 0 ? segments[idIdx] : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = leadIdFromPath(req);
  if (!id) return NextResponse.json({ error: 'Lead id missing from path.' }, { status: 400 });

  const [{ data: leadData }, { data: eventData, error }] = await Promise.all([
    supabaseAdmin.from('leads')
      .select('id, gclid, gbraid, wbraid, first_seen_at, utm_campaign, utm_source, utm_medium, landing_page, source, created_at')
      .eq('id', id).maybeSingle(),
    supabaseAdmin.from('lead_lifecycle_events')
      .select('id, milestone, occurred_at, value_cents, actor, metadata')
      .eq('lead_id', id)
      .order('occurred_at', { ascending: true })
      .limit(200),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lead = leadData as {
    gclid: string | null; gbraid: string | null; wbraid: string | null; first_seen_at: string | null;
    utm_campaign: string | null; utm_source: string | null; utm_medium: string | null;
    landing_page: string | null; source: string | null;
  } | null;

  const rows = (eventData ?? []) as EventRow[];

  const events: Array<Record<string, unknown>> = [];

  // The synthetic first entry. Only when there is a real click to describe — inventing one for a phone
  // lead would put an ad at the top of a story that had nothing to do with an ad.
  const clickId = lead?.gclid ?? lead?.gbraid ?? lead?.wbraid ?? null;
  if (lead?.first_seen_at && (clickId || lead.utm_campaign || lead.utm_source)) {
    const parts = [
      lead.utm_campaign ? `campaign: ${lead.utm_campaign}` : null,
      lead.utm_source ? `source: ${lead.utm_source}` : null,
      lead.utm_medium ? `medium: ${lead.utm_medium}` : null,
      lead.landing_page ? `landed on ${lead.landing_page}` : null,
    ].filter(Boolean);
    events.push({
      id: 'first-click',
      milestone: 'click',
      label: clickId ? 'Clicked an ad' : 'First visit',
      occurred_at: lead.first_seen_at,
      value_cents: null,
      actor: null,
      isClick: true,
      detail: parts.length ? parts.join(' · ') : null,
      gapDays: null,
    });
  }

  for (const r of rows) {
    // `adjustment_skipped_window` (A9) is worth showing here — it is the reason this lead's revenue and
    // Google's reported figure will never match, and this is the only screen where that is inspectable.
    const skip = r.metadata?.adjustment_skipped_window as { reportedCents?: number; actualCents?: number } | undefined;
    events.push({
      id: r.id,
      milestone: r.milestone,
      label: STAGE_LABELS[r.milestone] ?? r.milestone,
      occurred_at: r.occurred_at,
      value_cents: r.value_cents,
      actor: r.actor,
      detail: skip
        ? `Reported to Google as $${((skip.reportedCents ?? 0) / 100).toLocaleString()}; the real figure is $${((skip.actualCents ?? 0) / 100).toLocaleString()} — the 90-day window closed before it could be corrected.`
        : null,
      gapDays: null,
    });
  }

  // Server-side, so the number on screen and any future export agree. See the header.
  for (let i = 1; i < events.length; i += 1) {
    const prev = Date.parse(events[i - 1].occurred_at as string);
    const cur = Date.parse(events[i].occurred_at as string);
    events[i].gapDays = Number.isFinite(prev) && Number.isFinite(cur) && cur >= prev ? (cur - prev) / DAY_MS : null;
  }

  return NextResponse.json({ events });
}, { routeName: 'admin/leads/[id]/timeline' });
