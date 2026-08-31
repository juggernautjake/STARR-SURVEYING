// worker/src/__tests__/dependencies-are-declared.test.ts
//
// ── THE BUG THIS GENERALISES ────────────────────────────────────────────────────────────────────
//
// `worker/src/websocket/progress-server.ts` imported `ws`, and `worker/package.json` never declared
// it. It resolved anyway — 8.19.0 arrived transitively through another package — so nothing failed
// locally, in CI, or on the box. It would have failed on a clean install the day that transitive
// path changed, with an error pointing at a file nobody had touched.
//
// This was noticed three times and deferred three times, each with a good reason at the time: not
// in a security fix, not in a data-repair commit, not in a performance pass. Deferring is fine;
// deferring without a guard is how the fourth person rediscovers it.
//
// A package that resolves today because something ELSE depends on it is not a dependency you have.
// It is a dependency you are borrowing, from a lender who has not agreed to keep lending.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const WORKER_ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(WORKER_ROOT, 'src');

const pkg = JSON.parse(fs.readFileSync(path.join(WORKER_ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

const builtins = new Set(builtinModules);

/** Every .ts under src, tests included — a test's imports need declaring too. */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') sources(p, out);
    } else if (e.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** The package name a bare specifier belongs to: `@scope/pkg/sub` → `@scope/pkg`, `a/b` → `a`. */
function packageOf(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

function isBuiltin(spec: string): boolean {
  const bare = spec.startsWith('node:') ? spec.slice(5) : spec;
  return builtins.has(bare) || builtins.has(bare.split('/')[0]!);
}

const FILES = sources(SRC);

/** Bare specifiers imported anywhere under src, mapped to the file that imports them. */
function importedPackages(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8')
      .split('\r\n').join('\n')
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

    // ANCHORED TO THE START OF A LINE, because an import is a statement and prose is not.
    //
    // The first version used `\bfrom\s+['"]…['"]` anywhere in the file and dutifully reported two
    // undeclared packages named "we have not found it" and "we would not" — English sentences
    // inside comments that happened to contain the word `from` before a quoted phrase. Stripping
    // comments harder is the wrong fix: the real signal is that imports occupy column zero.
    const specs = [
      ...[...src.matchAll(/^(?:import|export)\s[^'"\n]*\sfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!),
      ...[...src.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!),
      // Dynamic imports are legitimately mid-line — `await import('playwright')`.
      ...[...src.matchAll(/\bawait import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]!),
    ];

    for (const spec of specs) {
      if (spec.startsWith('.') || spec.startsWith('/')) continue;  // relative
      if (isBuiltin(spec)) continue;
      const name = packageOf(spec);
      if (!found.has(name)) found.set(name, path.relative(WORKER_ROOT, file).replace(/\\/g, '/'));
    }
  }
  return found;
}

describe('every package the worker imports is declared in its package.json', () => {
  it('finds a plausible number of sources and imports — a broken scan passes everything', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(importedPackages().size).toBeGreaterThan(5);
  });

  it('declares `ws` — the instance this guard was written for', () => {
    // It resolved transitively at 8.19.0 for months while being declared nowhere.
    expect(declared.has('ws')).toBe(true);
  });

  it('has no undeclared package', () => {
    const undeclaredList = [...importedPackages().entries()]
      .filter(([name]) => !declared.has(name))
      .map(([name, file]) => `${name}  (imported by ${file})`)
      .sort();

    expect(
      undeclaredList,
      'These resolve today only because something else depends on them. That is a dependency you '
        + 'are borrowing, from a lender who has not agreed to keep lending — a clean install, or a '
        + 'change in the lender\'s own deps, breaks the worker with an error pointing at a file '
        + `nobody touched:\n  ${undeclaredList.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the scan really does see a package it would flag if undeclared', () => {
    // Control. If the regexes silently matched nothing, the assertion above would pass on an empty
    // list and prove nothing at all.
    const seen = importedPackages();
    expect(seen.has('playwright') || seen.has('ws') || seen.has('vitest')).toBe(true);
  });
});
