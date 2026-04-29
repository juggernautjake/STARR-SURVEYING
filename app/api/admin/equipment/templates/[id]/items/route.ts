// app/api/admin/equipment/templates/[id]/items/route.ts
//
// POST /api/admin/equipment/templates/{id}/items
//
// Phase F10.2c-i. Adds a line item to an existing template + bumps
// the parent's version + writes a fresh snapshot to
// equipment_template_versions per the §5.12.3 versioning rule.
//
// Body (one line):
//   item_kind: 'durable' | 'consumable' | 'kit'  (required)
//   equipment_inventory_id?: UUID,    // XOR with category — set
//   category?: string,                // exactly one
//   quantity?: number,                // default 1, must be ≥1
//   is_required?: boolean,            // default true
//   notes?: string,
//   sort_order?: number               // default 0
//
// PATCH + DELETE for individual items live at
// /[id]/items/[itemId] (lands as F10.2c-ii / F10.2c-iii).
//
// Versioning + snapshot semantics mirror the F10.2b-ii PATCH
// header endpoint:
//   1. Read all existing items (we need them in items_jsonb of
//      the new snapshot to capture the FULL state at this version).
//   2. INSERT the new item.
//   3. UPDATE template w/ bumped version.
//   4. INSERT snapshot row at the new version with the FULL items
//      array (existing + new) as items_jsonb.
//
// Step 4 failure is logged but doesn't roll back. Same posture
// as the other endpoints — snapshots are audit, not source of
// truth.
//
// Auth: admin (incl. developer via isAdmin) + equipment_manager.
// tech_support read-only per §5.12.3.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const ITEM_KIND_SET = new Set(['durable', 'consumable', 'kit']);
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ITEM_COLUMNS =
  'id, template_id, item_kind, equipment_inventory_id, category, ' +
  'quantity, is_required, notes, sort_order, created_at, updated_at';

const HEADER_COLUMNS_FOR_SNAPSHOT =
  'id, name, description, job_type, version, ' +
  'composes_from, required_personnel_slots, requires_certifications';

interface ItemBody {
  [key: string]: unknown;
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

    // Path: /api/admin/equipment/templates/[id]/items — id is at -2.
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const templateId = pathSegments[pathSegments.length - 2];
    if (!templateId || !UUID_RE.test(templateId)) {
      return NextResponse.json(
        { error: 'template id must be a UUID' },
        { status: 400 }
      );
    }

    let body: ItemBody;
    try {
      body = (await req.json()) as ItemBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate per the seeds/237 column shape + CHECK constraints.
    const item_kind = body.item_kind;
    if (typeof item_kind !== 'string' || !ITEM_KIND_SET.has(item_kind)) {
      return NextResponse.json(
        {
          error: `item_kind must be one of: ${[...ITEM_KIND_SET].join(', ')}`,
        },
        { status: 400 }
      );
    }
    const equipment_inventory_id =
      typeof body.equipment_inventory_id === 'string' &&
      body.equipment_inventory_id.trim()
        ? body.equipment_inventory_id.trim()
        : null;
    const category =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim()
        : null;
    if (
      (equipment_inventory_id && category) ||
      (!equipment_inventory_id && !category)
    ) {
      return NextResponse.json(
        {
          error:
            'Exactly one of equipment_inventory_id OR category must be set',
        },
        { status: 400 }
      );
    }
    if (equipment_inventory_id && !UUID_RE.test(equipment_inventory_id)) {
      return NextResponse.json(
        { error: 'equipment_inventory_id must be a UUID' },
        { status: 400 }
      );
    }
    let quantity = 1;
    if (body.quantity !== undefined && body.quantity !== null) {
      if (
        typeof body.quantity !== 'number' ||
        !Number.isInteger(body.quantity) ||
        body.quantity < 1
      ) {
        return NextResponse.json(
          { error: 'quantity must be a positive integer (≥1)' },
          { status: 400 }
        );
      }
      quantity = body.quantity;
    }
    const is_required =
      typeof body.is_required === 'boolean' ? body.is_required : true;
    const notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : null;
    const sort_order =
      typeof body.sort_order === 'number' ? body.sort_order : 0;

    // Read header + existing items in parallel (need both to write
    // the snapshot at the new version).
    const [headerRes, itemsRes] = await Promise.all([
      supabaseAdmin
        .from('equipment_templates')
        .select(HEADER_COLUMNS_FOR_SNAPSHOT)
        .eq('id', templateId)
        .maybeSingle(),
      supabaseAdmin
        .from('equipment_template_items')
        .select(ITEM_COLUMNS)
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true }),
    ]);

    if (headerRes.error) {
      console.error(
        '[admin/equipment/templates/:id/items POST] header read failed',
        { templateId, error: headerRes.error.message }
      );
      return NextResponse.json(
        { error: headerRes.error.message },
        { status: 500 }
      );
    }
    if (!headerRes.data) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    type HeaderShape = {
      id: string;
      name: string;
      description: string | null;
      job_type: string | null;
      version: number;
      composes_from: string[];
      required_personnel_slots: unknown;
      requires_certifications: string[];
    };
    const header = headerRes.data as HeaderShape;
    const existingItems = itemsRes.error ? [] : (itemsRes.data ?? []);

    // INSERT the new item. Postgres CHECK constraint on
    // (equipment_inventory_id IS NOT NULL XOR category IS NOT NULL)
    // catches anything our pre-flight missed; surface it as 400.
    const { data: insertedRaw, error: insertErr } = await supabaseAdmin
      .from('equipment_template_items')
      .insert({
        template_id: templateId,
        item_kind,
        equipment_inventory_id,
        category,
        quantity,
        is_required,
        notes,
        sort_order,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (insertErr) {
      console.error(
        '[admin/equipment/templates/:id/items POST] insert failed',
        { templateId, error: insertErr.message }
      );
      // 23514 = CHECK violation; surface as 400 since it usually
      // means the XOR pre-flight let something sneak through.
      const status = insertErr.code === '23514' ? 400 : 500;
      return NextResponse.json(
        { error: insertErr.message },
        { status }
      );
    }
    const inserted = insertedRaw as Record<string, unknown>;

    // Bump template version.
    const newVersion = header.version + 1;
    const nowIso = new Date().toISOString();
    const { error: versionErr } = await supabaseAdmin
      .from('equipment_templates')
      .update({ version: newVersion, updated_at: nowIso })
      .eq('id', templateId);
    if (versionErr) {
      console.warn(
        '[admin/equipment/templates/:id/items POST] version bump failed (non-fatal)',
        { templateId, error: versionErr.message }
      );
    }

    // Snapshot at the new version. Best-effort.
    const fullItems = [...existingItems, inserted];
    const { error: snapErr } = await supabaseAdmin
      .from('equipment_template_versions')
      .insert({
        template_id: templateId,
        version: newVersion,
        name_at_version: header.name,
        description_at_version: header.description,
        job_type_at_version: header.job_type,
        composes_from_at_version: header.composes_from ?? [],
        required_personnel_slots_at_version:
          header.required_personnel_slots ?? [],
        requires_certifications_at_version:
          header.requires_certifications ?? [],
        items_jsonb: fullItems,
      });
    if (snapErr) {
      console.warn(
        '[admin/equipment/templates/:id/items POST] snapshot write failed (non-fatal)',
        { templateId, version: newVersion, error: snapErr.message }
      );
    }

    console.log('[admin/equipment/templates/:id/items POST] added', {
      templateId,
      itemId: inserted.id,
      new_version: newVersion,
      admin_email: session.user.email,
    });

    return NextResponse.json(
      {
        item: inserted,
        template_version: newVersion,
      },
      { status: 201 }
    );
  },
  { routeName: 'admin/equipment/templates/:id/items#post' }
);
