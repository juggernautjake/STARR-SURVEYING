// lib/design/composition-server.ts — which composition this viewer gets, from the database.
//
// W4 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── THE ONE SAFETY PROPERTY ─────────────────────────────────────────────────────────────────────
//
// The plan states it plainly: *"a composition that fails to load must leave the page working."*
//
// That is not defensive tidiness, it is the whole risk of the feature. A portal is a page people do
// their jobs on. Putting a resolver in front of it means a bad row, a slow query or a typo in a
// scope key can take that page away — and it would take it away for exactly the group whose
// composition was broken, which is the hardest failure to notice and the worst one to have.
//
// So EVERY failure here returns null, and null means "render the page as it was written". The
// hand-built portal is always a correct answer; it is what the route did before any of this existed.
// Nothing in this file throws, and the one thing it must never do is return a composition it is not
// certain about.
//
// ── AND WHY THE CASCADE IS NOT HERE ─────────────────────────────────────────────────────────────
//
// This fetches. `resolveComposition` decides. That split is deliberate and is why the precedence —
// the part that actually decides which page somebody sees — is a pure function with twenty tests
// and no database. A resolver mixed into a query is one nobody can reason about at 2am.

import { supabaseAdmin } from '@/lib/supabase';
import { resolveComposition, type CompositionRow, type Viewer } from './composition';
import type { CompositionScope, DesignDocument } from './document';

const TABLE = 'design_mockups';

export interface ServedComposition {
  id: string;
  name: string;
  scope: CompositionScope;
  scopeKey: string;
  views: DesignDocument['views'];
}

/**
 * The composition this viewer should be served for this route and state, or null.
 *
 * Null is the normal answer today — nothing has a composition yet — and it stays a correct answer
 * forever: it means the route renders as it was written.
 */
export async function compositionFor(
  route: string,
  stateKey: string,
  viewer: Viewer,
): Promise<ServedComposition | null> {
  try {
    // ── ONLY WHAT IS LIVE ────────────────────────────────────────────────────────────────────────
    //
    // `status = 'active'` and nothing else. A DRAFT composition must never reach a real page: the
    // studio's whole flow is clone-to-edit, so at any moment there are half-finished layouts sitting
    // against a route, and serving one would put somebody's work-in-progress in front of the crew.
    //
    // Narrowed in the QUERY rather than after it, so a route with fifty drafts still costs one small
    // read. Seed 618's index is keyed exactly this way.
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('id, name, route, state_key, kind, scope, scope_key, views, updated_at')
      .eq('route', route)
      .eq('state_key', stateKey)
      .eq('kind', 'composition')
      .eq('status', 'active')
      .is('deleted_at', null);

    // Logged, not thrown. A page that disappears because a SELECT failed is the failure this whole
    // file exists to prevent — but a silent null would hide a broken table forever, so it is said
    // out loud on the server where somebody can find it.
    if (error) {
      console.error('[design] composition lookup failed, serving the page as written:', error.message);
      return null;
    }

    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r): CompositionRow => ({
      id: r.id as string,
      route: (r.route as string | null) ?? null,
      // The same snake_case → camelCase seam that has produced four bugs in this system already.
      // Spelled here, once, next to the query that fetched it.
      stateKey: (r.state_key as string | undefined) ?? '',
      kind: 'composition',
      scope: ((r.scope as CompositionScope | undefined) ?? 'firm'),
      scopeKey: (r.scope_key as string | undefined) ?? '',
      updatedAt: (r.updated_at as string | undefined) ?? null,
    }));

    const chosen = resolveComposition(rows, viewer, route, stateKey);
    if (!chosen) return null;

    const row = ((data ?? []) as Array<Record<string, unknown>>).find((r) => r.id === chosen.id);
    const views = row?.views as DesignDocument['views'] | undefined;
    // A row whose `views` never made it — an older write, a truncated JSONB — is not a composition
    // anybody can render. Falling back beats rendering an empty grid where a working page was.
    if (!views?.desktop || !views?.mobile) return null;

    return {
      id: chosen.id,
      name: (row?.name as string) ?? chosen.id,
      scope: chosen.scope,
      scopeKey: chosen.scopeKey,
      views,
    };
  } catch (err) {
    // Anything at all — a client that could not connect, a JSON parse, a bad shape. The page keeps
    // working, and the reason is recorded.
    console.error('[design] composition lookup threw, serving the page as written:', err);
    return null;
  }
}

/** The viewer a request is for, from a session. Kept here so callers cannot each shape it. */
export function viewerFrom(session: { user?: { email?: string | null; roles?: string[] | null } } | null): Viewer {
  return {
    email: session?.user?.email ?? null,
    roles: session?.user?.roles ?? [],
  };
}
