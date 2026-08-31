// __tests__/research/api-routes-are-reachable.test.ts
//
// Every research API route has a caller, or is listed here with a reason.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// The module-level version of this check (`worker/src/__tests__/research-modules-are-reachable.test.ts`)
// lists ELEVEN cases of work that was designed, tested and written up as done with nothing calling
// it. The eleventh was found on 2026-08-31: `BoundaryCallsPanel.tsx` was the only caller of
// `/boundary-calls` and `/browser-fetch`, and nothing mounted it — so two working endpoints could
// not be reached from the product at all.
//
// That is a different failure from an orphaned module, and worse. An unused module costs disk. An
// unreachable ROUTE is a capability the firm paid to build, that answers correctly when asked, and
// that nothing in the product ever asks. It typechecks, it builds, its own tests pass, and the
// symptom is silence.
//
// So this checks the API surface the way the other file checks the module surface.
//
// ── AN ALLOWLIST, NOT A BAN ─────────────────────────────────────────────────────────────────────
//
// Some routes legitimately have no in-repo caller: an operator hits them by hand, a proxy exists for
// a capability that also reaches the user another way, or a feature is parked. A check that failed
// on all of those would be noise, and noisy checks get skipped.
//
// The rule is the same as the module guard's: unreachable is allowed, but it must be a RECORDED
// DECISION with a reason. The list below is a standing inventory of what was built and never
// connected — which is the only artefact that has ever made this defect visible.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const API_ROOT = 'app/api/admin/research';

/**
 * Where a caller could live.
 *
 * `app/api` is excluded: one route calling another is not the product reaching it.
 *
 * **`worker/src` is excluded too, and that took a false positive to notice.** The worker serves its
 * OWN routes under `/research/…` — `/research/flood-zone`, `/research/access/platforms` — whose last
 * segments are identical to the app routes that proxy them. Including the worker made every such
 * proxy look called, by itself, through its own mirror image. The one genuine worker-to-app call is
 * `/api/admin/research/requests/claim`, listed in KNOWN_UNCALLED with that as its reason.
 */
const CALLER_DIRS = ['app', 'lib', 'scripts'];

const KNOWN_UNCALLED: Record<string, string> = {
  // ── CALLED, BUT NOT FROM THIS HALF OF THE REPOSITORY ─────────────────────────────
  '/api/admin/research/requests/claim':
    'CALLED BY THE WORKER, not by the UI. worker/src/infra/queue-client.ts fetches this to claim queued research requests; the worker is excluded from CALLER_DIRS because its own /research/* route names collide with the app routes that proxy them. Reachable and in daily use.',
  '/api/admin/research/requests':
    'The collection endpoint behind requests/claim, same queue. Written for the worker and for operators inspecting the queue by hand; no UI lists it yet, which is a gap worth closing but not a broken feature — the queue itself is working.',

  // ── OPERATOR-TRIGGERED, BY DESIGN ─────────────────────────────────────────────
  '/api/admin/research/self-heal/evaluate':
    'Admin-triggered by hand, and its own module says so (lib/research/self-heal-apply-runner.ts). SelfHealTab wires the other three — /sweep, /proposals, /settings — so the tab is not broken; evaluate is the deliberate manual step between proposing a fix and applying it. Worth a button eventually; not a dead feature.',

  // ── DEAD CAPABILITY — OWNER CALLS ───────────────────────────────────────────
  '/api/admin/research/templates/drawing/[id]/thumbnail':
    'Part of the TemplateManager family. That component is the only caller of the templates API and is itself mounted by nothing (recorded in the module guard) — so this route is unreachable for the same reason and is resolved by the same decision.',
  '/api/admin/research/[projectId]/drawings/[drawingId]/elements':
    'GET/PATCH for individual drawing elements. The CAD editor works on drawings through its own state and save path, so nothing needs this today; it reads as an API built for an editing UI that took a different shape. Retire it or point the editor at it — two write paths to the same elements is how they drift.',
  '/api/admin/research/[projectId]/topo':
    'Phase 13 USGS topographic proxy, no caller and no equivalent — topo data does not reach the user by any other route, unlike flood zone which the pipeline delivers. Genuinely unreachable capability. OWNER CALL: it needs a home on the boundary or drawing surface.',
  '/api/admin/research/[projectId]/verify-lot':
    'Parcel-level lot verification pipeline with no caller. Note lib/research/county-support.ts already documents a related defect here — its 400 was written as a coverage statement — which means this route has been read and reasoned about while still being unreachable. OWNER CALL.',

  '/api/admin/research/county-config':
    'The API half of a PARKED feature. worker/src/infra/county-config-registry.ts is already listed '
    + 'as unreachable in the module guard, with the note that research_site_adapters (resolveAdapter) '
    + 'already serves this purpose from the database and one of the two should be retired. Wiring '
    + 'this route would commit to the wrong one of those two.',

  '/api/admin/research/document-access':
    'DEAD CAPABILITY — owner call. Phase 14 document-access tier management; proxies the worker\'s '
    + '/research/access/platforms. Nothing reaches it, so which paid platforms serve a county cannot '
    + 'be seen anywhere in the product. Note the POLICY half IS reachable and separate: '
    + 'lib/research/paid-documents.ts (may this run buy, and if not why not) is called by the analyze '
    + 'route and surfaces in ResearchAnalysisPanel. This is the AVAILABILITY half.',

  '/api/admin/research/[projectId]/deep-lot-analysis':
    'DEAD CAPABILITY — owner call. A master orchestrator for deep lot/parcel analysis with no caller '
    + 'and no equivalent elsewhere: nothing else in the worker or the app orchestrates this, so it is '
    + 'genuinely unreachable rather than duplicated. Needs a home before it is worth anything.',

  '/api/admin/research/[projectId]/bell-cad-gis':
    'REDUNDANT, not lost. Bell CAD ArcGIS queries also happen app-side through '
    + 'lib/research/arcgis-fields.ts, which gis-progressive-zoom, parcel-map-capture and '
    + 'progressive-zoom all import. This route is a second path to the same data. Retire it or route '
    + 'those services through it — but only one should exist.',

  '/api/admin/research/[projectId]/flood-zone':
    'REDUNDANT, not lost. FEMA flood zone already reaches the user: the worker computes it during a '
    + 'run and it lands in the results (worker/src/index.ts logs "FEMA Flood Zone" and the value is '
    + 'carried on easementsAndEncumbrances.fema). This route is an unused proxy for a capability the '
    + 'pipeline already delivers, so nobody is missing anything today.',
};

function routeFiles(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) routeFiles(rel, out);
    else if (e.name === 'route.ts') out.push(rel);
  }
  return out;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      // A route calling a sibling route is not the product reaching it.
      if (rel.startsWith('app/api')) continue;
      sourceFiles(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) {
      out.push(rel);
    }
  }
  return out;
}

/** `app/api/admin/research/x/[id]/y/route.ts` → `/api/admin/research/x/[id]/y` */
const urlOf = (file: string) => file.replace(/^app\/api/, '/api').replace(/\/route\.ts$/, '');

/** The last segment that is not a dynamic `[param]` — what a caller must mention. */
function tailSegment(url: string): string {
  const segs = url.split('/').filter(Boolean).filter((s) => !s.startsWith('['));
  return segs[segs.length - 1];
}

const routes = routeFiles(API_ROOT);
const sources = CALLER_DIRS.flatMap((d) => sourceFiles(d));
const haystack = sources.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

/**
 * Does anything outside `app/api` reach this route?
 *
 * ── A TAIL MATCH ALONE IS NOT ENOUGH ────────────────────────────────────────────────────────────
 *
 * The first version asked only whether the last static segment appeared. It reported
 * `/templates/analysis` and `/templates/drawing/[id]/thumbnail` as uncalled, and they are not:
 * `TemplateManager.tsx` fetches `/api/admin/research/templates/${type}`, where `type` is
 * `'analysis' | 'drawing'`. The segment never appears as a literal anywhere, because it is a
 * variable.
 *
 * That is a false POSITIVE for the defect — the worst direction for this check, because it invites
 * someone to "fix" a route that already works, or to add a permanent exception for a lie.
 *
 * So a route also counts as called when its PARENT path appears with a template hole after it.
 */
function isCalled(url: string): boolean {
  const tail = tailSegment(url);
  const literal = [`/${tail}\``, `/${tail}'`, `/${tail}"`, `/${tail}?`, `/${tail}/`]
    .some((s) => haystack.includes(s));
  if (literal) return true;

  // `/templates/${type}` reaches `/templates/analysis`. Look for the parent with an interpolation.
  const segs = url.split('/').filter(Boolean);
  const tailAt = segs.lastIndexOf(tail);
  const parent = tailAt > 0 ? segs[tailAt - 1] : null;

  // `research` is the API root, so `/research/${projectId}/…` appears constantly and would make
  // EVERY top-level route look called — including the negative control, which is how this was
  // caught rather than shipped. The rule only means something for a genuine discriminator like
  // `templates`, one level down.
  const STRUCTURAL = new Set(['api', 'admin', 'research']);
  if (parent && !parent.startsWith('[') && !STRUCTURAL.has(parent)) {
    if (haystack.includes(`/${parent}/\${`)) return true;
  }
  return false;
}

describe('the check can see what it claims to', () => {
  // Without this, a broken matcher reports every route as called and this file passes for ever
  // while measuring nothing — the same failure as a search that cannot return a positive. The
  // module guard learned this the hard way the same day: reverting its `.tsx` filter made it pass
  // in silence.
  it('finds routes at all', () => {
    expect(routes.length, 'no research routes found — the path is wrong').toBeGreaterThan(50);
  });

  it('finds callers at all', () => {
    expect(sources.length).toBeGreaterThan(200);
    expect(haystack.length).toBeGreaterThan(100_000);
  });

  it('reports a route KNOWN to be called as called', () => {
    // PipelineTab fetches '/api/admin/research/batch'. If this ever reads false, the matcher is
    // broken and every "no caller" result below is meaningless.
    expect(isCalled('/api/admin/research/batch'), 'the matcher cannot detect a real caller').toBe(true);
  });

  it('reports a route known NOT to be called as uncalled', () => {
    // The other half of the control. A matcher that says "called" for everything would also pass
    // the assertion above.
    expect(isCalled('/api/admin/research/made-up-endpoint-that-does-not-exist')).toBe(false);
  });
});

describe('every research API route is reachable, or says why not', () => {
  it('has no route that nothing calls and nothing explains', () => {
    const uncalled = routes
      .map(urlOf)
      .filter((u) => !(u in KNOWN_UNCALLED))
      .filter((u) => !isCalled(u));

    expect(
      uncalled,
      uncalled.length
        ? 'These routes answer correctly and nothing in the product ever asks them. That is a '
          + 'capability the firm paid to build and cannot use. Either give it a caller, or add it to '
          + `KNOWN_UNCALLED with the reason:\n  ${uncalled.join('\n  ')}`
        : '',
    ).toEqual([]);
  });

  it('has no stale entry — something on the list that is now wired', () => {
    const stale = Object.keys(KNOWN_UNCALLED).filter((u) => isCalled(u));
    expect(
      stale,
      stale.length ? `These are now called — remove them from KNOWN_UNCALLED:\n  ${stale.join('\n  ')}` : '',
    ).toEqual([]);
  });

  it('has no entry for a route that no longer exists', () => {
    const urls = new Set(routes.map(urlOf));
    const gone = Object.keys(KNOWN_UNCALLED).filter((u) => !urls.has(u));
    expect(gone, gone.length ? `Deleted routes still listed:\n  ${gone.join('\n  ')}` : '').toEqual([]);
  });

  it('gives every exception an actual reason', () => {
    // "unused" is not a reason. An exception without one is the defect wearing a permission slip —
    // borrowed verbatim from the module guard, which had to learn it.
    const thin = Object.entries(KNOWN_UNCALLED).filter(([, why]) => why.trim().length < 60).map(([u]) => u);
    expect(thin).toEqual([]);
  });
});
