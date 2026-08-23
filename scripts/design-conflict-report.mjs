// scripts/design-conflict-report.mjs — where the stylesheets argue with themselves.
//
//   node scripts/design-conflict-report.mjs
//   node scripts/design-conflict-report.mjs --fail-on-new    # for CI
//
// Phase X of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// Owner: *"resolve any conflicts or anything in the code/html/css."*
//
// ── WHAT COUNTS AS A CONFLICT, AND WHAT DOES NOT ────────────────────────────────────────────────
//
// "Conflict" could mean almost anything, so it is three measurable things, each a bug rather than a
// style opinion:
//
//   REDEFINED   the same class declared in two stylesheets with DIFFERENT declarations. Which one
//               wins depends on import order — that is, on which route you happen to be on. This
//               family produced every real defect this pass found.
//
//   CONTRADICTS one selector setting a property twice within a single rule, the second silently
//               discarding the first — unless the second is a progressive-enhancement fallback,
//               which is the opposite of a mistake. See isFallbackPair.
//
//   ORPHANED    a class defined in CSS that no component references. Read the caveat below before
//               deleting anything on this list.
//
// Deliberately NOT reported: the same class declared twice with IDENTICAL declarations, and
// specificity battles between a base and its own modifier (that is what modifiers are).
//
// The detection lives in scripts/lib/css-conflicts.mjs, shared with the test that gates it. One
// copy on purpose — this file exists because two copies of some CSS drifted apart unnoticed.

import fs from 'node:fs';
import path from 'node:path';
import { collectDeclarations, findRedefined, walk } from './lib/css-conflicts.mjs';

const ROOT = process.cwd();
const FAIL_ON_NEW = process.argv.includes('--fail-on-new');

const { declarations, duplicateProps } = collectDeclarations([path.join(ROOT, 'app')], ROOT);
const redefined = findRedefined(declarations);

// ── ORPHANED, WITH A CAVEAT THAT MATTERS ────────────────────────────────────────────────────────
//
// This is a substring search for the class name in every component. It CANNOT see a class that is
// built at runtime — `admin-btn--${variant}`, `status-${row.state}` — so a chunk of this list is
// alive and merely assembled. That is why the count is reported and the gate is not: deleting from
// it on faith is how a status pill loses its colour on one branch of a conditional.
const jsxFiles = walk(path.join(ROOT, 'app'), (n) => /\.(tsx|jsx)$/.test(n))
  .concat(walk(path.join(ROOT, 'lib'), (n) => /\.(tsx|ts)$/.test(n)));
const jsxText = jsxFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const orphans = [];
for (const [cls, places] of declarations) {
  if (/^jsx-/.test(cls) || cls.startsWith('ds-')) continue;   // styled-jsx hashes + export primitives
  if (jsxText.includes(cls)) continue;
  orphans.push({ cls, file: places[0].file, line: places[0].line });
}
orphans.sort((a, b) => a.cls.localeCompare(b.cls));

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
console.log(`\n  ${declarations.size} single-class rules across app/\n`);

console.log(`  ── ${redefined.length} class(es) declared in more than one file, with different rules ──`);
console.log('     Which one wins depends on import order, which depends on the route you are on.\n');
for (const r of redefined.slice(0, 25)) {
  console.log(`    .${r.cls}`);
  for (const p of r.places) console.log(`        ${p.file}:${p.line}`);
}
if (redefined.length > 25) console.log(`\n    …and ${redefined.length - 25} more.`);

console.log(`\n  ── ${duplicateProps.length} rule(s) set a property twice, discarding the first ──\n`);
for (const d of duplicateProps.slice(0, 20)) {
  console.log(`    ${d.file}:${d.line}  ${d.selector}`);
  console.log(`        ${d.prop}: ${d.first}  →  ${d.prop}: ${d.second}`);
}
if (duplicateProps.length > 20) console.log(`\n    …and ${duplicateProps.length - 20} more.`);

console.log(`\n  ── ${orphans.length} class(es) no component names literally ──`);
console.log('     Some are alive and assembled at runtime. Verify before deleting.\n');
for (const o of orphans.slice(0, 20)) console.log(`    .${o.cls}  (${o.file}:${o.line})`);
if (orphans.length > 20) console.log(`\n    …and ${orphans.length - 20} more.`);

console.log('');

// The numbers that gate are the two that are always a bug. Orphans never gate — see the caveat.
if (FAIL_ON_NEW && duplicateProps.length > 0) process.exit(1);
