// lib/design/active.ts — which design is the record for a route, answered in ONE place.
//
// Phase R2 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// ── WHY THIS IS A MODULE AND NOT A `.eq('status', 'active')` IN FOUR FILES ──────────────────────
//
// Four surfaces ask this question — the page list, the serve route, the conformance view and the
// settings picker that offers a page's linked themes. Four copies of the query is four chances to
// disagree about the edge cases, and the edge cases are the entire content of the question:
//
//   · a route with an active design and a default → the active one
//   · a route with only a default                 → the default, SAID to be a default rather than
//                                                   quietly served as if somebody had chosen it
//   · a route with neither                        → nothing, and the reason
//
// The middle case is the one worth being careful about. A default is a trace of what is served, so
// showing it when nothing is active is genuinely the most useful answer — but presenting it as "the
// active design" would turn a measurement into a decision nobody made.
//
// ── AND WHAT "ACTIVE" DOES NOT MEAN ─────────────────────────────────────────────────────────────
//
// It does not mean the route renders this design. See §1 of the plan: `/admin/jobs` is a React
// component that authenticates, fetches and writes; serving a picture of it in its place would
// replace a working page with a mockup. Active means the design of RECORD — the specification, what
// the checklist measures, what the conformance view diffs the live page against, and the design
// whose linked themes become selectable in settings.

import { supabaseAdmin } from '@/lib/supabase';
import type { DesignDocument } from './document';

export type ActiveKind = 'active' | 'default' | 'none';

export interface ActiveResolution {
  route: string;
  kind: ActiveKind;
  /** The design itself, when there is one. */
  doc: DesignDocument | null;
  id: string | null;
  name: string | null;
  /** One line a surface can print. Says which of the three cases this is, in words. */
  explanation: string;
  /** Designs that are the same layout in other themes — what settings may offer while this is the
   *  record for the page. Empty unless the resolved design belongs to a theme family. */
  themeGroup: string | null;
}

const TABLE = 'design_mockups';
const COLS = 'id, name, route, variant_of, views, version, created_at, updated_at, status, locked, theme_group, theme_id, theme, notes';

function toDoc(row: Record<string, unknown>): DesignDocument {
  return {
    id: row.id as string,
    name: row.name as string,
    route: (row.route as string | null) ?? null,
    variantOf: (row.variant_of as string | null) ?? null,
    views: row.views as DesignDocument['views'],
    version: (row.version as number) ?? 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    status: (row.status as string) ?? 'draft',
    locked: !!row.locked,
    themeGroup: (row.theme_group as string | null) ?? null,
    themeId: (row.theme_id as string | null) ?? null,
    theme: (row.theme as DesignDocument['theme']) ?? null,
    notes: (row.notes as string | undefined) ?? undefined,
  } as DesignDocument;
}

export async function resolveActive(route: string): Promise<ActiveResolution> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(COLS)
    .eq('route', route)
    .in('status', ['active', 'default'])
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const active = rows.find((r) => r.status === 'active');
  const fallback = rows.find((r) => r.status === 'default');

  if (active) {
    return {
      route,
      kind: 'active',
      doc: toDoc(active),
      id: active.id as string,
      name: active.name as string,
      explanation: 'The design of record for this page — what it is supposed to be.',
      themeGroup: (active.theme_group as string | null) ?? null,
    };
  }
  if (fallback) {
    return {
      route,
      kind: 'default',
      doc: toDoc(fallback),
      id: fallback.id as string,
      name: fallback.name as string,
      // Said out loud. Nobody chose this; it is a measurement of what is already there.
      explanation: 'No design has been made the record for this page yet, so this is the default — '
        + 'a trace of the page as it is served today.',
      themeGroup: null,
    };
  }
  return {
    route,
    kind: 'none',
    doc: null,
    id: null,
    name: null,
    explanation: 'Nothing has been designed or traced for this page yet.',
    themeGroup: null,
  };
}

/**
 * Every route that has an active design, and the theme family that comes with it.
 *
 * This is what the settings picker reads: *"the different themes that we linked to the page will
 * become an option in the settings for the user while that page is set as active."* One query
 * rather than one per route, because the picker asks about the whole portal at once.
 */
export async function activeThemeGroups(): Promise<Array<{ route: string; designId: string; themeGroup: string }>> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, route, theme_group')
    .eq('status', 'active')
    .not('theme_group', 'is', null)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    route: r.route as string,
    designId: r.id as string,
    themeGroup: r.theme_group as string,
  }));
}
