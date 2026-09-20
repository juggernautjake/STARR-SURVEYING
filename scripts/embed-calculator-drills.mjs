// scripts/embed-calculator-drills.mjs — put the guided routines where they are taught.
//
// Owner, 2026-09-20: "I need to become very familiar and quick with the calculator."
//
// Familiarity comes from doing it in the place where the technique is explained, not from a
// separate practice page somebody has to remember to visit. Each routine is matched to the module
// section that covers the same technique, and the directive is written into that section.
//
// Idempotent, and `--dry-run` shows the plan without writing.

import pg from 'pg';
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');

// Each routine, and the words that identify the section teaching it. Matching on the CONTENT is
// what keeps this correct when modules are reordered or retitled — the alternative, a hard-coded
// module number and index, is wrong the first time anyone edits the curriculum.
const PLACEMENTS = [
  {
    routine: 'inverse-distance',
    lead: 'Work it on the calculator, one key at a time. Nothing is computed until you press the key yourself.',
    wants: ['inverse', 'distance'],
    module: 3,
  },
  {
    routine: 'inverse-bearing',
    lead: 'The other half. Note what the calculator hands back, and what it leaves to you.',
    wants: ['inverse', 'bearing'],
    module: 3,
  },
  {
    routine: 'dms-to-decimal',
    lead: 'This one is pure arithmetic, which means it works on every approved calculator. Follow it through.',
    wants: ['dms', 'decimal'],
    module: 3,
  },
  {
    routine: 'latitude-departure',
    lead: 'The signs come out on their own when you work from the azimuth. Watch them as you go.',
    wants: ['latitude', 'departure'],
    module: 4,
  },
  {
    routine: 'curve-radius-tangent',
    lead: 'Every curve problem starts here. Run it until the constant is in your fingers.',
    wants: ['curve', 'tangent'],
    module: 5,
  },
  {
    routine: 'memory-sto-rcl',
    lead: 'The same curve, without retyping the radius. Five fewer digits typed is five fewer chances to transpose one.',
    wants: ['calculator', 'memory'],
    module: 9,
  },
  {
    routine: 'stats-mean-sd',
    lead: 'The statistics registers are worth the ten minutes it takes to learn them properly.',
    wants: ['standard deviation', 'mean'],
    module: 9,
  },
];

const url = (readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m) || [])[1]
  .trim().replace(/^["']|["']$/g, '');

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(
  'select id, module_number, title, content_sections from fs_study_modules order by module_number',
);

/** The section in a module whose text mentions the most of what a routine is about. */
function bestSection(moduleRow, wants) {
  const sections = Array.isArray(moduleRow.content_sections) ? moduleRow.content_sections : [];
  let best = null;
  sections.forEach((sec, index) => {
    const title = String(sec?.title ?? '');
    // Never an overview: it is read once, at speed, and an exercise there is skipped by the person
    // who most needs it and never met again.
    if (/overview/i.test(title)) return;
    const text = `${title}\n${sec?.content ?? ''}`.toLowerCase();
    const score = wants.filter((w) => text.includes(w)).length;
    if (score === 0) return;
    // Ties go to "Worked Examples" — a routine IS a worked example, done by hand.
    const bonus = /worked/i.test(title) ? 0.5 : 0;
    if (!best || score + bonus > best.score) best = { index, section: sec, score: score + bonus };
  });
  return best;
}

const plan = [];
for (const p of PLACEMENTS) {
  const moduleRow = rows.find((r) => r.module_number === p.module);
  if (!moduleRow) { console.log(`   ✗ ${p.routine}: no module ${p.module}`); continue; }
  const hit = bestSection(moduleRow, p.wants);
  if (!hit) { console.log(`   ✗ ${p.routine}: no section in m${p.module} mentions ${p.wants.join(' + ')}`); continue; }
  if (String(hit.section.content ?? '').includes(`routine=${p.routine}`)) {
    console.log(`   = ${p.routine}: already in m${p.module} "${hit.section.title}"`);
    continue;
  }
  plan.push({ moduleRow, index: hit.index, placement: p });
  console.log(`   → ${p.routine}: m${p.module} "${hit.section.title}"`);
}

if (plan.length === 0) {
  console.log('\nnothing to do.');
  await c.end();
  process.exit(0);
}

if (DRY) {
  console.log(`\ndry run — ${plan.length} would be written.`);
  await c.end();
  process.exit(0);
}

// Grouped by module, because two routines can land in the same module row and the second write
// would otherwise overwrite the first with a copy of the pre-edit sections.
const byModule = new Map();
for (const item of plan) {
  if (!byModule.has(item.moduleRow.id)) byModule.set(item.moduleRow.id, { row: item.moduleRow, items: [] });
  byModule.get(item.moduleRow.id).items.push(item);
}

let written = 0;
for (const { row, items } of byModule.values()) {
  const sections = row.content_sections.map((sec, i) => {
    // `filter`, not `find`: two routines can legitimately belong in the same section, and `find`
    // would write the first and drop the second without a word.
    const here = items.filter((x) => x.index === i);
    if (here.length === 0) return sec;
    const blocks = here
      .map((it) => `\n\n${it.placement.lead}\n\n[demo:calculator routine=${it.placement.routine}]\n`)
      .join('');
    return { ...sec, content: `${String(sec.content ?? '').trimEnd()}${blocks}` };
  });
  await c.query('update fs_study_modules set content_sections = $1, updated_at = now() where id = $2',
    [JSON.stringify(sections), row.id]);

  // Read back. A write that reports success without checking is how a seed comes to be "applied"
  // and absent at the same time.
  const { rows: after } = await c.query('select content_sections from fs_study_modules where id = $1', [row.id]);
  for (const item of items) {
    const got = after[0]?.content_sections?.[item.index]?.content ?? '';
    if (!got.includes(`routine=${item.placement.routine}`)) {
      console.log(`✗ ${item.placement.routine} is not there after writing it. Stopping.`);
      await c.end();
      process.exit(1);
    }
    written += 1;
  }
}

console.log(`\n✓ ${written} embedded and verified.`);
await c.end();
