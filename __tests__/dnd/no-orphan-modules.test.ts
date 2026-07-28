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
  'lib/dnd/homebrew/kinds.ts':
    'TEMPORARY, and the only entry here that is meant to be DELETED rather than kept. It is the kind ' +
    'registry for the Content Studio (P0-3 in TABLETOP_AUDIT_REMEDIATION_AND_CONTENT_STUDIO_2026-07-28.md), ' +
    'shipped ahead of the UI that renders it because the schema is what the API, the form and the ' +
    'transposer all have to agree on. Slice P6-6 (`/dnd/content/new`) imports it and this line comes out. ' +
    'If you are reading this after P6-6 shipped, the exemption is stale — remove it and let the guard run.',
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
  // ⚑ SCOPE CORRECTED 2026-07-27 (slice 74). Both entries below said "homebrew" where they meant
  // SHARED homebrew, and the assertion at the foot of this file then "verified" that reading by
  // checking a path the code was never going to use. There are TWO homebrew subsystems:
  //
  //   · `lib/dnd/classes/homebrew-store.ts` — PER-CHARACTER, and fully wired. Three designer pages
  //     (`/dnd/characters/[id]/build/{class,subclass,feat}`), six routes, persisted to
  //     `character.data.homebrew{Classes,Subclasses,Feats}`, and read back by the level walker
  //     (`levels/route.ts` feeds all three into `findClass` / `subclassesFor` / `featPool`).
  //     Creating homebrew and using it on its own character WORKS.
  //   · `lib/dnd/homebrew/` — the SHARED library: publishing a piece so other characters and
  //     campaigns can take it. That is the half with no surface, and it is what these two are about.
  //
  // The distinction matters because "homebrew cannot actually be adopted" read as "homebrew does not
  // work", which is false and is the opposite of reassuring to anyone reading this file to find out.
  'lib/dnd/homebrew/adopt.ts':
    'GAP (pre-existing, Area H4/H5): the mechanical half of "take a SHARED homebrew piece onto a ' +
    'character" — turns a published piece\'s payload into an ActiveEffect the ledger resolves. No ' +
    'route or UI calls it, so a piece cannot be adopted FROM A LIBRARY. Note this is not the same as ' +
    'homebrew being unusable: per-character homebrew (lib/dnd/classes/homebrew-store.ts) is wired ' +
    'end to end and does reach the builder. The pure logic here is written and tested; the sharing ' +
    'surface that would reach it was never built.',

  'lib/dnd/homebrew/policy.ts':
    'GAP (pre-existing, Area H4): the campaign-level DM gate deciding which SHARED homebrew is legal ' +
    'in a campaign. Nothing calls it, so that gate is not enforced anywhere. Same shape as the PF2 ' +
    'rules-gate bug — a gate nobody invokes is indistinguishable from no gate. (Vacuous today rather ' +
    'than dangerous: with no sharing surface there is nothing for it to gate yet.)',

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

  // ⚑ REPLACED 2026-07-27 (slice 74). The assertion here was:
  //
  //     it('the homebrew subsystem genuinely has no route or UI', () => {
  //       expect(fs.existsSync(path.join(ROOT, 'app/api/dnd/homebrew'))).toBe(false);
  //     });
  //
  // labelled "the claim in EXEMPT, verified rather than asserted from memory". It verified nothing:
  // homebrew routes are per-character and live at `app/api/dnd/characters/[id]/homebrew-*`, so the
  // path it probed was never going to exist and the assertion could not have failed for the right
  // reason. The claim it certified — that homebrew has no route or UI — is false; six routes and
  // three designer pages exist. A guard that cannot fail is worse than no guard, because this one
  // was cited as evidence. Both halves are now asserted where they actually live.
  it('per-character homebrew IS wired — routes, designers, and a path back into the builder', () => {
    for (const kind of ['class', 'subclass', 'feat']) {
      expect(fs.existsSync(path.join(ROOT, `app/api/dnd/characters/[id]/homebrew-${kind}/route.ts`)),
        `homebrew-${kind} route`).toBe(true);
      expect(fs.existsSync(path.join(ROOT, `app/api/dnd/characters/[id]/homebrew-${kind}/save/route.ts`)),
        `homebrew-${kind} save route`).toBe(true);
      expect(fs.existsSync(path.join(ROOT, `app/dnd/characters/[id]/build/${kind}/page.tsx`)),
        `${kind} designer page`).toBe(true);
    }
    // Saved homebrew must come BACK, or create+save is a dead end. The level walker reads all three.
    const levels = fs.readFileSync(path.join(ROOT, 'app/api/dnd/characters/[id]/levels/route.ts'), 'utf8');
    expect(levels).toContain('readHomebrewClasses');
    expect(levels).toContain('readHomebrewSubclasses');
    expect(levels).toContain('readHomebrewFeats');
  });

  it('the SHARED-library half is the part with no surface — that is what the two gaps mean', () => {
    // No publish/browse/adopt surface anywhere: not as a route directory, and not as a page.
    expect(fs.existsSync(path.join(ROOT, 'app/api/dnd/homebrew'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'app/dnd/homebrew'))).toBe(false);
    // And the two modules are reached only by their own tests.
    for (const mod of ['adopt', 'policy']) {
      expect(EXEMPT[`lib/dnd/homebrew/${mod}.ts`]).toContain('SHARED');
    }
  });
});
