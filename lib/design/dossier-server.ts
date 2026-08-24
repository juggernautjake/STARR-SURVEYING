// lib/design/dossier-server.ts — dossiers and checklists, in the database.
//
// Phases D + C of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────────────────────
//
// The authored half and the derived half are written by different functions, and neither can touch
// the other's columns. `saveAuthored` cannot write `elements`; `saveDerived` cannot write `summary`.
// That is not defensive tidiness — it is the difference between a re-derive that refreshes an
// inventory and one that silently deletes a paragraph somebody spent ten minutes on. Whoever adds
// the next field should put it on one side of that line deliberately.
//
// Regenerating a checklist has the same shape: generated rows are replaced, custom rows are left
// alone, and STATE is keyed by the item's deterministic id so ticks survive a regeneration.

import { supabaseAdmin } from '@/lib/supabase';
import { ENTRIES } from './catalogue';
import {
  deriveDossier, mergeDossier,
  type AuthoredDossier, type DerivedDossier, type PageDossier, type RouteObservation,
} from './dossier';
import {
  generateChecklist, joinChecklist, progressOf, idFor,
  type ChecklistItem, type ChecklistRow, type ChecklistState, type Progress,
} from './checklist';
import type { DesignDocument } from './document';

const DOSSIERS = 'design_page_dossiers';
const ITEMS = 'design_checklist_items';
const STATE = 'design_checklist_state';

interface DossierRow {
  route: string;
  purpose: string | null;
  summary: string | null;
  audience: string | null;
  authored_by: string | null;
  authored_at: string | null;
  functions: DerivedDossier['functions'] | null;
  elements: DerivedDossier['elements'] | null;
  endpoints: DerivedDossier['endpoints'] | null;
  element_count: number | null;
  derived_at: string | null;
  derived_from: string | null;
}

function toDossier(row: DossierRow): PageDossier {
  return mergeDossier(
    row.route,
    {
      purpose: row.purpose,
      summary: row.summary,
      audience: row.audience,
      authoredBy: row.authored_by,
      authoredAt: row.authored_at,
    },
    {
      functions: row.functions ?? [],
      elements: row.elements ?? [],
      endpoints: row.endpoints ?? [],
      elementCount: row.element_count ?? row.elements?.length ?? 0,
      derivedAt: row.derived_at ?? '',
      derivedFrom: row.derived_from ?? null,
    },
  );
}

export async function getDossier(route: string): Promise<PageDossier | null> {
  const { data, error } = await supabaseAdmin.from(DOSSIERS).select('*').eq('route', route).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDossier(data as DossierRow) : null;
}

export async function listDossiers(): Promise<PageDossier[]> {
  const { data, error } = await supabaseAdmin
    .from(DOSSIERS)
    // `elements` is the big column and the list does not render it; `element_count` is why it
    // exists. Pulling 176 element inventories to draw 176 rows is the kind of thing that makes a
    // list page feel broken on a slow connection.
    .select('route, purpose, summary, audience, authored_by, authored_at, functions, endpoints, element_count, derived_at, derived_from')
    .order('route');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as DossierRow[]).map((row) => toDossier({ ...row, elements: [] }));
}

/** The written half. Cannot touch the measured columns — see the header. */
export async function saveAuthored(
  route: string,
  authored: Partial<Pick<AuthoredDossier, 'purpose' | 'summary' | 'audience'>>,
  email: string,
  now: string,
): Promise<PageDossier> {
  const patch: Record<string, unknown> = { route, authored_by: email, authored_at: now, updated_at: now };
  if (authored.purpose !== undefined) patch.purpose = authored.purpose?.trim() || null;
  if (authored.summary !== undefined) patch.summary = authored.summary?.trim() || null;
  if (authored.audience !== undefined) patch.audience = authored.audience?.trim() || null;

  const { data, error } = await supabaseAdmin
    .from(DOSSIERS).upsert(patch, { onConflict: 'route' }).select('*').single();
  if (error) throw new Error(error.message);
  return toDossier(data as DossierRow);
}

/**
 * The measured half, from one route walk.
 *
 * Replaced wholesale rather than merged: a re-derive that keeps elements the page no longer has
 * would produce an inventory that only ever grows, and a checklist generated from it would ask for
 * things that were deleted on purpose.
 */
export async function saveDerived(
  observation: RouteObservation,
  options: { base?: string | null; now: string },
): Promise<{ dossier: PageDossier; checklist: { generated: number; custom: number } }> {
  const derived = deriveDossier(observation, ENTRIES, { now: options.now, base: options.base });

  const { data, error } = await supabaseAdmin
    .from(DOSSIERS)
    .upsert({
      route: observation.route,
      functions: derived.functions,
      elements: derived.elements,
      endpoints: derived.endpoints,
      element_count: derived.elementCount,
      derived_at: derived.derivedAt,
      derived_from: derived.derivedFrom,
      updated_at: options.now,
    }, { onConflict: 'route' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const dossier = toDossier(data as DossierRow);
  const checklist = await regenerateChecklist(dossier);
  return { dossier, checklist };
}

// ── CHECKLIST ───────────────────────────────────────────────────────────────────────────────────

interface ItemRow {
  id: string;
  route: string;
  tier: ChecklistItem['tier'];
  label: string;
  detail: string | null;
  element_ref: string | null;
  sort: number;
  created_by: string | null;
}

function toItem(row: ItemRow): ChecklistItem {
  return {
    id: row.id,
    route: row.route,
    tier: row.tier,
    label: row.label,
    detail: row.detail,
    elementRef: row.element_ref,
    sort: row.sort,
    // The row is the authority, not the text. `created_by IS NULL` means the deriver wrote it.
    generated: row.created_by === null,
    createdBy: row.created_by,
  };
}

export async function listItems(route: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabaseAdmin
    .from(ITEMS).select('*').eq('route', route).is('deleted_at', null).order('sort');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ItemRow[]).map(toItem);
}

/**
 * Rewrite the generated items for a route, leaving the custom ones exactly as they are.
 *
 * The deletion is scoped by `created_by IS NULL`, which is the same predicate that defines
 * "generated" everywhere else in this system. If that ever drifts, somebody's hand-written items
 * disappear on the next derive — so it is written once, here, and read from the row rather than
 * inferred.
 */
export async function regenerateChecklist(dossier: PageDossier): Promise<{ generated: number; custom: number }> {
  const generated = generateChecklist(dossier);

  const { data: existing } = await supabaseAdmin
    .from(ITEMS).select('id, created_by').eq('route', dossier.route).is('deleted_at', null);
  const rows = (existing ?? []) as Array<{ id: string; created_by: string | null }>;
  const customCount = rows.filter((r) => r.created_by !== null).length;
  const keep = new Set(generated.map((g) => g.id));
  const stale = rows.filter((r) => r.created_by === null && !keep.has(r.id)).map((r) => r.id);

  if (stale.length) {
    // Hard delete, not soft: a generated item that no longer describes the page is not history,
    // and its state rows go with it by cascade rather than lingering as ticks against nothing.
    const { error } = await supabaseAdmin.from(ITEMS).delete().in('id', stale);
    if (error) throw new Error(error.message);
  }

  if (generated.length) {
    const { error } = await supabaseAdmin.from(ITEMS).upsert(
      generated.map((g) => ({
        id: g.id,
        route: g.route,
        tier: g.tier,
        label: g.label,
        detail: g.detail,
        element_ref: g.elementRef,
        sort: g.sort,
        created_by: null,
        deleted_at: null,
      })),
      { onConflict: 'id' },
    );
    if (error) throw new Error(error.message);
  }

  return { generated: generated.length, custom: customCount };
}

export async function addCustomItem(
  route: string,
  input: { label: string; detail?: string | null; tier?: ChecklistItem['tier']; elementRef?: string | null },
  email: string,
): Promise<ChecklistItem> {
  const label = input.label.trim();
  if (!label) throw new Error('A checklist item needs words.');
  const id = `${idFor(route, label)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: last } = await supabaseAdmin
    .from(ITEMS).select('sort').eq('route', route).order('sort', { ascending: false }).limit(1).maybeSingle();

  const row = {
    id,
    route,
    // A custom item defaults to the `custom` tier rather than to `required`: somebody adding a
    // reminder should not silently raise the bar the page is measured against.
    tier: input.tier ?? 'custom',
    label,
    detail: input.detail?.trim() || null,
    element_ref: input.elementRef ?? null,
    sort: ((last?.sort as number | undefined) ?? 0) + 1,
    created_by: email,
  };
  const { error } = await supabaseAdmin.from(ITEMS).insert(row);
  if (error) throw new Error(error.message);
  return toItem(row as ItemRow);
}

export async function removeCustomItem(id: string): Promise<void> {
  const { data: row } = await supabaseAdmin.from(ITEMS).select('created_by').eq('id', id).maybeSingle();
  if (!row) throw new Error('That item does not exist.');
  if ((row as { created_by: string | null }).created_by === null) {
    // Deleting a generated item would be undone by the next derive, which is a worse experience
    // than being told no: it looks like it worked until the measurement runs again.
    throw new Error('That item was generated from the page itself. Re-derive the dossier to change it.');
  }
  const { error } = await supabaseAdmin.from(ITEMS).update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listState(designId: string): Promise<ChecklistState[]> {
  const { data, error } = await supabaseAdmin
    .from(STATE).select('item_id, checked, note, checked_by, checked_at').eq('design_id', designId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    itemId: r.item_id as string,
    checked: !!r.checked,
    note: (r.note as string | null) ?? null,
    checkedBy: (r.checked_by as string | null) ?? null,
    checkedAt: (r.checked_at as string | null) ?? null,
  }));
}

export async function setChecked(
  designId: string,
  itemId: string,
  patch: { checked?: boolean; note?: string | null },
  email: string,
  now: string,
): Promise<void> {
  const row: Record<string, unknown> = { design_id: designId, item_id: itemId };
  if (patch.checked !== undefined) {
    row.checked = patch.checked;
    row.checked_by = patch.checked ? email : null;
    row.checked_at = patch.checked ? now : null;
  }
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;
  const { error } = await supabaseAdmin.from(STATE).upsert(row, { onConflict: 'design_id,item_id' });
  if (error) throw new Error(error.message);
}

/** Everything the editor's panel needs, in one round trip. */
export async function checklistFor(
  route: string,
  designId: string | null,
  doc: DesignDocument | null,
): Promise<{ dossier: PageDossier | null; rows: ChecklistRow[]; progress: Progress }> {
  const [dossier, items, state] = await Promise.all([
    getDossier(route),
    listItems(route),
    designId ? listState(designId) : Promise.resolve([] as ChecklistState[]),
  ]);
  const rows = joinChecklist(items, state, doc, dossier?.elements ?? []);
  return { dossier, rows, progress: progressOf(rows) };
}
