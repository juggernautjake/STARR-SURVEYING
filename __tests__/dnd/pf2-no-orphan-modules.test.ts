// __tests__/dnd/pf2-no-orphan-modules.test.ts — every PF2 module is actually REACHABLE.
//
// WHY THIS EXISTS. Twice during the PF2 buildout I wrote a module, tested it, and reported it
// shipped — while nothing outside its own test ever called it:
//   · `rules-gate.ts` shipped as a pure function no route invoked, so it enforced nothing.
//   · `bonuses.ts` shipped with rune resolution the sheet never consumed, so runes moved no numbers.
//
// Both had passing tests and zero effect. That is the worst failure shape available, because it
// LOOKS done — the module exists, the tests are green, the commit says shipped. A unit test proves
// behaviour in isolation; it does not prove the behaviour is reachable. This closes that gap.
//
// It is deliberately a REACHABILITY check, not a coverage check: it asks "does production code
// import this?", which is exactly the question I failed to ask twice.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PF2_DIR = 'lib/dnd/systems/pathfinder2e';

/** Every source file that could legitimately consume a PF2 module — production code only. Tests
 *  are excluded ON PURPOSE: a module imported solely by its own test is precisely the orphan this
 *  is hunting. */
function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (['node_modules', '.next', '.git', '__tests__'].includes(entry.name)) continue;
        walk(rel);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  walk('lib');
  walk('app');
  return out;
}

const FILES = productionFiles();
const SOURCES = new Map(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));

/** Does any production file OTHER than the module itself import it?
 *
 *  Relative specifiers are RESOLVED against the importing file rather than matched by basename.
 *  Basename matching seemed fine and was quietly wrong: three systems each own an `eligibility.ts`
 *  and a `rules-gate.ts`, so `lib/dnd/classes/levelup.ts` importing the 5e feats eligibility would
 *  have counted as an importer of PF2's. That is a guard that reports success it did not verify —
 *  the exact failure this whole file exists to prevent, one level up. */
function importersOf(moduleRel: string): string[] {
  const target = moduleRel.replace(/\.ts$/, '');
  const hits: string[] = [];
  for (const [file, src] of SOURCES) {
    if (file === moduleRel) continue;
    const fromDir = path.dirname(file);
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      const spec = m[1];
      const resolved = spec.startsWith('@/')
        ? spec.slice(2)
        : spec.startsWith('.')
          ? path.posix.normalize(path.posix.join(fromDir, spec))
          : null; // a bare package specifier — never one of ours
      if (resolved === target) { hits.push(file); break; }
    }
  }
  return hits;
}

const MODULES = fs.readdirSync(path.join(ROOT, PF2_DIR))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => `${PF2_DIR}/${f}`);

describe('no PF2 module is an orphan', () => {
  it('finds the modules to check', () => {
    // Guards the guard: a broken directory walk would make every assertion below vacuously pass.
    expect(MODULES.length).toBeGreaterThan(8);
    expect(FILES.length).toBeGreaterThan(100);
  });

  for (const mod of MODULES) {
    it(`${path.basename(mod)} is imported by production code`, () => {
      const importers = importersOf(mod);
      expect(
        importers.length,
        `${mod} is imported by NOTHING outside its own tests. A module nothing calls is ` +
        'indistinguishable from a module that does not exist — and worse, because it looks done. ' +
        'Either wire it up or delete it.',
      ).toBeGreaterThan(0);
    });
  }
});

describe('the data tranches reach the catalog', () => {
  // Same failure mode one level down: a tranche authored and never aggregated is invisible to
  // every picker, gate and library page, while its own tests pass.
  const DATA_DIR = `${PF2_DIR}/data`;
  const tranches = fs.readdirSync(path.join(ROOT, DATA_DIR))
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  const index = fs.readFileSync(path.join(ROOT, DATA_DIR, 'index.ts'), 'utf8');

  it('finds the tranches to check', () => {
    expect(tranches.length).toBeGreaterThan(4);
  });

  for (const t of tranches) {
    it(`${t} is aggregated by data/index.ts`, () => {
      const base = t.replace(/\.ts$/, '');
      expect(
        index.includes(`'./${base}'`),
        `data/${t} is not imported by data/index.ts, so nothing can reach its content.`,
      ).toBe(true);
    });
  }
});

describe('the gate is reachable from every PF2 write path', () => {
  // The specific bug that started this file: a gate exists but no route calls it. Asserted by
  // ROUTE rather than by module, because "something imports rules-gate" was already true while
  // two of the three routes ignored it.
  const WRITE_PATHS = [
    'app/api/dnd/characters/[id]/pf2-edit/route.ts',
    'app/api/dnd/characters/[id]/pf2-build/route.ts',
    'app/api/dnd/characters/[id]/ai-edit/route.ts',
  ];

  for (const p of WRITE_PATHS) {
    it(`${p.split('/').slice(-2)[0]} invokes a PF2 gate`, () => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(/gatePf2(Edit|Picks)\(/.test(src), `${p} writes PF2 content without gating it`).toBe(true);
    });
  }
});
