// app/api/admin/compliance/route.ts — every dated obligation, and what needs doing (audit §3, item 12).
//
//   GET    → { items, summary, unrecorded } — the whole register, worst first.
//   POST   → create a firm-level obligation (COI, E&O, business registration).
//   PATCH  → update one. body: { id, …fields }
//   DELETE ?id=… → remove one.
//
// Only `org_compliance_items` is writable here. Employee certifications, instrument calibration and
// vehicle dates are edited on their own surfaces, which are the tables that OWN them — accepting
// writes for them here would make this a second place those dates can be changed, which is the
// duplication seed 520's header refuses.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import type { UserRole } from '@/lib/auth-roles';

/** The roles `middleware.ts` lets through the `/admin/compliance` PAGE prefix.
 *
 *  Pinned to that entry by `__tests__/admin/compliance-access.test.ts`, because a mirror kept in two
 *  places has drifted in seven of the slices before this one. */
const COMPLIANCE_READ_ROLES: UserRole[] = ['admin', 'developer', 'tech_support'];
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { assess, bySeverity, summarise, type ComplianceRow, type UnrecordedObligation } from '@/lib/compliance/register';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // C13a: this GET answered ANY signed-in account until 2026-08-25 — the whole compliance register,
  // which is the firm's licences, insurance and instrument calibration. Every WRITE below already
  // called isAdmin; only the read had nothing.
  //
  // middleware.ts gates the /admin/compliance PAGE to these three roles and has since it was
  // written, but ROUTE_ROLES only ever ran on page paths, so the gate everybody could see was in
  // front of the screen and never in front of the data. Same finding as C11b-0, same argument for
  // fixing it rather than leaving it: this is not a new policy, it is the existing policy reaching
  // the data. Nobody who can open the page loses anything.
  if (!COMPLIANCE_READ_ROLES.some((r) => (session.user.roles ?? []).includes(r))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [register, equipment, vehicles] = await Promise.all([
    supabaseAdmin.from('compliance_register').select('*'),
    // Instruments with NO calibration date at all. The view cannot show these — it can only union
    // rows that have a date — and "never calibrated" is a worse answer than "overdue", not a better
    // one. Reporting only what the view holds would say the fleet is compliant because nobody has
    // ever recorded anything about it. (§1.1b, with a signed and sealed plat downstream.)
    supabaseAdmin
      .from('equipment_inventory')
      .select('id, name, brand, model, serial_number, equipment_type')
      .is('next_calibration_due_at', null)
      .is('next_calibration_due', null)
      .is('retired_at', null),
    supabaseAdmin.from('vehicles').select('id, name, license_plate, registration_expires_on, inspection_expires_on, insurance_expires_on'),
  ]);

  if (register.error) {
    // Surfaced, not swallowed. A compliance page that silently shows nothing reads as "all clear",
    // which is the most dangerous possible way for this particular screen to fail.
    return NextResponse.json({ error: `Could not read the compliance register: ${register.error.message}` }, { status: 500 });
  }

  const items = ((register.data ?? []) as ComplianceRow[]).map((r) => assess(r)).sort(bySeverity);

  const unrecorded: UnrecordedObligation[] = [];
  // Instruments only — a total station with no calibration on record cannot be relied on for a
  // boundary. Consumables and supplies live in the same table and are excluded by kind.
  const INSTRUMENT_TYPES = new Set(['total_station', 'gnss', 'gnss_receiver', 'level', 'data_collector', 'instrument']);
  for (const e of (equipment.data ?? []) as Array<{ id: string; name: string | null; brand: string | null; model: string | null; serial_number: string | null; equipment_type: string | null }>) {
    if (e.equipment_type && !INSTRUMENT_TYPES.has(e.equipment_type)) continue;
    unrecorded.push({
      subject_kind: 'equipment',
      subject_id: e.id,
      subject_label: e.name || [e.brand, e.model].filter(Boolean).join(' ') || e.serial_number || 'Equipment',
      what: 'No calibration date on record',
    });
  }
  for (const v of (vehicles.data ?? []) as Array<{ id: string; name: string | null; license_plate: string | null; registration_expires_on: string | null; inspection_expires_on: string | null; insurance_expires_on: string | null }>) {
    const label = v.name || v.license_plate || 'Vehicle';
    for (const [field, what] of [
      ['registration_expires_on', 'No registration expiry on record'],
      ['inspection_expires_on', 'No inspection expiry on record'],
      ['insurance_expires_on', 'No insurance expiry on record'],
    ] as const) {
      if (!v[field]) unrecorded.push({ subject_kind: 'vehicle', subject_id: v.id, subject_label: label, what });
    }
  }

  return NextResponse.json(
    { items, summary: summarise(items), unrecorded },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

interface OrgItemBody {
  id?: string;
  category?: string;
  title?: string;
  identifier?: string | null;
  issuing_authority?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  renewal_lead_days?: number;
  document_url?: string | null;
  notes?: string | null;
}

const CATEGORIES = new Set(['insurance', 'registration', 'license', 'policy', 'other']);

function sanitise(body: OrgItemBody): Record<string, unknown> | { error: string } {
  const title = (body.title ?? '').trim();
  if (!title) return { error: 'A title is required — "E&O policy" or "TBPELS firm registration".' };
  const category = (body.category ?? 'other').trim();
  if (!CATEGORIES.has(category)) return { error: `Category must be one of: ${[...CATEGORIES].join(', ')}.` };
  const lead = Number(body.renewal_lead_days ?? 30);
  return {
    category,
    title,
    identifier: body.identifier?.trim() || null,
    issuing_authority: body.issuing_authority?.trim() || null,
    issued_on: body.issued_on || null,
    expires_on: body.expires_on || null,
    // Clamped rather than trusted: a lead time of 0 means the first warning arrives on the day it
    // lapses, and a negative one makes the band arithmetic nonsense.
    renewal_lead_days: Number.isFinite(lead) ? Math.min(365, Math.max(1, Math.round(lead))) : 30,
    document_url: body.document_url?.trim() || null,
    notes: body.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as OrgItemBody;
  const fields = sanitise(body);
  if ('error' in fields) return NextResponse.json(fields, { status: 400 });

  const { data, error } = await supabaseAdmin.from('org_compliance_items').insert(fields).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as OrgItemBody;
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const fields = sanitise(body);
  if ('error' in fields) return NextResponse.json(fields, { status: 400 });

  const { data, error } = await supabaseAdmin.from('org_compliance_items').update(fields).eq('id', body.id).select('*').single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found.' }, { status: error ? 500 : 404 });
  return NextResponse.json({ item: data });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  // Returns the deleted rows so a wrong id reports 404 rather than a success that deleted nothing.
  const { data, error } = await supabaseAdmin.from('org_compliance_items').delete().eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found (nothing was deleted).' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
