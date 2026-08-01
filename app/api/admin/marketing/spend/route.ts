// app/api/admin/marketing/spend/route.ts — read ad spend, and type it in when the API cannot. A11.
//
// GET  ?from=&to=   → rows, totals, and the source split
// POST { spendDate, costDollars, platform?, campaignName?, notes? } → a manual entry
//
// ── MANUAL ENTRY IS A FIRST-CLASS SOURCE, NOT A HACK ───────────────────────────────────────────────
//
// The Ads API needs a developer token that has not arrived. A month with a figure typed off the Ads
// invoice gives a rough denominator; a month with NO figure makes every cost-per-lead number silently
// wrong — the dashboard would divide by the spend it happens to have, which is not the spend that
// happened.
//
// So `source` is stored per row and returned here, and the dashboard shows it. A number you know is
// approximate is usable. A number you believe is exact and is not, is worse than nothing.
//
// ── THE API WINS OVER A MANUAL ESTIMATE, BUT ONLY WHEN IT ARRIVES ──────────────────────────────────
//
// The nightly import upserts on the same grain with `source: 'api'`, so a real number overwrites a guess
// for the same day. That is the right direction. It is also why manual entries are stored at the same
// grain rather than in a side table — otherwise the two would both be counted and the month would double.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { MICROS_PER_UNIT, toUnits } from '@/lib/integrations/google-ads/spend';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface SpendDbRow {
  id: string; spend_date: string; platform: string;
  campaign_id: string; campaign_name: string | null;
  impressions: number; clicks: number; cost_micros: number;
  conversions: number; source: string; notes: string | null; entered_by: string | null;
}

async function requireAdmin(): Promise<{ error: NextResponse } | { email: string }> {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let q = supabaseAdmin
    .from('ad_spend_daily')
    .select('id, spend_date, platform, campaign_id, campaign_name, impressions, clicks, cost_micros, conversions, source, notes, entered_by')
    .order('spend_date', { ascending: false })
    .limit(400);
  if (from && DATE_RE.test(from)) q = q.gte('spend_date', from);
  if (to && DATE_RE.test(to)) q = q.lte('spend_date', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as SpendDbRow[];
  const totalMicros = rows.reduce((s, r) => s + Number(r.cost_micros ?? 0), 0);
  const manualMicros = rows.filter((r) => r.source === 'manual').reduce((s, r) => s + Number(r.cost_micros ?? 0), 0);

  return NextResponse.json({
    rows,
    totals: {
      spendMicros: totalMicros,
      spendDollars: toUnits(totalMicros),
      clicks: rows.reduce((s, r) => s + Number(r.clicks ?? 0), 0),
      impressions: rows.reduce((s, r) => s + Number(r.impressions ?? 0), 0),
      // How much of this total is a typed estimate. Every derived cost figure is only as exact as this
      // fraction, and the dashboard says so rather than implying precision it does not have.
      manualMicros,
      manualShare: totalMicros > 0 ? manualMicros / totalMicros : 0,
    },
  });
}, { routeName: 'admin/marketing/spend' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const spendDate = typeof body.spendDate === 'string' ? body.spendDate : '';
  const costDollars = typeof body.costDollars === 'number' ? body.costDollars : Number(body.costDollars);

  if (!DATE_RE.test(spendDate)) {
    return NextResponse.json({ error: 'spendDate must be YYYY-MM-DD.' }, { status: 400 });
  }
  // Zero is a legitimate entry — "we ran nothing that day" is a fact worth recording, and it is different
  // from having no row at all. Negative is not.
  if (!Number.isFinite(costDollars) || costDollars < 0) {
    return NextResponse.json({ error: 'costDollars must be a number ≥ 0.' }, { status: 400 });
  }

  const platform = typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : 'google_ads';
  const campaignName = typeof body.campaignName === 'string' && body.campaignName.trim() ? body.campaignName.trim() : null;

  const { error } = await supabaseAdmin
    .from('ad_spend_daily')
    .upsert({
      spend_date: spendDate,
      platform,
      // Manual entries sit at the account grain: '' campaign, '' ad group. Same grain as the import, so
      // the API overwrites the estimate instead of adding to it.
      campaign_id: '',
      ad_group_id: '',
      campaign_name: campaignName,
      cost_micros: Math.round(costDollars * MICROS_PER_UNIT),
      source: 'manual',
      entered_by: gate.email,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'spend_date,platform,campaign_id,ad_group_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, spendDate, platform, costDollars });
}, { routeName: 'admin/marketing/spend' });
