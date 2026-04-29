// app/api/admin/equipment/templates/[id]/items/[itemId]/route.ts
//
// PATCH /api/admin/equipment/templates/{id}/items/{itemId}
// DELETE /api/admin/equipment/templates/{id}/items/{itemId}
//
// Phase F10.2c-ii (PATCH) + F10.2c-iii (DELETE — queued for the
// next sub-batch). Each operation bumps the parent template's
// version + writes a fresh snapshot per the §5.12.3 versioning
// rule. Snapshot captures the FULL items array at the new
// version so audit can reconstruct what existed when version N
// was applied to a job.
//
// PATCH body: any subset of the F10.2c-i POST writable fields
// (item_kind / equipment_inventory_id / category / quantity /
// is_required / notes / sort_order). XOR rule between
// equipment_inventory_id + category enforced against the MERGED
// state (current row + incoming patch) so the operator can swap
// one for the other in a single request.
//
// 404 on either id mismatch (template_id ↔ itemId pairing must
// hold; defends against spoofed itemIds belonging to a
// different template).
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

const ALLOWED_PATCH_KEYS = new Set([
  'item_kind',
  'equipment_inventory_id',
  'category',
  'quantity',
  'is_required',
  'notes',
  'sort_order',
]);

interface ItemPatchBody {
  [key: string]: unknown;
}

/** Pull (templateId, itemId) from /api/admin/equipment/templates/[id]/items/[itemId]
 *  — itemId is at -1, templateId at -3 (filter empty segments first). */
function parseIds(url: URL): { templateId: string; itemId: string } | null {
  const segments = url.pathname.split('/').filter(Boolean);
  const itemId = segments[segments.length - 1];
  const templateId = segments[segments.length - 3];
  if (!itemId || !templateId) return null;
  if (!UUID_RE.test(itemId) || !UUID_RE.test(templateId)) return null;
  return { templateId, itemId };
}

export const PATCH = withErrorHandler(
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

    const ids = parseIds(new URL(req.url));
    if (!ids) {
      return NextResponse.json(
        { error: 'template id and item id must both be UUIDs' },
        { status: 400 }
      );
    }
    const { templateId, itemId } = ids;

    let body: ItemPatchBody;
    try {
      body = (await req.json()) as ItemPatchBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_PATCH_KEYS.has(k) && v !== undefined) {
        update[k] = v;
      }
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields supplied' },
        { status: 400 }
      );
    }

    // Validate enums + integers on supplied keys.
    if (update.item_kind !== undefined) {
      if (
        typeof update.item_kind !== 'string' ||
        !ITEM_KIND_SET.has(update.item_kind)
      ) {
        return NextResponse.json(
          {
            error: `item_kind must be one of: ${[...ITEM_KIND_SET].join(', ')}`,
          },
          { status: 400 }
        );
      }
    }
    if (update.quantity !== undefined && update.quantity !== null) {
      if (
        typeof update.quantity !== 'number' ||
        !Number.isInteger(update.quantity) ||
        update.quantity < 1
      ) {
        return NextResponse.json(
          { error: 'quantity must be a positive integer (≥1)' },
          { status: 400 }
        );
      }
    }
    if (
      update.equipment_inventory_id !== undefined &&
      update.equipment_inventory_id !== null
    ) {
      if (
        typeof update.equipment_inventory_id !== 'string' ||
        !UUID_RE.test(update.equipment_inventory_id)
      ) {
        return NextResponse.json(
          { error: 'equipment_inventory_id must be a UUID' },
          { status: 400 }
        );
      }
    }
    if (typeof update.notes === 'string') {
      const trimmed = update.notes.trim();
      update.notes = trimmed || null;
    }
    if (typeof update.category === 'string') {
      const trimmed = update.category.trim();
      update.category = trimmed || null;
    }
    if (update.is_required !== undefined) {
      if (typeof update.is_required !== 'boolean') {
        return NextResponse.json(
          { error: 'is_required must be a boolean' },
          { status: 400 }
        );
      }
    }

    // Read current row + parent header + sibling items in
    // parallel.  We need:
    //   - current row to MERGE with the patch + run XOR on the
    //     merged state
    //   - parent header for the snapshot's name/description/etc.
    //   - all sibling items so the snapshot's items_jsonb captures
    //     the complete state at the new version
    const [currentRes, headerRes, siblingsRes] = await Promise.all([
      supabaseAdmin
        .from('equipment_template_items')
        .select(ITEM_COLUMNS)
        .eq('id', itemId)
        .eq('template_id', templateId)
        .maybeSingle(),
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

    if (currentRes.error) {
      console.error(
        '[admin/equipment/templates/:id/items/:itemId PATCH] item read failed',
        { templateId, itemId, error: currentRes.error.message }
      );
      return NextResponse.json(
        { error: currentRes.error.message },
        { status: 500 }
      );
    }
    if (!currentRes.data) {
      // Either the item doesn't exist OR it belongs to a different
      // template. Both surface as 404 — we don't leak which.
      return NextResponse.json(
        { error: 'Template item not found' },
        { status: 404 }
      );
    }
    if (headerRes.error || !headerRes.data) {
      return NextResponse.json(
        { error: headerRes.error?.message ?? 'Template not found' },
        { status: headerRes.data ? 500 : 404 }
      );
    }

    // XOR check on MERGED state. Patch wins per-key; if the patch
    // explicitly clears one column AND sets the other, the swap
    // works in a single PATCH request.
    type CurrentShape = {
      equipment_inventory_id: string | null;
      category: string | null;
      item_kind: string;
      quantity: number;
      is_required: boolean;
      notes: string | null;
      sort_order: number;
    };
    const current = currentRes.data as CurrentShape;
    const mergedInventoryId =
      'equipment_inventory_id' in update
        ? (update.equipment_inventory_id as string | null)
        : current.equipment_inventory_id;
    const mergedCategory =
      'category' in update
        ? (update.category as string | null)
        : current.category;
    if (
      (mergedInventoryId && mergedCategory) ||
      (!mergedInventoryId && !mergedCategory)
    ) {
      return NextResponse.json(
        {
          error:
            'After patch, exactly one of equipment_inventory_id OR category must be set',
        },
        { status: 400 }
      );
    }

    // Stamp updated_at.
    update.updated_at = new Date().toISOString();

    // UPDATE the item.
    const { data: updatedRaw, error: updateErr } = await supabaseAdmin
      .from('equipment_template_items')
      .update(update)
      .eq('id', itemId)
      .eq('template_id', templateId)
      .select(ITEM_COLUMNS)
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/equipment/templates/:id/items/:itemId PATCH] update failed',
        { templateId, itemId, error: updateErr.message }
      );
      const status = updateErr.code === '23514' ? 400 : 500;
      return NextResponse.json(
        { error: updateErr.message },
        { status }
      );
    }
    if (!updatedRaw) {
      return NextResponse.json(
        { error: 'Template item not found (race lost)' },
        { status: 404 }
      );
    }
    const updatedItem = updatedRaw as Record<string, unknown>;

    // Bump template version.
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
    const newVersion = header.version + 1;
    const nowIso = new Date().toISOString();
    const { error: versionErr } = await supabaseAdmin
      .from('equipment_templates')
      .update({ version: newVersion, updated_at: nowIso })
      .eq('id', templateId);
    if (versionErr) {
      console.warn(
        '[admin/equipment/templates/:id/items/:itemId PATCH] version bump failed',
        { templateId, error: versionErr.message }
      );
    }

    // Snapshot at the new version. Replace the just-edited item
    // in the siblings list so items_jsonb reflects post-patch
    // state.
    const siblings = siblingsRes.error ? [] : (siblingsRes.data ?? []);
    const fullItems = siblings.map((s: Record<string, unknown>) =>
      (s as { id: string }).id === itemId ? updatedItem : s
    );
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
        '[admin/equipment/templates/:id/items/:itemId PATCH] snapshot failed (non-fatal)',
        { templateId, version: newVersion, error: snapErr.message }
      );
    }

    console.log(
      '[admin/equipment/templates/:id/items/:itemId PATCH] updated',
      {
        templateId,
        itemId,
        keys: Object.keys(update).filter((k) => k !== 'updated_at'),
        new_version: newVersion,
        admin_email: session.user.email,
      }
    );

    return NextResponse.json({
      item: updatedItem,
      template_version: newVersion,
    });
  },
  { routeName: 'admin/equipment/templates/:id/items/:itemId#patch' }
);
