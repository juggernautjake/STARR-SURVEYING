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

const MIN = 4; // the user's rule for the pseudo-login: name + password each ≥ 4 characters.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body?.code ?? '').trim();
    const name = String(body?.name ?? body?.displayName ?? '').trim();
    const password = String(body?.password ?? '');
    if (!code) return NextResponse.json({ error: 'An invite code is required.' }, { status: 400 });
    if (name.length < MIN) return NextResponse.json({ error: `Name must be at least ${MIN} characters.` }, { status: 400 });
    if (password.length < MIN) return NextResponse.json({ error: `Password must be at least ${MIN} characters.` }, { status: 400 });

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
