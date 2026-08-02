// app/api/voice/contracts/[id]/route.ts — edit, send, countersign, void.
//
// ── THE TEXT FREEZES AT SIGNATURE ───────────────────────────────────────────────────────────────
//
// `body_markdown` is editable only while the contract is a draft or sent-but-unsigned. Once a
// signature exists, the text is the thing that was signed and `canTransition` / `isEditable` refuse
// to let it change. The stored `body_hash` would detect an edit afterwards, but detection is a poor
// second to prevention — by the time a hash mismatch is noticed, the dispute has already started.
//
// Countersigning is Andrew's acceptance and is recorded separately from the client's signature. Both
// sides having a timestamp is what makes it a mutual agreement rather than a form someone filled in.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { canTransition, isEditable, type ContractStatus } from '@/lib/voice/contracts';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('va_contracts')
    .select('*, client:va_clients(id, name, email, company)')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ contract: data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const { data: contract } = await supabaseAdmin
    .from('va_contracts')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!contract) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const current = contract.status as ContractStatus;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // ── TEXT AND TERMS ──
  if (typeof body.bodyMarkdown === 'string') {
    if (!isEditable(current)) {
      return NextResponse.json(
        { error: 'This has been signed. Its wording cannot change — void it and issue a new one.' },
        { status: 409 },
      );
    }
    patch.body_markdown = body.bodyMarkdown.slice(0, 60000);
  }
  if (typeof body.title === 'string' && isEditable(current)) patch.title = body.title.slice(0, 200);
  if (Number.isFinite(Number(body.feeCents)) && isEditable(current)) {
    patch.fee_cents = Math.max(0, Math.round(Number(body.feeCents)));
  }

  // ── STATUS ──
  if (body.send === true) {
    if (!canTransition(current, 'sent')) {
      return NextResponse.json({ error: `A ${current} contract cannot be sent.` }, { status: 409 });
    }
    patch.status = 'sent';
    patch.sent_at = new Date().toISOString();
  }

  if (body.countersign === true) {
    if (!canTransition(current, 'countersigned')) {
      return NextResponse.json(
        { error: 'You can only countersign after the client has signed.' },
        { status: 409 },
      );
    }
    patch.status = 'countersigned';
    patch.countersigned_by = session.displayName;
    patch.countersigned_at = new Date().toISOString();
  }

  if (body.void === true) {
    if (!canTransition(current, 'void')) {
      return NextResponse.json({ error: 'This cannot be voided.' }, { status: 409 });
    }
    patch.status = 'void';
  }

  // Back to draft, which is only legal from `sent` — i.e. before anybody has signed it.
  if (body.unsend === true) {
    if (!canTransition(current, 'draft')) {
      return NextResponse.json({ error: 'This cannot go back to a draft.' }, { status: 409 });
    }
    patch.status = 'draft';
    patch.sent_at = null;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('va_contracts')
    .update(patch)
    .eq('id', params.id)
    .select('id, contract_number, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contract: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data: contract } = await supabaseAdmin
    .from('va_contracts')
    .select('status')
    .eq('id', params.id)
    .maybeSingle();

  // A signed agreement is a record, not a file. Void keeps the history; delete would erase the fact
  // that both parties once agreed to something.
  if (contract && contract.status !== 'draft') {
    return NextResponse.json({ error: 'Only drafts can be deleted. Void this one instead.' }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('va_contracts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
