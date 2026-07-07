// app/api/dnd/sessions/[id]/recap/route.ts — AI session recap (Phase I5). POST gathers
// the session's roll/combat log + the DM's notes, has Claude draft a player-facing
// recap, and upserts it to dnd_recaps as a draft (I6 turns it into a co-edited final).
// GET returns the current recap. DM generates; any member can read.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndComplete, dndAiConfigured } from '@/lib/dnd/ai';

const SYSTEM =
  'You are a Dungeon Master writing a recap of the last session for the players. Using the ' +
  "DM's private notes and the dice/combat log, write a concise, engaging, player-facing recap " +
  'in markdown: a short title, then a few paragraphs (or bullets) covering the key story beats, ' +
  'notable rolls (crits, clutch saves, deaths), victories/losses, and any cliffhanger. Do not ' +
  'invent major plot events that the notes and log do not support. Keep it tight.';

interface RollRow { actor_name: string | null; label: string; result: number | null; crit: boolean; fumble: boolean }

async function sessionMeta(id: string) {
  const { data } = await supabaseAdmin.from('dnd_sessions').select('campaign_id, title, dm_notes').eq('id', id).maybeSingle();
  return data as { campaign_id: string; title: string | null; dm_notes: string | null } | null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const meta = await sessionMeta(params.id);
  if (!meta) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(meta.campaign_id)) === null) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { data } = await supabaseAdmin.from('dnd_recaps').select('id, draft_markdown, final_markdown, status, generated_by, created_at').eq('session_id', params.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ recap: data ?? null });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const meta = await sessionMeta(params.id);
  if (!meta) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  // Collaborative: any campaign member can co-edit the recap (I6).
  if ((await getCampaignRole(meta.campaign_id)) === null) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { finalMarkdown, status } = await req.json().catch(() => ({}));
  if (typeof finalMarkdown !== 'string') return NextResponse.json({ error: 'finalMarkdown is required.' }, { status: 400 });
  const nextStatus = status === 'final' ? 'final' : 'draft';

  const { data: existing } = await supabaseAdmin.from('dnd_recaps').select('id, edited_by').eq('session_id', params.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const prior = (existing as { id: string; edited_by: string[] | null } | null);
  const editedBy = Array.from(new Set([...(prior?.edited_by ?? []), session.userId]));

  let saved;
  if (prior?.id) {
    ({ data: saved } = await supabaseAdmin.from('dnd_recaps').update({ final_markdown: finalMarkdown, status: nextStatus, edited_by: editedBy }).eq('id', prior.id).select('id, draft_markdown, final_markdown, status').single());
  } else {
    ({ data: saved } = await supabaseAdmin.from('dnd_recaps').insert({ session_id: params.id, final_markdown: finalMarkdown, generated_by: 'human', status: nextStatus, edited_by: editedBy }).select('id, draft_markdown, final_markdown, status').single());
  }
  return NextResponse.json({ recap: saved });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });
  const meta = await sessionMeta(params.id);
  if (!meta) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(meta.campaign_id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can generate a recap.' }, { status: 403 });

  const { data: rolls } = await supabaseAdmin
    .from('dnd_roll_log')
    .select('actor_name, label, result, crit, fumble')
    .eq('session_id', params.id)
    .order('created_at', { ascending: true })
    .limit(200);
  const log = ((rolls ?? []) as RollRow[])
    .map((r) => `- ${r.actor_name ?? 'Someone'}: ${r.label} = ${r.result ?? '?'}${r.crit ? ' (CRIT!)' : r.fumble ? ' (fumble)' : ''}`)
    .join('\n');

  const context = [
    `Session: ${meta.title ?? 'Untitled'}`,
    meta.dm_notes ? `\nDM notes:\n${meta.dm_notes}` : '',
    log ? `\nDice/combat log:\n${log}` : '\n(No dice were logged this session.)',
  ].join('\n');

  let draft: string;
  try {
    draft = await dndComplete({ system: SYSTEM, user: context, maxTokens: 1400, temperature: 0.8 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Recap generation failed.' }, { status: 502 });
  }

  // Upsert the newest recap for this session (keep one row; I6 edits it).
  const { data: existing } = await supabaseAdmin.from('dnd_recaps').select('id').eq('session_id', params.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  let saved;
  if (existing?.id) {
    ({ data: saved } = await supabaseAdmin.from('dnd_recaps').update({ draft_markdown: draft, generated_by: 'ai', status: 'draft' }).eq('id', existing.id).select('id, draft_markdown, final_markdown, status').single());
  } else {
    ({ data: saved } = await supabaseAdmin.from('dnd_recaps').insert({ session_id: params.id, draft_markdown: draft, generated_by: 'ai', status: 'draft' }).select('id, draft_markdown, final_markdown, status').single());
  }
  return NextResponse.json({ recap: saved });
}
