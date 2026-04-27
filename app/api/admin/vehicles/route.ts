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
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const MAX_NAME_LEN = 80;
const MAX_PLATE_LEN = 20;
const MAX_VIN_LEN = 32;

interface VehicleRow {
  id: string;
  name: string;
  license_plate: string | null;
  vin: string | null;
  company_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
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

  return NextResponse.json({
    vehicles: (data ?? []) as VehicleRow[],
  });
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

  const { data, error } = await supabaseAdmin
    .from('vehicles')
    .insert({
      name,
      license_plate: plate || null,
      vin: vin || null,
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
