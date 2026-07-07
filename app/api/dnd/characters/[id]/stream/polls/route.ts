// app/api/dnd/characters/[id]/stream/polls/route.ts — "chat decides" polls (Phase J7).
// The DM opens a poll (question + options); the overlay shows the (simulated) chat
// vote filling in, then the DM closes it and a result banner announces the winner.
// POST opens, GET returns the latest poll, PATCH records votes / closes with a result.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

async function characterAccess(id: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', id).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return null;
  const role = await getCampaignRole(row.campaign_id);
  return { isDM: role === 'dm', isOwner: row.owner_user_id === userId, isMember: role !== null };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isMember) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { data } = await supabaseAdmin
    .from('dnd_stream_polls')
    .select('id, question, options, votes, status, result, created_at')
    .eq('character_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ poll: data ?? null });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can open a poll.' }, { status: 403 });

  const { question, options } = await req.json().catch(() => ({}));
  const opts = Array.isArray(options) ? options.map((o) => String(o).slice(0, 60)).filter(Boolean).slice(0, 6) : [];
  if (!question || !String(question).trim() || opts.length < 2) {
    return NextResponse.json({ error: 'A question and at least two options are required.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('dnd_stream_polls')
    .insert({ character_id: params.id, question: String(question).slice(0, 200), options: opts, votes: {}, status: 'open' })
    .select('id, question, options, votes, status, result, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not open poll.' }, { status: 500 });
  return NextResponse.json({ poll: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can update a poll.' }, { status: 403 });

  const { pollId, votes, result, status } = await req.json().catch(() => ({}));
  if (!pollId) return NextResponse.json({ error: 'pollId is required.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (votes && typeof votes === 'object') patch.votes = votes;
  if (typeof result === 'string') patch.result = result;
  if (status === 'open' || status === 'closed') patch.status = status;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_polls')
    .update(patch)
    .eq('id', pollId)
    .eq('character_id', params.id)
    .select('id, question, options, votes, status, result, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ poll: data });
}
