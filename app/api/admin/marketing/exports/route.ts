// app/api/admin/marketing/exports/route.ts — download the offline-conversion CSV. A7.
//
// GET  ?from=&to=&milestone=&format=click|enhanced   → the CSV as a file download
// POST { eventIds: string[] }                        → mark those events as exported
//
// Reads A4's lifecycle stream and nothing else, per ground rule G2. The conversion NAME comes from env,
// because the Ads account's spelling is account-specific and Google matches it exactly, including case —
// hardcoding it here is how a staging test writes into the live account under a name that happens to
// collide.
//
// ── WHY MARKING IS A SEPARATE POST, NOT A SIDE EFFECT OF THE DOWNLOAD ───────────────────────────────
//
// Downloading a file is not the same as uploading it. Someone can export, glance at it, and never take it
// to Google — or take it and have Google reject the batch. If the GET marked rows as sent, both of those
// would silently lose conversions forever, because the next export would skip them.
//
// So the download is read-only, and marking is an explicit action the operator takes AFTER the upload
// succeeds. That is one more click and it is the difference between "we can always re-export" and "those
// conversions are gone".

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { buildCsv, withinClickWindow, type ConversionRow, type UploadFormat } from '@/lib/integrations/google-ads/offline';
import { GOOGLE_MILESTONES, type Milestone } from '@/lib/pipeline/events';

/**
 * Our milestone → the Ads conversion action name.
 *
 * From env, never hardcoded: the names are account-specific, Google matches them exactly (spelling AND
 * capitalisation), and the plan's prerequisite is that the owner creates them by hand. The fallbacks are
 * the plan's own table so the export is usable before the env is set — and the response says which names
 * it used, so a mismatch is visible rather than mysterious.
 */
function conversionNameFor(milestone: Milestone): string {
  const env: Partial<Record<Milestone, string | undefined>> = {
    inquiry_received: process.env.GOOGLE_ADS_ACTION_INQUIRY,
    quoted: process.env.GOOGLE_ADS_ACTION_QUOTED,
    job_created: process.env.GOOGLE_ADS_ACTION_JOB_WON,
    payment_received: process.env.GOOGLE_ADS_ACTION_JOB_PAID,
  };
  const fallback: Partial<Record<Milestone, string>> = {
    // PLAIN HYPHENS, MATCHING THE LIVE ACCOUNT (corrected 2026-08-07).
    //
    // These were em dashes, because the plan document wrote them that way and the owner was told to
    // name the Ads actions to match. They came out as "Lead - Inquiry" — which is what anybody typing
    // a name into a form produces, since an em dash needs a copy-paste or a keyboard sequence nobody
    // remembers. Google matches these names EXACTLY, so the pretty character was a silent trap: the
    // CSV would have been rejected on upload with no hint as to which of thirty columns was wrong.
    //
    // The nightly API upload is unaffected either way — it addresses actions by resource name, not
    // display name. This only governs the manual CSV export path.
    inquiry_received: 'Lead - Inquiry',
    quoted: 'Lead - Quoted',
    job_created: 'Job - Won',
    payment_received: 'Job - Paid',
  };
  return env[milestone] || fallback[milestone] || milestone;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

interface EventRow {
  id: string;
  milestone: Milestone;
  occurred_at: string;
  value_cents: number | null;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') === 'enhanced' ? 'enhanced' : 'click') as UploadFormat;
  const milestone = (url.searchParams.get('milestone') ?? 'job_created') as Milestone;
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!GOOGLE_MILESTONES.includes(milestone)) {
    // Only four milestones are conversion actions. Refusing the others is not pedantry: uploading a
    // dozen overlapping actions is what degrades Smart Bidding, which is the thing this exists to feed.
    return NextResponse.json(
      { error: `${milestone} is not a Google conversion action. Choose one of: ${GOOGLE_MILESTONES.join(', ')}` },
      { status: 400 },
    );
  }

  let query = supabaseAdmin
    .from('lead_lifecycle_events')
    .select('id, milestone, occurred_at, value_cents, lead_id, metadata')
    .eq('milestone', milestone)
    .order('occurred_at', { ascending: true });

  if (from) query = query.gte('occurred_at', from);
  if (to) query = query.lte('occurred_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (data ?? []) as EventRow[];

  // Already exported? Skipped, per G3 — a second export must not re-send.
  const notYetSent = events.filter((e) => !(e.metadata as { exported_at?: string } | null)?.exported_at);

  // The click identifiers and hashes live on the LEAD, so fetch the ones we need in a single query
  // rather than per row.
  const leadIds = [...new Set(notYetSent.map((e) => e.lead_id).filter(Boolean))] as string[];
  const leadsById = new Map<string, { gclid: string | null; gbraid: string | null; wbraid: string | null; first_seen_at: string | null; customer_id: string | null }>();
  if (leadIds.length) {
    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('id, gclid, gbraid, wbraid, first_seen_at, customer_id')
      .in('id', leadIds);
    for (const l of (leads ?? []) as Array<{ id: string } & Record<string, never>>) {
      leadsById.set(l.id, l as never);
    }
  }

  // Enhanced conversions match on the customer's hashed identifiers, which live on `customers`.
  const customerIds = [...new Set([...leadsById.values()].map((l) => l.customer_id).filter(Boolean))] as string[];
  const hashById = new Map<string, { email_sha256: string | null; phone_sha256: string | null }>();
  if (format === 'enhanced' && customerIds.length) {
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, email_sha256, phone_sha256')
      .in('id', customerIds);
    for (const c of (customers ?? []) as Array<{ id: string; email_sha256: string | null; phone_sha256: string | null }>) {
      hashById.set(c.id, { email_sha256: c.email_sha256, phone_sha256: c.phone_sha256 });
    }
  }

  const conversionName = conversionNameFor(milestone);
  const outOfWindow: string[] = [];

  const rows: ConversionRow[] = [];
  for (const e of notYetSent) {
    const lead = e.lead_id ? leadsById.get(e.lead_id) : undefined;
    const clickId = lead?.gclid || lead?.gbraid || lead?.wbraid || null;

    // Filter out anything Google would reject for being past the click window. A rejected row makes a
    // good upload look broken, and the operator cannot tell which of the two it is.
    if (format === 'click' && !withinClickWindow(lead?.first_seen_at ?? null, e.occurred_at)) {
      outOfWindow.push(e.id);
      continue;
    }

    const hashes = lead?.customer_id ? hashById.get(lead.customer_id) : undefined;
    rows.push({
      clickId,
      hashedEmail: hashes?.email_sha256 ?? null,
      hashedPhone: hashes?.phone_sha256 ?? null,
      conversionName,
      occurredAt: e.occurred_at,
      valueCents: e.value_cents,
      // The lifecycle dedupe key IS the Order ID — the thing that makes a re-upload a no-op in Google.
      orderId: `${e.milestone}:${e.id}`,
    });
  }

  const { csv, included, skipped } = buildCsv(rows, format);

  // A HEAD-style summary is returned when asked for JSON, so the UI can show what the file will contain
  // (and what it will not) BEFORE someone downloads it and takes it to Google.
  if (url.searchParams.get('summary') === '1') {
    return NextResponse.json({
      conversionName, format, milestone,
      total: events.length,
      alreadyExported: events.length - notYetSent.length,
      outOfWindow: outOfWindow.length,
      noIdentifier: skipped,
      included,
      eventIds: notYetSent.filter((e) => !outOfWindow.includes(e.id)).map((e) => e.id),
    });
  }

  const filename = `google-ads-${milestone}-${format}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Surfaced as headers too, so the counts are visible even to a caller that just downloaded.
      'X-Export-Included': String(included),
      'X-Export-Skipped-No-Identifier': String(skipped),
      'X-Export-Skipped-Out-Of-Window': String(outOfWindow.length),
    },
  });
}, { routeName: 'admin/marketing/exports' });

/** Mark events as exported, AFTER Google has accepted them. See the header for why this is not automatic. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({})) as { eventIds?: unknown };
  const ids = Array.isArray(body.eventIds) ? body.eventIds.filter((v): v is string => typeof v === 'string') : [];
  if (!ids.length) return NextResponse.json({ error: 'No eventIds given' }, { status: 400 });

  const exportedAt = new Date().toISOString();
  let marked = 0;

  // Read-modify-write per row, because the mark lives inside `metadata` and PostgREST has no JSONB merge
  // expression. The volume is an export batch, not a hot path, and doing it row-wise keeps the existing
  // metadata (the campaign, the pre_attribution flag) instead of overwriting it.
  for (const id of ids) {
    const { data: row } = await supabaseAdmin
      .from('lead_lifecycle_events')
      .select('metadata')
      .eq('id', id)
      .maybeSingle();
    const metadata = { ...(((row as { metadata?: Record<string, unknown> } | null)?.metadata) ?? {}), exported_at: exportedAt, exported_by: gate.email };
    const { error } = await supabaseAdmin.from('lead_lifecycle_events').update({ metadata }).eq('id', id);
    if (!error) marked += 1;
  }

  return NextResponse.json({ marked, exportedAt });
}, { routeName: 'admin/marketing/exports' });
