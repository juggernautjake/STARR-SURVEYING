// app/api/voice/demos/route.ts — the demo reels.
//
// A reel may reference either an uploaded file (`media_id`) or an external URL (`audio_url`). Both are
// supported because they solve different moments: early on the reel lives on SoundCloud and pasting a
// link is the fastest route to a working page; later it is uploaded here, and referencing it by id
// means re-recording it updates every page that plays it. Supporting only the second would make "get
// something live today" impossible, which is the wrong trade for a portfolio with no reels on it.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';

const CATEGORIES = ['commercial', 'character', 'narration', 'telephony', 'promo', 'singing'] as const;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Give the reel a name.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('va_demos')
    .insert({
      title: title.slice(0, 160),
      category: (CATEGORIES as readonly string[]).includes(String(body.category)) ? String(body.category) : 'commercial',
      description: body.description ? String(body.description).slice(0, 400) : null,
      audio_url: body.audioUrl ? String(body.audioUrl).slice(0, 600) : null,
      media_id: body.mediaId ? String(body.mediaId) : null,
      traits: Array.isArray(body.traits)
        ? body.traits.filter((t) => typeof t === 'string').map((t) => (t as string).slice(0, 40)).slice(0, 8)
        : [],
      sort_order: Math.round(Number(body.sortOrder) || 0),
    })
    .select('id, title')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ demo: data });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Which reel?' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 160);
  if (typeof body.description === 'string') patch.description = body.description.slice(0, 400) || null;
  if (typeof body.audioUrl === 'string') patch.audio_url = body.audioUrl.slice(0, 600) || null;
  if ((CATEGORIES as readonly string[]).includes(String(body.category))) patch.category = String(body.category);
  if (typeof body.featured === 'boolean') patch.featured = body.featured;
  if (Array.isArray(body.traits)) {
    patch.traits = body.traits.filter((t) => typeof t === 'string').map((t) => (t as string).slice(0, 40)).slice(0, 8);
  }
  if (Number.isFinite(Number(body.sortOrder))) patch.sort_order = Math.round(Number(body.sortOrder));

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const { error } = await supabaseAdmin.from('va_demos').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which reel?' }, { status: 400 });

  // Only the reel entry goes. The audio file stays in the media library — removing a reel from the
  // site is not the same as throwing away the recording, and conflating them loses work.
  const { error } = await supabaseAdmin.from('va_demos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
