// app/api/admin/vehicles/route.ts — Fleet CRUD for the admin Vehicles
// page. Powers the mobile vehicle picker on clock-in (F6 #vehicle-
// picker) by maintaining the source-of-truth list.
//
// GET    /api/admin/vehicles?include_inactive=1   — list (mobile only
//        gets active=true via RLS; admin can see archived).
// POST   /api/admin/vehicles                      — create.
// PUT    /api/admin/vehicles                      — update by id.
// DELETE /api/admin/vehicles?id=                  — soft-archive
//        (active=false). Hard-delete via service-role only.
//
// vehicle-details-and-photos-2026-06-22 — extended every shape to
// carry make / model / model_year / status / issue_notes. Photo
// uploads + retrieval live in app/api/admin/vehicles/[id]/photos.
//
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const MAX_NAME_LEN  = 80;
const MAX_PLATE_LEN = 20;
const MAX_VIN_LEN   = 32;
const MAX_MAKE_LEN  = 40;
const MAX_MODEL_LEN = 60;
const MAX_NOTES_LEN = 2000;

const VEHICLE_STATUSES = [
  'ok',
  'maintenance_due',
  'in_repair',
  'damaged',
  'out_of_service',
] as const;
type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

interface VehicleRow {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  license_plate: string | null;
  vin: string | null;
  status: VehicleStatus;
  issue_notes: string | null;
  primary_photo_path: string | null;
  company_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface VehiclePhotoRow {
  id: string;
  vehicle_id: string;
  photo_path: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

function isVehicleStatus(value: unknown): value is VehicleStatus {
  return typeof value === 'string' && (VEHICLE_STATUSES as readonly string[]).includes(value);
}

async function authorize(): Promise<
  | { ok: true; email: string }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, email: session.user.email };
}

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get('include_inactive') === '1';

  let query = supabaseAdmin
    .from('vehicles')
    .select('*')
    .order('active', { ascending: false })
    .order('name', { ascending: true });
  if (!includeInactive) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const vehicles = (data ?? []) as VehicleRow[];
  const ids = vehicles.map((v) => v.id);

  // vehicle-details-and-photos-2026-06-22 — attach a thin list of
  // photos per vehicle. Signed URLs are minted at the per-vehicle
  // endpoint when the gallery is opened; the list endpoint only
  // returns counts + the primary photo's signed URL so the card
  // grid doesn't have to mint N URLs per render.
  let photosByVehicle = new Map<string, VehiclePhotoRow[]>();
  if (ids.length > 0) {
    const { data: photoRows } = await supabaseAdmin
      .from('vehicle_photos')
      .select('*')
      .in('vehicle_id', ids)
      .order('uploaded_at', { ascending: false });
    const grouped = new Map<string, VehiclePhotoRow[]>();
    for (const p of (photoRows ?? []) as VehiclePhotoRow[]) {
      if (!grouped.has(p.vehicle_id)) grouped.set(p.vehicle_id, []);
      grouped.get(p.vehicle_id)!.push(p);
    }
    photosByVehicle = grouped;
  }

  // Mint a signed URL for each vehicle's primary photo so the card
  // grid can render a thumbnail without an extra per-row fetch.
  const decorated = await Promise.all(vehicles.map(async (v) => {
    const photos = photosByVehicle.get(v.id) ?? [];
    const primaryPath = v.primary_photo_path ?? photos[0]?.photo_path ?? null;
    let primary_photo_url: string | null = null;
    if (primaryPath) {
      const { data: signed } = await supabaseAdmin.storage
        .from('vehicle-photos')
        .createSignedUrl(primaryPath, 60 * 60);
      primary_photo_url = signed?.signedUrl ?? null;
    }
    return {
      ...v,
      photo_count: photos.length,
      primary_photo_path: primaryPath,
      primary_photo_url,
    };
  }));

  return NextResponse.json({ vehicles: decorated });
}, { routeName: 'admin/vehicles.get' });

// ── POST ────────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;
  if (!isAdmin((await auth())?.user?.roles)) {
    // tech_support is read-only — same precedent as
    // /api/admin/users.POST.
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const name =
    typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `name required (1..${MAX_NAME_LEN} chars)` },
      { status: 400 }
    );
  }

  const plate =
    typeof body.license_plate === 'string'
      ? body.license_plate.trim().toUpperCase()
      : null;
  if (plate && plate.length > MAX_PLATE_LEN) {
    return NextResponse.json(
      { error: `license_plate exceeds ${MAX_PLATE_LEN} chars` },
      { status: 400 }
    );
  }

  const vin =
    typeof body.vin === 'string' ? body.vin.trim().toUpperCase() : null;
  if (vin && vin.length > MAX_VIN_LEN) {
    return NextResponse.json(
      { error: `vin exceeds ${MAX_VIN_LEN} chars` },
      { status: 400 }
    );
  }

  // vehicle-details-and-photos-2026-06-22 — validate the new fields.
  const make = typeof body.make === 'string' ? body.make.trim() : null;
  if (make && make.length > MAX_MAKE_LEN) {
    return NextResponse.json({ error: `make exceeds ${MAX_MAKE_LEN} chars` }, { status: 400 });
  }
  const model = typeof body.model === 'string' ? body.model.trim() : null;
  if (model && model.length > MAX_MODEL_LEN) {
    return NextResponse.json({ error: `model exceeds ${MAX_MODEL_LEN} chars` }, { status: 400 });
  }
  let model_year: number | null = null;
  if (body.model_year !== undefined && body.model_year !== null && body.model_year !== '') {
    const n = Number(body.model_year);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) {
      return NextResponse.json({ error: 'model_year must be an integer between 1900 and 2100' }, { status: 400 });
    }
    model_year = n;
  }
  const status: VehicleStatus = isVehicleStatus(body.status) ? body.status : 'ok';
  const issue_notes = typeof body.issue_notes === 'string' ? body.issue_notes.trim() : null;
  if (issue_notes && issue_notes.length > MAX_NOTES_LEN) {
    return NextResponse.json({ error: `issue_notes exceeds ${MAX_NOTES_LEN} chars` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('vehicles')
    .insert({
      name,
      make: make || null,
      model: model || null,
      model_year,
      license_plate: plate || null,
      vin: vin || null,
      status,
      issue_notes: issue_notes || null,
      active: true,
      created_by: guard.email,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ vehicle: data as VehicleRow }, { status: 201 });
}, { routeName: 'admin/vehicles.post' });

// ── PUT ─────────────────────────────────────────────────────────────────────

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;
  if (!isAdmin((await auth())?.user?.roles)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) {
    return NextResponse.json(
      { error: 'id is required' },
      { status: 400 }
    );
  }

  // Build the update set defensively — only fields present in the
  // body get written. Active toggle uses an explicit boolean check so
  // a missing field doesn't accidentally archive a vehicle.
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name || name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: `name required (1..${MAX_NAME_LEN} chars)` },
        { status: 400 }
      );
    }
    update.name = name;
  }
  if ('license_plate' in body) {
    if (typeof body.license_plate === 'string') {
      const plate = body.license_plate.trim().toUpperCase();
      if (plate.length > MAX_PLATE_LEN) {
        return NextResponse.json(
          { error: `license_plate exceeds ${MAX_PLATE_LEN} chars` },
          { status: 400 }
        );
      }
      update.license_plate = plate || null;
    } else {
      update.license_plate = null;
    }
  }
  if ('vin' in body) {
    if (typeof body.vin === 'string') {
      const vin = body.vin.trim().toUpperCase();
      if (vin.length > MAX_VIN_LEN) {
        return NextResponse.json(
          { error: `vin exceeds ${MAX_VIN_LEN} chars` },
          { status: 400 }
        );
      }
      update.vin = vin || null;
    } else {
      update.vin = null;
    }
  }
  if ('make' in body) {
    if (typeof body.make === 'string') {
      const m = body.make.trim();
      if (m.length > MAX_MAKE_LEN) {
        return NextResponse.json({ error: `make exceeds ${MAX_MAKE_LEN} chars` }, { status: 400 });
      }
      update.make = m || null;
    } else {
      update.make = null;
    }
  }
  if ('model' in body) {
    if (typeof body.model === 'string') {
      const m = body.model.trim();
      if (m.length > MAX_MODEL_LEN) {
        return NextResponse.json({ error: `model exceeds ${MAX_MODEL_LEN} chars` }, { status: 400 });
      }
      update.model = m || null;
    } else {
      update.model = null;
    }
  }
  if ('model_year' in body) {
    if (body.model_year === null || body.model_year === '' || body.model_year === undefined) {
      update.model_year = null;
    } else {
      const n = Number(body.model_year);
      if (!Number.isInteger(n) || n < 1900 || n > 2100) {
        return NextResponse.json({ error: 'model_year must be an integer between 1900 and 2100' }, { status: 400 });
      }
      update.model_year = n;
    }
  }
  if ('status' in body) {
    if (!isVehicleStatus(body.status)) {
      return NextResponse.json({ error: `status must be one of ${VEHICLE_STATUSES.join(', ')}` }, { status: 400 });
    }
    update.status = body.status;
  }
  if ('issue_notes' in body) {
    if (typeof body.issue_notes === 'string') {
      const n = body.issue_notes.trim();
      if (n.length > MAX_NOTES_LEN) {
        return NextResponse.json({ error: `issue_notes exceeds ${MAX_NOTES_LEN} chars` }, { status: 400 });
      }
      update.issue_notes = n || null;
    } else {
      update.issue_notes = null;
    }
  }
  if ('primary_photo_path' in body) {
    update.primary_photo_path = typeof body.primary_photo_path === 'string' && body.primary_photo_path.length > 0
      ? body.primary_photo_path
      : null;
  }
  if (typeof body.active === 'boolean') {
    update.active = body.active;
  }

  const { data, error } = await supabaseAdmin
    .from('vehicles')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ vehicle: data as VehicleRow });
}, { routeName: 'admin/vehicles.put' });

// ── DELETE ──────────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const guard = await authorize();
  if (!guard.ok) return guard.res;
  if (!isAdmin((await auth())?.user?.roles)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'id is required' },
      { status: 400 }
    );
  }

  // Soft-archive — preserves historical job_time_entries.vehicle_id
  // references. Hard-delete is service-role-only.
  const { data, error } = await supabaseAdmin
    .from('vehicles')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ vehicle: data as VehicleRow });
}, { routeName: 'admin/vehicles.delete' });
