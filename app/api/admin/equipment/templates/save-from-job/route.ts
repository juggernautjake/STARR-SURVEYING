// app/api/admin/equipment/templates/save-from-job/route.ts
//
// POST /api/admin/equipment/templates/save-from-job
//
// Phase F10.2f-i — the §5.12.3 "Save as template" shortcut.
// Takes a job_id + a name + optional header fields, walks the
// job's live equipment_reservations, and one-shot creates a
// reusable equipment_templates row (version=1) with one
// equipment_template_items row per reservation.
//
// Reduces the friction of the "I built this loadout from
// scratch and want to use it again" path. Per the spec, this
// path is what keeps dispatchers using templates instead of
// giving up and rebuilding from memory each time.
//
// Body:
//   {
//     job_id: UUID,
//     name: string,
//     slug?: string,
//     description?: string,
//     job_type?: string,
//     default_crew_size?: number,
//     default_duration_hours?: number,
//     requires_certifications?: string[]
//   }
//
// Reservation source filter: includes state IN (held,
// checked_out, returned). Cancelled reservations are omitted
// (the dispatcher pulled them back, so they shouldn't ride
// into the saved template). For each included reservation:
//   * preserve `equipment_inventory_id` (specific instrument);
//     dispatcher can edit the resulting template to switch a
//     row to category-of-kind via the existing item-edit UI
//   * `item_kind` resolved from equipment_inventory.item_kind
//   * `quantity = 1` (consumables that were applied at
//     quantity > 1 came in as multiple reservation rows or
//     under one row with consumed_quantity at check-in; v1 of
//     save-as-template emits 1 per row and the dispatcher
//     edits)
//   * `is_required = true` (default; dispatcher edits)
//   * `notes` carries forward from the reservation if any
//   * `sort_order = (i * 10)` so dispatcher edits can drop
//     rows in between
//
// Personnel slots from job_team are NOT included in this batch
// — F10.2f-ii layers them on with the slot_role grouping +
// min/max derivation logic.
//
// Auth: admin / developer / equipment_manager (mutating; same
// as the rest of the templates surface).

import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SOURCE_RESERVATION_STATES = ['held', 'checked_out', 'returned'];

interface ReservationSource {
  id: string;
  equipment_inventory_id: string;
  notes: string | null;
}

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const actorUserId =
      (session.user as { id?: string } | undefined)?.id ?? null;

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object.' },
        { status: 400 }
      );
    }

    const jobId =
      typeof body.job_id === 'string' ? body.job_id.trim() : '';
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json(
        { error: '`job_id` must be a valid UUID.' },
        { status: 400 }
      );
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { error: '`name` must be a non-empty string.' },
        { status: 400 }
      );
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: '`name` must be ≤ 200 characters.' },
        { status: 400 }
      );
    }

    let slug: string | null = null;
    if (body.slug !== undefined && body.slug !== null) {
      if (typeof body.slug !== 'string') {
        return NextResponse.json(
          { error: '`slug` must be a string when present.' },
          { status: 400 }
        );
      }
      const trimmed = body.slug.trim().toLowerCase();
      if (trimmed && !/^[a-z0-9_-]+$/.test(trimmed)) {
        return NextResponse.json(
          {
            error:
              '`slug` must be lowercase alphanumeric with `_` or `-` only.',
          },
          { status: 400 }
        );
      }
      slug = trimmed || null;
    }

    let description: string | null = null;
    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        return NextResponse.json(
          { error: '`description` must be a string when present.' },
          { status: 400 }
        );
      }
      description = body.description.trim() || null;
    }

    let jobType: string | null = null;
    if (body.job_type !== undefined && body.job_type !== null) {
      if (typeof body.job_type !== 'string') {
        return NextResponse.json(
          { error: '`job_type` must be a string when present.' },
          { status: 400 }
        );
      }
      jobType = body.job_type.trim() || null;
    }

    let defaultCrewSize: number | null = null;
    if (
      body.default_crew_size !== undefined &&
      body.default_crew_size !== null
    ) {
      if (
        typeof body.default_crew_size !== 'number' ||
        !Number.isInteger(body.default_crew_size) ||
        body.default_crew_size < 0
      ) {
        return NextResponse.json(
          {
            error:
              '`default_crew_size` must be a non-negative integer when ' +
              'present.',
          },
          { status: 400 }
        );
      }
      defaultCrewSize = body.default_crew_size;
    }

    let defaultDurationHours: number | null = null;
    if (
      body.default_duration_hours !== undefined &&
      body.default_duration_hours !== null
    ) {
      if (
        typeof body.default_duration_hours !== 'number' ||
        body.default_duration_hours < 0
      ) {
        return NextResponse.json(
          {
            error:
              '`default_duration_hours` must be a non-negative number when ' +
              'present.',
          },
          { status: 400 }
        );
      }
      defaultDurationHours = body.default_duration_hours;
    }

    let requiresCertifications: string[] = [];
    if (
      body.requires_certifications !== undefined &&
      body.requires_certifications !== null
    ) {
      if (!Array.isArray(body.requires_certifications)) {
        return NextResponse.json(
          {
            error: '`requires_certifications` must be an array of strings.',
          },
          { status: 400 }
        );
      }
      requiresCertifications = (body.requires_certifications as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }

    // ── Source reservations ─────────────────────────────────────
    const { data: rsRows, error: rsErr } = await supabaseAdmin
      .from('equipment_reservations')
      .select('id, equipment_inventory_id, notes')
      .eq('job_id', jobId)
      .in('state', SOURCE_RESERVATION_STATES)
      .order('created_at', { ascending: true });
    if (rsErr) {
      console.error(
        '[admin/equipment/templates/save-from-job] reservations read failed',
        { jobId, error: rsErr.message }
      );
      return NextResponse.json({ error: rsErr.message }, { status: 500 });
    }
    const reservations = (rsRows ?? []) as ReservationSource[];
    if (reservations.length === 0) {
      return NextResponse.json(
        {
          error:
            `Job ${jobId} has no live reservations to promote into a ` +
            'template. Apply equipment to the job first, then save-as.',
          code: 'no_source_reservations',
        },
        { status: 400 }
      );
    }

    // ── Resolve item_kind for each row (drives template item kind) ──
    const equipmentIds = Array.from(
      new Set(reservations.map((r) => r.equipment_inventory_id))
    );
    const { data: invRows, error: invErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, item_kind')
      .in('id', equipmentIds);
    if (invErr) {
      console.error(
        '[admin/equipment/templates/save-from-job] inventory read failed',
        { error: invErr.message }
      );
      return NextResponse.json({ error: invErr.message }, { status: 500 });
    }
    const itemKindById = new Map<string, string>();
    for (const r of (invRows ?? []) as Array<{
      id: string;
      item_kind: string | null;
    }>) {
      itemKindById.set(r.id, r.item_kind ?? 'durable');
    }

    // ── Create the template header ──────────────────────────────
    const headerInsert = {
      name,
      slug,
      description,
      job_type: jobType,
      default_crew_size: defaultCrewSize,
      default_duration_hours: defaultDurationHours,
      requires_certifications: requiresCertifications,
      required_personnel_slots: [], // F10.2f-ii layers these on
      composes_from: [],
      version: 1,
      is_archived: false,
      created_by: actorUserId,
    };
    const { data: tplRow, error: tplErr } = await supabaseAdmin
      .from('equipment_templates')
      .insert(headerInsert)
      .select(
        'id, name, slug, description, job_type, default_crew_size, ' +
          'default_duration_hours, requires_certifications, ' +
          'required_personnel_slots, composes_from, version, ' +
          'is_archived, created_by, created_at, updated_at'
      )
      .maybeSingle();
    if (tplErr) {
      const pgErr = tplErr as PostgrestError;
      if (pgErr.code === '23505') {
        return NextResponse.json(
          {
            error: `Slug '${slug ?? name}' already exists. Pick a different ` +
                   'name/slug or PATCH the existing template.',
            code: 'slug_collision',
          },
          { status: 409 }
        );
      }
      console.error(
        '[admin/equipment/templates/save-from-job] header insert failed',
        { code: pgErr.code, message: pgErr.message }
      );
      return NextResponse.json(
        { error: pgErr.message ?? 'Header insert failed.' },
        { status: 500 }
      );
    }
    if (!tplRow) {
      return NextResponse.json(
        { error: 'Header insert returned no row.' },
        { status: 500 }
      );
    }
    const templateId = (tplRow as { id: string }).id;

    // ── Create the template items ──────────────────────────────
    const itemRows = reservations.map((r, i) => ({
      template_id: templateId,
      item_kind: itemKindById.get(r.equipment_inventory_id) ?? 'durable',
      equipment_inventory_id: r.equipment_inventory_id,
      category: null,
      quantity: 1,
      is_required: true,
      notes: r.notes,
      sort_order: i * 10,
    }));
    const { data: itemsInserted, error: itemsErr } = await supabaseAdmin
      .from('equipment_template_items')
      .insert(itemRows)
      .select(
        'id, template_id, item_kind, equipment_inventory_id, category, ' +
          'quantity, is_required, notes, sort_order, created_at, updated_at'
      );
    if (itemsErr) {
      // CLEANUP: roll back the template header so the surveyor
      // doesn't end up with an empty-template ghost. Best-effort;
      // a failure here logs but doesn't double-report.
      await supabaseAdmin
        .from('equipment_templates')
        .delete()
        .eq('id', templateId);
      console.error(
        '[admin/equipment/templates/save-from-job] items insert failed; ' +
          'header rolled back',
        { templateId, error: itemsErr.message }
      );
      return NextResponse.json(
        { error: itemsErr.message ?? 'Items insert failed.' },
        { status: 500 }
      );
    }

    // ── Snapshot version 1 ─────────────────────────────────────
    // Mirrors the F10.2c-ii pattern — every version bump (incl.
    // the v1 birth) writes to equipment_template_versions for the
    // §5.12.3 audit chain.
    const { error: snapErr } = await supabaseAdmin
      .from('equipment_template_versions')
      .insert({
        template_id: templateId,
        version: 1,
        name_at_version: name,
        description_at_version: description,
        job_type_at_version: jobType,
        composes_from_at_version: [],
        required_personnel_slots_at_version: [],
        requires_certifications_at_version: requiresCertifications,
        items_jsonb: itemsInserted ?? [],
      });
    if (snapErr) {
      console.warn(
        '[admin/equipment/templates/save-from-job] v1 snapshot failed (non-fatal)',
        { templateId, error: snapErr.message }
      );
    }

    console.log('[admin/equipment/templates/save-from-job POST] ok', {
      template_id: templateId,
      job_id: jobId,
      item_count: (itemsInserted ?? []).length,
      actor_email: session.user.email,
    });

    return NextResponse.json({
      template: tplRow,
      items: itemsInserted ?? [],
      summary: {
        item_count: (itemsInserted ?? []).length,
        source_reservation_count: reservations.length,
      },
    });
  },
  { routeName: 'admin/equipment/templates/save-from-job#post' }
);
