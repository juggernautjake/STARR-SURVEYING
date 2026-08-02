// app/api/voice/inquiries/[id]/route.ts — reading and working one inquiry.
//
// GET returns the inquiry with SIGNED download links for its attachments. The uploads bucket is
// private (see app/api/voice/uploads/route.ts), so a stored `storage_path` is not something a browser
// can fetch — it has to be exchanged for a short-lived URL, and that exchange has to happen behind
// this session check. A public bucket would have made this route unnecessary and made every client's
// unreleased script readable by anyone who guessed a path.
//
// PATCH is how Andrew works the queue: change the status, keep private notes, and — the one that
// matters — turn an inquiry into a client without retyping the name and email.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { generatePrefixedToken } from '@/lib/voice/tokens';
// In lib/ because a route may export only handlers + segment config — see lib/voice/slug.ts.
import { signAttachments } from '@/lib/voice/attachments';

const STATUSES = ['new', 'read', 'quoted', 'won', 'lost', 'spam'] as const;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin.from('va_inquiries').select('*').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Attachments are useless to a caller as raw storage paths — the bucket is private.
  const attachments = await signAttachments(Array.isArray(data.attachments) ? data.attachments : []);
  return NextResponse.json({ inquiry: { ...data, attachments } });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return unauthorized();

  let body: { status?: string; internalNotes?: string; createClient?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const { data: inquiry } = await supabaseAdmin
    .from('va_inquiries')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!inquiry) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (typeof body.status === 'string' && (STATUSES as readonly string[]).includes(body.status)) {
    patch.status = body.status;
    // Stamp the first time it moves off `new`, so "how fast do I actually reply" is answerable
    // later. Only the FIRST transition counts — re-reading an old inquiry must not reset it.
    if (body.status !== 'new' && !inquiry.responded_at) patch.responded_at = new Date().toISOString();
  }

  if (typeof body.internalNotes === 'string') {
    patch.internal_notes = body.internalNotes.slice(0, 5000);
  }

  // ── TURN AN INQUIRY INTO A CLIENT ──
  // The single most common next action, and the one most likely to be done badly by hand: retyping an
  // email address introduces a typo into the record the invoice will eventually be sent to.
  if (body.createClient === true && !inquiry.client_id) {
    const { data: existing } = await supabaseAdmin
      .from('va_clients')
      .select('id')
      .ilike('email', inquiry.email)
      .maybeSingle();

    if (existing) {
      patch.client_id = existing.id;
    } else {
      const { data: created, error: clientErr } = await supabaseAdmin
        .from('va_clients')
        .insert({
          name: inquiry.name,
          email: inquiry.email,
          phone: inquiry.phone,
          company: inquiry.company,
          relationship: inquiry.intent === 'coaching' ? 'coaching' : 'voiceover',
          portal_token: generatePrefixedToken('cli'),
          notes: inquiry.message ? `From their first inquiry:\n\n${inquiry.message}`.slice(0, 4000) : null,
        })
        .select('id')
        .single();

      if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });
      patch.client_id = created.id;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('va_inquiries')
    .update(patch)
    .eq('id', params.id)
    .select('id, status, internal_notes, client_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inquiry: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();
  const { error } = await supabaseAdmin.from('va_inquiries').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
