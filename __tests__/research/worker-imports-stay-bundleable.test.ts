// __tests__/research/worker-imports-stay-bundleable.test.ts
//
// Plan S-9b — a worker module imported by the Next app must not drag the pipeline in behind it.
//
// The app legitimately shares code with the worker: closure tolerances, survey units, bearing
// rotation, OCR legibility. Those are pure, so webpack bundles them without complaint.
//
// `pipeline.ts` is not. It imports the clerk scrapers, the Playwright adapters and the AI extractors
// — the whole worker. Any app file that reaches it, however indirectly, fails the production build
// with `Module parse failed: Unexpected character` on a file nobody wrote by hand.
//
// **This is worth a test because the ordinary checks do not see it.** `tsc` resolves the types
// happily. The worker's 1,497 tests pass. `next dev` serves the route. It fails only in
// `npm run build`, which is the step most likely to be skipped, and the error names a transitive
// file rather than the import that caused it — so the cost lands on whoever runs the build next,
// with no obvious link back to the line that did it.
//
// It cost three build cycles when `app/api/admin/research/vendor-accounts/route.ts` imported
// `decideTopup` from `vendor-accounts.ts`. Making that import lazy did NOT fix it: webpack still
// walks a dynamic import when building the graph. The fix was to give the pure rules their own
// import-free home (`vendor-accounts-policy.ts`) — which is the shape every entry below already has.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const REPO = join(__dirname, '..', '..');

/** Modules whose import graph must never be pulled into the app bundle.
 *
 *  Matched as a whole path ending, not a substring: `services/pipeline` as a substring also catches
 *  `pipeline-version-store` and `pipeline-diff-engine`, which the app imports today and which build
 *  perfectly well. A guard that flags working code gets switched off. */
const FORBIDDEN = ['worker/src/services/pipeline.ts'];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

/** Every `@/worker/...` specifier an app-side file imports. */
function workerImports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/from\s+'(@\/worker\/[^']+)'/g)].map((m) => m[1]);
}

/** Resolve a worker specifier or relative import to a file on disk. */
function resolveModule(spec: string, fromFile: string): string | null {
  const base = spec.startsWith('@/worker/')
    ? join(REPO, spec.slice(2))
    : resolve(dirname(fromFile), spec.replace(/\.js$/, ''));
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

/** Walk a worker module's own imports, depth-first, collecting the path taken to any forbidden one.
 *
 *  Dynamic `await import()` is followed too, deliberately — webpack does, which is exactly the
 *  lesson that made this file necessary. */
function pathToForbidden(file: string, seen = new Set<string>(), trail: string[] = []): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);

  const rel = file.replace(REPO, '').replace(/\\/g, '/').replace(/^\//, '');
  const here = [...trail, rel];
  if (FORBIDDEN.some((f) => rel === f || rel.endsWith(`/${f}`))) return here;

  const src = readFileSync(file, 'utf8');
  const specs = [
    ...[...src.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/import\s*\(\s*'(\.[^']+)'\s*\)/g)].map((m) => m[1]),
  ];
  for (const s of specs) {
    const next = resolveModule(s, file);
    if (!next) continue;
    const found = pathToForbidden(next, seen, here);
    if (found) return found;
  }
  return null;
}

describe('worker modules imported by the app stay bundleable', () => {
  const appFiles = [...walk(join(REPO, 'app')), ...walk(join(REPO, 'lib'))];
  const edges = appFiles.flatMap((f) => workerImports(f).map((spec) => ({ file: f, spec })));

  it('finds the app→worker imports at all', () => {
    // Without this, a broken scan reports "no violations" forever. There are ~18 such imports today.
    expect(edges.length).toBeGreaterThan(8);
  });

  it('can still resolve the modules it checks', () => {
    // A specifier that silently fails to resolve is skipped by the walker below, so a rename could
    // quietly empty this test out.
    const unresolved = edges
      .map((e) => ({ ...e, target: resolveModule(e.spec, e.file) }))
      .filter((e) => e.target === null)
      .map((e) => e.spec);
    expect(unresolved, 'update resolveModule() — these specifiers no longer point at a file').toEqual([]);
  });

  it('none of them reaches services/pipeline', () => {
    const violations: string[] = [];
    for (const { file, spec } of edges) {
      const target = resolveModule(spec, file);
      if (!target) continue;
      const trail = pathToForbidden(target);
      if (trail) {
        const appRel = file.replace(REPO, '').replace(/\\/g, '/').replace(/^\//, '');
        violations.push(`${appRel}\n      imports ${spec}\n      which reaches ${trail.join('\n        → ')}`);
      }
    }
    expect(
      violations,
      violations.length
        ? `These app files pull the whole worker into the Next bundle. The production build will ` +
          `fail with "Module parse failed" naming a file none of them mention:\n\n  ` +
          violations.join('\n\n  ') +
          `\n\nSplit the pure part into its own import-free module and import THAT — see ` +
          `worker/src/services/vendor-accounts-policy.ts. Making the import lazy does not work; ` +
          `webpack walks dynamic imports too.`
        : undefined,
    ).toEqual([]);
  });
});
