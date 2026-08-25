// lib/design/server.ts — mockups, in the database rather than in one browser.
//
// Slice S1 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md, and the reason seed 609 exists.
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
import { statusRule, cloneName, type DesignStatus } from './lifecycle';
// `diffDefaults` lives with the other measurement code rather than here: it is pure, a test has to
// be able to reach it, and this module cannot be imported without a database client.
import { diffDefaults, type RetraceChange } from './conformance';

/**
 * The columns a `DesignSummary` is built from.
 *
 * This constant existed and TWO call sites still spelled the list out by hand — which is how
 * adding `traced_at` for S1 came within one keystroke of being added to one query and not the
 * others, producing a `--stale` filter that silently matched nothing. `summarise()` reads every
 * name in here, so a query that fetches fewer does not fail; it returns undefined and the caller
 * gets a null. Both copies now use this.
 */
const SUMMARY_COLS = 'id, name, route, state_key, variant_of, views, version, updated_at, status, locked, theme_group, theme_id, owner_email, traced_at';

export interface DesignSummary {
  id: string;
  name: string;
  route: string | null;
  updatedAt: string;
  version: number;
  variantOf: string | null;
  counts: { desktop: number; mobile: number };
  // ── The lifecycle, carried on every summary ──────────────────────────────────────────────────
  //
  // The page list has to show, at a glance, what exists for a route: the default, the active one,
  // how many alternatives, how many drafts. Fetching a second time per row to answer that would
  // make the list N+1 queries deep for information the row already has.
  status: string;
  locked: boolean;
  themeGroup: string | null;
  themeId: string | null;
  /** When the tracer measured this, for a `default`. Null on anything hand-built.
   *
   * On the summary because the question it answers — "is this record older than the page it
   * records?" — has four callers (the page list's fifth gap, and `--stale` on the tracer, the
   * deriver and the conformance sweep) and none of them wants a second query per row. */
  /** Which STATE of the route this is of — the `?tab=` value, or a disclosure panel's id.
   *
   * `''` means the route as a whole, which is what every row made before 2026-08-24 is. Carried
   * through the types by V1 so the column cannot be added and then quietly forgotten; nothing
   * READS it until V2 teaches the deriver to find a page's states. Distinct from `views`, which is
   * the desktop/mobile pair — a design has both axes and they multiply. */
  stateKey: string;
  tracedAt: string | null;
  ownerEmail: string | null;
}

interface MockupRow {
  id: string;
  name: string;
  route: string | null;
  variant_of: string | null;
  views: DesignDocument['views'];
  owner_email: string;
  status: string;
  locked: boolean | null;
  theme_group: string | null;
  theme_id: string | null;
  theme: DesignDocument['theme'] | null;
  notes: string | null;
  activated_at: string | null;
  traced_at: string | null;
  state_key: string;
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
    // V6. Read here so every consumer of a document gets it for free rather than fetching the row
    // again to find out which tab it is of.
    stateKey: row.state_key ?? '',
    variantOf: row.variant_of,
    views: row.views,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status ?? 'draft',
    locked: !!row.locked,
    themeGroup: row.theme_group ?? null,
    themeId: row.theme_id ?? null,
    // Both of these were edited in the UI and thrown away on save until seed 614 — the columns did
    // not exist, so the row simply had nowhere to put them. See that seed for the whole story.
    theme: row.theme ?? null,
    notes: row.notes ?? undefined,
  } as DesignDocument;
}

function summarise(row: Pick<MockupRow, 'id' | 'name' | 'route' | 'state_key' | 'updated_at' | 'version' | 'variant_of' | 'views' | 'status' | 'locked' | 'theme_group' | 'theme_id' | 'owner_email' | 'traced_at'>): DesignSummary {
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
    status: row.status ?? 'draft',
    locked: !!row.locked,
    themeGroup: row.theme_group ?? null,
    themeId: row.theme_id ?? null,
    // `?? ''` rather than trusting NOT NULL: a row read by an older client, or by a query written
    // before the column existed, arrives undefined and the route-as-a-whole is the right answer.
    stateKey: row.state_key ?? '',
    tracedAt: row.traced_at ?? null,
    ownerEmail: row.owner_email ?? null,
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
    .select(SUMMARY_COLS)
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
    .select('version, owner_email, created_at, status, locked')
    .eq('id', doc.id)
    .maybeSingle();

  // ── A LOCKED DESIGN IS REFUSED HERE, NOT ONLY IN THE UI ──────────────────────────────────────
  //
  // Owner: *"we should never be able to change the default page for any page itself, but we should
  // be able to clone it and change the clone."*
  //
  // The editor opens a default read-only, which handles the honest case. This handles every other
  // one: a stale tab opened before the trace ran, a direct API call, a script. A default is the
  // record of what the page actually is; if it can be edited it stops being evidence and becomes
  // just another opinion, and then nothing in the system knows what the page really looks like.
  if (existing && (existing.locked || existing.status === 'default')) {
    throw new Error(
      'LOCKED: this is the default design — a trace of the page as it is served. Clone it and edit '
      + 'the clone.',
    );
  }

  const version = ((existing?.version as number | undefined) ?? 0) + 1;
  const row = {
    id: doc.id,
    name: doc.name,
    route: doc.route,
    variant_of: doc.variantOf ?? null,
    views: doc.views,
    theme: doc.theme ?? null,
    notes: doc.notes ?? null,
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

// ── STATUS, CLONING AND THE DEFAULT TRACE ───────────────────────────────────────────────────────
//
// Phases P, S and B of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.



/**
 * Move a design to a status, demoting whatever held the slot.
 *
 * `active` and `default` are singular per route, and the database enforces that with partial unique
 * indexes. That means the demotion has to happen BEFORE the promotion or the index rejects the
 * write — which is a feature: the ordering is forced rather than remembered.
 */
export async function setDesignStatus(
  id: string,
  next: DesignStatus,
  actorEmail: string,
  now: string,
): Promise<{ design: DesignSummary; demoted: string | null }> {
  const { data: row, error: readError } = await supabaseAdmin
    .from(TABLE)
    .select('id, name, route, status, locked')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!row) throw new Error('That design does not exist.');

  const rule = statusRule(row.status as string);
  if (!rule.canBecome.includes(next)) {
    throw new Error(`A ${rule.label.toLowerCase()} design cannot become ${next}.`);
  }

  let demoted: string | null = null;
  if ((next === 'active' || next === 'default') && row.route) {
    const { data: holder } = await supabaseAdmin
      .from(TABLE)
      .select('id')
      .eq('route', row.route)
      .eq('status', next)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle();
    if (holder?.id) {
      // Demoted to `alternative`, never to `draft`: it was the record a moment ago, so it is by
      // definition finished work. Sending it back to draft would lose that.
      const { error } = await supabaseAdmin
        .from(TABLE)
        .update({ status: 'alternative', updated_at: now })
        .eq('id', holder.id as string);
      if (error) throw new Error(error.message);
      demoted = holder.id as string;
    }
  }

  const patch: Record<string, unknown> = { status: next, updated_at: now };
  if (next === 'active') { patch.activated_at = now; patch.activated_by = actorEmail; }
  const { error: writeError } = await supabaseAdmin.from(TABLE).update(patch).eq('id', id);
  if (writeError) throw new Error(writeError.message);

  const { data: after } = await supabaseAdmin
    .from(TABLE)
    .select(SUMMARY_COLS)
    .eq('id', id)
    .maybeSingle();
  return { design: summarise(after as unknown as MockupRow), demoted };
}

/**
 * Copy a design into a new editable draft.
 *
 * The clone carries BOTH viewports, the theme and the lineage, and is never locked — cloning a
 * default is the whole point of a default being locked. `themeGroup` is only carried when the clone
 * is explicitly a theme sibling: an ordinary clone starts a new layout lineage, and putting it in
 * the source's theme group would make a re-skin of one page look like a re-skin of the other.
 */
export async function cloneMockup(
  sourceId: string,
  actorEmail: string,
  now: string,
  options: { name?: string; asThemeSibling?: boolean; themeId?: string | null } = {},
): Promise<{ document: DesignDocument; summary: DesignSummary }> {
  const { data: row, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('id', sourceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('That design does not exist.');
  const source = row as unknown as MockupRow;

  const { data: siblings } = await supabaseAdmin
    .from(TABLE)
    .select('name')
    .eq('route', source.route)
    .is('deleted_at', null);
  const taken = ((siblings ?? []) as Array<{ name: string }>).map((s) => s.name);

  const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const name = options.name?.trim() || cloneName({ name: source.name, status: source.status }, taken);

  // A theme sibling joins (or starts) the source's theme group. The group id is the SOURCE's id
  // when it has none yet, so the family is named after the layout it came from.
  const themeGroup = options.asThemeSibling
    ? (source.theme_group ?? source.id)
    : null;

  const insert = {
    id,
    name,
    route: source.route,
    // ── THE CLONE IS OF THE SAME STATE AS ITS SOURCE (V6) ────────────────────────────────────────
    //
    // Missing, this silently undid the whole point of V1. The owner's flow for a tab is "open its
    // default, clone it, edit the clone" — and the clone came out attached to the ROUTE, so an
    // edited invoices tab would have been offered as the design of record for the billing page as
    // a whole. Not an error and not an empty: a design filed one level up from where it was made.
    state_key: source.state_key ?? '',
    variant_of: source.id,
    views: source.views,
    // The clone wears what the source wore. A copy that lost its theme would open in the default
    // palette and read as a different design before anybody had touched it.
    theme: source.theme ?? null,
    notes: source.notes ?? null,
    owner_email: actorEmail,
    status: 'draft',
    locked: false,
    theme_group: themeGroup,
    theme_id: options.themeId ?? source.theme_id ?? null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  const { error: writeError } = await supabaseAdmin.from(TABLE).insert(insert);
  if (writeError) throw new Error(writeError.message);

  // If the source had no theme group and this is a theme sibling, the source joins its own family
  // — otherwise the group would have one member and the relationship would only exist one way.
  if (options.asThemeSibling && !source.theme_group) {
    await supabaseAdmin.from(TABLE).update({ theme_group: source.id }).eq('id', source.id);
  }

  await supabaseAdmin.from(VERSIONS).insert({
    mockup_id: id,
    version: 1,
    views: source.views,
    summary: `Cloned from “${source.name}”`,
    author_email: actorEmail,
    created_at: now,
  });

  // Returned as a summary rather than a bare document: the caller's next move is to show it in the
  // list or open it, and both need to know it is a draft and not locked. A document that omits its
  // own status made the first clone response read `status: undefined`, which is the kind of thing a
  // UI then renders as a blank chip.
  return { document: toDocument({ ...source, ...insert } as unknown as MockupRow), summary: summarise(insert as unknown as MockupRow) };
}

/**
 * Write (or replace) the DEFAULT design for a route.
 *
 * Called by the tracer, never by the editor. Replacing a default deletes the old row rather than
 * updating it, so its version history does not imply somebody edited it — the whole claim of a
 * default is that nobody did.
 */
export async function writeDefault(
  route: string,
  doc: DesignDocument,
  actorEmail: string,
  now: string,
  /** Which state of the route this is the default FOR — V4.
   *
   * `''` is the route as a whole, which is what every default written before 2026-08-24 is. A
   * tabbed page gets one default per tab, because "the page" was never one thing to look at:
   * /admin/settings is six. */
  stateKey: string = '',
): Promise<DesignSummary & { changes: RetraceChange[] }> {
  // The whole prior row, not just its id: replacing a default is the moment to say what changed,
  // and after the update the old elements are gone.
  const { data: prior } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('route', route)
    // Scoped to the STATE, or re-tracing the invoices tab would retire the overview's default.
    // The bug this prevents is not subtle in its effects and is completely invisible in its
    // cause: six tabs would leave one design, the last one written.
    .eq('state_key', stateKey)
    .eq('status', 'default')
    .is('deleted_at', null)
    .maybeSingle();
  const previous = prior ? toDocument(prior as unknown as MockupRow) : null;
  if (prior?.id) {
    // ── A RE-TRACE NEVER TOUCHES A CLONE ────────────────────────────────────────────────────────
    //
    // Only the row with `status = 'default'` is replaced. Designs branched FROM it are ordinary
    // drafts with their own ids and their own lives; the re-trace does not know or care that they
    // came from here. Said explicitly because "re-tracing the page" sounds like it might reach
    // everything derived from it, and somebody's afternoon depends on it not doing that.
    await supabaseAdmin.from(TABLE).update({ deleted_at: now }).eq('id', prior.id as string);
  }

  const slug = `${route}${stateKey ? `-${stateKey}` : ''}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const id = `d-default-${slug}-${Date.now().toString(36)}`;
  const insert = {
    id,
    // The state is in the NAME as well as the column, because the name is what a person reads in
    // a list of six otherwise-identical rows.
    name: `${route}${stateKey ? ` · ${stateKey}` : ''} — as served`,
    route,
    state_key: stateKey,
    variant_of: null,
    views: doc.views,
    owner_email: actorEmail,
    status: 'default',
    locked: true,
    version: 1,
    traced_at: now,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabaseAdmin.from(TABLE).insert(insert);
  if (error) throw new Error(error.message);
  return {
    ...summarise(insert as unknown as MockupRow),
    changes: diffDefaults(previous, { ...doc, views: doc.views } as DesignDocument),
  };
}

// ── LINEAGE AND THEME FAMILIES ──────────────────────────────────────────────────────────────────
//
// Phases B3 + K3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"we need to be able to link the page designs together to mark them as alternative themes
// for each other"*, and — on branching — *"if we make an alternative of the page, then it will
// create a new version that looks the same that we can then edit."*
//
// Two different relationships, deliberately not merged:
//
//   `variant_of`  WHERE THIS CAME FROM. A history. It never changes after the clone.
//   `theme_group` WHAT THIS IS THE SAME LAYOUT AS. A membership. It can be joined and left.
//
// Collapsing them into one field is tempting and wrong: a design branched to try a different layout
// shares a parent with its source but is emphatically not a theme of it, and a design linked into a
// theme family later never came from its siblings at all.

export interface DesignRelations {
  design: DesignSummary;
  /** The design this was branched from, if it still exists. */
  parent: DesignSummary | null;
  /** Designs branched from this one. */
  children: DesignSummary[];
  /** The same layout in other themes — this design's theme family, excluding itself. */
  themeSiblings: DesignSummary[];
  /** Everything else that names the same route, whatever its lineage. */
  routeSiblings: DesignSummary[];
}


export async function designRelations(id: string): Promise<DesignRelations | null> {
  const { data: row, error } = await supabaseAdmin
    .from(TABLE).select(SUMMARY_COLS).eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const self = summarise(row as unknown as MockupRow);

  const [parentRes, childrenRes, familyRes, routeRes] = await Promise.all([
    self.variantOf
      ? supabaseAdmin.from(TABLE).select(SUMMARY_COLS).eq('id', self.variantOf).is('deleted_at', null).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from(TABLE).select(SUMMARY_COLS).eq('variant_of', id).is('deleted_at', null),
    self.themeGroup
      ? supabaseAdmin.from(TABLE).select(SUMMARY_COLS).eq('theme_group', self.themeGroup).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    self.route
      ? supabaseAdmin.from(TABLE).select(SUMMARY_COLS).eq('route', self.route).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
  ]);

  const map = (data: unknown) => ((data ?? []) as unknown as MockupRow[]).map(summarise);
  const family = map(familyRes.data).filter((d) => d.id !== id);
  const familyIds = new Set([id, ...family.map((d) => d.id)]);

  return {
    design: self,
    parent: parentRes.data ? summarise(parentRes.data as unknown as MockupRow) : null,
    children: map(childrenRes.data),
    themeSiblings: family,
    // The route list is what is LEFT: showing a theme sibling twice, once as family and once as
    // "also for this page", makes two relationships look like four designs.
    routeSiblings: map(routeRes.data).filter((d) => !familyIds.has(d.id)),
  };
}

/**
 * Join a design to a theme family, or take it out of one.
 *
 * Joining by naming ANOTHER design: `groupWith` is a design id, and the family is that design's
 * group — created from its id if it did not have one, so the family is always named after a real
 * layout rather than after a generated token nobody can trace back to anything.
 *
 * The elements are never touched. That is the whole point of a theme family: *"a theme sibling
 * shares elements, not copies of them"* — changing colours must never mean rebuilding the page.
 */
export async function setThemeGroup(
  id: string,
  groupWith: string | null,
  now: string,
): Promise<{ design: DesignSummary; group: string | null }> {
  const { data: row, error } = await supabaseAdmin
    .from(TABLE).select('id, route, theme_group').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('That design does not exist.');

  if (!groupWith) {
    const { error: unlinkError } = await supabaseAdmin
      .from(TABLE).update({ theme_group: null, updated_at: now }).eq('id', id);
    if (unlinkError) throw new Error(unlinkError.message);
    const { data: after } = await supabaseAdmin.from(TABLE).select(SUMMARY_COLS).eq('id', id).maybeSingle();
    return { design: summarise(after as unknown as MockupRow), group: null };
  }

  if (groupWith === id) throw new Error('A design is already the same layout as itself.');

  const { data: target } = await supabaseAdmin
    .from(TABLE).select('id, route, theme_group').eq('id', groupWith).is('deleted_at', null).maybeSingle();
  if (!target) throw new Error('The design to link with does not exist.');
  // Two designs for different pages are not two themes of one layout, whatever their contents look
  // like — and a family that spans routes would make "this page's themes" unanswerable.
  if ((target as { route: string | null }).route !== (row as { route: string | null }).route) {
    throw new Error('Those designs are for different pages, so they cannot be themes of each other.');
  }

  const group = (target as { theme_group: string | null }).theme_group ?? (target as { id: string }).id;
  if (!(target as { theme_group: string | null }).theme_group) {
    await supabaseAdmin.from(TABLE).update({ theme_group: group }).eq('id', groupWith);
  }
  const { error: linkError } = await supabaseAdmin
    .from(TABLE).update({ theme_group: group, updated_at: now }).eq('id', id);
  if (linkError) throw new Error(linkError.message);

  const { data: after } = await supabaseAdmin.from(TABLE).select(SUMMARY_COLS).eq('id', id).maybeSingle();
  return { design: summarise(after as unknown as MockupRow), group };
}

/**
 * Give a design a different theme without touching a single element.
 *
 * Phase K2. The elements stay exactly where they are; only `theme` — the embedded token map the
 * artboard reads — is replaced. This is the function that makes the promise in §6 true: *"a theme
 * sibling shares elements, not copies of them. Otherwise 'change the colours' becomes 'rebuild the
 * page'."*
 */
export async function retheme(
  id: string,
  theme: { id: string; name: string; tokens: Record<string, string>; paletteId?: string | null } | null,
  email: string,
  now: string,
): Promise<DesignDocument> {
  const current = await getMockup(id);
  if (!current) throw new Error('That design does not exist.');
  return saveMockup(
    { ...current, theme, themeId: theme?.id ?? null },
    email,
    now,
    theme ? `re-themed as “${theme.name}”` : 'theme removed',
  );
}
