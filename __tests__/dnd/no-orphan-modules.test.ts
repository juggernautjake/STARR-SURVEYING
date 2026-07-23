// __tests__/dnd/no-orphan-modules.test.ts — every lib/dnd module is REACHABLE, or says why not.
//
// Generalises the PF2-only guard to the whole subsystem, because the bug it catches is not
// PF2-specific. Twice during the PF2 buildout I wrote a module, tested it, and reported it shipped
// while nothing outside its own test ever called it (`rules-gate.ts` enforced nothing; `bonuses.ts`
// moved no numbers). Green tests, zero effect — the worst failure shape, because it looks done.
//
// Running it across lib/dnd immediately found three PRE-EXISTING orphans, documented in EXEMPT
// below. Two of them mean a shipped-looking feature has no way to be used at all.
//
// A unit test proves behaviour in isolation. This proves the behaviour is reachable.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * Modules that are legitimately not imported by app/lib code. Every entry needs a REASON — the
 * point of the list is that adding to it is a deliberate act, not a way to silence the guard.
 */
const EXEMPT: Record<string, string> = {
  'lib/dnd/statgen/pf2.ts':
    'PENDING WIRING (SG-2): the pure PF2 attribute-boost allocator (staged sets, per-slot restrictions, +4 ' +
    'partial rule, ancestry flaws) for the manual builder. Built ahead of its UI; wired by MB-3 (the PF2 ' +
    'manual builder upgrade), when this exemption is removed. Unit-tested in statgen-pf2.test.ts.',
  'lib/dnd/statgen/ig.ts':
    'PENDING WIRING (SG-3): the pure IG ability-boost allocator (start 10, eight +2 boosts, creation cap 14, ' +
    'ancestry adjustments). Built ahead of its UI; wired by MB-4 (the IG manual builder upgrade), when this ' +
    'exemption is removed. Unit-tested in statgen-ig.test.ts.',
  'lib/dnd/statgen/builder5e.ts':
    'PENDING WIRING (MB-2): the pure 5e manual-builder logic layer (racial/background increases, subclass + ' +
    'feat levels, picks validation) over the real catalogs. Built ahead of the 5e builder UI shell; wired ' +
    'when that shell lands, at which point this exemption is removed. Unit-tested in statgen-builder5e.test.ts.',
  'lib/dnd/theme-contrast.ts':
    'Build-time GUARDRAIL (TR-1): a pure WCAG-contrast module used by theme-contrast.test.ts to fail any ' +
    'theme whose text/border tokens fall below the legibility thresholds. It is deliberately consumed by ' +
    'the test, not runtime code — its whole job is to keep new themes honest without a browser.',
  'lib/dnd/ai-scope.ts':
    'Documentation-as-code: the authoritative statement of the AI permission boundary, asserted by ' +
    'its own tests and cited by comment in grant-content/route.ts. It is meant to be read, not called.',

  'lib/dnd/glossary/coverage.ts':
    'Documentation-as-code, same shape as ai-scope.ts above: it states what a tooltip can ask for in ' +
    'each of the four systems, computes whether an article exists for every one of those terms, and ' +
    'records the gaps this sweep chose to REPORT rather than invent text for (CX-12). Nothing at ' +
    'runtime consults it because nothing should — the sheet looks a term up through findTerm and ' +
    'handles a miss itself. Its consumer is glossary-coverage.test.ts, which fails the build when a ' +
    'term stops resolving; that is the whole point of the module, and a runtime caller would not ' +
    'make the claim any more true. If a UI ever wants to state coverage honestly, import ' +
    'GLOSSARY_COVERAGE_STATUS here and delete this entry.',

  // (system-rules-entries.ts was listed here until `scripts` was added to the walk — it is
  // consumed by dnd-seed-system-rules.ts and is genuinely reachable, so the staleness check below
  // correctly rejected the exemption. Left as a note because it is a good example of the list
  // working: an exemption that stops being true has to go.)

  // (lib/dnd/spells/dnd5e-2014.ts was listed here until 2026-07-21. The exemption said it was
  // in flight with no exports, and warned that if the entry outlived the exports, the dispatcher
  // wiring had been forgotten — which is exactly what had happened: 200 authored records that
  // nothing could import. The catalog now exports SPELLS_2014 and spellCatalog() dispatches to it,
  // so the staleness check below correctly rejected the exemption and it is gone. Left as a note
  // because this guard did its job: a self-cleaning exemption caught a slice that stalled between
  // "written" and "reachable".)

  // ── The three below are REAL GAPS, recorded rather than hidden. ────────────────────────────────
  'lib/dnd/homebrew/adopt.ts':
    'GAP (pre-existing, Area H4/H5): the mechanical half of "use a homebrew piece on a character" — ' +
    'turns a shared piece\'s payload into an ActiveEffect the ledger resolves. No route or UI calls ' +
    'it, so homebrew cannot actually be adopted. The pure logic is written and tested; the surface ' +
    'that would reach it was never built.',

  'lib/dnd/homebrew/policy.ts':
    'GAP (pre-existing, Area H4): the campaign-level DM gate deciding which shared homebrew is legal ' +
    'in a campaign. Nothing calls it, so that gate is not enforced anywhere. Same shape as the PF2 ' +
    'rules-gate bug — a gate nobody invokes is indistinguishable from no gate.',

  'lib/dnd/stream-names-ai.ts':
    'GAP (pre-existing, Phase J1): AI-generated chat usernames. The stream chat uses the procedural ' +
    'generator in stream-names.ts instead, so this enhancement is unwired. Harmless — the fallback ' +
    'IS the procedural generator — but it is dead code until something calls it.',
};

function sourceFiles(roots: string[]): string[] {
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
  for (const r of roots) walk(r);
  return out;
}

// `scripts` counts as a consumer: a module a seed script needs is reachable, just not at runtime.
const FILES = sourceFiles(['lib', 'app', 'scripts']);
const SOURCES = new Map(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));

/** Does any file OTHER than the module itself import it?
 *
 *  Specifiers are RESOLVED against the importing file rather than matched by basename. Basename
 *  matching looked fine and was quietly wrong: three systems each own an `eligibility.ts`, so an
 *  unrelated import of one counted as an importer of another — a guard reporting success it had
 *  not verified. */
function importersOf(moduleRel: string): string[] {
  const target = moduleRel.replace(/\.tsx?$/, '');
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
          : null;
      // An import of `foo` also resolves a barrel at `foo/index`.
      if (resolved === target || resolved === path.posix.dirname(target) && path.basename(target) === 'index') {
        hits.push(file);
        break;
      }
    }
  }
  return hits;
}

const MODULES = FILES.filter((f) => f.startsWith('lib/dnd/') && f.endsWith('.ts') && !f.endsWith('/index.ts'));

describe('no lib/dnd module is an orphan', () => {
  it('finds modules and consumers to check', () => {
    // Guards the guard: a broken walk would make every assertion below vacuously pass.
    expect(MODULES.length).toBeGreaterThan(50);
    expect(FILES.length).toBeGreaterThan(150);
  });

  it('the resolver can actually report zero', () => {
    // If it never returns empty, "everything is reachable" means nothing.
    expect(importersOf('lib/dnd/definitely-not-a-real-module.ts')).toEqual([]);
  });

  const orphans = MODULES.filter((m) => importersOf(m).length === 0);

  it('every orphan is a KNOWN one', () => {
    const unexpected = orphans.filter((o) => !(o in EXEMPT));
    expect(
      unexpected,
      'These modules are imported by nothing outside their own tests. A module nothing calls is ' +
      'indistinguishable from one that does not exist — and worse, because it looks done. Wire it ' +
      'up, delete it, or add it to EXEMPT with a reason.',
    ).toEqual([]);
  });

  it('every exemption still applies', () => {
    // Stops the list rotting: once something IS wired up, its exemption must go, or the list
    // slowly becomes a lie about the codebase.
    const stale = Object.keys(EXEMPT).filter((e) => fs.existsSync(path.join(ROOT, e)) && importersOf(e).length > 0);
    expect(stale, 'These are now imported and should be removed from EXEMPT.').toEqual([]);
  });

  it('every exemption names a real file', () => {
    const missing = Object.keys(EXEMPT).filter((e) => !fs.existsSync(path.join(ROOT, e)));
    expect(missing, 'EXEMPT references files that no longer exist.').toEqual([]);
  });

  it('every exemption gives a reason', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${file} needs a real reason, not a placeholder`).toBeGreaterThan(40);
    }
  });
});

describe('the recorded gaps are stated honestly', () => {
  // These assertions exist so the gaps cannot be quietly downgraded to "fine" by editing a comment.
  it('the homebrew adopt/policy gap is described as a gap', () => {
    expect(EXEMPT['lib/dnd/homebrew/adopt.ts']).toContain('GAP');
    expect(EXEMPT['lib/dnd/homebrew/policy.ts']).toContain('GAP');
  });

  it('the homebrew subsystem genuinely has no route or UI', () => {
    // The claim in EXEMPT, verified rather than asserted from memory.
    expect(fs.existsSync(path.join(ROOT, 'app/api/dnd/homebrew'))).toBe(false);
  });
});
