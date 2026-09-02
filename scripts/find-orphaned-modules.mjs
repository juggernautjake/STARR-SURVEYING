#!/usr/bin/env node
// scripts/find-orphaned-modules.mjs — plausible code that nothing imports
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// On 2026-08-27 I spent a slice rebuilding `lib/hub/components/AddWidgetModal.tsx` — search,
// collapsible categories, tests, the lot — before opening the hub in a browser and discovering that
// **nothing mounts it.** It was retired by the hub overhaul; `HubCanvas`'s own header says so. The
// wiring tests I wrote asserted that the modal imported the new modules, which was true and useless:
// they never asked whether anything imported the modal.
//
// The same session's planning doc records `lib/research/prioritized-pipeline.ts` — 764 lines across
// two near-identical files, neither imported anywhere, where nobody can now tell which was real.
//
// This is the repo's most common defect shape, and it is invisible by construction: orphaned code
// typechecks, lints, passes its own unit tests, and reads exactly like code that runs.
//
// ── WHAT COUNTS AS AN ORPHAN ────────────────────────────────────────────────────────────────────
//
// A module under `lib/` or `app/` that exports something, and whose path appears in no import
// statement anywhere in the product — tests excluded, because a module imported ONLY by its own test
// is precisely the case worth catching. That is how a retired component keeps a green suite.
//
// ── WHAT IS DELIBERATELY NOT AN ORPHAN ──────────────────────────────────────────────────────────
//
// Next.js entry points are reached by the router, not by an import: `page`, `layout`, `route`,
// `template`, `loading`, `error`, `not-found`, `default`, `middleware`, `sitemap`, `robots`, `icon`,
// `opengraph-image`. Same for `.d.ts`, `_archive/`, and anything under `.claude/worktrees`.
//
// ── THIS IS A RATCHET, NOT A BAN ────────────────────────────────────────────────────────────────
//
// The known orphans are listed below with what is known about each. The check fails when a NEW one
// appears, so the number can only go down. Deleting or wiring one of them is a judgement call — and
// in `prioritized-pipeline`'s case an explicitly owner-gated one — but nobody should be able to add
// the next one by accident.
//
// Usage:
//   node scripts/find-orphaned-modules.mjs          # report + ratchet
//   node scripts/find-orphaned-modules.mjs --list   # every orphan, no ratchet

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIRS = ['lib', 'app', 'components'];
const CODE = /\.(ts|tsx)$/;

/** Filenames Next.js reaches through the router rather than through an import. */
const ROUTER_ENTRIES = new Set([
  'page', 'layout', 'route', 'template', 'loading', 'error', 'global-error', 'not-found',
  'default', 'middleware', 'sitemap', 'robots', 'icon', 'apple-icon', 'opengraph-image',
  'twitter-image', 'manifest', 'instrumentation',
]);

const SKIP_DIR = new Set(['node_modules', '.next', '.git', '.claude', '_archive', 'dist', 'build']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (CODE.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const files = SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d)));

// Every import specifier mentioned anywhere in the product, plus the tests — read separately so a
// module imported ONLY by its own test still registers as an orphan.
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function specifiersIn(file) {
  const src = readFileSync(file, 'utf8');
  const out = new Set();
  for (const m of src.matchAll(IMPORT_RE)) out.add(m[1]);
  return out;
}

/** Every specifier used by product code (not tests). */
const productImports = new Set();
for (const f of files) for (const s of specifiersIn(f)) productImports.add(s);

// `scripts/` is product-adjacent: a module a script imports is reachable and maintained.
for (const f of walk(join(ROOT, 'scripts'))) {
  for (const s of specifiersIn(f)) productImports.add(s);
}

/** Does any recorded import specifier resolve to this file? */
function isImported(file) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const noExt = rel.replace(/\.(ts|tsx)$/, '');
  const alias = '@/' + noExt;
  const bare = noExt.replace(/\/index$/, '');
  const aliasBare = '@/' + bare;

  for (const spec of productImports) {
    if (spec === alias || spec === aliasBare) return true;
    // Relative specifiers: compare on the tail, which is enough to distinguish these filenames and
    // avoids resolving every path against every importer.
    if (spec.startsWith('.')) {
      const tail = spec.replace(/^[./]+/, '');
      if (!tail) continue;
      if (noExt.endsWith('/' + tail) || bare.endsWith('/' + tail)) return true;
    }
  }
  return false;
}

const orphans = [];
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const base = rel.split('/').pop().replace(/\.(ts|tsx)$/, '');
  if (ROUTER_ENTRIES.has(base)) continue;

  const src = readFileSync(file, 'utf8');
  // No exports means nothing to orphan — a side-effect module is reached by being imported, and if
  // it is not, it simply never runs and cannot mislead anyone about what it does.
  if (!/^\s*export\s/m.test(src)) continue;

  if (!isImported(file)) {
    orphans.push({ file: rel, lines: src.split('\n').length });
  }
}

orphans.sort((a, b) => b.lines - a.lines);

// ── The ratchet ─────────────────────────────────────────────────────────────────────────────────
//
// Each entry carries what is KNOWN about it, because "unreferenced" and "dead" are not the same
// claim and the difference is what the next reader needs.
const KNOWN = new Map([
  ['lib/research/prioritized-pipeline.ts',
    'Plan §F5. 378 lines, zero callers. Near-duplicate of prioritized-pipeline.service.ts and nobody knows which was real. Owner-gated: wire, delete, or merge.'],
  ['lib/research/prioritized-pipeline.service.ts',
    'Plan §F5. 386 lines, zero callers. The other half of the same pair.'],
]);

// The ceiling. 62 when this was written, 61 after AddWidgetModal was deleted, and it may only go DOWN.
//
// It sat at 63 from `1499ca1cb` — the commit that rebuilt Research & Analysis as one view — until
// 2026-09-02. That rebuild replaced four panels with `ResearchRunView` and left the old ones in the
// tree: ResearchRunPanel (1,775 lines), ResearchAnalysisPanel (1,298) and, one commit earlier,
// RunConsoleBar (123). 3,193 lines that typechecked, passed lint, and rendered nothing.
//
// Worth stating plainly, because this guard exists for the opposite failure and caught this one on
// the way past: the usual defect here is code written and never wired. This was code wired, then
// UNWIRED by its own replacement — the superseded half of a refactor. Same signature at the scan,
// opposite cause, and the count is what noticed.
//
// ResearchRunPanel and RunConsoleBar are gone (63 -> 61). Deleting them was gated on re-pointing
// the five guards that still read ResearchRunPanel to prove properties which now hold in
// ResearchRunView/useRunState — see worker/src/__tests__/research-modules-are-reachable.test.ts,
// which set that condition. All five were re-pointed first, in the same commit.
//
// ResearchAnalysisPanel went too, on 2026-09-02, after the owner asked whether it was obsolete.
// It was: the old Review-stage monolith, superseded by PropertySearchPanel, ResearchRunView and
// the extracted Review panels (DataPointsPanel, DiscrepancyPanel, EncumbrancePanel,
// AdjoinersPanel, GisQualityCard, PacketBuilderPanel). 1,297 lines and a co-located stylesheet.
//
// Checked before deleting, per the rule that a retired component's guards are the inventory of
// what it did: every section had a live replacement, and the ONE thing without an exact one —
// `POST /analyze { resume: true }`, a cheap re-analysis over newly uploaded files — was already
// unreachable, because nothing had mounted the panel for weeks. Deleting the file removed the last
// copy of a capability that had already stopped working, not a working one. The route still
// accepts `resume`, so rebuilding it is small; that is recorded in the plan rather than kept alive
// as 1,297 lines nobody renders.
// Not an enumerated allowlist, because I investigated three of these (one of which is now deleted) and would be inventing notes
// for the other 58. A count is the honest instrument: it stops the next one being added by accident
// without pretending to know what the existing ones are.
const MAX_ORPHANS = 60;

const listOnly = process.argv.includes('--list');

console.log('\nModules under ' + SOURCE_DIRS.join('/ , ') + '/ that export something no product code imports.\n');

if (orphans.length === 0) {
  console.log('  none\n');
  process.exit(0);
}

let unknown = 0;
for (const o of orphans) {
  const note = KNOWN.get(o.file);
  const mark = note ? '  known  ' : '  NEW    ';
  if (!note) unknown++;
  console.log(mark + o.file + '  (' + o.lines + ' lines)');
  if (note) console.log('          ' + note);
}

console.log('\n  ' + orphans.length + ' total, ' + unknown + ' not on the known list.\n');

if (listOnly) process.exit(0);

// A sanity figure, printed every run. If this ratio ever looks absurd, the scanner is the thing that
// broke rather than the codebase — that has been the fault more often than the code around here.
console.log('  scanned ' + files.length + ' modules; ' + Math.round((orphans.length / files.length) * 100) + '% unreferenced.\n');

if (orphans.length > MAX_ORPHANS) {
  console.error(
    'FAIL: ' + orphans.length + ' orphaned modules, ceiling is ' + MAX_ORPHANS + '.\n\n' +
    'Something new exports code that nothing imports. This is the repo\'s most common defect and it\n' +
    'is invisible by construction — orphaned code typechecks, lints, and passes its own tests. Wire\n' +
    'it to something or delete it. Do NOT raise the ceiling to make this pass.\n',
  );
  process.exit(1);
}

if (orphans.length < MAX_ORPHANS) {
  console.log('  Ceiling is ' + MAX_ORPHANS + ' and there are now ' + orphans.length + '. Lower it in this script.\n');
}

console.log('No new orphans.\n');
