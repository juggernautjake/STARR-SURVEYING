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
  // `lib/dnd/bestiary/eligibility.ts` was exempted here for exactly one slice. P13-10 imports it, this
  // test failed with "now imported and should be removed from EXEMPT", and the entry was deleted the same
  // day. The second exemption in this file's history to be honoured rather than accumulate.
  //
  // EXPIRES WITH P13-3. `derive.ts` composes the three bestiary rules (taxonomy, eligibility, variants)
  // into the single call the importer makes. It is the ONE orphan the bestiary now has: taxonomy,
  // eligibility and variants are all reached through it, which is the point of a composition seam — the
  // importer cannot accidentally apply two of the three.
  //
  // It does not exist yet because seed 462 — the tables the rows go in — is written but unapplied, so
  // there is nothing to import into. Exempted rather than deferred because the RULES are the reviewable
  // part and they are complete and tested; settling them before an importer bakes them in is the right
  // order.
  // `derive.ts`'s exemption lasted one slice too: P13-3's transform imports it, and the guard failed with
  // "now imported and should be removed from EXEMPT". Third honoured expiry in this file's history.
  //
  // EXPIRES WHEN SEED 462 IS APPLIED. `import.ts` is the PURE half of P13-3 — one raw SRD entry to one
  // `dnd_creatures` row — split from the writer deliberately, because the transform is testable today and
  // the INSERT needs a table that does not exist. Its caller is the writer loop, which is the one thing
  // here that genuinely cannot be built or verified yet.
  // `import.ts`'s exemption expired exactly as its note said it would: the writer landed
  // (`scripts/import-bestiary.mjs`, B1-3, 334 creatures), `import-pf2.ts` now imports its shared types,
  // and this guard failed with "now imported and should be removed from EXEMPT". Fourth honoured expiry
  // in this file's history — deleted rather than left to rot.
  // `lib/dnd/homebrew/kinds.ts` was exempted here on 2026-07-28 with an expiry note naming the slice that
  // would remove it. P6-4 shipped the API that imports it, this test failed with "now imported and should
  // be removed from EXEMPT", and the note was honoured. Recorded because an exemption that actually got
  // deleted is rare enough to be worth showing.
  // `lib/dnd/statblocks/tiers.ts` was exempted on 2026-07-30 with the note "consumed by
  // deriveNativeStatblock in N2-1; delete this entry then". N2-1 shipped the same day, this guard failed
  // with "now imported and should be removed from EXEMPT", and the entry was deleted. FIFTH honoured
  // expiry in this file's history — and the second where the exemption lasted hours rather than months,
  // which is what an expiry note naming a specific slice is for.
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
  // `lib/dnd/homebrew/adopt.ts` left this list on 2026-07-28: the Content Studio's API (P6-4) calls its
  // `validateHomebrewPayload`, so the module is reached by shipping code. Its ADOPT half is still not
  // called — that is slice P6-8 — but a module is either imported or it is not, and this one now is.

  // `lib/dnd/homebrew/policy.ts` came off this list on 2026-07-28 when P6-8 shipped the adopt route — the
  // only caller it was ever meant to have. It had been exempt since the day it was written: a campaign-level
  // DM gate that nothing invoked, which is indistinguishable from no gate. **Every homebrew module is now
  // reached by shipping code**, which is the first time that has been true.

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
      // `.mjs` too, and that was a real blind spot rather than a nicety. The comment below already said
      // "scripts counts as a consumer", but the filter only collected .ts/.tsx — so the bestiary's import,
      // art and variant scripts (all .mjs, because they run under vite-node rather than Next) counted for
      // nothing, and three modules they call every day were reported as orphans on 2026-07-29.
      } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
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
      const raw = spec.startsWith('@/')
        ? spec.slice(2)
        : spec.startsWith('.')
          ? path.posix.normalize(path.posix.join(fromDir, spec))
          : null;
      // STRIP THE EXTENSION FROM THE SPECIFIER TOO, not just from the target.
      //
      // `target` is already extensionless, so an import written WITH an extension never matched. That is
      // not a hypothetical: native ESM requires it, and the bestiary's `.mjs` importers say
      // `from '../lib/dnd/bestiary/art.ts'` — so art.ts, variants.ts and eligibility.ts were reported as
      // orphans while three scripts imported them every day.
      const resolved = raw ? raw.replace(/\.(tsx?|mjs|js)$/, '') : null;
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

  it('the resolver can actually FIND an import', () => {
    // The other direction, and the one both of this file's historic resolver bugs lived in. Matching
    // by basename silently counted an unrelated `eligibility.ts` as an importer (under-reporting
    // orphans); not stripping the extension from the specifier made three `.mjs`-imported modules
    // look orphaned (over-reporting). A resolver that returns [] for genuine imports would leave
    // "every orphan is a KNOWN one" failing loudly, but one that mis-resolves a SUBSET fails
    // quietly — and quietly is how both real bugs behaved.
    //
    // Asserted on a SPECIFIC `@/`-form importer, not just "found something". The first version
    // checked only that the count was above zero, and a control that disabled `@/` resolution
    // entirely still passed it — `currency.ts` also has relative importers, so the weaker assertion
    // was satisfied by the branch that still worked while the broken one went unnoticed.
    //
    // The aggregate test below does catch that break, by reporting most of lib/dnd as orphaned. But
    // "everything is broken" is a different signal from "this resolution form is broken", and only
    // the second one tells the next reader where to look.
    const importers = importersOf('lib/dnd/currency.ts');
    expect(
      importers,
      'the resolver did not resolve an `@/`-absolute import it should have. Every "reachable" ' +
        'verdict that depends on that form is suspect until it is fixed.',
    ).toContain('app/dnd/_sheet/components/Inventory.tsx');
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
  it('NO homebrew module is exempt any more — the whole subsystem is wired', () => {
    // This assertion has now inverted twice in two days, which is the record working as intended. It began
    // as "the adopt/policy gap is described as a gap" — correct while both modules were orphans. P6-4 wired
    // `adopt.ts`, P6-8 wired `policy.ts` (its only intended caller), and there is nothing left to describe.
    for (const mod of ['model', 'policy', 'adopt', 'projection', 'kinds', 'store', 'seeds']) {
      expect(EXEMPT[`lib/dnd/homebrew/${mod}.ts`], `${mod}.ts should be reached by shipping code`).toBeUndefined();
    }
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

  // ⚑ FLIPPED 2026-07-28 (P6-2/P6-3/P6-4). This asserted the shared-library half had NO surface —
  // no route directory, no page — which was true when written and is the reason the Content Studio was
  // planned. Building the surface turned it red, which is what a pin like this is for. Replaced with
  // assertions on what now exists, and on the ONE part that is still missing.
  it('the SHARED catalog is wired end to end: author → browse → adopt', () => {
    // Written on 2026-07-27 as "the shared-library half has NO surface" — true then, and the reason the
    // Content Studio was planned. It flipped once when the catalog got a table and routes, and again a
    // slice later when adoption landed. Three states in two days; each rewrite is above.
    for (const p of [
      'seeds/455_dnd_homebrew.sql',                    // a real table, not a two-entry hard-coded array
      'app/api/dnd/homebrew/route.ts',                 // list + create
      'app/api/dnd/homebrew/[id]/route.ts',            // read + edit + delete
      'app/api/dnd/homebrew/[id]/adopt/route.ts',      // onto a character — the payoff
      'app/dnd/content/page.tsx',                      // browse
      'app/dnd/content/new/page.tsx',                  // build
    ]) {
      expect(fs.existsSync(path.join(ROOT, p)), p).toBe(true);
    }
  });
});
