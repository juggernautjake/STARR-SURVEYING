// app/api/admin/deliverables/route.ts — the artefact the firm is legally on the hook for (§3, item 11).
//
//   GET ?jobId=…    → a job's deliverables, newest first.
//   POST            → create one, or a new revision of an existing one.
//   PATCH           → issue it, seal it, or record delivery. body: { id, action: 'issue'|'seal'|'receive', … }
//
// ── SEALING AND ISSUING ARE ACTIONS, NOT FIELD EDITS ────────────────────────────────────────────
//
// `state` could be a column somebody PATCHes to `'final'`. It is not, because "final" means signed
// and sealed by a licensed surveyor, and the fields that make it mean anything — who sealed it, their
// seal number, the moment — must be written in the same statement. A state that can be set without
// them is a state that will be, and the result is a plat recorded as sealed with nobody's name on it.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const COLS = 'id, job_id, name, kind, revision, state, file_url, sealed_by, sealed_at, seal_number, issued_at, issued_to, delivery_method, delivery_note, received_at, supersedes_id, notes, created_by, created_at';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId');
  let q = supabaseAdmin.from('deliverables').select(COLS).order('created_at', { ascending: false }).limit(200);
  if (jobId) q = q.eq('job_id', jobId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deliverables: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id ?? '');
  const name = String(body.name ?? '').trim();
  if (!jobId || !name) return NextResponse.json({ error: 'job_id and name are required.' }, { status: 400 });

  // The next revision of THIS name on THIS job. A revision is a new row: the previous one stays,
  // because "what did we issue in March" is a question that gets asked years later, usually by a
  // lawyer.
  const { data: prior } = await supabaseAdmin
    .from('deliverables')
    .select('id, revision, state')
    .eq('job_id', jobId)
    .eq('name', name)
    .order('revision', { ascending: false })
    .limit(1);
  const previous = (prior ?? [])[0] as { id: string; revision: number; state: string } | undefined;
  const revision = (previous?.revision ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('deliverables')
    .insert({
      job_id: jobId,
      name,
      kind: String(body.kind ?? 'plat'),
      revision,
      state: 'draft',
      file_url: body.file_url ?? null,
      storage_path: body.storage_path ?? null,
      notes: body.notes ?? null,
      supersedes_id: previous?.id ?? null,
      created_by: session.user.email,
    })
    .select(COLS)
    .single();

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json({ error: 'Someone created that revision at the same moment. Reload and try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only after the new revision exists. The reverse order leaves a job whose current deliverable is
  // marked superseded by something that does not exist.
  if (previous && previous.state !== 'superseded') {
    await supabaseAdmin.from('deliverables').update({ state: 'superseded', updated_at: new Date().toISOString() }).eq('id', previous.id);
  }

  return NextResponse.json({ deliverable: data });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const action = String(body.action ?? '');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const now = new Date().toISOString();

  if (action === 'seal') {
    const sealedBy = String(body.sealed_by ?? '').trim();
    const sealNumber = String(body.seal_number ?? '').trim();
    // Both required. A deliverable marked final with no surveyor named is worse than one still marked
    // draft — it asserts a professional responsibility nobody has taken.
    if (!sealedBy || !sealNumber) {
      return NextResponse.json({ error: 'Sealing needs the surveyor’s name and their registration number — both are what make "final" mean anything.' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('deliverables')
      .update({ state: 'final', sealed_by: sealedBy, seal_number: sealNumber, sealed_at: body.sealed_at || now, updated_at: now })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found.' }, { status: error ? 500 : 404 });
    return NextResponse.json({ deliverable: data });
  }

  if (action === 'issue') {
    const issuedTo = String(body.issued_to ?? '').trim();
    // "Issued" without a recipient is not a delivery, it is a file. Seed 523's comment, enforced.
    if (!issuedTo) return NextResponse.json({ error: 'Who was it issued to? A delivery with no recipient is just a file.' }, { status: 400 });

    const { data: current } = await supabaseAdmin.from('deliverables').select('state').eq('id', id).maybeSingle();
    const state = (current as { state: string } | null)?.state;
    if (!state) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    // Issuing does NOT downgrade a sealed deliverable back to `issued`. Sealed is the stronger
    // statement and a delivery record must not quietly retract it.
    const nextState = state === 'final' ? 'final' : 'issued';

    const { data, error } = await supabaseAdmin
      .from('deliverables')
      .update({
        state: nextState,
        issued_at: body.issued_at || now,
        issued_to: issuedTo,
        delivery_method: body.delivery_method ?? 'email',
        delivery_note: body.delivery_note ?? null,
        updated_at: now,
      })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deliverable: data });
  }

  if (action === 'receive') {
    // Proof of receipt, kept separate from `issued_at` rather than conflated with it — sending and
    // arriving are different events and only one of them is evidence.
    const { data, error } = await supabaseAdmin
      .from('deliverables')
      .update({ received_at: body.received_at || now, updated_at: now })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deliverable: data });
  }

  return NextResponse.json({ error: "action must be 'issue', 'seal' or 'receive'." }, { status: 400 });
});
