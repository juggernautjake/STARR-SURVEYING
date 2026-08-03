// app/api/voice/clients/[id]/route.ts — one client.
//
// ── REGENERATING THE PORTAL TOKEN IS THE REVOKE BUTTON ──────────────────────────────────────────
//
// A client's portal link IS their authorisation — there is no password to change. So "this link ended
// up somewhere it should not have" is fixed by minting a new token, which instantly invalidates every
// copy of the old one. That is why it is offered as a visible action with a plain-language warning
// rather than buried: it is the only security control the client relationship has.
//
// Deletion CASCADES to contracts and invoices (the foreign keys say so), which is why this route
// refuses when either exists. Losing a signed contract because somebody tidied up the address book is
// not a recoverable mistake.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { generatePrefixedToken } from '@/lib/voice/tokens';

const RELATIONSHIPS = ['voiceover', 'coaching', 'both'] as const;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('va_clients')
    .select('*, invoices:va_invoices(*), contracts:va_contracts(*)')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ client: data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 200);
  if (typeof body.email === 'string' && body.email.includes('@')) patch.email = body.email.trim().toLowerCase().slice(0, 200);
  if (typeof body.phone === 'string') patch.phone = body.phone.slice(0, 40) || null;
  if (typeof body.company === 'string') patch.company = body.company.slice(0, 200) || null;
  if (typeof body.address === 'string') patch.address = body.address.slice(0, 500) || null;
  if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 4000) || null;
  if ((RELATIONSHIPS as readonly string[]).includes(String(body.relationship))) {
    patch.relationship = String(body.relationship);
  }

  // Minting a new token invalidates every existing link — see the header note.
  if (body.regenerateToken === true) {
    patch.portal_token = generatePrefixedToken('cli');
    patch.portal_revoked_at = null;
  }
  if (body.revokePortal === true) patch.portal_revoked_at = new Date().toISOString();
  if (body.restorePortal === true) patch.portal_revoked_at = null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('va_clients')
    .update(patch)
    .eq('id', params.id)
    .select('id, name, email, portal_token, portal_revoked_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Another client already uses that email address.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ client: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  // The FKs cascade. Refuse rather than take a signed contract or a paid invoice with it.
  const [{ count: invoiceCount }, { count: contractCount }] = await Promise.all([
    supabaseAdmin.from('va_invoices').select('id', { count: 'exact', head: true }).eq('client_id', params.id),
    supabaseAdmin.from('va_contracts').select('id', { count: 'exact', head: true }).eq('client_id', params.id),
  ]);

  if ((invoiceCount ?? 0) > 0 || (contractCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'This client has invoices or contracts attached — deleting them would take those with it. Revoke their portal link instead.',
      },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin.from('va_clients').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
