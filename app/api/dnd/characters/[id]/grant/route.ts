// app/api/dnd/characters/[id]/grant/route.ts — the DM grants a character a custom element (IG builder
// Slice 6). DM-gated (must be the DM of the character's campaign). A grant is a DM-authored feat / ability /
// item / spell / weapon with its mechanics; it's stored flagged `dm-granted` and is ALWAYS allowed, even in
// a vanilla-only campaign. POST adds a grant; DELETE (?grantId=…) revokes one.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { validateGrant, readGrants, addGrant, removeGrant } from '@/lib/dnd/dm-grant';

async function requireDm(id: string) {
  const res = await getCharacterAccess(id);
  if (!res.access) return { error: res.error, status: res.status } as const;
  const { character } = res.access;
  const isDM = character.campaign_id ? (await getCampaignRole(character.campaign_id)) === 'dm' : false;
  if (!isDM) return { error: 'Only the campaign DM can grant custom content.', status: 403 } as const;
  return { character } as const;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const gate = await requireDm(params.id);
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const check = validateGrant(body);
  if (!check.ok || !check.grant) return NextResponse.json({ error: check.error }, { status: 400 });

  // DM display name (falls back to 'DM') so the grant reads "granted by …".
  const { data: dmUser } = await supabaseAdmin.from('dnd_users').select('display_name').eq('id', session.userId).maybeSingle();
  const grantedBy = (dmUser as { display_name?: string } | null)?.display_name?.trim() || 'DM';

  const existing = readGrants((gate.character as { dm_granted?: unknown }).dm_granted);
  const next = addGrant(existing, check.grant, { id: randomUUID(), grantedBy, grantedAt: new Date().toISOString() });

  const { error } = await supabaseAdmin.from('dnd_characters').update({ dm_granted: next }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, grants: next });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const gate = await requireDm(params.id);
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const grantId = new URL(req.url).searchParams.get('grantId') ?? '';
  if (!grantId) return NextResponse.json({ error: 'grantId is required.' }, { status: 400 });

  const existing = readGrants((gate.character as { dm_granted?: unknown }).dm_granted);
  const next = removeGrant(existing, grantId);
  if (next.length === existing.length) return NextResponse.json({ error: 'No such grant.' }, { status: 404 });

  const { error } = await supabaseAdmin.from('dnd_characters').update({ dm_granted: next }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, grants: next });
}
