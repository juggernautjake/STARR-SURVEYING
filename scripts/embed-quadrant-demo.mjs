// scripts/embed-quadrant-demo.mjs — put the compass into the section it teaches.
//
// Owner, 2026-09-20: "Things like having a unit circle/compass and asking the user to select which
// quadrant is the 192 degrees in."
//
// The component and the `[demo:...]` directive are code; WHERE the demo appears is content, and
// content lives in the database. This script writes the directive into the section that actually
// covers azimuth-to-bearing conversion, rather than the page hard-coding "module 2 shows a
// compass" — which would be wrong the first time somebody reorders a module.
//
// Idempotent: it looks for the directive before adding it, and `--dry-run` shows what it would do.

import pg from 'pg';
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');

const url = (readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m) || [])[1]
  .trim().replace(/^["']|["']$/g, '');

// The directive, and the sentence that introduces it. A widget dropped into prose with no lead-in
// reads as a glitch; one sentence of "try it" is the difference between an exercise and a bug.
const BLOCK = `

Try it: the needle stays hidden until you choose, so this is the same judgement you make on a data
sheet with nothing but a number in front of you.

[demo:quadrant azimuth=192]
`;

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// Sections live as a jsonb array on the module row, not as their own table, so the find-and-edit
// is done in JS rather than SQL. The section is chosen by WHAT IT TEACHES, not by an id or an
// index: azimuth-to-bearing conversion is the one place the quadrant question is the whole point,
// and an index would be wrong the first time somebody reorders a module.
const { rows } = await c.query(
  'select id, module_number, title, content_sections from fs_study_modules order by module_number',
);

const hits = [];
for (const m of rows) {
  const sections = Array.isArray(m.content_sections) ? m.content_sections : [];
  sections.forEach((sec, i) => {
    const text = `${sec?.title ?? ''}
${sec?.content ?? ''}`.toLowerCase();
    // BOTH words, in the body. A section that only says "bearing" is using the word in passing;
    // a section that says "quadrant" is the one teaching the thing this demo asks about.
    //
    // And never the overview. An overview is read once, at speed, to find out what is coming — an
    // exercise there gets skipped by exactly the person who most needs it, and then never
    // encountered again because nobody re-reads an overview.
    const isOverview = /overview/i.test(String(sec?.title ?? ''));
    if (!isOverview && text.includes('azimuth') && text.includes('quadrant')) {
      hits.push({ module: m, index: i, section: sec });
    }
  });
}

if (hits.length === 0) {
  console.log('✗ no section covers azimuths and quadrants — nothing written.');
  await c.end();
  process.exit(1);
}

console.log(`${hits.length} candidate section(s):`);
for (const h of hits) console.log(`   m${h.module.module_number} · ${h.module.title} → ${h.section.title}`);

// The first in module order is the earliest point a student meets the idea, which is where a
// demonstration is worth the most.
const target = hits[0];

if (String(target.section.content ?? '').includes('[demo:quadrant')) {
  console.log(`
✓ already embedded in "${target.section.title}" — nothing to do.`);
  await c.end();
  process.exit(0);
}

console.log(`
→ embedding in m${target.module.module_number} "${target.section.title}"`);
if (DRY) {
  console.log(BLOCK);
  await c.end();
  process.exit(0);
}

const sections = target.module.content_sections.map((sec, i) =>
  i === target.index ? { ...sec, content: `${String(sec.content ?? '').trimEnd()}
${BLOCK}` } : sec);

await c.query('update fs_study_modules set content_sections = $1, updated_at = now() where id = $2',
  [JSON.stringify(sections), target.module.id]);

// Read it back. A write that reports success without checking is how a seed comes to be "applied"
// and absent at the same time.
const { rows: after } = await c.query(
  'select content_sections from fs_study_modules where id = $1', [target.module.id]);
const written = after[0]?.content_sections?.[target.index]?.content ?? '';
if (!written.includes('[demo:quadrant azimuth=192]')) {
  console.log('✗ wrote it, and it is not there. Investigate before re-running.');
  await c.end();
  process.exit(1);
}

console.log('✓ embedded and verified.');
await c.end();
