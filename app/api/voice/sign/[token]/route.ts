// app/api/voice/sign/[token]/route.ts — a client signing a contract.
//
// This is the ONE write endpoint an unauthenticated stranger can reach that changes a legal record,
// so the constraints are stated plainly.
//
// ── THE TOKEN IS THE AUTHORISATION ──────────────────────────────────────────────────────────────
//
// 256 bits of randomness in the URL. There is no account, because a client visits twice — once to
// sign, once to pay — and a password would mean account recovery, verification and a support burden
// for that. The token is looked up by an indexed equality, so the lookup itself is constant-time as
// far as anyone on the wire can observe.
//
// ── WHAT MAKES THE SIGNATURE HOLD UP ────────────────────────────────────────────────────────────
//
// A typed name is a valid electronic signature under ESIGN/UETA for an agreement this size. What
// makes it defensible is the EVIDENCE captured alongside it: who typed what, from which IP, with
// which browser, when — and `body_hash`, a SHA-256 of the exact text on screen at the moment they
// agreed. The hash is the load-bearing part. Without it, "that is not what I signed" is unanswerable;
// with it, an edit after signing is detectable rather than silent.
//
// ── SIGNING IS IDEMPOTENT-ISH, DELIBERATELY ─────────────────────────────────────────────────────
//
// A second POST to an already-signed contract is REFUSED rather than overwriting the first signature.
// A double-submitted form must not quietly replace the evidence bundle with a fresh timestamp.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildSignatureRecord, checkSignature } from '@/lib/voice/contracts';
import { looksLikeToken } from '@/lib/voice/tokens';
import { notifyStudio } from '@/lib/voice/notifications';
import { BASE_PATH } from '@/lib/voice/content';

export async function POST(request: Request, { params }: { params: { token: string } }): Promise<NextResponse> {
  if (!looksLikeToken(params.token)) {
    return NextResponse.json({ error: 'That link is not valid.' }, { status: 404 });
  }

  let body: { typedName?: string; email?: string; agreed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const { data: contract } = await supabaseAdmin
    .from('va_contracts')
    .select('*, client:va_clients(id, name, email)')
    .eq('access_token', params.token)
    .maybeSingle();

  // A missing contract and a bad token get the same 404 — there is no reason to confirm to a
  // stranger that a token was ALMOST right.
  if (!contract) return NextResponse.json({ error: 'That link is not valid.' }, { status: 404 });

  if (contract.status === 'void') {
    return NextResponse.json({ error: 'This agreement has been withdrawn. Get in touch.' }, { status: 409 });
  }
  if (contract.signed_at) {
    return NextResponse.json({ error: 'This has already been signed.' }, { status: 409 });
  }
  if (contract.status === 'draft') {
    // Not yet sent. Refuse rather than let a guessed-at link sign something still being written.
    return NextResponse.json({ error: 'This agreement is not ready to sign yet.' }, { status: 409 });
  }

  const check = checkSignature({
    typedName: String(body.typedName ?? ''),
    expectedName: String(contract.client?.name ?? ''),
    agreed: body.agreed === true,
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const forwarded = request.headers.get('x-forwarded-for');
  const record = buildSignatureRecord({
    typedName: String(body.typedName),
    email: body.email ?? contract.client?.email ?? null,
    body: contract.body_markdown,
    ip: forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  });

  const { error } = await supabaseAdmin
    .from('va_contracts')
    // Guarded on `signed_at IS NULL` as well as on the id: two simultaneous submissions would both
    // pass the check above, and this is what makes the second one a no-op rather than an overwrite.
    .update(record)
    .eq('id', contract.id)
    .is('signed_at', null);

  if (error) {
    console.error('[voice/sign] failed:', error.message);
    return NextResponse.json({ error: 'Could not record that. Please try again.' }, { status: 500 });
  }

  void notifyStudio({
    kind: 'contract_signed',
    title: `${contract.client?.name ?? 'A client'} signed ${contract.contract_number}`,
    body: contract.title,
    href: `${BASE_PATH}/studio/contracts/${contract.id}`,
    subjectType: 'contract',
    subjectId: contract.id,
  });

  return NextResponse.json({ ok: true, signedAt: record.signed_at });
}
