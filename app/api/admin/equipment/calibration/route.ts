// app/api/admin/equipment/calibration/route.ts — calibration certificates (audit §3c.2, item 8m).
//
// *"Instrument records with make/model/serial tied to `equipment_inventory`, so a calibration
// certificate and its instrument are the same object — which is also the compliance surface §3 says
// is missing."*
//
//   GET ?equipmentId=… → certificates for one instrument, newest first.
//   GET                → the whole firm's certificates.
//   POST               → record a calibration. Also advances the instrument's own due date.
//   DELETE ?id=…       → remove a certificate.
//
// ── RECORDING A CERTIFICATE MOVES THE DUE DATE, AND THAT IS THE POINT ───────────────────────────
//
// `equipment_inventory.next_calibration_due_at` stays the authority on whether an instrument is due
// (seed 520's header). If filing a certificate did not update it, a firm would calibrate an
// instrument, file the paperwork, and the compliance page would still say it was overdue — so people
// would learn to ignore the page, which is worse than not having one.
//
// It is advanced from the certificate's OWN expiry when it has one, and only otherwise from a
// twelve-month default. A lab that certifies for two years should not have its instrument flagged
// after twelve months because this route assumed an interval.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const DEFAULT_INTERVAL_MONTHS = 12;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const equipmentId = new URL(req.url).searchParams.get('equipmentId');
  let q = supabaseAdmin
    .from('calibration_certificates')
    .select('id, equipment_id, certificate_no, issuing_lab, calibrated_on, expires_on, standard, document_url, notes, recorded_by, created_at')
    .order('calibrated_on', { ascending: false });
  if (equipmentId) q = q.eq('equipment_id', equipmentId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ certificates: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const equipmentId = typeof body.equipment_id === 'string' ? body.equipment_id : '';
  const calibratedOn = typeof body.calibrated_on === 'string' ? body.calibrated_on : '';
  if (!equipmentId || !calibratedOn) {
    return NextResponse.json({ error: 'equipment_id and calibrated_on are required.' }, { status: 400 });
  }

  // Confirm the instrument exists and is in this tenant BEFORE writing. The scoped client filters the
  // read, so a missing row means "not yours or not there" — either way there is nothing to attach to,
  // and a certificate pointing at nothing is worse than a rejected request.
  const { data: instrument, error: readErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, name')
    .eq('id', equipmentId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!instrument) return NextResponse.json({ error: 'That instrument is not in this firm’s inventory.' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('calibration_certificates')
    .insert({
      equipment_id: equipmentId,
      certificate_no: body.certificate_no?.trim() || null,
      issuing_lab: body.issuing_lab?.trim() || null,
      calibrated_on: calibratedOn,
      expires_on: body.expires_on || null,
      standard: body.standard?.trim() || null,
      document_url: body.document_url?.trim() || null,
      notes: body.notes?.trim() || null,
      recorded_by: session.user.email,
    })
    .select('*')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save.' }, { status: 500 });

  // Advance the instrument's due date. From the certificate's own expiry when the lab gave one.
  const nextDue = body.expires_on
    ? new Date(`${body.expires_on}T00:00:00Z`)
    : (() => {
        const d = new Date(`${calibratedOn}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + DEFAULT_INTERVAL_MONTHS);
        return d;
      })();

  const { error: updateErr } = await supabaseAdmin
    .from('equipment_inventory')
    .update({
      last_calibrated_at: new Date(`${calibratedOn}T00:00:00Z`).toISOString(),
      next_calibration_due_at: nextDue.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', equipmentId);

  // Reported rather than swallowed: the certificate saved and the due date did not move, which is a
  // state a user must know about — otherwise the compliance page keeps flagging an instrument they
  // just certified, and they stop believing the page.
  const warning = updateErr
    ? `The certificate was saved, but the instrument's next-due date could not be updated: ${updateErr.message}`
    : null;

  return NextResponse.json({ certificate: data, next_calibration_due_at: nextDue.toISOString(), warning });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('calibration_certificates').delete().eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found (nothing was deleted).' }, { status: 404 });
  // The instrument's due date is deliberately NOT rolled back. It may have been advanced by a later
  // certificate, and silently moving a compliance date backwards because a record was tidied up is
  // not something a user would expect or notice.
  return NextResponse.json({ ok: true });
});
