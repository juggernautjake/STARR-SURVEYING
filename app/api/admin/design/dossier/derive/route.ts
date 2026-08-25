// app/api/admin/design/dossier/derive/route.ts — the measured half of a dossier.
//
//   POST /api/admin/design/dossier/derive { observation, base? } → { dossier, checklist }
//
// Phase D1 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// ── WHY THE SHAPING IS HERE AND THE WALKING IS IN A SCRIPT ──────────────────────────────────────
//
// Same seam as the importer: `scripts/derive-dossiers.mjs` is a `.mjs` file driving Playwright and
// cannot import the TypeScript catalogue, so it does the part only a browser can do — visit the
// route, watch the network, read the DOM — and posts the raw observation here. Deciding what those
// nodes MEAN happens in `lib/design/dossier.ts`, which is pure, tested, and the only place that
// needs to change when the inference gets smarter.
//
// Writing the derived half also regenerates the checklist, because a checklist generated from a
// stale inventory is worse than none: it asks for elements the page no longer has and stays quiet
// about the ones it grew.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { saveDerived } from '@/lib/design/dossier-server';
import type { RouteObservation } from '@/lib/design/dossier';

/** An observation is a lot of untrusted shape. Anything malformed is dropped rather than stored. */
function sane(raw: unknown): RouteObservation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<RouteObservation>;
  if (typeof o.route !== 'string' || !o.route.startsWith('/')) return null;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    route: o.route,
    title: typeof o.title === 'string' ? o.title : '',
    headings: arr<string>(o.headings).filter((h) => typeof h === 'string').slice(0, 40),
    controls: arr<RouteObservation['controls'][number]>(o.controls)
      .filter((c) => c && typeof c.tag === 'string' && Array.isArray(c.classes)).slice(0, 400),
    regions: arr<RouteObservation['regions'][number]>(o.regions)
      .filter((r) => r && typeof r.tag === 'string' && Array.isArray(r.classes)).slice(0, 200),
    requests: arr<RouteObservation['requests'][number]>(o.requests)
      .filter((r) => r && typeof r.method === 'string' && typeof r.path === 'string').slice(0, 200),
    // V2. Validated like everything else rather than passed through: `kind` and `addressable` are
    // small closed sets and a row with a bad one would be stored forever.
    //
    // This allowlist is why the first run of V2 recorded ZERO states while the deriver reported
    // success on every page — the walk found them, the type carried them, the column existed, and
    // `sane()` quietly dropped them on the way past. Third time this session that a field added at
    // one end of a pipeline and not the other produced an empty that looked like a legitimate one.
    states: arr<RouteObservation['states'] extends (infer U)[] | undefined ? U : never>(o.states)
      .filter((st) => st && typeof st.key === 'string' && st.key.length > 0
        && (st.kind === 'tab' || st.kind === 'disclosure')
        && (st.addressable === 'yes' || st.addressable === 'unknown'))
      .slice(0, 24),
    stateParam: typeof o.stateParam === 'string' ? o.stateParam : null,
    problem: typeof o.problem === 'string' ? o.problem : null,
  };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDeveloper(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null) as { observation?: unknown; base?: string } | null;
  const observation = sane(body?.observation);
  if (!observation) return NextResponse.json({ error: 'That observation has no route in it.' }, { status: 400 });

  // A walk that hit an error page or a redirect must not become the page's inventory. Refused
  // loudly rather than stored with a caveat nobody reads.
  if (observation.problem) {
    return NextResponse.json(
      { error: `Not stored — the walk could not trust what it saw: ${observation.problem}` },
      { status: 422 },
    );
  }

  const result = await saveDerived(observation, {
    base: body?.base ?? null,
    now: new Date().toISOString(),
  });
  return NextResponse.json(result);
});
