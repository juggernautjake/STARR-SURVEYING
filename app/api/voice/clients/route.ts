// app/api/voice/clients/route.ts — the address book.
//
// ── EVERY CLIENT GETS A PORTAL TOKEN AT CREATION ────────────────────────────────────────────────
//
// Not lazily, on first send. A token minted on demand means the "share this" button has to handle a
// missing one, every caller has to remember to check, and there is a window where a client exists but
// cannot be sent anything. It is 32 random bytes; generating it eagerly costs nothing and removes a
// whole category of null-handling from every surface downstream.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { generatePrefixedToken } from '@/lib/voice/tokens';
import { emailProblem } from '@/lib/voice/auth-rules';

const RELATIONSHIPS = ['voiceover', 'coaching', 'both'] as const;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('va_clients')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();

  if (!name) return NextResponse.json({ error: 'What are they called?' }, { status: 400 });
  const emailErr = emailProblem(email);
  // The shared identifier check also accepts usernames; a client record genuinely needs an address,
  // so the '@' is required here even though it is not at login.
  if (emailErr || !email.includes('@')) {
    return NextResponse.json({ error: 'A real email address, so you can invoice them.' }, { status: 400 });
  }

  // Duplicate emails are refused rather than merged. Two records for one person means an invoice sent
  // to one and a contract to the other, and no screen that shows both.
  const { data: existing } = await supabaseAdmin.from('va_clients').select('id, name').ilike('email', email).maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `${existing.name} already uses that email address.`, existingId: existing.id },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('va_clients')
    .insert({
      name: name.slice(0, 200),
      email: email.slice(0, 200),
      phone: body.phone ? String(body.phone).slice(0, 40) : null,
      company: body.company ? String(body.company).slice(0, 200) : null,
      address: body.address ? String(body.address).slice(0, 500) : null,
      relationship: (RELATIONSHIPS as readonly string[]).includes(String(body.relationship))
        ? String(body.relationship)
        : 'voiceover',
      portal_token: generatePrefixedToken('cli'),
      notes: body.notes ? String(body.notes).slice(0, 4000) : null,
    })
    .select('id, name')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
