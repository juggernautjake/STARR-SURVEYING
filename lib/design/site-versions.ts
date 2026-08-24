// lib/design/site-versions.ts — a whole alternative version of the site, activated in one action.
//
// Phase V of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"eventually we can create full alternative versions of the website with all of the
// different pages being alternatives of each other with multiple themes in each version, so that
// once we built out a full version of the website, we can make that one active and have all of the
// pages served at once."*
//
// ── PUBLISHING IS THE WHOLE FEATURE, AND IT IS THE DANGEROUS PART ───────────────────────────────
//
// A version is a list. Publishing it changes the design of record for every page on that list at
// once — which is exactly what was asked for, and exactly the operation that can quietly undo a
// decision somebody made this morning. So:
//
//   1. **Nothing happens without a plan first.** `planPublish` returns what WOULD change, per
//      route, before anything is written. A bulk action whose effects you find out about afterwards
//      is one people stop using.
//   2. **A deliberate per-page choice wins by default** (V3). If a route's current active design was
//      activated after this version claimed that route, publishing SKIPS it and says so. The
//      alternative — silently overwriting — makes "I set this page's design yesterday" a thing the
//      system can undo without telling anybody.
//   3. **Overriding is possible and explicit.** `overrides` names the routes to take anyway. A rule
//      with no override is a rule people work around by deleting things.

import { supabaseAdmin } from '@/lib/supabase';
import { PAGES } from './pages';

export type SiteVersionStatus = 'draft' | 'published' | 'archived';

export interface SiteVersion {
  id: string;
  name: string;
  description: string | null;
  status: SiteVersionStatus;
  themeId: string | null;
  ownerEmail: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** How many designs it names. */
  members: number;
  /** How much of the site it covers — see `coverageOf`. */
  coverage: Coverage;
}

export interface SiteVersionMember {
  designId: string;
  route: string;
  addedAt: string;
  designName: string;
  designStatus: string;
  /** Whether this design is currently the record for its route. */
  isActive: boolean;
}

export interface Coverage {
  /** Routes this version names. */
  covered: number;
  /** Routes it could name — the non-dynamic pages of the areas it touches. */
  inScope: number;
  percent: number;
  /** The named areas, so "40% of the site" can be read as "all of the admin, none of the rest". */
  areas: Array<{ area: string; covered: number; inScope: number }>;
}

const VERSIONS = 'design_site_versions';
const MEMBERS = 'design_site_version_members';
const MOCKUPS = 'design_mockups';

/**
 * How much of the site a version actually covers (V4).
 *
 * Scoped to the AREAS the version touches, not to all 270 pages. A version that redesigns the whole
 * admin portal and ignores the D&D side project is 100% of what it set out to do, and reporting it
 * as 46% of everything would make the number useless for the only decision it informs — whether
 * this version is finished enough to publish.
 */
export function coverageOf(routes: string[]): Coverage {
  const named = new Set(routes);
  const areasTouched = new Set(
    PAGES.filter((p) => named.has(p.route)).map((p) => p.area),
  );
  const inScopePages = PAGES.filter((p) => areasTouched.has(p.area) && !p.dynamic);
  const byArea = new Map<string, { covered: number; inScope: number }>();
  for (const page of inScopePages) {
    const hit = byArea.get(page.area) ?? { covered: 0, inScope: 0 };
    hit.inScope += 1;
    if (named.has(page.route)) hit.covered += 1;
    byArea.set(page.area, hit);
  }
  const covered = inScopePages.filter((p) => named.has(p.route)).length;
  return {
    covered,
    inScope: inScopePages.length,
    percent: inScopePages.length ? Math.round((covered / inScopePages.length) * 100) : 0,
    areas: [...byArea.entries()].map(([area, v]) => ({ area, ...v })),
  };
}

// ── PLANNING A PUBLISH ──────────────────────────────────────────────────────────────────────────

export type PlanOutcome = 'activate' | 'already-active' | 'conflict' | 'missing-design';

export interface PlanRow {
  route: string;
  designId: string;
  designName: string;
  outcome: PlanOutcome;
  /** What currently holds the route, when something does. */
  currentActive: { id: string; name: string; activatedAt: string | null } | null;
  note: string;
}

export interface PublishPlan {
  versionId: string;
  versionName: string;
  rows: PlanRow[];
  willActivate: number;
  conflicts: number;
  unchanged: number;
  /** Routes in scope for this version's areas that the version does not name — what it leaves as
   *  it is. Stated, because "publish the new site" reading as "every page changes" is the natural
   *  assumption and it is wrong. */
  untouched: number;
}

/**
 * Does a per-page choice beat this version's claim on the route?
 *
 * Yes when something else is active AND it was activated after this version claimed the route.
 * Time is the only evidence available for "somebody decided this deliberately, later" — and the
 * comparison is deliberately one-directional: a version assembled today does not lose to an
 * activation from last month, because that activation is what the version was assembled to replace.
 */
export function isConflict(
  memberAddedAt: string,
  currentActive: { id: string; activatedAt: string | null } | null,
  memberDesignId: string,
): boolean {
  if (!currentActive || currentActive.id === memberDesignId) return false;
  if (!currentActive.activatedAt) return false;
  return Date.parse(currentActive.activatedAt) > Date.parse(memberAddedAt);
}

export async function listSiteVersions(): Promise<SiteVersion[]> {
  const { data, error } = await supabaseAdmin
    .from(VERSIONS).select('*').is('deleted_at', null).order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  const versions = (data ?? []) as Array<Record<string, unknown>>;
  if (!versions.length) return [];

  const { data: members } = await supabaseAdmin
    .from(MEMBERS).select('version_id, route').in('version_id', versions.map((v) => v.id as string));
  const routesByVersion = new Map<string, string[]>();
  for (const m of (members ?? []) as Array<{ version_id: string; route: string }>) {
    const list = routesByVersion.get(m.version_id) ?? [];
    list.push(m.route);
    routesByVersion.set(m.version_id, list);
  }

  return versions.map((v) => {
    const routes = routesByVersion.get(v.id as string) ?? [];
    return {
      id: v.id as string,
      name: v.name as string,
      description: (v.description as string | null) ?? null,
      status: (v.status as SiteVersionStatus) ?? 'draft',
      themeId: (v.theme_id as string | null) ?? null,
      ownerEmail: v.owner_email as string,
      publishedAt: (v.published_at as string | null) ?? null,
      createdAt: v.created_at as string,
      updatedAt: v.updated_at as string,
      members: routes.length,
      coverage: coverageOf(routes),
    };
  });
}

export async function getSiteVersion(id: string): Promise<{ version: SiteVersion; members: SiteVersionMember[] } | null> {
  const all = await listSiteVersions();
  const version = all.find((v) => v.id === id);
  if (!version) return null;

  const { data, error } = await supabaseAdmin
    .from(MEMBERS).select('design_id, route, added_at').eq('version_id', id).order('route');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ design_id: string; route: string; added_at: string }>;
  if (!rows.length) return { version, members: [] };

  const { data: designs } = await supabaseAdmin
    .from(MOCKUPS).select('id, name, status').in('id', rows.map((r) => r.design_id));
  const byId = new Map(((designs ?? []) as Array<{ id: string; name: string; status: string }>).map((d) => [d.id, d]));

  return {
    version,
    members: rows.map((r) => ({
      designId: r.design_id,
      route: r.route,
      addedAt: r.added_at,
      designName: byId.get(r.design_id)?.name ?? '(deleted)',
      designStatus: byId.get(r.design_id)?.status ?? 'missing',
      isActive: byId.get(r.design_id)?.status === 'active',
    })),
  };
}

export async function createSiteVersion(
  input: { name: string; description?: string | null; themeId?: string | null },
  email: string,
  now: string,
): Promise<SiteVersion> {
  const name = input.name.trim();
  if (!name) throw new Error('A version needs a name.');
  const id = `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabaseAdmin.from(VERSIONS).insert({
    id,
    name,
    description: input.description?.trim() || null,
    theme_id: input.themeId ?? null,
    status: 'draft',
    owner_email: email,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  return {
    id, name, description: input.description?.trim() || null, status: 'draft',
    themeId: input.themeId ?? null, ownerEmail: email, publishedAt: null,
    createdAt: now, updatedAt: now, members: 0, coverage: coverageOf([]),
  };
}

export async function addMember(versionId: string, designId: string, now: string): Promise<void> {
  const { data: design } = await supabaseAdmin
    .from(MOCKUPS).select('id, route, status').eq('id', designId).is('deleted_at', null).maybeSingle();
  if (!design) throw new Error('That design does not exist.');
  const route = (design as { route: string | null }).route;
  if (!route) throw new Error('That design is not attached to a page, so it cannot be part of a site version.');
  if ((design as { status: string }).status === 'default') {
    // A default is a record of what is already served. Publishing a version that "activates" it
    // would be publishing a description of the present as a plan for the future.
    throw new Error('A default is a trace of what is already served — clone it if you want it in a version.');
  }

  const { error } = await supabaseAdmin.from(MEMBERS).upsert(
    { version_id: versionId, design_id: designId, route, added_at: now },
    { onConflict: 'version_id,design_id' },
  );
  // The partial unique index on (version_id, route) is what stops a version naming two designs for
  // one page. Caught here so the message is a sentence rather than a constraint name.
  if (error) {
    if (/idx_design_version_one_per_route|duplicate key/i.test(error.message)) {
      throw new Error(`This version already names a design for ${route}. Remove that one first.`);
    }
    throw new Error(error.message);
  }
}

export async function removeMember(versionId: string, designId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(MEMBERS).delete().eq('version_id', versionId).eq('design_id', designId);
  if (error) throw new Error(error.message);
}

export async function planPublish(versionId: string): Promise<PublishPlan> {
  const loaded = await getSiteVersion(versionId);
  if (!loaded) throw new Error('That version does not exist.');
  const { version, members } = loaded;

  const routes = members.map((m) => m.route);
  const { data: actives } = routes.length
    ? await supabaseAdmin
      .from(MOCKUPS)
      .select('id, name, route, activated_at')
      .in('route', routes).eq('status', 'active').is('deleted_at', null)
    : { data: [] };
  const activeByRoute = new Map(
    ((actives ?? []) as Array<{ id: string; name: string; route: string; activated_at: string | null }>)
      .map((a) => [a.route, a]),
  );

  const rows: PlanRow[] = members.map((m) => {
    const current = activeByRoute.get(m.route) ?? null;
    const currentActive = current
      ? { id: current.id, name: current.name, activatedAt: current.activated_at }
      : null;

    if (m.designStatus === 'missing') {
      return {
        route: m.route, designId: m.designId, designName: m.designName,
        outcome: 'missing-design', currentActive,
        note: 'The design this version names has been deleted. Remove it or point the version at another.',
      };
    }
    if (currentActive?.id === m.designId) {
      return {
        route: m.route, designId: m.designId, designName: m.designName,
        outcome: 'already-active', currentActive,
        note: 'Already the design of record — publishing changes nothing here.',
      };
    }
    if (isConflict(m.addedAt, currentActive, m.designId)) {
      return {
        route: m.route, designId: m.designId, designName: m.designName,
        outcome: 'conflict', currentActive,
        note: `“${currentActive!.name}” was made the record for this page after this version claimed `
          + 'it. That choice wins unless you override this route.',
      };
    }
    return {
      route: m.route, designId: m.designId, designName: m.designName,
      outcome: 'activate', currentActive,
      note: currentActive
        ? `Replaces “${currentActive.name}”, which becomes an alternative.`
        : 'Becomes the design of record for this page.',
    };
  });

  const namedRoutes = new Set(routes);
  const coverage = coverageOf(routes);

  return {
    versionId,
    versionName: version.name,
    rows,
    willActivate: rows.filter((r) => r.outcome === 'activate').length,
    conflicts: rows.filter((r) => r.outcome === 'conflict').length,
    unchanged: rows.filter((r) => r.outcome === 'already-active').length,
    untouched: coverage.inScope - namedRoutes.size,
  };
}

export interface PublishResult {
  activated: string[];
  skipped: Array<{ route: string; why: string }>;
  demoted: string[];
  plan: PublishPlan;
}

/**
 * Activate every member, one route at a time.
 *
 * Not one transaction, and that is a decision rather than an omission: PostgREST gives no
 * multi-statement transaction, and the alternative — a stored procedure — would move the rules that
 * live in `lifecycle.ts` into SQL where the editor cannot read them. A partial publish is survivable
 * and visible (`activated` says exactly which routes moved); a rule that exists in two places and
 * disagrees with itself is neither.
 */
export async function publishSiteVersion(
  versionId: string,
  email: string,
  now: string,
  options: { overrides?: string[] } = {},
): Promise<PublishResult> {
  const plan = await planPublish(versionId);
  const overrides = new Set(options.overrides ?? []);
  const activated: string[] = [];
  const demoted: string[] = [];
  const skipped: Array<{ route: string; why: string }> = [];

  for (const row of plan.rows) {
    if (row.outcome === 'already-active') { skipped.push({ route: row.route, why: 'already the record' }); continue; }
    if (row.outcome === 'missing-design') { skipped.push({ route: row.route, why: 'the design has been deleted' }); continue; }
    if (row.outcome === 'conflict' && !overrides.has(row.route)) {
      skipped.push({ route: row.route, why: `a later per-page choice (“${row.currentActive?.name}”) wins` });
      continue;
    }

    // Demote first: the partial unique index makes two actives for one route unrepresentable, so
    // the ordering is enforced by the database rather than remembered by whoever writes this next.
    if (row.currentActive && row.currentActive.id !== row.designId) {
      const { error } = await supabaseAdmin
        .from(MOCKUPS).update({ status: 'alternative', updated_at: now }).eq('id', row.currentActive.id);
      if (error) { skipped.push({ route: row.route, why: error.message }); continue; }
      demoted.push(row.currentActive.id);
    }
    const { error } = await supabaseAdmin
      .from(MOCKUPS)
      .update({ status: 'active', activated_at: now, activated_by: email, updated_at: now })
      .eq('id', row.designId);
    if (error) { skipped.push({ route: row.route, why: error.message }); continue; }
    activated.push(row.route);
  }

  await supabaseAdmin
    .from(VERSIONS)
    .update({ status: 'published', published_at: now, updated_at: now })
    .eq('id', versionId);

  return { activated, skipped, demoted, plan };
}
