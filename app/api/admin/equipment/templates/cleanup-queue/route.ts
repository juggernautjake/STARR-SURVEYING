// app/api/admin/equipment/templates/cleanup-queue/route.ts
//
// GET /api/admin/equipment/templates/cleanup-queue
//
// Phase F10.6-f-i — the §5.12.7.8 "Templates referencing retired
// gear" cleanup queue aggregator. Surfaces every
// equipment_template_items row whose `equipment_inventory_id`
// points at a retired (or discontinued — same `retired_at IS
// NOT NULL` mechanism per F10.6-d-iii-γ) inventory row so the
// EM can swap to category-of-kind OR pick a replacement before
// the next dispatcher tries to apply the template and hits a
// hard block.
//
// Grouped by template so the EM sees "Template X — 3 stale
// lines" instead of N separate rows; expand-to-see-items in
// the F10.6-f-ii page UI.
//
// Auth: EQUIPMENT_ROLES.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface TemplateItemRow {
  id: string;
  template_id: string;
  item_kind: string;
  equipment_inventory_id: string;
  quantity: number;
  is_required: boolean;
  notes: string | null;
  sort_order: number;
}

interface InventoryRow {
  id: string;
  name: string | null;
  category: string | null;
  retired_at: string | null;
  retired_reason: string | null;
  current_status: string | null;
}

interface TemplateHeader {
  id: string;
  name: string;
  slug: string | null;
  job_type: string | null;
  version: number;
  is_archived: boolean;
  updated_at: string;
}

interface StaleItem {
  template_item_id: string;
  template_item_kind: string;
  template_quantity: number;
  template_is_required: boolean;
  template_notes: string | null;
  template_sort_order: number;
  equipment_inventory_id: string;
  equipment_name: string | null;
  equipment_category: string | null;
  equipment_retired_at: string | null;
  equipment_retired_reason: string | null;
  equipment_current_status: string | null;
}

interface TemplateGroup {
  template: TemplateHeader;
  stale_items: StaleItem[];
  stale_item_count: number;
  total_item_count: number;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req;
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

  // 1. Pull every template item that pins a specific instrument.
  //    Category-mode rows (equipment_inventory_id IS NULL) are
  //    fine — they auto-resolve at apply-time so retirement
  //    doesn't leave them stale.
  const itemsRes = await supabaseAdmin
    .from('equipment_template_items')
    .select(
      'id, template_id, item_kind, equipment_inventory_id, quantity, ' +
        'is_required, notes, sort_order'
    )
    .not('equipment_inventory_id', 'is', null);
  if (itemsRes.error) {
    return NextResponse.json(
      { error: itemsRes.error.message },
      { status: 500 }
    );
  }
  const items = (itemsRes.data ?? []) as TemplateItemRow[];

  if (items.length === 0) {
    return NextResponse.json({
      templates: [],
      summary: { template_count: 0, stale_item_count: 0 },
    });
  }

  // 2. Resolve inventory targets — only the retired ones bubble
  // up. Filter on the seeds/233 retired_at column.
  const equipmentIds = Array.from(
    new Set(items.map((r) => r.equipment_inventory_id))
  );
  const invRes = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, name, category, retired_at, retired_reason, current_status'
    )
    .in('id', equipmentIds)
    .not('retired_at', 'is', null);
  if (invRes.error) {
    return NextResponse.json(
      { error: invRes.error.message },
      { status: 500 }
    );
  }
  const retiredInv = (invRes.data ?? []) as InventoryRow[];
  if (retiredInv.length === 0) {
    return NextResponse.json({
      templates: [],
      summary: { template_count: 0, stale_item_count: 0 },
    });
  }
  const retiredById = new Map<string, InventoryRow>();
  for (const r of retiredInv) retiredById.set(r.id, r);

  // 3. Filter items whose target is retired.
  const staleItems = items.filter((r) =>
    retiredById.has(r.equipment_inventory_id)
  );
  if (staleItems.length === 0) {
    return NextResponse.json({
      templates: [],
      summary: { template_count: 0, stale_item_count: 0 },
    });
  }

  // 4. Pull template headers for the affected template_ids.
  const templateIds = Array.from(
    new Set(staleItems.map((r) => r.template_id))
  );
  const tplRes = await supabaseAdmin
    .from('equipment_templates')
    .select('id, name, slug, job_type, version, is_archived, updated_at')
    .in('id', templateIds);
  if (tplRes.error) {
    return NextResponse.json(
      { error: tplRes.error.message },
      { status: 500 }
    );
  }
  const templatesById = new Map<string, TemplateHeader>();
  for (const t of (tplRes.data ?? []) as TemplateHeader[]) {
    templatesById.set(t.id, t);
  }

  // 5. Pull total item-counts per template so the page can
  // show "3 of 8 lines stale" context.
  const totalCountsRes = await supabaseAdmin
    .from('equipment_template_items')
    .select('template_id')
    .in('template_id', templateIds);
  const totalCounts = new Map<string, number>();
  for (const r of ((totalCountsRes.data ?? []) as Array<{
    template_id: string;
  }>)) {
    totalCounts.set(r.template_id, (totalCounts.get(r.template_id) ?? 0) + 1);
  }

  // 6. Group stale items by template.
  const byTemplate = new Map<string, StaleItem[]>();
  for (const item of staleItems) {
    const inv = retiredById.get(item.equipment_inventory_id);
    if (!inv) continue;
    const list = byTemplate.get(item.template_id) ?? [];
    list.push({
      template_item_id: item.id,
      template_item_kind: item.item_kind,
      template_quantity: item.quantity,
      template_is_required: item.is_required,
      template_notes: item.notes,
      template_sort_order: item.sort_order,
      equipment_inventory_id: item.equipment_inventory_id,
      equipment_name: inv.name,
      equipment_category: inv.category,
      equipment_retired_at: inv.retired_at,
      equipment_retired_reason: inv.retired_reason,
      equipment_current_status: inv.current_status,
    });
    byTemplate.set(item.template_id, list);
  }

  const groups: TemplateGroup[] = [];
  for (const [templateId, list] of byTemplate.entries()) {
    const tpl = templatesById.get(templateId);
    if (!tpl) continue;
    list.sort((a, b) => a.template_sort_order - b.template_sort_order);
    groups.push({
      template: tpl,
      stale_items: list,
      stale_item_count: list.length,
      total_item_count: totalCounts.get(templateId) ?? 0,
    });
  }

  // Sort: archived templates last (cleanup is less urgent for
  // archives); within each archive bucket, most-stale first;
  // alphabetical tiebreak.
  groups.sort((a, b) => {
    if (a.template.is_archived !== b.template.is_archived) {
      return a.template.is_archived ? 1 : -1;
    }
    if (a.stale_item_count !== b.stale_item_count) {
      return b.stale_item_count - a.stale_item_count;
    }
    return a.template.name.localeCompare(b.template.name);
  });

  return NextResponse.json({
    templates: groups,
    summary: {
      template_count: groups.length,
      stale_item_count: staleItems.length,
    },
  });
}, { routeName: 'admin/equipment/templates/cleanup-queue#get' });
