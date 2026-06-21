// app/api/admin/invoicing/categories/route.ts
//
// Phase-2 Slice 11 (route) of
// docs/planning/in-progress/CUSTOMER_INVOICING_PHASE2_2026-06-21.md.
//
//   GET  /api/admin/invoicing/categories
//        → { categories: FinancialAllocationCategory[] }
//
//   PUT  /api/admin/invoicing/categories
//        body: { categories: [{ id, label?, description?, target_percent?,
//                               color?, sort_order?, is_active? }, …] }
//        → 200 { ok: true, updated_count }
//          422 { error, validation: ValidationResult }  (slice-11 helpers
//               flag a bad percent-sum / duplicate key / invalid color)
//
// Admin + developer only. The UI at app/admin/invoicing/categories/page.tsx
// consumes both endpoints. The PUT path runs the slice-11 validators
// FIRST so a bad save returns a typed inline error instead of a 500
// from the schema's CHECK constraint.
//
// ADD + REMOVE are deliberately NOT supported in this initial cut —
// the seed-374 default set is comprehensive; a future slice ships
// inserts + the soft-archive path once dad confirms the bucket list.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  validateCategorySet,
  type EditableCategory,
} from '@/lib/payments/category-editor';

interface CategoryRow {
  id: string;
  category_key: string;
  label: string;
  description: string | null;
  target_percent: number;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

async function authOrError(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, status: 401, error: 'Unauthorized' };
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const allowed = isAdmin(session.user.roles) || roles.includes('developer');
  if (!allowed) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true };
}

export const GET = withErrorHandler(async () => {
  const gate = await authOrError();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await supabaseAdmin
    .from('financial_allocation_categories')
    .select('id, category_key, label, description, target_percent, color, sort_order, is_active, created_at, updated_at')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: (data ?? []) as CategoryRow[] });
}, { routeName: 'admin/invoicing/categories.GET' });


interface PutBody {
  categories?: Array<Partial<EditableCategory> & { id: string }>;
}

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await authOrError();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as PutBody;
  const updates = Array.isArray(body.categories) ? body.categories : [];
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No categories to update.' }, { status: 400 });
  }

  // Pull the current state so we can build the merged set the slice-11
  // validators check. The UI sends a partial — fall back to the
  // persisted value for any field it didn't include.
  const { data: persisted, error: readErr } = await supabaseAdmin
    .from('financial_allocation_categories')
    .select('id, category_key, label, description, target_percent, color, sort_order, is_active');
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  type StoredRow = Omit<CategoryRow, 'created_at' | 'updated_at'>;
  const persistedRows = (persisted ?? []) as unknown as StoredRow[];
  const byId = new Map<string, StoredRow>(
    persistedRows.map((c) => [c.id, c]),
  );

  // Build the merged draft for validation. Drop any update whose id
  // doesn't match a persisted row (no admin-side delete in this cut).
  const merged: EditableCategory[] = [];
  const unknownIds: string[] = [];
  for (const update of updates) {
    const base = byId.get(update.id);
    if (!base) {
      unknownIds.push(update.id);
      continue;
    }
    byId.delete(update.id);  // remove from the leftovers map
    merged.push({
      id: base.id,
      category_key: base.category_key,
      label: update.label ?? base.label,
      description: update.description ?? base.description ?? null,
      target_percent: Number(update.target_percent ?? base.target_percent),
      color: update.color ?? base.color,
      sort_order: update.sort_order ?? base.sort_order,
      is_active: update.is_active ?? base.is_active,
    });
  }
  // The remaining rows in byId weren't in the request — keep them as-is
  // for the validation pass so the set-level percent sum reflects the
  // FULL list, not just the diff.
  for (const remaining of byId.values()) {
    merged.push({
      id: remaining.id,
      category_key: remaining.category_key,
      label: remaining.label,
      description: remaining.description,
      target_percent: Number(remaining.target_percent),
      color: remaining.color,
      sort_order: remaining.sort_order,
      is_active: remaining.is_active,
    });
  }

  if (unknownIds.length > 0) {
    return NextResponse.json(
      { error: 'Some categories in the request are not in the database', unknownIds },
      { status: 400 },
    );
  }

  const validation = validateCategorySet(merged);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Validation failed', validation },
      { status: 422 },
    );
  }

  // Apply the updates one by one. supabase-js doesn't support a true
  // bulk-conditional update; the row count is small (~18 default
  // categories) so per-row UPDATEs are fine.
  let updated = 0;
  for (const update of updates) {
    const patch: Record<string, unknown> = {};
    if (update.label !== undefined)          patch.label = update.label;
    if (update.description !== undefined)    patch.description = update.description;
    if (update.target_percent !== undefined) patch.target_percent = Number(update.target_percent);
    if (update.color !== undefined)          patch.color = update.color;
    if (update.sort_order !== undefined)     patch.sort_order = update.sort_order;
    if (update.is_active !== undefined)      patch.is_active = update.is_active;
    if (Object.keys(patch).length === 0) continue;

    const { error: writeErr } = await supabaseAdmin
      .from('financial_allocation_categories')
      .update(patch)
      .eq('id', update.id);
    if (writeErr) {
      return NextResponse.json({ error: writeErr.message, updated_count: updated }, { status: 500 });
    }
    updated += 1;
  }

  return NextResponse.json({
    ok: true,
    updated_count: updated,
    total_active_percent: validation.total_active_percent,
  });
}, { routeName: 'admin/invoicing/categories.PUT' });
