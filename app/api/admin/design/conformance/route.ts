// app/api/admin/design/conformance/route.ts — the design against the page, by measurement.
//
//   POST /api/admin/design/conformance { route, which?, desktop?, mobile? } → { reports }
//
// Phases R3 + P4 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// `which` picks what the capture is compared against:
//   'active'  → the design of record. *"Is the served page the active version yet?"*
//   'default' → the locked trace. *"Is the default still 1:1 with the page?"*
//   'both'    → one capture, two answers, which is why they share an endpoint at all.
//
// The capture arrives from `scripts/check-design-conformance.mjs`, for the same reason every other
// measurement in this system does: only a browser can walk a live page, and only the server can
// reach the catalogue and the designs. Splitting it any other way would put the comparison — the
// part that is either right or quietly wrong — in the file no test covers.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { ENTRIES } from '@/lib/design/catalogue';
import { conformanceOf, traceIsFaithful, type ConformanceReport } from '@/lib/design/conformance';
import { resolveActive } from '@/lib/design/active';
import { supabaseAdmin } from '@/lib/supabase';
import type { CapturedNode } from '@/lib/design/import';
import type { DesignDocument, ViewId } from '@/lib/design/document';

function sane(nodes: unknown): CapturedNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter((n): n is CapturedNode =>
    !!n && typeof n === 'object'
    && Array.isArray((n as CapturedNode).classes)
    && !!(n as CapturedNode).rect
    && typeof (n as CapturedNode).rect.w === 'number');
}

/**
 * The route's locked default, as a document.
 *
 * Fetched here rather than through `resolveActive`, which deliberately falls back to the default
 * when nothing is active — correct for showing a page, wrong here, where "compared against the
 * default" and "compared against the active design" have to be different answers or the report is
 * lying about which design it measured.
 */
/**
 * ── AND WHY THIS TAKES A STATE — V5 ───────────────────────────────────────────────────────────
 *
 * V4 gave a tabbed route one default PER TAB. This query asked for the route's default with
 * `.maybeSingle()`, which errors the moment there is more than one — so for every tabbed route it
 * returned null, the endpoint produced no reports, and the sweep printed a tick.
 *
 * **A conformance run that cannot find the design reads exactly like one that found no problem.**
 * /admin/settings and /admin/billing both came back "✓" with no score beside them, and the summary
 * line said "0 default(s) no longer 1:1". Nobody investigates a pass.
 */
async function defaultFor(route: string, stateKey = ''): Promise<DesignDocument | null> {
  const { data } = await supabaseAdmin
    .from('design_mockups')
    .select('id, name, route, views, version, created_at, updated_at, status, locked, theme, notes')
    .eq('route', route).eq('state_key', stateKey).eq('status', 'default').is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    name: row.name as string,
    route: (row.route as string | null) ?? null,
    // A default is traced, never branched, so it has no parent by construction.
    variantOf: null,
    views: row.views as DesignDocument['views'],
    version: (row.version as number) ?? 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    status: (row.status as string) ?? 'default',
    locked: !!row.locked,
    theme: (row.theme as DesignDocument['theme']) ?? null,
    notes: (row.notes as string | undefined) ?? undefined,
  };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDeveloper(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null) as {
    route?: string; which?: 'active' | 'default' | 'both'; desktop?: unknown; mobile?: unknown;
    /** Which state of the route was captured — V5. Absent means the route as a whole. */
    stateKey?: string;
  } | null;
  if (!body?.route) return NextResponse.json({ error: 'Which route was captured?' }, { status: 400 });

  const captures: Record<ViewId, CapturedNode[]> = {
    desktop: sane(body.desktop),
    mobile: sane(body.mobile),
  };
  const which = body.which ?? 'both';
  const stateKey = typeof body.stateKey === 'string' ? body.stateKey : '';

  const targets: Array<{ kind: 'active' | 'default'; doc: DesignDocument }> = [];
  if (which === 'active' || which === 'both') {
    // `resolveActive` has no notion of a state yet, so it is only asked about the route as a
    // whole. Asking it for a tab would silently answer with the ROUTE's active design and label
    // the report as being about the tab — the same class of lie `defaultFor` was just fixed for,
    // and worse, because it would produce a plausible score rather than an empty one.
    if (!stateKey) {
      const resolved = await resolveActive(body.route);
      // Falls back to the default when nothing is active — correct for showing a page, wrong
      // here, where "compared against the active design" would then be a lie about which design
      // was measured.
      if (resolved.kind === 'active' && resolved.doc) targets.push({ kind: 'active', doc: resolved.doc });
    }
  }
  if (which === 'default' || which === 'both') {
    const doc = await defaultFor(body.route, stateKey);
    if (doc) targets.push({ kind: 'default', doc });
  }

  if (targets.length === 0) {
    return NextResponse.json({
      route: body.route,
      reports: [],
      stateKey,
      note: which === 'active'
        ? 'No design is the record for this page yet, so there is nothing to compare the page with.'
        : `This page has no default traced${stateKey ? ` for the "${stateKey}" tab` : ''} yet.`,
    });
  }

  const reports: Array<{ kind: string; report: ConformanceReport; verdict?: { ok: boolean; why: string } }> = [];
  for (const target of targets) {
    for (const view of ['desktop', 'mobile'] as ViewId[]) {
      if (!captures[view].length) continue;
      const report = conformanceOf(target.doc, view, captures[view], ENTRIES);
      reports.push({
        kind: target.kind,
        report,
        // Only a default gets a pass/fail: it is the one making a factual claim. An active design
        // differing from the page is the normal state of a proposal, and scoring it as a failure
        // would make every unbuilt improvement look like a defect.
        verdict: target.kind === 'default' ? traceIsFaithful(report) : undefined,
      });
    }
  }

  return NextResponse.json({ route: body.route, reports });
});
