// app/api/admin/vehicles/condition/route.ts
//
// E5 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — log a vehicle's condition.
//
//   POST  { vehicle_id, condition, odometer_miles?, notes? }
//         → appends a vehicle_condition_logs row AND updates the vehicle's
//           current condition snapshot (condition, odometer, last_inspected_at).
//   GET   ?vehicle_id=UUID  → that vehicle's condition history (newest first).
//
// Auth: admin / developer / equipment_manager / tech_support.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'out_of_service'];

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!isAdmin(session.user.roles) && !roles.includes('equipment_manager') && !roles.includes('tech_support')) {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const g = await gate();
  if (!g.ok) return g.res;
  const vehicleId = new URL(req.url).searchParams.get('vehicle_id') ?? '';
  if (!UUID_RE.test(vehicleId)) return NextResponse.json({ error: 'vehicle_id must be a UUID' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('vehicle_condition_logs')
    .select('id, condition, odometer_miles, notes, logged_by, created_at')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data ?? [] });
}, { routeName: 'admin/vehicles/condition:GET' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const g = await gate();
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id : '';
  if (!UUID_RE.test(vehicleId)) return NextResponse.json({ error: 'vehicle_id must be a UUID' }, { status: 400 });
  const condition = typeof body.condition === 'string' ? body.condition : '';
  if (!CONDITIONS.includes(condition)) {
    return NextResponse.json({ error: `condition must be one of ${CONDITIONS.join(', ')}` }, { status: 400 });
  }
  const odometer = typeof body.odometer_miles === 'number' && body.odometer_miles >= 0
    ? Math.round(body.odometer_miles) : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) || null : null;
  const nowIso = new Date().toISOString();

  const { error: logErr } = await supabaseAdmin.from('vehicle_condition_logs').insert({
    vehicle_id: vehicleId, condition, odometer_miles: odometer, notes, logged_by: g.email,
  });
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

  const update: Record<string, unknown> = {
    condition, last_inspected_at: nowIso, condition_notes: notes, updated_at: nowIso,
  };
  if (odometer !== null) update.odometer_miles = odometer;

  const { data: vehicle, error: updErr } = await supabaseAdmin
    .from('vehicles')
    .update(update)
    .eq('id', vehicleId)
    .select('id, name, condition, odometer_miles, last_inspected_at, condition_notes')
    .maybeSingle();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ vehicle });
}, { routeName: 'admin/vehicles/condition:POST' });
