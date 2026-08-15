// scripts/cad-integration-audit.mjs — C44a, enumerate the integration points
//
// P9b's owner ask is "every integration point that is surfaced is fully fleshed out and works as
// intended", and C44a's deliverable is explicitly **the list**, built before anything is checked.
// Extracted, not hand-written, for the reason C13 and C27 both paid for: a hand-listed inventory is
// a document about what somebody believed, and the slice graded against it grades the belief.
//
// ── WHY THIS IS NOT THE ORPHAN RATCHET ──────────────────────────────────────────────────────────
//
// `__tests__/cad/cad-modules-are-reachable.test.ts` already asks "does any production file import
// this module", across all 248 modules in lib/cad. That is a necessary condition and a weak one: a
// module imported only by another module that nothing mounts passes it, and so does a parser
// imported by a component that was never rendered. "Authored but not wired" is this codebase's most
// common defect precisely because having an importer is not the same as being reachable.
//
// So this walks the importer graph TRANSITIVELY and asks a different question: starting here, can
// you get to a page or an API route — something a person or another system can actually invoke?
// The answer is one of:
//
//   PAGE      reachable from a Next.js page (a surveyor can get there in a browser)
//   ROUTE     reachable from an API route (another system can call it)
//   WORKER    reachable from the research worker's entry (runs on a schedule)
//   ORPHAN    the graph runs out before any of those — authored, imported, and unreachable
//
// ── THE HEURISTIC IS NAMED, NOT HIDDEN ──────────────────────────────────────────────────────────
//
// Import resolution is textual: a basename prefilter, then a regex over the import specifiers. It
// cannot see dynamic `import(variable)` or a re-export chain that renames. Where it is unsure it
// reports the module, it does not judge it — C27's instrument was wrong four times, and each time
// the cost was a slice spent disproving a finding. A tool that calls a correct design broken is
// worse than no tool.
//
// Usage: node scripts/cad-integration-audit.mjs [--json] [--orphans-only]

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';

const ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');
const ORPHANS_ONLY = process.argv.includes('--orphans-only');

/** The integration surface C44a names: CAD file formats in and out, delivery, and the outside world. */
const INTEGRATION_DIRS = [
  ['lib/cad/io', 'TRV round-trip (the native format)'],
  ['lib/cad/import', 'Field-data import (RW5 / GSI / JobXML / LandXML / CSV)'],
  ['lib/cad/export', 'Export writers'],
  ['lib/cad/delivery', 'Deliverable production (DXF / GeoJSON / LandXML / PDF / seals)'],
  ['lib/cad/integrations', 'Third-party sync (Compass / Forge / Orbit)'],
  ['lib/cad/ai', 'AI providers and the tool registry'],
];

const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/** Every production file that could import anything. Tests are excluded on purpose — a module
 *  imported only by its own test is the exact case this audit exists to catch. */
const ALL_FILES = [
  ...walk(join(ROOT, 'lib')),
  ...walk(join(ROOT, 'app')),
  ...walk(join(ROOT, 'worker/src')),
  ...walk(join(ROOT, 'components')),
].map((p) => ({ path: rel(p), src: readFileSync(p, 'utf8') }));

const BY_PATH = new Map(ALL_FILES.map((f) => [f.path, f]));

const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * Resolve one import specifier to a repo-relative file path, or null for a package import.
 *
 * **This is the second version.** The first matched on the module's BASENAME with a word-boundary
 * regex, on the theory that an import of `foo/bar.ts` must contain the substring `bar`. That is
 * true and useless: it also matches `@/lib/dnd/preview` when looking for `lib/cad/ai/preview.ts`,
 * and the first run cheerfully reported the CAD AI reach map as reachable from a D&D campaign world
 * page. Nine modules named something ordinary — `types`, `scope`, `validation`, `provenance`,
 * `preview`, `reach` — were resolved to whichever unrelated file happened to share the word.
 *
 * C27's instrument was wrong four times and each wrong finding cost a slice to disprove, so the
 * cheap-and-approximate version is not worth having here. Specifiers are resolved for real: `@/`
 * against the repo root, `./` and `../` against the importing file, anything else is a package.
 */
function resolveSpecifier(fromPath, spec) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('./') || spec.startsWith('../')) {
    const dir = fromPath.split('/').slice(0, -1);
    const parts = spec.split('/');
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      else if (part === '..') dir.pop();
      else dir.push(part);
    }
    base = dir.join('/');
  } else return null; // a package, not a file in this repo

  base = base.replace(/\.(ts|tsx|js|jsx)$/, '');
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (BY_PATH.has(cand)) return cand;
  }
  return null;
}

/** Forward edges: file → the repo files it imports. Built once, in one pass over every source. */
const IMPORTS = new Map();
for (const f of ALL_FILES) {
  const out = new Set();
  for (const m of f.src.matchAll(SPECIFIER_RE)) {
    const target = resolveSpecifier(f.path, m[1]);
    if (target && target !== f.path) out.add(target);
  }
  IMPORTS.set(f.path, out);
}

/** Reverse index: for each file, who imports it. */
const IMPORTERS = new Map();
for (const [from, targets] of IMPORTS) {
  for (const t of targets) {
    if (!IMPORTERS.has(t)) IMPORTERS.set(t, []);
    IMPORTERS.get(t).push(from);
  }
}
const importersOf = (p) => IMPORTERS.get(p) ?? [];

function classify(path) {
  if (/^app\/api\/.*\/route\.tsx?$/.test(path)) return 'ROUTE';
  if (/^app\/.*\/page\.tsx$/.test(path)) return 'PAGE';
  if (/^app\/.*\/layout\.tsx$/.test(path)) return 'PAGE';
  if (/^worker\/src\/(index|main|server)\.ts$/.test(path)) return 'WORKER';
  return null;
}

/**
 * Walk importers breadth-first until something a person or a system can invoke turns up.
 *
 * Breadth-first rather than depth-first so the reported entry is the SHORTEST path to the surface —
 * "this parser is reached from the import dialog" is a more useful sentence than the same fact
 * arrived at through six intermediate modules.
 */
function findEntry(startPath) {
  const seen = new Set([startPath]);
  let frontier = importersOf(startPath);
  let depth = 1;
  while (frontier.length > 0 && depth < 12) {
    const next = [];
    for (const p of frontier) {
      if (seen.has(p)) continue;
      seen.add(p);
      const kind = classify(p);
      if (kind) return { kind, via: p, depth };
      next.push(...importersOf(p));
    }
    frontier = next;
    depth += 1;
  }
  return { kind: 'ORPHAN', via: null, depth };
}

const results = [];
for (const [dir, purpose] of INTEGRATION_DIRS) {
  const files = walk(join(ROOT, dir)).map(rel).sort();
  for (const path of files) {
    if (/\/index\.ts$/.test(path)) continue; // barrels are plumbing, not integration points
    const entry = findEntry(path);
    results.push({
      module: path,
      area: dir,
      purpose,
      entry: entry.kind,
      via: entry.via,
      hops: entry.depth,
      directImporters: importersOf(path).length,
    });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ results }, null, 2));
  process.exit(0);
}

if (process.argv.includes('--markdown')) {
  for (const [dir, purpose] of INTEGRATION_DIRS) {
    const rows = results.filter((r) => r.area === dir);
    if (rows.length === 0) continue;
    console.log(`### \`${dir}\` — ${purpose}\n`);
    console.log('| Module | Reachable from | Hops |');
    console.log('|---|---|---|');
    for (const r of rows) {
      const where = r.via ? `\`${r.via}\`` : '**ORPHAN — no path to a surface**';
      console.log(`| \`${basename(r.module)}\` | ${where} | ${r.via ? r.hops : '—'} |`);
    }
    console.log('');
  }
  process.exit(0);
}

const shown = ORPHANS_ONLY ? results.filter((r) => r.entry === 'ORPHAN') : results;
const byArea = new Map();
for (const r of shown) {
  if (!byArea.has(r.area)) byArea.set(r.area, []);
  byArea.get(r.area).push(r);
}

console.log('CAD integration points — reachability to a page, an API route, or the worker\n');
for (const [area, rows] of byArea) {
  const purpose = rows[0]?.purpose ?? '';
  console.log(`── ${area} — ${purpose}`);
  for (const r of rows) {
    const tag = r.entry.padEnd(6);
    const where = r.via ? `${r.via} (${r.hops} hop${r.hops === 1 ? '' : 's'})` : '— no path to a surface';
    console.log(`   ${tag} ${basename(r.module).padEnd(30)} ${where}`);
  }
  console.log('');
}

const counts = results.reduce((acc, r) => ({ ...acc, [r.entry]: (acc[r.entry] ?? 0) + 1 }), {});
console.log('Totals:', Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('  ·  '));
console.log(`${results.length} integration modules across ${INTEGRATION_DIRS.length} areas.`);
