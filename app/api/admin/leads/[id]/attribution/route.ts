// app/api/admin/leads/[id]/attribution/route.ts — record what a caller said. A13.
//
// GET   → { howHeard, mentionedAd, mentionedAdBy, mentionedAdAt, hasClickId }
// PATCH { mentionedAd } → save it
//
// ── ONLY `mentioned_ad` IS WRITABLE ────────────────────────────────────────────────────────────────
//
// `how_heard` is the CUSTOMER's answer from the public form. Letting staff edit it would quietly turn a
// self-report into a staff opinion while it kept the name of a self-report — and then nobody could tell
// which rows were which. Staff observations go in their own field, with who recorded them and when.
//
// ── WHY THIS IS NEVER UPLOADED TO GOOGLE ───────────────────────────────────────────────────────────
//
// "He mentioned seeing us on Facebook" is a human recollection of a conversation. It is a genuinely
// useful internal dimension and it is NOT a conversion signal; sending it as one would be inventing
// attribution, which is the one thing this whole plan is built to avoid.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/** Path is /api/admin/leads/{id}/attribution — `withErrorHandler` passes only the request, so the id
 *  comes off the path, the same way the sibling `reply` and `timeline` routes do it. */
function leadIdFromPath(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idIdx = segments.indexOf('attribution') - 1;
  return idIdx >= 0 ? segments[idIdx] : null;
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

  const id = leadIdFromPath(req);
  if (!id) return NextResponse.json({ error: 'Lead id missing from path.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('how_heard, mentioned_ad, mentioned_ad_by, mentioned_ad_at, gclid, gbraid, wbraid, utm_campaign, source')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  const row = data as Record<string, string | null>;
  return NextResponse.json({
    howHeard: row.how_heard,
    mentionedAd: row.mentioned_ad,
    mentionedAdBy: row.mentioned_ad_by,
    mentionedAdAt: row.mentioned_ad_at,
    utmCampaign: row.utm_campaign,
    source: row.source,
    // When there IS a click, the self-report is redundant and the UI says so rather than inviting
    // someone to type a guess over hard evidence.
    hasClickId: Boolean(row.gclid || row.gbraid || row.wbraid),
  });
}, { routeName: 'admin/leads/[id]/attribution' });

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;

  const id = leadIdFromPath(req);
  if (!id) return NextResponse.json({ error: 'Lead id missing from path.' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const raw = typeof body.mentionedAd === 'string' ? body.mentionedAd.trim() : '';
  // Empty means "clear it" — a wrongly recorded observation must be removable, not just editable.
  const mentionedAd = raw === '' ? null : raw.slice(0, 300);

  const { error } = await supabaseAdmin
    .from('leads')
    .update({
      mentioned_ad: mentionedAd,
      // Cleared together with the value: keeping "recorded by X at Y" beside an empty field would
      // describe an observation that no longer exists.
      mentioned_ad_by: mentionedAd ? gate.email : null,
      mentioned_ad_at: mentionedAd ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mentionedAd });
}, { routeName: 'admin/leads/[id]/attribution' });
