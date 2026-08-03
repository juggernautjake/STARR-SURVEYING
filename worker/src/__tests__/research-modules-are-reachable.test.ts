// Every research module has a caller, or is listed here with a reason.
//
// TEN times in this plan, work that was designed correctly, tested, and written up as DONE had no
// caller — and in three cases the planning doc's own prose asserted the fix was live:
//
//   S8   the legibility check       computed a verdict nobody read
//   S10  ALL NINE Phase I modules   monuments, curves, varas, closure, the drawing — an island
//   S11  bearing-rotation           the owner's named feature, no route and no button
//   R13  platform-choice            "the enforcement point", never asked
//   R14  the chain walk             wired, but its searches were never passed
//   R16  frameParcel                fixed the zoom-19 defect for nobody
//   R18  chooseTiles                the recommended grid, computed and discarded
//   S-11 research-modes             a mode picker that governed nothing
//
// The reason it keeps happening is that nothing can see it. A module's own unit tests pass exactly
// the same whether or not anything calls it, `tsc` is happy, and the production build is happy. It
// is invisible to every check this repo runs — so this is the check.
//
// ── WHY AN ALLOWLIST RATHER THAN A BAN ──────────────────────────────────────────────────────────
//
// Some modules genuinely have no importer and should not: entry points, scripts, and work that is
// deliberately parked. A test that failed on all of them would be noise, and noisy tests get
// skipped, which would leave this worse than before.
//
// So the rule is: unreachable is allowed, but it must be a RECORDED DECISION with a reason. Adding
// a name here is cheap and takes ten seconds; the point is that it cannot happen by accident, and
// the list is a standing inventory of what was built and never connected.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO = path.resolve(ROOT, '..');

/** Directories whose modules are library code and should be reachable.
 *
 *  `worker/src/lib` and `worker/src/infra` were missing from the first version of this list, and the
 *  omission hid a whole subsystem: the real-time progress channel's PUBLISHER lives in
 *  `worker/src/lib/research-events-emit.ts` and has no callers, which the check could not see. A
 *  guard is only as good as its coverage, and the directories it skips are exactly where the next
 *  orphan will be. */
const LIBRARY_DIRS = [
  'worker/src/services',
  'worker/src/research',
  'worker/src/chain-of-title',
  'worker/src/lib',
  'worker/src/infra',
  'lib/research',
];

/** Directories searched for callers. */
const CALLER_DIRS = ['worker/src', 'lib', 'app'];

/**
 * Modules with no importer, each with the reason it is allowed to have none.
 *
 * Anything NOT on this list must be imported by something that is not a test.
 */
const KNOWN_UNREACHABLE: Record<string, string> = {
  // Entry points and operational surfaces — called by a route, a script or a schedule, not imported.
  'lib/research/useResearchProgress.ts':
    'React hook for a UI that has not been built yet; kept because the event shape it decodes is the worker\'s.',
  'lib/research/white-label.config.ts':
    'Configuration for per-firm branding, read when white-labelling is turned on. Not code that runs.',

  // ── Found 2026-08-03 when this check was widened to worker/src/lib and worker/src/infra ──
  //
  // The first version of the list skipped those two directories, and the omission hid a whole
  // subsystem. Every entry below is a real gap; none is a false alarm.
  'worker/src/lib/research-events-emit.ts':
    'The real-time progress channel is built END TO END and connected at NEITHER end: this publisher has no callers and useResearchProgress has no consumer. It needs `npm run ws` deployed as a long-lived process, which Vercel cannot host — a deployment decision, not a coding gap. Until then the UI polls, which works.',
  'worker/src/lib/rate-limiter.ts':
    'PARKED: per-site concurrency and backoff limits (spec §18). The adapters currently pace themselves with ad-hoc waits. Real work — being rude to a county portal is how a firm gets blocked — but it belongs with a plan slice, since it changes the timing of every adapter at once.',
  'worker/src/infra/ai-guardrails.ts':
    'PARKED: validates AI-extracted bearings/distances/curves. Overlaps with survey-geometry parseBearing and curve-check, both of which ARE wired and refuse bad input at the point of use. Wiring a second validator needs a decision on which one is authoritative, or the two will disagree.',
  'worker/src/infra/county-config-registry.ts':
    'PARKED: operator-managed per-county portal overrides. The adapter registry in research_site_adapters (resolveAdapter) already serves this purpose from the database; one of the two should be retired rather than both wired.',

  // Built ahead of the surface that will use them. Each is a real decision, not an oversight.
  'lib/research/prioritized-pipeline.ts':
    'PARKED: the prioritised run order is specified but the pipeline still runs its fixed stages. Wiring it changes run behaviour and belongs with a plan slice, not a drive-by.',
  'lib/research/prioritized-pipeline.service.ts':
    'PARKED with prioritized-pipeline.ts, same reason.',
  'lib/research/self-heal-planner.ts':
    'PARKED: the self-healing adapter plan (RESEARCH_SOFTWARE_OPTIMIZATION Part II) has not been activated; the cron route drives the existing self-heal path.',
  'lib/research/multi-source-confidence.ts':
    'PARKED: cross-source agreement scoring, superseded in practice by the confidence-scoring engine. Needs a decision on which of the two is the model before either is wired.',
  'lib/research/document-segmentation.ts':
    'PARKED: multi-document PDF splitting. Real work, but it changes what a "document" is throughout the pipeline and cannot be a small slice.',
  'lib/research/spatial-filter.ts':
    'PARKED: geometry-based adjoiner filtering; the adjoiner path currently filters by county and owner.',
  'lib/research/place-county.ts':
    'PARKED: place-name to county resolution, pending the ambiguity decision (a place name can span counties).',
  'worker/src/services/usps-address-client.ts':
    'PARKED: USPS address standardisation needs a USPS API account, which is an owner decision.',
};

function listModules(dir: string): string[] {
  const abs = path.join(REPO, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith('.test.ts'))
    .map((f) => `${dir}/${f}`);
}

/** Every non-test source, read ONCE.
 *
 *  The first version of this test re-read the whole tree for each module — a few hundred files times
 *  a few dozen modules — and took ten seconds before timing out. A guard that is slow enough to be
 *  annoying is a guard somebody eventually skips, which would leave this worse than not having it. */
function allSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
        walk(p);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(p);
      }
    }
  };
  for (const d of CALLER_DIRS) walk(path.join(REPO, d));
  return out;
}

/** Is this module named in any non-test source file other than itself?
 *
 *  Matches the basename inside quotes, which covers `import … from './x.js'`, a dynamic
 *  `await import('./x.js')`, and a path string in a registry — all three are real ways this codebase
 *  reaches a module, and the earlier version of this sweep missed the last two and produced false
 *  accusations. */
function hasCaller(modulePath: string, sources: Array<{ abs: string; text: string }>): boolean {
  const base = path.basename(modulePath, '.ts');
  const selfAbs = path.join(REPO, modulePath);
  const pattern = new RegExp(`['"\`][^'"\`]*\\b${base.replace(/\./g, '\\.')}(\\.js)?['"\`]`);
  return sources.some((f) => f.abs !== selfAbs && pattern.test(f.text));
}

describe('every research module is reachable, or says why not', () => {
  const sources = allSourceFiles().map((abs) => ({ abs, text: fs.readFileSync(abs, 'utf8') }));
  const modules = LIBRARY_DIRS.flatMap(listModules);

  it('finds the modules and the sources at all', () => {
    // A sweep that silently matched nothing would pass forever and defend nothing.
    expect(modules.length).toBeGreaterThan(50);
    expect(sources.length).toBeGreaterThan(200);
  });

  it('has no unreachable module that is not a recorded decision', () => {
    const orphans = modules
      .filter((m) => !(m in KNOWN_UNREACHABLE))
      .filter((m) => !hasCaller(m, sources));

    expect(orphans, orphans.length
      ? `These modules have no non-test caller. Either wire them, or add them to KNOWN_UNREACHABLE ` +
        `with the reason:\n  ${orphans.join('\n  ')}`
      : '').toEqual([]);
  });

  it('has no stale entry — a module on the list that DID get wired', () => {
    // The list is an inventory, and an inventory nobody prunes stops being read. When something is
    // finally connected, its excuse should disappear with it.
    const stale = Object.keys(KNOWN_UNREACHABLE)
      .filter((m) => fs.existsSync(path.join(REPO, m)))
      .filter((m) => hasCaller(m, sources));

    expect(stale, stale.length
      ? `These are now wired — remove them from KNOWN_UNREACHABLE:\n  ${stale.join('\n  ')}`
      : '').toEqual([]);
  });

  it('has no entry for a module that no longer exists', () => {
    const gone = Object.keys(KNOWN_UNREACHABLE)
      .filter((m) => !fs.existsSync(path.join(REPO, m)));
    expect(gone, gone.length ? `Deleted modules still listed:\n  ${gone.join('\n  ')}` : '').toEqual([]);
  });

  it('gives every allowed exception an actual reason', () => {
    const empty = Object.entries(KNOWN_UNREACHABLE)
      .filter(([, why]) => why.trim().length < 30)
      .map(([m]) => m);
    expect(empty, 'An exception without a reason is the defect wearing a permission slip').toEqual([]);
  });
});
