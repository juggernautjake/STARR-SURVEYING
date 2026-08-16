// scripts/cad-click-order-audit.mjs — does every drawing tool say what it wants next?
//
// C13 of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Owner: *"Please make sure when we are drawing, that the order of clicks and placement of points
// and lines works well and is intuitive."*
//
// ── WHY THIS IS EXTRACTED, NOT HAND-WRITTEN ─────────────────────────────────────────────────────
//
// D5 says the click order is a specification, not a preference: without the sequence written down
// there is nothing to test and every review is an opinion. The obvious way to produce it is to sit
// down and write 51 rows of prose. That would be a document about what the tools SHOULD do, and
// C14 would then be graded against something nobody verified against the code.
//
// The tools already carry their own descriptions in `ToolBar.tsx`, shown in the tooltip a surveyor
// actually reads. So the spec is EXTRACTED from those, and what this measures is whether each one
// answers the four questions a person has while holding the mouse:
//
//   1. What does the FIRST click do?
//   2. How does it END — a click count, a double-click, Enter?
//   3. What does ESCAPE do?
//   4. What does it show me BEFORE I commit?
//
// A tool whose description answers none of those is not necessarily broken. It is undocumented,
// which is a different defect and the one that makes "unintuitive" impossible to argue about.
//
// Usage:  node scripts/cad-click-order-audit.mjs [--json]

import fs from 'node:fs';

const TOOLBAR = 'app/admin/cad/components/ToolBar.tsx';
const AS_JSON = process.argv.includes('--json');

const src = fs.readFileSync(TOOLBAR, 'utf8');

/** Every `{ tool: 'X', label: '…', description: '…' }` entry, in toolbar order. */
function entries() {
  const out = [];
  const re = /\{\s*tool:\s*'([A-Z_]+)'\s*,\s*label:\s*'((?:[^'\\]|\\.)*)'\s*,\s*description:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({
      tool: m[1],
      label: m[2].replace(/\\'/g, "'"),
      description: m[3].replace(/\\'/g, "'"),
    });
  }
  return out;
}

/** The four questions, answered or not. Deliberately generous — this is looking for SILENCE, not
 *  for a particular phrasing, so a tool is only flagged when its description says nothing at all
 *  on the axis. */
function classify(description) {
  const d = description.toLowerCase();
  return {
    // 1. What the first interaction is.
    firstAction: /\bclick|\bdrag|\bpick|\bselect|\btap|\bpress\b/.test(d),
    // 2. How it terminates.
    terminates: /enter|double-?click|right-?click|apply|commit|empty space|finish|until|second click|two points|three points/.test(d),
    // 3. What Escape does.
    escape: /\bescape\b|\besc\b|\bcancel\b/.test(d),
    // 4. What is shown before committing.
    preview: /preview|live|ghost|rubber|shows|highlight|as you (?:move|drag)|follows/.test(d),
  };
}

const rows = entries().map((e) => ({ ...e, answers: classify(e.description) }));

if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const score = (r) => Object.values(r.answers).filter(Boolean).length;
  const silent = rows.filter((r) => score(r) === 0);
  const thin = rows.filter((r) => score(r) === 1);
  const noEscape = rows.filter((r) => !r.answers.escape);
  const noEnd = rows.filter((r) => !r.answers.terminates);
  const noPreview = rows.filter((r) => !r.answers.preview);

  console.log(`\n  ${rows.length} toolbar entries\n`);
  console.log(`  answers all four      ${rows.filter((r) => score(r) === 4).length}`);
  console.log(`  answers three         ${rows.filter((r) => score(r) === 3).length}`);
  console.log(`  answers two           ${rows.filter((r) => score(r) === 2).length}`);
  console.log(`  answers one           ${thin.length}`);
  console.log(`  SILENT on all four    ${silent.length}\n`);
  console.log(`  does not say how it ENDS     ${noEnd.length}`);
  console.log(`  does not mention ESCAPE      ${noEscape.length}`);
  console.log(`  does not describe a PREVIEW  ${noPreview.length}\n`);

  const list = (title, rs) => {
    if (!rs.length) return;
    console.log(`  ── ${title} ──`);
    for (const r of rs) console.log(`     ${r.tool.padEnd(22)} ${r.label}`);
    console.log('');
  };
  list('silent on all four questions', silent);
  list('answers only one', thin);
}
