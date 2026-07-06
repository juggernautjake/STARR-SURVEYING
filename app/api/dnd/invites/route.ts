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

// POST — create an invite. Body: { campaignId, role?, characterId?, expiresInDays? }
export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { campaignId, role = 'player', characterId, expiresInDays } = await req.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if (role !== 'player' && role !== 'dm') {
      return NextResponse.json({ error: "role must be 'player' or 'dm'." }, { status: 400 });
    }
    if ((await getCampaignRole(String(campaignId))) !== 'dm') {
      return NextResponse.json({ error: 'Only the DM of this campaign can create invites.' }, { status: 403 });
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
          expires_at,
        })
        .select('*')
        .single();
      if (!error && data) {
        return NextResponse.json({ invite: data, joinPath: `/dnd/join/${data.code}` });
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
