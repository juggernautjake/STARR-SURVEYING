// app/api/admin/mileage/manual/route.ts — persist a MANUAL odometer mileage entry (Area D6, owner 2026-07-18:
// "put in our miles at the start of the day and at the end, and we record the vehicle used"). Distinct from the
// GPS-ping report at /api/admin/mileage (read-only): this writes a surveyor-entered start/end odometer reading
// as one `mileage_entries` row (source 'odometer') so it flows into the operations/job financial reports that
// already read that table. Any authenticated member logs their OWN mileage (user_email = the caller); the math
// is the shared `resolveOdometerEntry` so the Work Mode form preview and the saved financial line always agree.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { resolveOdometerEntry } from '@/lib/mileage/odometer';

const MAX_NOTES_LEN = 500;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', email)
    .maybeSingle();
  if (!user?.default_org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });
  const orgId = user.default_org_id as string;

  const body = await req.json().catch(() => ({}));
  const startReading = Number(body?.startReading);
  const endReading = Number(body?.endReading);

  // The single source of truth for miles + reimbursement (validates reversed/negative/absurd entries).
  const resolved = resolveOdometerEntry(startReading, endReading);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });

  // Optional attribution: a job, an entry date (defaults to today, UTC), and a vehicle. mileage_entries has no
  // vehicle column, so the vehicle + the raw readings ride along in notes for the audit trail.
  const jobId = typeof body?.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : null;
  const entryDate = typeof body?.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.entryDate)
    ? body.entryDate
    : new Date().toISOString().slice(0, 10);

  let vehicleName: string | null = null;
  if (typeof body?.vehicleId === 'string' && body.vehicleId.trim()) {
    const { data: veh } = await supabaseAdmin
      .from('vehicles')
      .select('name')
      .eq('id', body.vehicleId.trim())
      .maybeSingle();
    vehicleName = (veh as { name?: string | null } | null)?.name ?? null;
  }
  const readingNote = `Odometer ${startReading}→${endReading}`;
  const userNote = typeof body?.notes === 'string' ? body.notes.trim().slice(0, MAX_NOTES_LEN) : '';
  const notes = [vehicleName, readingNote, userNote].filter(Boolean).join(' · ') || null;

  const { data, error } = await supabaseAdmin
    .from('mileage_entries')
    .insert({
      org_id: orgId,
      user_email: email,
      job_id: jobId,
      entry_date: entryDate,
      miles: resolved.miles,
      rate_cents_per_mile: Math.round(resolved.rate * 100),
      total_cents: Math.round(resolved.reimbursement * 100),
      notes,
      source: 'odometer',
      created_by: email,
    })
    .select('id, entry_date, miles, rate_cents_per_mile, total_cents')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    entry: data,
    miles: resolved.miles,
    reimbursement: resolved.reimbursement,
    rate: resolved.rate,
  }, { status: 201 });
}, { routeName: 'admin/mileage.manual.post' });
