// app/api/dnd/auth/register/route.ts — invite-gated registration (Phase B, B2).
//
// Reconciled to the Slice-36 name+password-only convention (matches /api/dnd/auth/signup): the
// identity is a NAME, stored in dnd_users.email as `name:<normalized>` via nameToKey — no real email,
// since the rest of the platform stopped collecting one. The only thing this route adds over signup is
// the invite: validate the code, then consume it + attach the new member to the campaign (and claim the
// invited character). `displayName` is still accepted as an alias for `name` for older callers.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, setDndSession, nameToKey } from '@/lib/dnd/auth';
import { checkName, checkNewPassword, loginSubjects, callerIp } from '@/lib/dnd/password-policy';
import { checkRateLimit, rateLimitHeaders } from '@/lib/dnd/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code ?? '').trim();
    const name = String(body?.name ?? body?.displayName ?? '').trim();
    const password = String(body?.password ?? '');
    if (!code) return NextResponse.json({ error: 'An invite code is required.' }, { status: 400 });
    // This route ONLY creates accounts, so the new-password floor applies unconditionally — unlike
    // `auth/quick`, where the same check would have caught existing players signing in (P2-3).
    const nameCheck = checkName(name);
    if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.error }, { status: 400 });
    const pwCheck = checkNewPassword(password);
    if (!pwCheck.ok) return NextResponse.json({ error: pwCheck.error }, { status: 400 });

    // Invite codes are guessable in principle, and this route creates accounts — so it gets the same
    // counter as the sign-in paths rather than being the one unthrottled door left standing.
    for (const subject of loginSubjects(name, callerIp(req.headers))) {
      const gate = await checkRateLimit('login', subject);
      if (!gate.allowed) {
        return NextResponse.json({ error: gate.message }, { status: 429, headers: rateLimitHeaders(gate, 'login') });
      }
    }

    // validate invite
    const { data: invite } = await supabaseAdmin
      .from('dnd_invites')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (!invite) return NextResponse.json({ error: 'Invalid invite code.' }, { status: 400 });
    if (invite.used_by) return NextResponse.json({ error: 'This invite has already been used.' }, { status: 400 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired.' }, { status: 400 });
    }

    // The name is the identity — its `name:<normalized>` key must be unique (same column, same
    // convention as signup + the `quick:` accounts).
    const key = nameToKey(name);
    const { data: existing } = await supabaseAdmin.from('dnd_users').select('id').eq('email', key).maybeSingle();
    if (existing) return NextResponse.json({ error: 'That name is taken — pick another, or sign in if it’s yours.' }, { status: 409 });

    // create user
    const password_hash = await hashPassword(password);
    const { data: user, error: uErr } = await supabaseAdmin
      .from('dnd_users')
      .insert({ email: key, password_hash, display_name: name })
      .select('id, email, display_name, avatar_url')
      .single();
    if (uErr || !user) return NextResponse.json({ error: uErr?.message ?? 'Could not create account.' }, { status: 500 });

    // consume invite + attach to campaign
    await supabaseAdmin.from('dnd_invites').update({ used_by: user.id, used_at: new Date().toISOString() }).eq('id', invite.id);
    await supabaseAdmin
      .from('dnd_campaign_members')
      .upsert({ campaign_id: invite.campaign_id, user_id: user.id, role: invite.role }, { onConflict: 'campaign_id,user_id' });
    if (invite.character_id) {
      await supabaseAdmin.from('dnd_characters').update({ owner_user_id: user.id }).eq('id', invite.character_id);
    }

    setDndSession({ id: user.id, email: user.email, display_name: user.display_name });
    return NextResponse.json({ user, campaignId: invite.campaign_id, role: invite.role });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Registration failed.' }, { status: 500 });
  }
}
