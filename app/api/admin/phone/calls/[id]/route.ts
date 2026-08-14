// app/api/admin/phone/calls/[id]/route.ts — slices S2/L1 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// One call: read it, and edit the parts a person is allowed to edit.
//
// ── WHAT A PERSON MAY CHANGE, AND WHAT THEY MAY NOT ─────────────────────────────────────────────
//
// The allow-list holds notes, assignment, review state, and the job link. It deliberately excludes
// everything the provider told us — numbers, timings, duration, status — because those are the
// record of what happened, and a UI that can rewrite them turns evidence into opinion.
//
// The transcript IS editable. That is not an inconsistency: a transcript is a machine's guess at
// what was said, it is routinely wrong on names and numbers, and correcting it is the whole reason
// a person reads it. Editing it stamps `reviewed_by`, so a corrected transcript is distinguishable
// from a generated one.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { CALL_RECORDING_BUCKET } from '@/lib/phone/calls';
import { idFromPath } from '@/lib/phone/route-params';

const SELECT = '*';

/** Signed URLs last 15 minutes — long enough to listen, short enough that a copied link expires. */
const SIGNED_URL_SECONDS = 900;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = idFromPath(req.url, 0);
  if (!id) return NextResponse.json({ error: 'Bad call id.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('calls')
    .select(SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const call = data as Record<string, unknown>;

  // The audio is in a private bucket; it is reached only through a short-lived signed URL minted
  // for an admin who just authenticated. The path is never enough on its own.
  let audioUrl: string | null = null;
  if (call.recording_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from(CALL_RECORDING_BUCKET)
      .createSignedUrl(String(call.recording_path), SIGNED_URL_SECONDS);
    audioUrl = signed?.signedUrl ?? null;
  }

  // The raw webhook trail, for the case where a call did something inexplicable.
  const { data: events } = await supabaseAdmin
    .from('call_events')
    .select('id, kind, signature_ok, created_at')
    .eq('call_id', id)
    .order('created_at', { ascending: true });

  let job: unknown = null;
  if (call.job_id) {
    const { data: j } = await supabaseAdmin
      .from('jobs')
      .select('id, job_number, title, client_name, status')
      .eq('id', String(call.job_id))
      .maybeSingle();
    job = j ?? null;
  }

  return NextResponse.json({ call, audioUrl, events: events ?? [], job });
}, { routeName: 'admin/phone/calls/[id]' });

/** Fields a person may set. Everything else is the provider's record — see the header. */
const EDITABLE = new Set([
  'job_id', 'lead_id', 'contact_id', 'customer_id',
  'assigned_to', 'notes', 'transcript', 'summary',
]);

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = idFromPath(req.url, 0);
  if (!id) return NextResponse.json({ error: 'Bad call id.' }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) patch[k] = v === '' ? null : v;
  }

  // Marking read is a distinct verb rather than a field, so "I opened this" cannot be sent
  // accidentally by a form that round-trips every column.
  if (body.markRead === true) {
    patch.reviewed_at = new Date().toISOString();
    patch.reviewed_by = session.user.email;
  }
  if (body.markUnread === true) {
    patch.reviewed_at = null;
    patch.reviewed_by = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  // A hand-corrected transcript or summary is attributed, so it can be told apart from the
  // machine's version later.
  if ('transcript' in patch || 'summary' in patch) {
    patch.reviewed_at = patch.reviewed_at ?? new Date().toISOString();
    patch.reviewed_by = session.user.email;
  }

  // Filing a call under a job is a decision, so it clears the machine's guess rather than leaving
  // two competing answers on the row.
  if ('job_id' in patch && patch.job_id) {
    patch.matched_kind = 'job';
    patch.matched_id = patch.job_id;
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('calls')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ call: data });
}, { routeName: 'admin/phone/calls/[id]' });

/** Soft delete. The row stays, because a deleted call is still evidence that a call happened. */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = idFromPath(req.url, 0);
  if (!id) return NextResponse.json({ error: 'Bad call id.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('calls')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}, { routeName: 'admin/phone/calls/[id]' });
