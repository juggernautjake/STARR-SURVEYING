// app/api/admin/equipment/overrides/route.ts
//
// GET /api/admin/equipment/overrides
//   ?since=YYYY-MM-DD
//   [&type=equipment|personnel|both]
//   [&limit=N]
//
// Phase F10.6-g-i — the §5.12.7.7 override audit panel
// aggregator. Unions every `is_override=true` row across
// `equipment_reservations` (F10.3-e soft-override on equipment)
// AND `job_team` (F10.4-c soft-override on personnel) so admins
// can review the "nothing is silent" trail in one place.
//
// Default since = 30 days ago, default type = both, default
// limit = 200 (overrides are uncommon by design — if volume
// grows beyond a few hundred we surface a polished pager).
//
// For each override row the response carries:
//   * `kind`            'equipment' | 'personnel'
//   * `override_id`     reservation_id OR job_team.id
//   * `created_at`
//   * `actor_email`     resolved from reserved_by → registered_
//                       users.email (equipment side); null on
//                       personnel side since job_team has no
//                       historical actor column
//   * `target_label`    equipment_name OR user_email
//   * `target_id`       equipment_inventory_id OR user_email
//   * `job_id`
//   * `state`           current row state
//   * `reason`          override_reason text
//   * `notes`           the row's notes (which carries the
//                       'OVERRIDE: …' prefix from the
//                       insert path)
//   * `window_from` / `window_to`  reservation/assignment
//                                   window
//
// Auth: EQUIPMENT_ROLES.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

type OverrideKind = 'equipment' | 'personnel';

interface EquipmentOverrideRow {
  id: string;
  job_id: string;
  equipment_inventory_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  override_reason: string | null;
  notes: string | null;
  created_at: string;
  reserved_by: string;
}

interface PersonnelOverrideRow {
  id: string;
  job_id: string;
  user_email: string;
  user_name: string | null;
  slot_role: string | null;
  assigned_from: string | null;
  assigned_to: string | null;
  state: string | null;
  override_reason: string | null;
  notes: string | null;
  created_at: string;
}

interface UnifiedOverride {
  kind: OverrideKind;
  override_id: string;
  created_at: string;
  actor_email: string | null;
  target_label: string;
  target_id: string;
  job_id: string;
  state: string;
  reason: string | null;
  notes: string | null;
  window_from: string | null;
  window_to: string | null;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('tech_support') &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const sinceRaw = searchParams.get('since');
  const typeRaw = searchParams.get('type') ?? 'both';
  const limitRaw = searchParams.get('limit');

  if (typeRaw !== 'both' && typeRaw !== 'equipment' && typeRaw !== 'personnel') {
    return NextResponse.json(
      { error: '`type` must be one of: both | equipment | personnel.' },
      { status: 400 }
    );
  }

  let sinceIso: string;
  if (sinceRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceRaw)) {
      return NextResponse.json(
        { error: '`since` must be YYYY-MM-DD when present.' },
        { status: 400 }
      );
    }
    sinceIso = `${sinceRaw}T00:00:00.000Z`;
  } else {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    d.setUTCHours(0, 0, 0, 0);
    sinceIso = d.toISOString();
  }

  let limit = DEFAULT_LIMIT;
  if (limitRaw) {
    const n = parseInt(limitRaw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: '`limit` must be a positive integer.' },
        { status: 400 }
      );
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  const wantEquipment = typeRaw === 'both' || typeRaw === 'equipment';
  const wantPersonnel = typeRaw === 'both' || typeRaw === 'personnel';

  // ── Equipment overrides ─────────────────────────────────────
  let equipmentOverrides: EquipmentOverrideRow[] = [];
  if (wantEquipment) {
    const { data, error } = await supabaseAdmin
      .from('equipment_reservations')
      .select(
        'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
          'state, override_reason, notes, created_at, reserved_by'
      )
      .eq('is_override', true)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    equipmentOverrides = (data ?? []) as EquipmentOverrideRow[];
  }

  // ── Personnel overrides ─────────────────────────────────────
  let personnelOverrides: PersonnelOverrideRow[] = [];
  if (wantPersonnel) {
    const { data, error } = await supabaseAdmin
      .from('job_team')
      .select(
        'id, job_id, user_email, user_name, slot_role, ' +
          'assigned_from, assigned_to, state, override_reason, ' +
          'notes, created_at'
      )
      .eq('is_override', true)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    personnelOverrides = (data ?? []) as PersonnelOverrideRow[];
  }

  // ── Resolve actor emails for the equipment side ────────────
  const actorIds = Array.from(
    new Set(
      equipmentOverrides
        .map((r) => r.reserved_by)
        .filter((v): v is string => !!v)
    )
  );
  const actorById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('registered_users')
      .select('id, email')
      .in('id', actorIds);
    if (error) {
      console.warn(
        '[admin/equipment/overrides] actor lookup failed',
        { error: error.message }
      );
    } else {
      for (const r of (data ?? []) as Array<{
        id: string;
        email: string | null;
      }>) {
        if (r.email) actorById.set(r.id, r.email);
      }
    }
  }

  // ── Resolve equipment names ─────────────────────────────────
  const equipmentIds = Array.from(
    new Set(equipmentOverrides.map((r) => r.equipment_inventory_id))
  );
  const equipmentNameById = new Map<string, string>();
  if (equipmentIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name')
      .in('id', equipmentIds);
    if (error) {
      console.warn(
        '[admin/equipment/overrides] equipment name lookup failed',
        { error: error.message }
      );
    } else {
      for (const r of (data ?? []) as Array<{
        id: string;
        name: string | null;
      }>) {
        equipmentNameById.set(r.id, r.name ?? r.id);
      }
    }
  }

  // ── Unify into single sorted feed ──────────────────────────
  const unified: UnifiedOverride[] = [];
  for (const r of equipmentOverrides) {
    unified.push({
      kind: 'equipment',
      override_id: r.id,
      created_at: r.created_at,
      actor_email: actorById.get(r.reserved_by) ?? null,
      target_label:
        equipmentNameById.get(r.equipment_inventory_id) ??
        r.equipment_inventory_id,
      target_id: r.equipment_inventory_id,
      job_id: r.job_id,
      state: r.state,
      reason: r.override_reason,
      notes: r.notes,
      window_from: r.reserved_from,
      window_to: r.reserved_to,
    });
  }
  for (const r of personnelOverrides) {
    unified.push({
      kind: 'personnel',
      override_id: r.id,
      created_at: r.created_at,
      // job_team has no historical actor column — F10.4-c logs
      // the actor at insert time but doesn't persist; surface
      // null so the page UI shows '—'. Future polish: add a
      // `created_by` column on job_team to backfill.
      actor_email: null,
      target_label: r.user_name ?? r.user_email,
      target_id: r.user_email,
      job_id: r.job_id,
      state: r.state ?? 'unknown',
      reason: r.override_reason,
      notes: r.notes,
      window_from: r.assigned_from,
      window_to: r.assigned_to,
    });
  }
  unified.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const trimmed = unified.slice(0, limit);

  const summary = {
    total: trimmed.length,
    equipment: trimmed.filter((r) => r.kind === 'equipment').length,
    personnel: trimmed.filter((r) => r.kind === 'personnel').length,
    since: sinceIso,
    type: typeRaw,
    truncated: unified.length > limit,
  };

  return NextResponse.json({
    overrides: trimmed,
    summary,
  });
}, { routeName: 'admin/equipment/overrides#get' });
