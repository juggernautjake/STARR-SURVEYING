// scripts/audit-bestiary.mjs — is the bestiary actually cultivated? (B5-1 … B5-4)
//
//   npm run audit:bestiary
//
// The owner asked for each stat block to be *cultivated*, not merely present. "Every plane, every
// alignment, all difficulty levels" is a CLAIM, and this is the thing that turns it into a measurement —
// or into a list of what is missing, which is the more useful outcome.
//
// REPORTS, NEVER REPAIRS. A sweep that silently backfilled a blank alignment would be inventing content,
// and a sweep that "fixed" what it found would hide the fact that the import produced it. Everything here
// prints; the decisions belong to whoever reads it.
//
// It also exits non-zero when a HARD invariant is broken (a creature with no name, no system, or a licence
// it is not entitled to), so this can become a CI gate without becoming a nag about soft coverage gaps.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.cwd();
const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const DB_URL = (env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)/) || [])[1];

const bar = (n, total, width = 28) => {
  const filled = total ? Math.round((n / total) * width) : 0;
  return '█'.repeat(filled) + '·'.repeat(width - filled);
};

async function main() {
  const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let hardFailures = 0;

  const { rows: [tot] } = await c.query('SELECT count(*)::int n FROM dnd_creatures');
  console.log(`\n═══ BESTIARY AUDIT — ${tot.n} creatures ═══`);

  // ── B6-3 · the per-system floor ────────────────────────────────────────────────────────────────
  //
  // Owner, 2026-07-30: *"no less than 200-300 creatures/monsters of all kinds and types and sizes and
  // difficulties in each system."* That is four claims, not one, and each is checked separately — a system
  // could hold 3,000 creatures and still have no Gargantuan ones, or nothing above CR 16.
  //
  // A HARD failure, unlike most of this audit. The floor is a promise the owner stated in a number, so a
  // system dropping under it should stop a CI run rather than print a warning nobody reads.
  console.log('\n── B6-3 · Per-system floor (≥200, every band, ≥10 types, ≥5 sizes) ──');
  const FLOOR = 200;
  const { rows: floors } = await c.query(`
    SELECT system,
           count(*)::int                                                        AS n,
           count(DISTINCT size)::int                                            AS sizes,
           count(DISTINCT type)::int                                            AS types,
           count(*) FILTER (WHERE cr_sort <  1)::int                            AS b0,
           count(*) FILTER (WHERE cr_sort >= 1  AND cr_sort <  5)::int          AS b1,
           count(*) FILTER (WHERE cr_sort >= 5  AND cr_sort < 11)::int          AS b2,
           count(*) FILTER (WHERE cr_sort >= 11 AND cr_sort < 17)::int          AS b3,
           count(*) FILTER (WHERE cr_sort >= 17)::int                           AS b4
      FROM dnd_creatures GROUP BY system ORDER BY system`);
  console.log('  system              total  types  sizes    ≤0   1–4  5–10 11–16   17+');
  for (const r of floors) {
    const bands = [r.b0, r.b1, r.b2, r.b3, r.b4];
    const gaps = bands.filter((b) => b === 0).length;
    const bad = r.n < FLOOR || gaps > 0 || r.types < 10 || r.sizes < 5;
    if (bad) hardFailures += 1;
    console.log(
      `  ${bad ? '❌' : '✅'} ${r.system.padEnd(17)} ${String(r.n).padStart(5)}  ${String(r.types).padStart(5)}`
      + `  ${String(r.sizes).padStart(5)}  ${bands.map((b) => String(b).padStart(5)).join(' ')}`,
    );
    if (r.n < FLOOR) console.log(`       └─ under the ${FLOOR} floor by ${FLOOR - r.n}`);
    if (gaps) console.log(`       └─ ${gaps} challenge band(s) empty — "all difficulty levels" fails on the gap, not the average`);
  }

  // ── B5-1 · completeness ────────────────────────────────────────────────────────────────────────
  //
  // Split HARD from SOFT deliberately. A creature with no name is broken; a creature with no languages is
  // a wolf. Reporting both at the same volume trains a reader to skim past the ones that matter.
  console.log('\n── B5-1 · Stat-block completeness ──');
  const FIELDS = [
    ['name',      "name IS NULL OR btrim(name) = ''",                'hard'],
    ['system',    "system IS NULL OR btrim(system) = ''",            'hard'],
    ['licence',   "licence IS NULL OR btrim(licence) = ''",          'hard'],
    ['type',      'type IS NULL',                                    'soft'],
    ['size',      'size IS NULL',                                    'soft'],
    ['CR/level',  'cr IS NULL',                                      'soft'],
    ['AC',        "statblock->>'ac' IS NULL",                        'soft'],
    ['HP',        "statblock->>'hp' IS NULL",                        'soft'],
    ['speed',     "statblock->>'speed' IS NULL",                     'soft'],
    ['senses',    "statblock->>'senses' IS NULL",                    'soft'],
    ['actions',   "jsonb_array_length(coalesce(statblock->'entries','[]'::jsonb)) = 0", 'soft'],
    ['abilities', "statblock->'abilities' IS NULL AND statblock->'abilityMods' IS NULL", 'soft'],
  ];
  for (const [label, pred, severity] of FIELDS) {
    const { rows: [r] } = await c.query(`SELECT count(*)::int n FROM dnd_creatures WHERE ${pred}`);
    if (r.n === 0) { console.log(`  ✅ ${label.padEnd(10)} complete`); continue; }
    if (severity === 'hard') { hardFailures += r.n; console.log(`  ❌ ${label.padEnd(10)} ${r.n} MISSING (hard)`); continue; }
    const { rows: sample } = await c.query(
      `SELECT name, system FROM dnd_creatures WHERE ${pred} ORDER BY name LIMIT 3`,
    );
    console.log(`  ⚠️  ${label.padEnd(10)} ${String(r.n).padStart(4)} missing — e.g. ${sample.map((s) => s.name).join(', ')}`);
  }

  // ── B5-3 · alignment ───────────────────────────────────────────────────────────────────────────
  //
  // Per system, because a global count would be nonsense: PF2's remaster REMOVED alignment from stat
  // blocks entirely, so "492 creatures have no alignment" is a fact about Paizo, not a gap in the import.
  console.log('\n── B5-3 · Alignment coverage (per system — the systems disagree about whether it exists) ──');
  const { rows: systems } = await c.query('SELECT DISTINCT system FROM dnd_creatures ORDER BY 1');
  for (const { system } of systems) {
    const { rows } = await c.query(
      `SELECT coalesce(alignment, '(none)') a, count(*)::int n
         FROM dnd_creatures WHERE system = $1 GROUP BY 1 ORDER BY 2 DESC`, [system],
    );
    const total = rows.reduce((s, r) => s + r.n, 0);
    const none = rows.find((r) => r.a === '(none)')?.n ?? 0;
    console.log(`  ${system} — ${rows.length - (none ? 1 : 0)} distinct alignment(s), ${none} without one of ${total}`);
    if (none === total) console.log('     └─ the whole system: expected for PF2, whose remaster dropped alignment');
    else rows.filter((r) => r.a !== '(none)').slice(0, 4).forEach((r) => console.log(`     ${String(r.n).padStart(4)}  ${r.a}`));
  }

  // ── B5-4 · challenge coverage ──────────────────────────────────────────────────────────────────
  console.log('\n── B5-4 · Challenge/level coverage ──');
  for (const { system } of systems) {
    const { rows } = await c.query(
      `SELECT CASE
                WHEN cr_sort IS NULL   THEN 'unrated'
                WHEN cr_sort < 1       THEN 'a. ≤0 / fractional'
                WHEN cr_sort <= 4      THEN 'b. 1–4'
                WHEN cr_sort <= 10     THEN 'c. 5–10'
                WHEN cr_sort <= 16     THEN 'd. 11–16'
                ELSE                        'e. 17+'
              END band, count(*)::int n
         FROM dnd_creatures WHERE system = $1 GROUP BY 1 ORDER BY 1`, [system],
    );
    const total = rows.reduce((s, r) => s + r.n, 0);
    console.log(`  ${system} (${total})`);
    for (const r of rows) console.log(`     ${r.band.replace(/^[a-e]\. /, '').padEnd(16)} ${bar(r.n, total)} ${r.n}`);
    // An EMPTY band is the finding — "all difficulty levels" fails on the gap, not on the average.
    const empty = ['a. ≤0 / fractional', 'b. 1–4', 'c. 5–10', 'd. 11–16', 'e. 17+']
      .filter((b) => !rows.some((r) => r.band === b));
    if (empty.length) console.log(`     ⚠️  no creatures at: ${empty.map((b) => b.replace(/^[a-e]\. /, '')).join(', ')}`);
  }

  // ── B5-2 · environments / planes ───────────────────────────────────────────────────────────────
  console.log('\n── B5-2 · Environment & plane tagging ──');
  const { rows: [envs] } = await c.query(
    "SELECT count(*) FILTER (WHERE coalesce(array_length(environments,1),0) > 0)::int tagged, count(*)::int n FROM dnd_creatures",
  );
  console.log(`  ${envs.tagged} of ${envs.n} carry an environment.`);
  if (envs.tagged === 0) {
    console.log('  ⚠️  NONE. Neither source publishes environment data, so "creatures from every plane" is');
    console.log('     not yet a filter — it would have to be derived (as the tags are) or authored.');
  }

  // ── categories + variants ──────────────────────────────────────────────────────────────────────
  console.log('\n── Category tags & variants ──');
  const { rows: tags } = await c.query('SELECT unnest(tags) t, count(*)::int n FROM dnd_creatures GROUP BY 1 ORDER BY 2 DESC');
  console.log('  ' + tags.map((t) => `${t.t} ${t.n}`).join(' · '));
  const { rows: [untagged] } = await c.query("SELECT count(*)::int n FROM dnd_creatures WHERE coalesce(array_length(tags,1),0) = 0");
  console.log(`  ${untagged.n} creature(s) carry no category tag at all.`);
  const { rows: [v] } = await c.query(
    `SELECT (SELECT count(*)::int FROM dnd_creature_variants) variants,
            (SELECT count(*)::int FROM dnd_creatures WHERE variant_eligible) eligible`,
  );
  console.log(`  ${v.variants} variants across ${v.eligible} eligible creatures ` +
    `(expected ${v.eligible * 2}${v.variants === v.eligible * 2 ? ' ✅' : ' ⚠️'}).`);

  // ── art ────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n── Art & licensing ──');
  const { rows: [art] } = await c.query(
    'SELECT count(image_url)::int with_art, count(*)::int n FROM dnd_creatures',
  );
  console.log(`  ${art.with_art} of ${art.n} have a picture; the rest render a generated sigil.`);
  // The schema CHECK already forbids this, so a non-zero count means the constraint was dropped.
  const { rows: [unlicensed] } = await c.query(
    "SELECT count(*)::int n FROM dnd_creatures WHERE image_url IS NOT NULL AND (image_licence IS NULL OR image_attribution IS NULL)",
  );
  if (unlicensed.n) { hardFailures += unlicensed.n; console.log(`  ❌ ${unlicensed.n} image(s) with no licence — the CHECK constraint is gone`); }
  else console.log('  ✅ every stored image carries a licence and a credit');

  console.log(hardFailures ? `\n❌ ${hardFailures} hard failure(s).\n` : '\n✅ No hard failures.\n');
  await c.end();
  process.exitCode = hardFailures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
