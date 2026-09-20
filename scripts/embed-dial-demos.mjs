// scripts/embed-dial-demos.mjs — put the two draggable demos where they are taught.
//
// Owner, 2026-09-20: "turning an instrument in the right direction, or reorienting a drawing to the
// correct north."
//
// Same shape as embed-calculator-drills.mjs: sections are chosen by what they TEACH, never by an
// index, and never an overview. Idempotent; `--dry-run` shows the plan.

import pg from 'pg';
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');

// ── WHERE EACH ONE GOES, AND ONE PLACE IT DELIBERATELY DOES NOT ────────────────────────────────
//
// The deflection variant was first aimed at the traversing module, which does not mention
// deflection angles at all. The automatic fallback then found "deflection" in the CURVES module —
// and every one of those is the curve's central angle, which is a different quantity that happens
// to share a name. Dropping the demo there would have taught the wrong association.
//
// So both turned-angle variants sit in the module that actually teaches angle measurement, where
// the plain case and the deflection case can be met one after the other, which is the order that
// makes the distinction land. `module` is explicit here and there is no fallback search: a demo
// that cannot find its home should say so rather than settle for somewhere nearby.
const PLACEMENTS = [
  {
    id: 'turn-angle-right',
    directive: '[demo:turn-angle backsight=90 angle=87.25 direction=right]',
    lead: 'Point the telescope where that angle puts it. Drag the handle, or use the arrow keys.',
    wants: ['backsight', 'angle'],
    module: 3,
  },
  {
    id: 'turn-angle-deflection',
    directive: '[demo:turn-angle backsight=90 angle=20 direction=right deflection=yes]',
    lead: 'Now the same instrument, the same backsight, and a *deflection* of 20° right instead. It is measured from the extension of the back line, so it does not land where a plain angle right would. Try it before reading on — the difference is worth meeting as a surprise.',
    wants: ['backsight', 'angle'],
    module: 3,
  },
  {
    id: 'north-up',
    directive: '[demo:north-up rotation=128 bearing=64]',
    lead: 'Turn the plat until its north arrow is up the page, then look at what happened to the bearing.',
    wants: ['plat', 'bearing'],
    module: 7,
  },
];

const url = (readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m) || [])[1]
  .trim().replace(/^["']|["']$/g, '');

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(
  'select id, module_number, title, content_sections from fs_study_modules order by module_number',
);

/** The section in a module whose text mentions the most of what a demo is about. */
function bestSection(moduleRow, wants) {
  const sections = Array.isArray(moduleRow.content_sections) ? moduleRow.content_sections : [];
  let best = null;
  sections.forEach((sec, index) => {
    const title = String(sec?.title ?? '');
    if (/overview/i.test(title)) return;
    const text = `${title}\n${sec?.content ?? ''}`.toLowerCase();
    const score = wants.filter((w) => text.includes(w)).length;
    if (score === 0) return;
    const bonus = /key concepts/i.test(title) ? 0.5 : 0;
    if (!best || score + bonus > best.score) best = { index, section: sec, score: score + bonus };
  });
  return best;
}

const plan = [];
for (const p of PLACEMENTS) {
  const moduleRow = rows.find((r) => r.module_number === p.module);
  if (!moduleRow) { console.log(`   ✗ ${p.id}: no module ${p.module}`); continue; }
  // No fallback to another module. Searching the whole curriculum for a matching word is how the
  // deflection demo nearly landed in the curves module, where "deflection" means something else.
  const hit = bestSection(moduleRow, p.wants);
  if (!hit) { console.log(`   ✗ ${p.id}: nothing in m${p.module} mentions ${p.wants.join(' + ')}`); continue; }
  const owner = moduleRow;
  if (String(hit.section.content ?? '').includes(p.directive)) {
    console.log(`   = ${p.id}: already in m${p.module} "${hit.section.title}"`);
    continue;
  }
  plan.push({ moduleRow: owner, index: hit.index, placement: p });
  console.log(`   → ${p.id}: m${p.module} "${hit.section.title}"`);
}

if (plan.length === 0) { console.log('\nnothing to do.'); await c.end(); process.exit(0); }
if (DRY) { console.log(`\ndry run — ${plan.length} would be written.`); await c.end(); process.exit(0); }

const byModule = new Map();
for (const item of plan) {
  if (!byModule.has(item.moduleRow.id)) byModule.set(item.moduleRow.id, { row: item.moduleRow, items: [] });
  byModule.get(item.moduleRow.id).items.push(item);
}

let written = 0;
for (const { row, items } of byModule.values()) {
  const sections = row.content_sections.map((sec, i) => {
    // `filter`, not `find`: two demos can belong in the same section, and `find` would write the
    // first and drop the second without a word.
    const here = items.filter((x) => x.index === i);
    if (here.length === 0) return sec;
    const blocks = here.map((it) => `\n\n${it.placement.lead}\n\n${it.placement.directive}\n`).join('');
    return { ...sec, content: `${String(sec.content ?? '').trimEnd()}${blocks}` };
  });
  await c.query('update fs_study_modules set content_sections = $1, updated_at = now() where id = $2',
    [JSON.stringify(sections), row.id]);

  const { rows: after } = await c.query('select content_sections from fs_study_modules where id = $1', [row.id]);
  for (const item of items) {
    const got = after[0]?.content_sections?.[item.index]?.content ?? '';
    if (!got.includes(item.placement.directive)) {
      console.log(`✗ ${item.placement.id} is not there after writing it. Stopping.`);
      await c.end();
      process.exit(1);
    }
    written += 1;
  }
}

console.log(`\n✓ ${written} embedded and verified.`);
await c.end();
