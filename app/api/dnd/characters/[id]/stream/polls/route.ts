// app/api/dnd/characters/[id]/stream/polls/route.ts — DM-directed "chat decides" polls.
//
// Flow: the streamer/owner (Susie) creates a poll from her chat box (question + up to 4
// options) → status 'pending'. The DM (Andrew) dials each option's percentage with sliders
// and submits; the total is scaled from the live viewer count (≥25% turnout). The server is
// authoritative about the vote math: it turns percentages + total into per-option counts and
// picks the winner (highest %). Votes then trickle in client-side over ~60s from opened_at,
// and the controller marks the poll 'closed' when the minute is up.
//   GET   → latest poll for this character.
//   POST  → create a pending poll (question + 2–4 options).
//   PATCH → 'direct' (DM submits percentages+total → open) or 'close'.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const COLS = 'id, question, options, votes, status, result, target_percentages, total_votes, opened_at, created_at';
const MAX_VOTES = 9e15; // keep bigint counts under 2^53 so they round-trip exactly as JSON numbers

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
    .select(COLS)
    .eq('character_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ poll: data ?? null });
}

// Susie (owner) — or the DM — proposes a poll. It sits 'pending' until the DM directs it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the streamer or DM can create a poll.' }, { status: 403 });

  const { question, options } = await req.json().catch(() => ({}));
  const opts = Array.isArray(options)
    ? options.map((o) => String(o).slice(0, 60).trim()).filter(Boolean).slice(0, 4)
    : [];
  if (!question || !String(question).trim() || opts.length < 2) {
    return NextResponse.json({ error: 'A question and at least two options are required.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('dnd_stream_polls')
    .insert({ character_id: params.id, question: String(question).slice(0, 200).trim(), options: opts, votes: {}, target_percentages: {}, total_votes: 0, status: 'pending' })
    .select(COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create poll.' }, { status: 500 });
  return NextResponse.json({ poll: data });
}

// DM-only outcome control: 'direct' opens the poll with a set result; 'close' concludes it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM can decide a poll.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const pollId = body.pollId;
  if (!pollId) return NextResponse.json({ error: 'pollId is required.' }, { status: 400 });

  // Fetch the poll so the vote math is anchored to its real options (not client claims).
  const { data: existing } = await supabaseAdmin
    .from('dnd_stream_polls').select(COLS).eq('id', pollId).eq('character_id', params.id).maybeSingle();
  const poll = existing as { options: string[] } | null;
  if (!poll) return NextResponse.json({ error: 'Poll not found.' }, { status: 404 });

  let patch: Record<string, unknown> = {};

  if (body.action === 'close') {
    patch = { status: 'closed' };
  } else {
    // 'direct' (default): the DM's percentages + a viewer-scaled total → concrete counts.
    const options = poll.options ?? [];
    const pctIn = (body.percentages && typeof body.percentages === 'object') ? body.percentages as Record<string, number> : {};
    const pcts = options.map((o) => Math.max(0, Math.min(100, Math.round(Number(pctIn[o]) || 0))));
    const sum = pcts.reduce((a, b) => a + b, 0);
    if (options.length < 2 || sum < 99 || sum > 101) {
      return NextResponse.json({ error: 'Each option needs a percentage and they must total 100%.' }, { status: 400 });
    }
    const total = Math.max(0, Math.min(MAX_VOTES, Math.round(Number(body.totalVotes) || 0)));

    // Per-option counts from the percentages; drop any rounding remainder on the leader so
    // the counts always sum to exactly `total`.
    const counts = pcts.map((p) => Math.round((total * p) / 100));
    let lead = 0;
    for (let i = 1; i < pcts.length; i++) if (pcts[i] > pcts[lead]) lead = i;
    const drift = total - counts.reduce((a, b) => a + b, 0);
    counts[lead] += drift;

    const votes = Object.fromEntries(options.map((o, i) => [o, Math.max(0, counts[i] ?? 0)]));
    const target = Object.fromEntries(options.map((o, i) => [o, pcts[i] ?? 0]));
    patch = {
      status: 'open',
      opened_at: new Date().toISOString(),
      votes,
      target_percentages: target,
      total_votes: total,
      result: options[lead], // highest % wins
    };
  }

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_polls')
    .update(patch)
    .eq('id', pollId)
    .eq('character_id', params.id)
    .select(COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ poll: data });
}
