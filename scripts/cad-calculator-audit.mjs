// scripts/cad-calculator-audit.mjs — C27, inventory the calculators
//
// Extracted, not hand-written. C13 learned this the expensive way: 51 rows of prose about what the
// tools *should* do produced a document nobody had checked against the code, and the slice graded
// against it would have measured the prose. So this reads the tree and reports what is there.
//
// Three questions per calculation surface, because those are the three ways one can be useless:
//
//   REACHABLE   can a surveyor open it without knowing the source? (menu entry, hotkey, event)
//   INPUT       does it take the current selection, or must every value be retyped?
//   WRITES BACK does the answer become geometry in the drawing, or only text on a screen?
//
// A calculator that fails the third is a pocket calculator with extra steps, and this repo has
// already found several features that were authored and never wired.
//
// Usage: node scripts/cad-calculator-audit.mjs [--json]

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const COMPONENTS = join(ROOT, 'app/admin/cad/components');
const GEOMETRY = join(ROOT, 'lib/cad/geometry');

const read = (p) => {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
};

/** Source of every file that could reach a calculator. */
const REACH_SOURCES = [
  'app/admin/cad/components/MenuBar.tsx',
  'app/admin/cad/CADLayout.tsx',
  'app/admin/cad/hooks/useHotkeys.ts',
  'lib/cad/hotkeys/registry.ts',
  'app/admin/cad/components/Toolbar.tsx',
  'app/admin/cad/components/StatusBar.tsx',
  'app/admin/cad/components/PropertyPanel.tsx',
  'app/admin/cad/components/CanvasViewport.tsx',
  'app/admin/cad/components/FeatureContextMenu.tsx',
].map((p) => ({ path: p, src: read(join(ROOT, p)) }));

/**
 * Which files mention this component name, excluding its own file.
 *
 * Every CAD component counts, not just the fixed list above — the first version of this scan only
 * looked at menus/hotkeys/layout and reported `GenericCalculator`, `CalculatorPicker`,
 * `ClosureReport` and `CurveCalculatorBody` as unreachable. All four are mounted by other
 * components (`CalculatorModal`, `TraversePanel`), which is exactly how a modal-with-tabs is built.
 * An instrument that calls a correct design broken is worse than no instrument, because the
 * "finding" costs a slice to disprove.
 */
const ALL_COMPONENT_SRC = readdirSync(COMPONENTS)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: `app/admin/cad/components/${f}`, src: read(join(COMPONENTS, f)) }));

function reachedFrom(name) {
  return [...REACH_SOURCES, ...ALL_COMPONENT_SRC]
    .filter(({ path, src }) => !path.endsWith(`${name}.tsx`) && src.includes(name))
    .map(({ path }) => path.split('/').pop());
}

/** Every CAD component whose name or content says it calculates something. */
const CALC_NAME = /(Calc|Calculator|Inverse|Intersect|Closure|Traverse|Curve|Cogo|Area|Offset|Bearing)/;

const componentFiles = readdirSync(COMPONENTS).filter((f) => f.endsWith('.tsx'));

const surfaces = [];
for (const file of componentFiles) {
  const name = file.replace(/\.tsx$/, '');
  if (!CALC_NAME.test(name)) continue;
  const src = read(join(COMPONENTS, file));
  if (!src) continue;

  surfaces.push({
    name,
    lines: src.split('\n').length,
    // Reachability: named by something a surveyor can operate.
    reachedFrom: reachedFrom(name),
    // Input: does it read the live selection rather than only its own fields?
    readsSelection: /useSelectionStore|selectedIds|getSelectedIds/.test(src),
    // Write-back: does the answer become geometry?
    //
    // `enqueueProposal` counts. `CalcPointDialog` computes a point and hands it to the AI review
    // queue, which paints it dashed until the surveyor accepts — a deliberate design, and the first
    // version of this scan called it "answer never becomes geometry" because it only looked for
    // direct store writes. Review-then-commit IS a write-back path, and a stricter one.
    writesGeometry: /addFeature|updateFeature|finishFeature|addPoint\(|enqueueProposal/.test(src),
    // Provenance: does the written geometry record how it was derived? (C30's prerequisite.)
    recordsProvenance: /derivedFrom|provenance|calculatedFrom|derivation/i.test(src),
    // Undo: a write-back that cannot be undone is worse than none.
    pushesUndo: /pushUndo|makeBatchEntry|makeAddFeatureEntry/.test(src),
  });
}

/** Geometry modules that look like calculation engines, and whether anything in the app calls them. */
const APP_SRC = [
  ...readdirSync(COMPONENTS).map((f) => read(join(COMPONENTS, f))),
  read(join(ROOT, 'app/admin/cad/CADLayout.tsx')),
  read(join(ROOT, 'app/admin/cad/hooks/useHotkeys.ts')),
].join('\n');

/**
 * All of `lib/cad`, RECURSIVELY.
 *
 * The first version read only the top level, and reported `computeClosure`, `bowditchAdjustment`
 * and `transitAdjustment` as orphaned — the closure and bowditch engines the plan names by name.
 * They are called from `lib/cad/store/traverse-store.ts`, one directory down. That would have been
 * a headline finding built entirely out of the instrument's own blind spot, which is the third
 * correction this scan needed and the reason none of its numbers went into the write-up unverified.
 */
function readTree(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readTree(p));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push({ path: p, src: read(p) });
  }
  return out;
}

const LIB_FILES = readTree(join(ROOT, 'lib/cad'));

/** Everything in lib/cad EXCEPT the engine being checked.
 *
 *  Including its own file makes every export match its own declaration — the scan then reported
 *  zero orphans everywhere, which is the same self-match that cost C3's guard three revisions and
 *  the inline-hex fix a second pass. A scan that cannot fail is not measuring anything. */
function libSourceExcluding(file) {
  return LIB_FILES.filter((f) => !f.path.endsWith(file)).map((f) => f.src).join('\n');
}

const ENGINE_FILES = [
  'cogo.ts', 'curve.ts', 'compound-curve.ts', 'curb-return.ts', 'intersection.ts',
  'closure.ts', 'traverse.ts', 'area.ts', 'area-measurement.ts', 'offset.ts',
  'perpendicular-line.ts', 'bearing.ts', 'solver.ts', 'legal-desc.ts', 'boundary-loop.ts',
  'spline-to-arc.ts', 'curve-fit.ts', 'fit.ts', 'orient.ts', 'units.ts',
];

const engines = [];
for (const file of ENGINE_FILES) {
  const src = read(join(GEOMETRY, file));
  if (!src) continue;
  const exported = [...src.matchAll(/export function (\w+)/g)].map((m) => m[1]);
  // Bare identifier, NOT `name(`.
  //
  // `CanvasViewport` imports the whole of `perpendicular-line.ts` under aliases
  // (`unitVector as perpUnitVector`, …), so a call-shaped regex reported all seven exports as
  // orphaned while they are used on every frame. Matching the identifier catches the import
  // specifier too. It over-reports usage — a mention in a comment counts — but this column exists
  // to hand a human a candidate list, and a false orphan costs a slice to disprove while a missed
  // one costs nothing this scan was going to catch anyway.
  const used = (haystack) => (fn) => new RegExp(`\\b${fn}\\b`).test(haystack);
  const usedInApp = exported.filter(used(APP_SRC));
  const usedInLib = exported.filter(used(libSourceExcluding(file)));
  engines.push({
    file,
    exports: exported.length,
    usedInApp: usedInApp.length,
    usedInLib: usedInLib.length,
    /** Exported, and called by neither the UI nor the rest of lib/cad — the shape this repo keeps
     *  finding: real work with no caller. */
    orphans: exported.filter((fn) => !usedInApp.includes(fn) && !usedInLib.includes(fn)),
  });
}

const report = { surfaces, engines };

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('── CALCULATION SURFACES ' + '─'.repeat(56));
  console.log(
    'component'.padEnd(24) + 'lines'.padStart(6) + '  reach  sel  writes  prov  undo',
  );
  for (const s of surfaces) {
    console.log(
      s.name.padEnd(24) +
      String(s.lines).padStart(6) +
      '  ' + String(s.reachedFrom.length).padStart(5) +
      '  ' + (s.readsSelection ? ' y ' : ' . ') +
      '  ' + (s.writesGeometry ? '  y  ' : '  .  ') +
      '  ' + (s.recordsProvenance ? ' y ' : ' . ') +
      '  ' + (s.pushesUndo ? ' y ' : ' . '),
    );
  }
  console.log('\n── ENGINES ' + '─'.repeat(69));
  console.log('file'.padEnd(24) + 'exports'.padStart(8) + '  app  lib  orphaned');
  for (const e of engines) {
    console.log(
      e.file.padEnd(24) +
      String(e.exports).padStart(8) +
      '  ' + String(e.usedInApp).padStart(3) +
      '  ' + String(e.usedInLib).padStart(3) +
      '  ' + (e.orphans.length ? e.orphans.join(', ') : '—'),
    );
  }
  const noReach = surfaces.filter((s) => s.reachedFrom.length === 0);
  const noWrite = surfaces.filter((s) => !s.writesGeometry);
  const noProv = surfaces.filter((s) => s.writesGeometry && !s.recordsProvenance);
  console.log('\n── SUMMARY ' + '─'.repeat(69));
  console.log(`${surfaces.length} calculation surfaces, ${engines.length} engine modules`);
  console.log(`unreachable from any operable surface: ${noReach.length}` +
    (noReach.length ? ` — ${noReach.map((s) => s.name).join(', ')}` : ''));
  console.log(`answer never becomes geometry: ${noWrite.length}` +
    (noWrite.length ? ` — ${noWrite.map((s) => s.name).join(', ')}` : ''));
  console.log(`writes geometry with no provenance: ${noProv.length}` +
    (noProv.length ? ` — ${noProv.map((s) => s.name).join(', ')}` : ''));
}
