// app/api/dnd/invites/route.ts — DM invite generation + listing (Phase B, B5a).
// Only a DM of the target campaign may create or list its invites. The invite
// `code` powers the /dnd/join/[code] acceptance flow (B4).
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

function newCode(): string {
  // 12-char URL-safe code (72 bits) — unguessable, no ambiguous separators.
  return crypto.randomBytes(9).toString('base64url');
}

// Resolve a typed name to a dnd_users id. Matches a real display name (case-insensitive)
// or a pseudo-login name (stored as the `quick:<normalized>` key in the email column).
async function resolveUserByName(name: string): Promise<{ id: string; display_name: string } | null> {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  // Prefer an exact pseudo-login match (the `quick:<normalized>` key in the email column).
  const quickKey = `quick:${trimmed.toLowerCase()}`;
  const byKey = await supabaseAdmin.from('dnd_users').select('id, display_name').eq('email', quickKey).maybeSingle();
  if (byKey.data) return byKey.data as { id: string; display_name: string };
  // Fall back to a case-insensitive display-name match (covers invite-based accounts).
  const byName = await supabaseAdmin.from('dnd_users').select('id, display_name').ilike('display_name', trimmed).limit(1);
  const row = (byName.data ?? [])[0] as { id: string; display_name: string } | undefined;
  return row ?? null;
}

// POST — create an invite. Body: { campaignId, role?, characterId?, expiresInDays?, invitedUserName? }
// When `invitedUserName` is given, this is a DIRECTED invite: it targets that user, who
// then sees it as a notification on their hub and can accept/decline (Phase P).
export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { campaignId, role = 'player', characterId, expiresInDays, invitedUserName } = await req.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if (role !== 'player' && role !== 'dm') {
      return NextResponse.json({ error: "role must be 'player' or 'dm'." }, { status: 400 });
    }
    if ((await getCampaignRole(String(campaignId))) !== 'dm') {
      return NextResponse.json({ error: 'Only the DM of this campaign can create invites.' }, { status: 403 });
    }

    // Directed invite: resolve the target user + guard against re-inviting a member or
    // stacking duplicate pending invites.
    let invited_user_id: string | null = null;
    let invitedDisplayName: string | null = null;
    if (invitedUserName != null && String(invitedUserName).trim()) {
      const target = await resolveUserByName(String(invitedUserName));
      if (!target) return NextResponse.json({ error: `No one signed in as “${String(invitedUserName).trim()}” yet. They need to sign in once first.` }, { status: 404 });
      if (target.id === session.userId) return NextResponse.json({ error: "You're already the DM of this campaign." }, { status: 400 });
      const { data: existingMember } = await supabaseAdmin
        .from('dnd_campaign_members').select('user_id').eq('campaign_id', campaignId).eq('user_id', target.id).maybeSingle();
      if (existingMember) return NextResponse.json({ error: `${target.display_name} is already in this campaign.` }, { status: 409 });
      const { data: pending } = await supabaseAdmin
        .from('dnd_invites').select('id').eq('campaign_id', campaignId).eq('invited_user_id', target.id).eq('status', 'pending').maybeSingle();
      if (pending) return NextResponse.json({ error: `${target.display_name} already has a pending invite.` }, { status: 409 });
      invited_user_id = target.id;
      invitedDisplayName = target.display_name;
    }

    let expires_at: string | null = null;
    if (expiresInDays != null) {
      const days = Number(expiresInDays);
      if (!Number.isFinite(days) || days <= 0) {
        return NextResponse.json({ error: 'expiresInDays must be a positive number.' }, { status: 400 });
      }
      expires_at = new Date(Date.now() + days * 86400_000).toISOString();
    }

    // Insert with a retry in the (very unlikely) event of a code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabaseAdmin
        .from('dnd_invites')
        .insert({
          campaign_id: campaignId,
          code: newCode(),
          role,
          character_id: characterId ?? null,
          created_by: session.userId,
          invited_user_id,
          expires_at,
        })
        .select('*')
        .single();
      if (!error && data) {
        return NextResponse.json({ invite: { ...data, invitedDisplayName }, joinPath: `/dnd/join/${data.code}` });
      }
      // 23505 = unique_violation on code; retry. Anything else → fail.
      if (error && error.code !== '23505') {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ error: 'Could not allocate a unique invite code.' }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Create failed.' }, { status: 500 });
  }
}

// GET — list a campaign's invites. Query: ?campaignId=…
export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
  if ((await getCampaignRole(campaignId)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM of this campaign can view invites.' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('dnd_invites')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}
