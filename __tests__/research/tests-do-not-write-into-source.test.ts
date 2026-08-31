// __tests__/research/tests-do-not-write-into-source.test.ts
//
// ── A TEST THAT WRITES INTO A SCANNED SOURCE TREE BREAKS AN UNRELATED TEST ──────────────────────
//
// Nine self-checks in `writes-hit-real-columns.test.ts` used to write a temporary `.ts` file into
// `lib/research/`, run a scanner over it, and delete it in a `finally`. Each one passed on its own
// and passed when its file was run alone.
//
// Vitest runs test FILES in parallel worker threads. `__tests__/saas/starr-assumptions.test.ts`
// walks `lib/` in a different thread, and it caught one of those probes between the `readdirSync`
// that listed it and the `readFileSync` that opened it:
//
//     Error: ENOENT: no such file or directory, open 'lib/research/__filter_probe_jsonb__.ts'
//       ❯ scan scripts/audit-starr-assumptions.mjs:231
//
// The failure names a file in a suite that has nothing to do with the one at fault, appears only in
// the whole-suite run, and does not reproduce on a rerun. That cost more to diagnose than the
// probes were worth; they now pass their source in memory instead.
//
// This check is the general form: no test may create a file inside a directory the repository's own
// scanners walk. It is cheap and it fails loudly, which is the opposite of what it replaces.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Trees that scanners, audits and ratchets walk. A stray file here is visible to another thread. */
const SCANNED = ['lib', 'app', 'components', 'worker/src', 'types', 'scripts'];

function testFiles(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) testFiles(rel, out);
    else if (/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

const FILES = testFiles('__tests__');

describe('the scan can see the tests it is meant to check', () => {
  it('finds a plausible number of test files', () => {
    // Control. An empty list agrees with every rule below, which is how a check like this passes
    // while enforcing nothing.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('and includes the file that motivated this one', () => {
    expect(FILES).toContain('__tests__/research/writes-hit-real-columns.test.ts');
  });
});

const WRITE = /\b(writeFileSync|appendFileSync|mkdirSync|copyFileSync|writeFile|rmSync|unlinkSync)\s*\(\s*([A-Za-z_$][\w$]*)/g;
const JOINED = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*path\.join\(\s*(?:ROOT|process\.cwd\(\))\s*,\s*['"`]([^'"`]+)['"`]/g;

/** Every path a test file both BUILDS from the repo root and hands to a write call. */
function writeTargets(src: string): string[] {
  // Resolving the variable is the whole point. Matching any path literal in a file that happens to
  // also contain a write reported `worker-endpoint-contract.test.ts → 'worker/src/index.ts'` — a
  // path that file only ever READS. The finding was real but the evidence named the wrong line,
  // which is the kind of report that sends somebody to change working code.
  const built = new Map<string, string>();
  for (const m of src.matchAll(JOINED)) built.set(m[1], m[2]);

  const targets: string[] = [];
  for (const m of src.matchAll(WRITE)) {
    const p = built.get(m[2]);
    if (p) targets.push(p);
  }
  // A literal passed straight to the write, with no variable in between.
  for (const m of src.matchAll(/\b(?:writeFileSync|appendFileSync|copyFileSync)\s*\(\s*path\.join\(\s*(?:ROOT|process\.cwd\(\))\s*,\s*['"`]([^'"`]+)['"`]/g)) {
    targets.push(m[1]);
  }
  return targets;
}

describe('the target extractor works', () => {
  it('resolves a path built from ROOT and then written', () => {
    const sample = [
      "const tmp = path.join(ROOT, 'lib/research/__probe__.ts');",
      'fs.writeFileSync(tmp, code);',
    ].join('\n');
    expect(writeTargets(sample)).toEqual(['lib/research/__probe__.ts']);
  });

  it('does NOT report a path that is only read', () => {
    // The false positive that made the first version of this check misleading.
    const sample = [
      "const idx = fs.readFileSync(path.join(ROOT, 'worker/src/index.ts'), 'utf8');",
      "const out = path.join(ROOT, 'tmp/scratch.txt');",
      'fs.writeFileSync(out, idx);',
    ].join('\n');
    expect(writeTargets(sample)).toEqual(['tmp/scratch.txt']);
  });
});

describe('no test writes a file into a scanned source tree', () => {
  it.each(SCANNED)('nothing writes into %s/', (tree) => {
    const offenders: string[] = [];

    for (const rel of FILES) {
      // This file's own samples above are source TEXT inside string literals, not writes. The
      // extractor reads raw text and cannot tell the difference, so it reports them. Skipping the
      // file is stated here rather than hidden, and the two tests above are what keep the extractor
      // honest in its place — they assert it resolves a real write and ignores a read-only path.
      if (rel.endsWith('tests-do-not-write-into-source.test.ts')) continue;

      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const target of writeTargets(src)) {
        if (target === tree || target.startsWith(tree + '/')) offenders.push(`${rel} → ${target}`);
      }
    }

    expect(
      offenders,
      `these tests create files inside ${tree}/, where another suite's scanner will race them:\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
