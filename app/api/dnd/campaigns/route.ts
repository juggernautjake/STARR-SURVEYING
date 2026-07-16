// app/api/dnd/campaigns/route.ts — DM campaigns (Phase E2).
// GET lists the campaigns the signed-in user belongs to (with their role); POST
// creates a campaign and makes the creator its DM.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, clearDndSession } from '@/lib/dnd/auth';
import { normalizeSystem } from '@/lib/dnd/systems';

/** A stale session points at a `dnd_users` row that no longer exists, so any insert that references
 *  it by FK (dm_user_id, user_id) fails with Postgres 23503. That's a dead cookie, not a server
 *  fault — surface it as a clean 401 AND clear the cookie so the next request doesn't re-trip it. */
function isStaleUserFk(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23503' || /foreign key/i.test(error?.message ?? '');
}
function expiredSession() {
  clearDndSession(); // drop the dead cookie so the client isn't stuck re-hitting the same expired session
  return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 });
}

export async function GET() {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: memberships, error: mErr } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('campaign_id, role')
    .eq('user_id', session.userId);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const mems = (memberships ?? []) as { campaign_id: string; role: string }[];
  const ids = mems.map((m) => m.campaign_id);
  if (ids.length === 0) return NextResponse.json({ campaigns: [] });

  const roleById = new Map(mems.map((m) => [m.campaign_id, m.role]));
  const { data: campaigns, error } = await supabaseAdmin
    .from('dnd_campaigns')
    .select('id, name, blurb, theme, created_at')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    campaigns: ((campaigns ?? []) as { id: string }[]).map((c) => ({ ...c, role: roleById.get(c.id) ?? 'player' })),
  });
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, blurb } = body;
    if (!name || !String(name).trim()) return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 });

    // The campaign's rulebook (Slice 38a). Normalized so an unknown/garbage value can't be stored;
    // omitted → 'ambiguous', which the DM can set later.
    const system = normalizeSystem(body.system);
    // Whether players may bring custom/homebrew content (default true — matches the column default).
    const allowCustom = body.allowCustom !== false;

    const { data: campaign, error } = await supabaseAdmin
      .from('dnd_campaigns')
      .insert({ dm_user_id: session.userId, name: String(name).trim(), blurb: blurb ? String(blurb).trim() : null, system, allow_custom: allowCustom })
      .select('id, name, blurb, theme, system, allow_custom, created_at')
      .single();
    if (error || !campaign) {
      // The dm_user_id foreign key fails when the session's user row is gone — a dead cookie, not a
      // server fault (a raw 500 with an FK message is both confusing and wrong for an auth problem).
      if (isStaleUserFk(error)) return expiredSession();
      return NextResponse.json({ error: error?.message ?? 'Could not create campaign.' }, { status: 500 });
    }

    const { error: memErr } = await supabaseAdmin
      .from('dnd_campaign_members')
      .insert({ campaign_id: campaign.id, user_id: session.userId, role: 'dm' });
    // The membership insert references the same (possibly stale) user by FK too — handle it the same way.
    if (memErr) {
      if (isStaleUserFk(memErr)) return expiredSession();
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    return NextResponse.json({ campaign: { ...campaign, role: 'dm' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Create failed.' }, { status: 500 });
  }
}
