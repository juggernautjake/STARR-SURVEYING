// lib/design/server.ts — mockups, in the database rather than in one browser.
//
// Slice S1 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md, and the reason seed 609 exists.
//
// ── WHY THIS EXISTS AT ALL, GIVEN localStorage ALREADY WORKED ───────────────────────────────────
//
// The studio shipped saving to `localStorage` so the page could be opened and used the same night.
// That was the right call for one evening and the wrong one for the job being asked of it: the plan
// is to design 147 pages, twice each. A body of work that size cannot live in one browser profile,
// where a cleared cache, a private window or a second laptop ends it — and a design that exists on
// exactly one machine cannot be shown to anybody, which was half the point.
//
// So: the server is the source of truth, and the browser copy stays as the offline draft. The
// document shape is IDENTICAL on both sides (`views: { desktop, mobile }`), which is what makes
// this a write path rather than a rewrite.
//
// ── THE ROW IS NOT THE DOCUMENT, AND THE SEAM IS HERE ───────────────────────────────────────────
//
// A row carries the columns worth querying — name, route, owner, version — and the whole document
// in `views`. `toDocument` and `toRow` are the only two places that know that, so a change to the
// document shape does not turn into a search across every route.

import { supabaseAdmin } from '@/lib/supabase';
import type { DesignDocument } from './document';

export interface DesignSummary {
  id: string;
  name: string;
  route: string | null;
  updatedAt: string;
  version: number;
  variantOf: string | null;
  counts: { desktop: number; mobile: number };
}

interface MockupRow {
  id: string;
  name: string;
  route: string | null;
  variant_of: string | null;
  views: DesignDocument['views'];
  owner_email: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const TABLE = 'design_mockups';
const VERSIONS = 'design_mockup_versions';

function toDocument(row: MockupRow): DesignDocument {
  return {
    id: row.id,
    name: row.name,
    route: row.route,
    variantOf: row.variant_of,
    views: row.views,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as DesignDocument;
}

function summarise(row: Pick<MockupRow, 'id' | 'name' | 'route' | 'updated_at' | 'version' | 'variant_of' | 'views'>): DesignSummary {
  return {
    id: row.id,
    name: row.name,
    route: row.route,
    updatedAt: row.updated_at,
    version: row.version,
    variantOf: row.variant_of,
    counts: {
      // A row written by an older client could be missing a view; a list page is not the place to
      // discover that by throwing.
      desktop: row.views?.desktop?.elements?.length ?? 0,
      mobile: row.views?.mobile?.elements?.length ?? 0,
    },
  };
}

/**
 * Every design, newest first.
 *
 * Deliberately NOT filtered to the caller: this is an internal build tool used by at most a couple
 * of people, and the failure everyone actually hits is "I made it on the laptop and now I am on the
 * desktop". Hiding a colleague's mockup would create that failure on purpose. `owner_email` is
 * still recorded, and still shown, so it is clear whose work a design is.
 */
export async function listMockups(): Promise<DesignSummary[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, name, route, variant_of, views, version, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as MockupRow[]).map((row) => summarise(row));
}

export async function getMockup(id: string): Promise<DesignDocument | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDocument(data as MockupRow) : null;
}

/**
 * Write a design, and record what it looked like at this version.
 *
 * The version number is decided HERE, from the row that exists, rather than taken from the client.
 * Two tabs open on the same design would otherwise both send "version 4" and one would silently
 * overwrite the other's history entry — and a history with a gap in it is worse than none, because
 * it is trusted.
 */
export async function saveMockup(
  doc: DesignDocument,
  ownerEmail: string,
  now: string,
  summary?: string,
): Promise<DesignDocument> {
  const { data: existing } = await supabaseAdmin
    .from(TABLE)
    .select('version, owner_email, created_at')
    .eq('id', doc.id)
    .maybeSingle();

  const version = ((existing?.version as number | undefined) ?? 0) + 1;
  const row = {
    id: doc.id,
    name: doc.name,
    route: doc.route,
    variant_of: doc.variantOf ?? null,
    views: doc.views,
    // The first writer owns it. A colleague opening and saving a design does not take it over.
    owner_email: (existing?.owner_email as string | undefined) ?? ownerEmail,
    version,
    created_at: (existing?.created_at as string | undefined) ?? doc.createdAt ?? now,
    updated_at: now,
    deleted_at: null,
  };

  const { error } = await supabaseAdmin.from(TABLE).upsert(row, { onConflict: 'id' });
  if (error) throw new Error(error.message);

  // History is best-effort: losing the snapshot must never lose the save itself.
  const { error: versionError } = await supabaseAdmin.from(VERSIONS).insert({
    mockup_id: doc.id,
    version,
    views: doc.views,
    summary: summary ?? null,
    author_email: ownerEmail,
    created_at: now,
  });
  if (versionError) console.error('[design] version row not written:', versionError.message);

  return { ...doc, version, updatedAt: now, createdAt: row.created_at };
}

/** Soft delete. A design is somebody's afternoon; `deleted_at` means it can come back. */
export async function deleteMockup(id: string, now: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export interface VersionSummary {
  version: number;
  summary: string | null;
  authorEmail: string;
  createdAt: string;
  counts: { desktop: number; mobile: number };
}

export async function listVersions(id: string): Promise<VersionSummary[]> {
  const { data, error } = await supabaseAdmin
    .from(VERSIONS)
    .select('version, summary, author_email, created_at, views')
    .eq('mockup_id', id)
    .order('version', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const views = row.views as DesignDocument['views'] | null;
    return {
      version: row.version as number,
      summary: (row.summary as string | null) ?? null,
      authorEmail: row.author_email as string,
      createdAt: row.created_at as string,
      counts: {
        desktop: views?.desktop?.elements?.length ?? 0,
        mobile: views?.mobile?.elements?.length ?? 0,
      },
    };
  });
}

/**
 * Restore an old version by writing it forward as a NEW one.
 *
 * Not by deleting the versions after it. History that can be destroyed by using it is not history,
 * and "I restored v3 to look at it and lost v4 through v9" is a support conversation that should
 * never be possible.
 */
export async function restoreVersion(
  id: string,
  version: number,
  email: string,
  now: string,
): Promise<DesignDocument | null> {
  const { data, error } = await supabaseAdmin
    .from(VERSIONS)
    .select('views')
    .eq('mockup_id', id)
    .eq('version', version)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const current = await getMockup(id);
  if (!current) return null;

  return saveMockup(
    { ...current, views: data.views as DesignDocument['views'] },
    email,
    now,
    `restored from v${version}`,
  );
}
