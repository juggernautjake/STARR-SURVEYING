// app/api/dnd/auth/register/route.ts — invite-gated registration (Phase B, B2).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, setDndSession } from '@/lib/dnd/auth';

export async function POST(req: NextRequest) {
  try {
    const { code, email, password, displayName } = await req.json();
    if (!code || !email || !password || !displayName) {
      return NextResponse.json({ error: 'code, email, password, and displayName are required' }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
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

    // email must be unique
    const emailNorm = String(email).trim().toLowerCase();
    const { data: existing } = await supabaseAdmin.from('dnd_users').select('id').eq('email', emailNorm).maybeSingle();
    if (existing) return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 400 });

    // create user
    const password_hash = await hashPassword(String(password));
    const { data: user, error: uErr } = await supabaseAdmin
      .from('dnd_users')
      .insert({ email: emailNorm, password_hash, display_name: String(displayName).trim() })
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
