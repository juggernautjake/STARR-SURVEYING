// __tests__/every-import-is-declared.test.ts
//
// Every package our own code imports must be in `package.json`.
//
// ── WHY, WITH THE INCIDENT THAT PROMPTED IT ─────────────────────────────────────────────────────
//
// `pg` was imported by `scripts/apply-seeds.mjs` — the tool that applies database seeds — and by four
// audit scripts, and it was **not declared anywhere.** It sat in `node_modules` because something
// else pulled it in transitively, and it worked perfectly for months.
//
// Then `npm i web-push` ran, npm pruned what nothing declared, and the seed runner stopped working.
// Nothing in the install output mentioned it. It surfaced as `ERR_MODULE_NOT_FOUND` in seven schema
// tests — and only because those tests **execute the script** rather than reading it.
//
// That is the shape worth guarding: **an undeclared dependency works right up until any install
// command runs**, and then the failure lands on whatever unrelated thing happens to be next. The
// gap between cause and symptom is what makes it expensive.
//
// ── WHAT IT DOES NOT SCAN, AND WHY ──────────────────────────────────────────────────────────────
//
// `__tests__` is excluded. The first version of this scan reported `three` as undeclared, from
// `map-3d-reachability.test.ts` — where the string `import … from "three"` appears **inside test
// fixtures**, because that test checks a detector for exactly that pattern in HTML files. A guard
// that reads a detector's own examples as real imports is the fifth flavour of "prose read as code"
// found in this repo today, and excluding test fixtures is cheaper than parsing around them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { codeOf } from './_helpers/source';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
]);

/** Node built-ins, which are never declared. `node:`-prefixed forms are filtered separately. */
const BUILTINS = new Set([
  'fs', 'path', 'url', 'os', 'crypto', 'http', 'https', 'child_process', 'util', 'stream', 'zlib',
  'events', 'buffer', 'assert', 'readline', 'worker_threads', 'perf_hooks', 'net', 'tls', 'dns',
  'vm', 'timers', 'string_decoder', 'querystring', 'module', 'process', 'punycode', 'tty',
]);

/**
 * Imports that are allowed to be undeclared, each with the reason.
 *
 * An exception without a reason is the defect wearing a permission slip — the same rule the AI-spend
 * and reachability inventories carry.
 */
const ALLOWED_UNDECLARED: Record<string, string> = {
  'playwright-core':
    'Deliberate fallback: every call site is `import("playwright").catch(() => import("playwright-core"))`. ' +
    '`playwright` IS a runtime dependency; the core package is the serverless path where the bundled ' +
    'browser is absent, and the .catch means its absence degrades rather than throws.',
};

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git', '.claude', 'dist'].includes(e.name)) walk(p, out);
    } else if (/\.(m?[jt]sx?|cjs)$/.test(p)) out.push(p);
  }
  return out;
}

/** Our own shipped code and tooling. See the header for why `__tests__` is out. */
const files = [...walk('app'), ...walk('lib'), ...walk('scripts')];

/** The package name a specifier resolves to, or null if it is local/builtin. */
function packageOf(spec: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('node:')) return null;
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (BUILTINS.has(name)) return null;
  return name;
}

/**
 * Every bare specifier a file imports.
 *
 * The static-import pattern is **line-scoped on purpose**. The first version used
 * `(?:[\s\S]*?from\s*)?`, which let a match run from an `import` line across the rest of the file to
 * any later `from` and capture whatever quotes came next — on `finances/overview/page.tsx` it
 * returned a chunk of JSX as a package name. A multi-line import list is still matched, because the
 * `[^;]` class spans newlines while a `;` ends it.
 *
 * Caught by this guard failing on its own first run with an empty-string package, which is the
 * cheapest possible place to find a bad regex.
 */
function importsIn(src: string): string[] {
  const code = codeOf(src);
  return [
    ...[...code.matchAll(/^[ \t]*import\s+(?:[^;'"]*?from\s*)?['"]([^'"\n]+)['"]/gm)].map((m) => m[1]),
    ...[...code.matchAll(/require\(\s*['"]([^'"\n]+)['"]\s*\)/g)].map((m) => m[1]),
    ...[...code.matchAll(/import\(\s*['"]([^'"\n]+)['"]\s*\)/g)].map((m) => m[1]),
  ];
}

describe('every imported package is declared', () => {
  it('the sweep is looking at something', () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(declared.size).toBeGreaterThan(50);
  });

  it('finds imports it can resolve, so the predicate is not vacuously true', () => {
    // Without this, a broken specifier regex would report zero offenders forever — the same failure
    // mode as a negative control that changes nothing.
    const seen = new Set<string>();
    for (const f of files.slice(0, 400)) {
      for (const s of importsIn(fs.readFileSync(f, 'utf8'))) {
        const p = packageOf(s);
        if (p && declared.has(p)) seen.add(p);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('has no undeclared package import', () => {
    const offenders = new Map<string, string[]>();
    for (const f of files) {
      for (const s of importsIn(fs.readFileSync(f, 'utf8'))) {
        const name = packageOf(s);
        if (!name || declared.has(name) || name in ALLOWED_UNDECLARED) continue;
        if (!offenders.has(name)) offenders.set(name, []);
        const where = offenders.get(name)!;
        if (where.length < 3) where.push(path.relative(process.cwd(), f));
      }
    }
    const lines = [...offenders].map(([n, w]) => `${n}  ←  ${w.join(', ')}`);
    expect(
      lines,
      'These packages are imported by our code and declared nowhere in package.json. They work only ' +
        'while something else happens to pull them in — and the next `npm install` can prune them, ' +
        'with the failure landing on whatever unrelated thing runs next. That is exactly how `pg` ' +
        `disappeared from the seed runner:\n  ${lines.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every allowed exception carries a reason', () => {
    const empty = Object.entries(ALLOWED_UNDECLARED).filter(([, why]) => why.trim().length < 30);
    expect(empty.map(([n]) => n), 'An exception without a reason is the defect wearing a permission slip')
      .toEqual([]);
  });

  it('the seed runner’s own dependency is declared, since that is the one that broke', () => {
    expect(declared.has('pg'), 'scripts/apply-seeds.mjs imports pg').toBe(true);
  });
});
