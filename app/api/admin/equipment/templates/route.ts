// app/api/admin/equipment/templates/route.ts
//
// GET /api/admin/equipment/templates?job_type=&include_archived=1&q=&limit=
//
// Templates list endpoint — Phase F10.2a-i. Read-side foundation
// for the F10.2 dispatcher templates work the user explicitly
// asked for: "create a template that entails all of the equipment
// that would be used on that kind of job, and then could reuse
// that template over and over again."
//
// Each row is a header (without the line items) — the F10.2a-ii
// detail endpoint joins items + the latest snapshot for the edit
// page. Listing keeps the per-row payload small for the catalogue
// view + the F10.5 "apply template" picker on the job detail page.
//
// Filters:
//   * job_type — narrow to one tag (boundary / topo / stakeout /
//     road_work / etc.). Indexed via seeds/237 partial idx.
//   * include_archived=1 — opt-in to include is_archived=true
//     rows. Default filters them out so the picker stays clean.
//   * q — case-insensitive substring against name + description.
//   * limit — default 100, max 500. Templates rarely number in
//     the hundreds; the cap is sanity.
//
// Response: { items: TemplateRow[], total_count, filters_applied }.
//
// Auth: admin / developer / tech_support / equipment_manager.
// All four roles can SEE templates; only admin + equipment_manager
// can CREATE them per §5.12.3 permissions split (enforced on
// the F10.2b POST endpoint).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface TemplateRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  job_type: string | null;
  default_crew_size: number | null;
  default_duration_hours: number | null;
  requires_certifications: string[];
  composes_from: string[];
  version: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Cheap aggregate so the list view can show "5 line items" without
  // a per-row roundtrip. Pulled via the !inner / count syntax.
  item_count?: number;
}

const SELECT_COLUMNS =
  'id, name, slug, description, job_type, ' +
  'default_crew_size, default_duration_hours, ' +
  'requires_certifications, composes_from, version, is_archived, ' +
  'created_by, created_at, updated_at, ' +
  'equipment_template_items(count)';

export const GET = withErrorHandler(
  async (req: NextRequest) => {
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
    const jobTypeRaw = searchParams.get('job_type');
    const includeArchived = searchParams.get('include_archived') === '1';
    const qRaw = searchParams.get('q');
    const limitRaw = searchParams.get('limit');

    const limit = (() => {
      if (!limitRaw) return DEFAULT_LIMIT;
      const n = parseInt(limitRaw, 10);
      if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
      return Math.min(n, MAX_LIMIT);
    })();

    let query = supabaseAdmin
      .from('equipment_templates')
      .select(SELECT_COLUMNS)
      .order('name', { ascending: true })
      .limit(limit);

    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }
    if (jobTypeRaw) {
      query = query.eq('job_type', jobTypeRaw);
    }
    if (qRaw && qRaw.trim()) {
      const escaped = qRaw.trim().replace(/[%,]/g, '');
      query = query.or(
        `name.ilike.%${escaped}%,description.ilike.%${escaped}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[admin/equipment/templates] read failed', {
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the embedded count() into a top-level item_count for
    // the client. Supabase returns it as `equipment_template_items:
    // [{ count: N }]` — collapse it.
    type RawRow = Omit<TemplateRow, 'item_count'> & {
      equipment_template_items?: Array<{ count: number }>;
    };
    const items: TemplateRow[] = ((data ?? []) as RawRow[]).map((r) => {
      const itemCount = r.equipment_template_items?.[0]?.count ?? 0;
      const { equipment_template_items: _drop, ...rest } = r;
      return { ...rest, item_count: itemCount };
    });

    // Total-count probe (filtered to the same archive shape so
    // narrowing by job_type / q doesn't move the denominator the
    // catalogue UI shows in "Showing N of M").
    let totalCount: number | null = null;
    {
      let countQuery = supabaseAdmin
        .from('equipment_templates')
        .select('id', { count: 'exact', head: true });
      if (!includeArchived) {
        countQuery = countQuery.eq('is_archived', false);
      }
      const { count, error: countErr } = await countQuery;
      if (!countErr) totalCount = count;
    }

    return NextResponse.json({
      items,
      total_count: totalCount,
      filters_applied: {
        job_type: jobTypeRaw ?? null,
        include_archived: includeArchived,
        q: qRaw ?? null,
      },
      limit,
    });
  },
  { routeName: 'admin/equipment/templates' }
);

// ── POST /api/admin/equipment/templates — create a template ────────────────
//
// Phase F10.2b-i. Atomic-ish create flow:
//   1. INSERT equipment_templates header at version=1
//   2. INSERT every supplied item linked to the new template id
//   3. INSERT a version=1 snapshot into equipment_template_versions
//      capturing the immutable header + items_jsonb
//
// If step 2 fails, the parent is deleted (cascades the partial
// items insert via the seeds/237 ON DELETE CASCADE FK). Step 3
// failure is logged but doesn't roll back — the snapshot is audit;
// the live row + items still work.
//
// Body:
//   name (required, ≤200 chars)
//   slug? (UNIQUE; conflict → 409)
//   description?, job_type?, default_crew_size?,
//   default_duration_hours?, requires_certifications[]?,
//   required_personnel_slots? (JSONB array per §5.12.4 schema),
//   composes_from? (UUID[] for §5.12.3 stackable-add-on
//     composition; recursion guard runs at apply-time, not here)
//   items?: Array<{
//     item_kind: 'durable' | 'consumable' | 'kit',  // required
//     equipment_inventory_id?: UUID,   // XOR with category
//     category?: string,
//     quantity?: number (default 1, must be ≥ 1),
//     is_required?: boolean (default true),
//     notes?: string,
//     sort_order?: number (default 0)
//   }>
//
// Auth: admin (incl. developer via isAdmin) + equipment_manager
// per §5.12.3 — keeps the catalogue curated. tech_support
// read-only.

interface CreateBody {
  [key: string]: unknown;
  items?: unknown;
}

interface ItemInsert {
  item_kind: string;
  equipment_inventory_id: string | null;
  category: string | null;
  quantity: number;
  is_required: boolean;
  notes: string | null;
  sort_order: number;
}

const HEADER_INSERT_KEYS = new Set([
  'name',
  'slug',
  'description',
  'job_type',
  'default_crew_size',
  'default_duration_hours',
  'requires_certifications',
  'required_personnel_slots',
  'composes_from',
]);

const ITEM_KIND_SET = new Set(['durable', 'consumable', 'kit']);

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const POST_SELECT_HEADER =
  'id, name, slug, description, job_type, ' +
  'default_crew_size, default_duration_hours, ' +
  'requires_certifications, required_personnel_slots, composes_from, ' +
  'version, is_archived, created_by, created_at, updated_at';

const POST_SELECT_ITEM =
  'id, template_id, item_kind, equipment_inventory_id, category, ' +
  'quantity, is_required, notes, sort_order, created_at, updated_at';

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    // admin (incl. developer via isAdmin) OR equipment_manager.
    // tech_support is intentionally NOT allowed — catalogue stays
    // curated per §5.12.3.
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Strip header inserts to allow-listed keys.
    const headerInsert: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (HEADER_INSERT_KEYS.has(k) && v !== undefined) {
        headerInsert[k] = v;
      }
    }

    // Required: name.
    const name = typeof headerInsert.name === 'string' ? headerInsert.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: 'name must be ≤200 characters' },
        { status: 400 }
      );
    }
    headerInsert.name = name;

    // composes_from must be UUIDs if supplied.
    if (headerInsert.composes_from !== undefined) {
      if (!Array.isArray(headerInsert.composes_from)) {
        return NextResponse.json(
          { error: 'composes_from must be an array of UUIDs' },
          { status: 400 }
        );
      }
      const arr = headerInsert.composes_from;
      const bad = arr.find(
        (v) => typeof v !== 'string' || !UUID_RE.test(v as string)
      );
      if (bad !== undefined) {
        return NextResponse.json(
          { error: `composes_from contains a non-UUID entry: "${bad}"` },
          { status: 400 }
        );
      }
    }

    // requires_certifications must be strings if supplied.
    if (headerInsert.requires_certifications !== undefined) {
      if (
        !Array.isArray(headerInsert.requires_certifications) ||
        (headerInsert.requires_certifications as unknown[]).some(
          (v) => typeof v !== 'string'
        )
      ) {
        return NextResponse.json(
          { error: 'requires_certifications must be an array of strings' },
          { status: 400 }
        );
      }
    }

    // Numeric crew size + duration must be non-negative if supplied.
    for (const key of ['default_crew_size', 'default_duration_hours'] as const) {
      const v = headerInsert[key];
      if (v !== undefined && v !== null) {
        if (typeof v !== 'number' || v < 0) {
          return NextResponse.json(
            { error: `${key} must be a non-negative number` },
            { status: 400 }
          );
        }
      }
    }

    // Validate items[] payload UP-FRONT before any DB writes so
    // we don't have to roll back partial state on a bad item.
    const itemsRaw = body.items;
    const itemInserts: ItemInsert[] = [];
    if (itemsRaw !== undefined) {
      if (!Array.isArray(itemsRaw)) {
        return NextResponse.json(
          { error: 'items must be an array' },
          { status: 400 }
        );
      }
      for (let idx = 0; idx < itemsRaw.length; idx++) {
        const rawItem = itemsRaw[idx];
        if (!rawItem || typeof rawItem !== 'object') {
          return NextResponse.json(
            { error: `items[${idx}] must be an object` },
            { status: 400 }
          );
        }
        const it = rawItem as Record<string, unknown>;

        const item_kind = it.item_kind;
        if (typeof item_kind !== 'string' || !ITEM_KIND_SET.has(item_kind)) {
          return NextResponse.json(
            {
              error: `items[${idx}].item_kind must be one of: ${[...ITEM_KIND_SET].join(', ')}`,
            },
            { status: 400 }
          );
        }
        const equipment_inventory_id =
          typeof it.equipment_inventory_id === 'string' &&
          it.equipment_inventory_id.trim()
            ? it.equipment_inventory_id.trim()
            : null;
        const category =
          typeof it.category === 'string' && it.category.trim()
            ? it.category.trim()
            : null;
        // XOR per the seeds/237 CHECK constraint — pre-flight here
        // for a friendlier error than the DB's raw constraint
        // violation.
        if (
          (equipment_inventory_id && category) ||
          (!equipment_inventory_id && !category)
        ) {
          return NextResponse.json(
            {
              error: `items[${idx}] must set exactly one of equipment_inventory_id OR category`,
            },
            { status: 400 }
          );
        }
        if (equipment_inventory_id && !UUID_RE.test(equipment_inventory_id)) {
          return NextResponse.json(
            {
              error: `items[${idx}].equipment_inventory_id must be a UUID`,
            },
            { status: 400 }
          );
        }
        const quantityRaw = it.quantity;
        let quantity = 1;
        if (quantityRaw !== undefined && quantityRaw !== null) {
          if (
            typeof quantityRaw !== 'number' ||
            !Number.isInteger(quantityRaw) ||
            quantityRaw < 1
          ) {
            return NextResponse.json(
              {
                error: `items[${idx}].quantity must be a positive integer (≥1)`,
              },
              { status: 400 }
            );
          }
          quantity = quantityRaw;
        }
        const is_required =
          typeof it.is_required === 'boolean' ? it.is_required : true;
        const notes =
          typeof it.notes === 'string' && it.notes.trim()
            ? it.notes.trim()
            : null;
        const sort_order =
          typeof it.sort_order === 'number' ? it.sort_order : 0;

        itemInserts.push({
          item_kind,
          equipment_inventory_id,
          category,
          quantity,
          is_required,
          notes,
          sort_order,
        });
      }
    }

    // Seed v1 metadata.
    headerInsert.version = 1;
    // created_by left NULL for v1 — would need a listUsers lookup
    // to resolve session.user.email → auth.users.id. Audit log
    // already captures the email via server logs.

    // Step 1 — INSERT header.
    const { data: created, error: insertErr } = await supabaseAdmin
      .from('equipment_templates')
      .insert(headerInsert)
      .select(POST_SELECT_HEADER)
      .single();
    if (insertErr) {
      if (insertErr.code === '23505') {
        return NextResponse.json(
          { error: `slug "${headerInsert.slug}" is already in use` },
          { status: 409 }
        );
      }
      console.error('[admin/equipment/templates] header insert failed', {
        error: insertErr.message,
      });
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500 }
      );
    }
    const template = created as { id: string };

    // Step 2 — INSERT items linked to the new template id. Empty
    // items array is fine; no DB write needed.
    let insertedItems: unknown[] = [];
    if (itemInserts.length > 0) {
      const itemsWithFk = itemInserts.map((it) => ({
        ...it,
        template_id: template.id,
      }));
      const { data: itemsData, error: itemsErr } = await supabaseAdmin
        .from('equipment_template_items')
        .insert(itemsWithFk)
        .select(POST_SELECT_ITEM);
      if (itemsErr) {
        // Roll back the header so we don't leave an empty template
        // in the catalogue.
        await supabaseAdmin
          .from('equipment_templates')
          .delete()
          .eq('id', template.id);
        console.error('[admin/equipment/templates] items insert failed', {
          template_id: template.id,
          error: itemsErr.message,
        });
        return NextResponse.json(
          { error: `items insert failed (header rolled back): ${itemsErr.message}` },
          { status: 500 }
        );
      }
      insertedItems = itemsData ?? [];
    }

    // Step 3 — INSERT version=1 snapshot. Failure here is logged
    // but doesn't roll back; the snapshot is audit, not the source
    // of truth.
    {
      const certs = Array.isArray(headerInsert.requires_certifications)
        ? headerInsert.requires_certifications
        : [];
      const composes = Array.isArray(headerInsert.composes_from)
        ? headerInsert.composes_from
        : [];
      const personnel = Array.isArray(headerInsert.required_personnel_slots)
        ? headerInsert.required_personnel_slots
        : [];
      const { error: snapErr } = await supabaseAdmin
        .from('equipment_template_versions')
        .insert({
          template_id: template.id,
          version: 1,
          name_at_version: name,
          description_at_version:
            (headerInsert.description as string | null | undefined) ?? null,
          job_type_at_version:
            (headerInsert.job_type as string | null | undefined) ?? null,
          composes_from_at_version: composes,
          required_personnel_slots_at_version: personnel,
          requires_certifications_at_version: certs,
          items_jsonb: insertedItems,
        });
      if (snapErr) {
        console.warn(
          '[admin/equipment/templates] v1 snapshot insert failed (non-fatal)',
          {
            template_id: template.id,
            error: snapErr.message,
          }
        );
      }
    }

    console.log('[admin/equipment/templates] created', {
      id: template.id,
      name,
      item_count: insertedItems.length,
      admin_email: session.user.email,
    });

    return NextResponse.json(
      {
        template: created,
        items: insertedItems,
        version_count: 1,
      },
      { status: 201 }
    );
  },
  { routeName: 'admin/equipment/templates#post' }
);

