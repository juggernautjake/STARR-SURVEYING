// scripts/import-open5e.mjs — grow the 5e bestiary from the freely-licensed monster corpus.
//
//   npm run import:open5e -- --dry-run              # report, write nothing
//   npm run import:open5e                           # every document below, upsert
//   npm run import:open5e -- --doc=tob-2023         # one document
//
// Run through vite-node WITH the repo's vitest config — the transform is TypeScript importing via `@/`,
// which only `vitest.config.ts` resolves. The import must be STATIC: a lazy `await import()` races
// vite-node's shutdown and dies with ERR_CLOSED_SERVER. Both lessons are from B1-3.
//
// ── WHAT THIS IS, AND WHAT IT IS DELIBERATELY NOT ────────────────────────────────────────────────────
//
// The SRD gave the bestiary 334 creatures, which is the whole of what Wizards of the Coast released. The
// rest of the 5e monster corpus splits cleanly in two, and only one half can be catalogued here:
//
//   · FREELY LICENSED, and the source of every row below — Kobold Press's Tome of Beasts 1–3 and Creature
//     Codex (OGL 1.0a), EN Publishing's Monstrous Menagerie (OGL 1.0a), the Black Flag SRD (CC-BY-4.0),
//     Tal'Dorei (OGL 1.0a). Roughly 2,500 monsters, every one with a licence that permits redistribution
//     and a publisher that intended it.
//
//   · THE MONSTER MANUAL and its siblings, which are copyrighted and not licensed for redistribution at
//     any scale. Sites that reproduce them in full — 5e.tools and its mirrors, flipbook and PDF scans of
//     the book — are not sources this importer will read, regardless of how convenient the JSON is.
//     `/dnd` is publicly reachable by direct link, so cataloguing them is republishing the book.
//
// That boundary is the bestiary plan's Ground Rule 3 ("a creature whose licence we cannot state does not
// get imported") applied to the largest temptation there is to break it.
//
// ── LICENCE IS READ FROM THE DATA, NOT FROM THIS FILE ────────────────────────────────────────────────
//
// Open5e publishes each document's licences as structured data, so the run asks the API what it is allowed
// to use rather than trusting the list of document keys below. A document whose licence set is empty, or
// is not on the allowlist, is REFUSED BY NAME — that is how B1-5 discovered its own licence rule was wrong
// (a legitimate creature refused because one legacy item carried a stale marker), and a refusal that
// prints is a rule that can be argued with.
//
// ── WHY `tob` IS ABSENT AND `tob-2023` IS PRESENT ────────────────────────────────────────────────────
//
// Open5e carries both the original Tome of Beasts and its 2023 revision — 391 and 408 creatures with
// substantially the same names. Importing both would put two Clockwork Dragons in the catalogue that
// differ in a few numbers, and a DM searching would have no way to tell which is which. The revision
// supersedes the original, so only the revision is catalogued. Stated here rather than silently omitted.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { open5eCreatureToRow, open5eIsRedistributable, open5eLicenceLabel } from '../lib/dnd/bestiary/import-open5e.ts';

const ROOT = process.cwd();
const API = 'https://api.open5e.com/v2';
const DRY = process.argv.includes('--dry-run');
const ONLY = (process.argv.find((a) => a.startsWith('--doc=')) || '').split('=')[1] || null;

/**
 * The documents catalogued, with the slug prefix each gets.
 *
 * A PREFIX PER DOCUMENT, not per publisher: `tob2:drake` and `tob3:drake` are different creatures from
 * different books, and a shared prefix would make the second silently overwrite the first on upsert. The
 * SRD's own `srd51`/`srd52` prefixes already work this way.
 *
 * `srd-2014` and `srd-2024` are absent because the bestiary already holds them from their own importer,
 * and a second copy under a different prefix would double every SRD monster in the catalogue.
 */
const DOCUMENTS = [
  { key: 'a5e-mm', prefix: 'a5emm', label: 'Monstrous Menagerie (Level Up: Advanced 5th Edition)' },
  { key: 'tob-2023', prefix: 'tob1', label: 'Tome of Beasts 1 (2023 Edition)' },
  { key: 'tob2', prefix: 'tob2', label: 'Tome of Beasts 2' },
  { key: 'tob3', prefix: 'tob3', label: 'Tome of Beasts 3' },
  { key: 'ccdx', prefix: 'ccdx', label: 'Creature Codex' },
  { key: 'bfrd', prefix: 'bfrd', label: 'Black Flag SRD (Tales of the Valiant)' },
  { key: 'tdcs', prefix: 'tdcs', label: "Tal'Dorei Campaign Setting" },
];

const SYSTEM = 'dnd5e-2014';

/**
 * Documents whose actions have to be recovered from the v1 endpoint.
 *
 * v2 is the primary source everywhere — it publishes attacks as structured data, which is what makes an
 * entry rollable rather than merely readable. But its migration is unfinished: 396 of Tome of Beasts 3's
 * 397 creatures arrive from v2 with `actions: []` while v1 carries all of them. Importing from v2 alone
 * would have catalogued 396 monsters with a complete defensive line and nothing to do on their turn — each
 * transforming successfully and looking fine.
 *
 * Listed rather than attempted for every document, because v1 only carries the Kobold Press books at these
 * slugs (`a5e-mm`, `ccdx`, `bfrd` and `tdcs` return 0 there) and a blind fetch would be 4 wasted round
 * trips reported as an error. The fallback fires per CREATURE, only where v2 is empty.
 */
const V1_DOCS = { 'tob-2023': 'tob-2023', tob2: 'tob2', tob3: 'tob3' };

const CACHE = path.join(ROOT, '.cache');

async function getJson(url) {
  // Cached per URL. 3,000 creatures is ~90 requests against someone else's free API; a re-run during
  // development should cost them nothing.
  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `open5e-${Buffer.from(url).toString('base64url').slice(-100)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(url, { headers: { 'User-Agent': 'starr-tabletop-bestiary/1.0 (self-hosted campaign tool)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

/** Every page of a paginated list endpoint. */
async function getAll(url) {
  const out = [];
  let next = url;
  while (next) {
    const page = await getJson(next);
    out.push(...(page.results ?? []));
    next = page.next;
  }
  return out;
}

async function main() {
  const docs = await getAll(`${API}/documents/?limit=50`);
  const byKey = new Map(docs.map((d) => [d.key, d]));

  const wanted = DOCUMENTS.filter((d) => !ONLY || d.key === ONLY);
  if (!wanted.length) throw new Error(`--doc=${ONLY} is not a catalogued document.`);

  const rows = [];
  const refused = [];
  const report = [];

  for (const doc of wanted) {
    const meta = byKey.get(doc.key);
    if (!meta) { refused.push(`${doc.key}: not published by the API`); continue; }

    // G3, enforced against the API's own statement rather than this file's assumption.
    if (!open5eIsRedistributable(meta.licenses)) {
      refused.push(`${doc.key}: licence "${(meta.licenses ?? []).map((l) => l.key).join(', ') || 'unstated'}" is not one we can redistribute under`);
      continue;
    }

    const licence = open5eLicenceLabel(meta.licenses);
    const publisher = meta.publisher?.name ?? 'the publisher';
    const attribution = `${doc.label}. © ${publisher}. Authors: ${meta.author ?? 'see publication'}. `
      + `Used under ${licence}.`;

    const creatures = await getAll(`${API}/creatures/?limit=500&document__key=${doc.key}`);

    // Fetched ONCE per document and only when v2 actually left actions out, so the recovery costs nothing
    // for the documents that do not need it.
    let v1ById = new Map();
    const gaps = creatures.filter((c) => !(c.actions ?? []).some((a) => a.action_type === 'ACTION')).length;
    if (gaps && V1_DOCS[doc.key]) {
      const v1 = await getAll(`${API.replace('/v2', '/v1')}/monsters/?limit=500&document__slug=${V1_DOCS[doc.key]}`);
      v1ById = new Map(v1.map((m) => [m.slug, m]));
    }

    let ok = 0;
    let recovered = 0;
    const skipped = [];
    for (const c of creatures) {
      // v2 keys are `${document}_${slug}`; v1 keys are the bare slug.
      const v1 = v1ById.get(String(c.key ?? '').replace(`${doc.key}_`, ''));
      const imported = open5eCreatureToRow(c, {
        source: doc.label,
        licence,
        attribution,
        sourceUrl: meta.permalink ?? undefined,
        slugPrefix: doc.prefix,
        system: SYSTEM,
      }, v1);
      if (!imported) { skipped.push(c.name ?? c.key ?? '(unnamed)'); continue; }
      // Counted against whether the FALLBACK fired, not against "the row ended up with a non-trait entry" —
      // the looser test credited v1 for a creature whose only v2 entry was a reaction (the Shrieker), and a
      // recovery number that counts things it did not recover is worse than no number.
      if (v1 && !(c.actions ?? []).some((a) => a.action_type === 'ACTION')
        && imported.row.statblock.entries?.some((e) => e.kind === 'action')) recovered += 1;
      rows.push(imported.row);
      ok += 1;
    }
    report.push({ doc, licence, publisher, total: creatures.length, ok, skipped, gaps, recovered });
  }

  // ── the report comes BEFORE the write (G6: nothing silently truncates) ─────────────────────────────
  console.log('\nDocument                                        licence      creatures  refused');
  for (const r of report) {
    console.log(
      `${r.doc.label.padEnd(46).slice(0, 46)}  ${r.licence.padEnd(11)}  ${String(r.ok).padStart(9)}  ${String(r.skipped.length).padStart(7)}`,
    );
    for (const s of r.skipped.slice(0, 5)) console.log(`    refused: ${s}`);
    if (r.skipped.length > 5) console.log(`    …and ${r.skipped.length - 5} more`);
    // Stated per document rather than summed, because "396 recovered" is a fact about Tome of Beasts 3's
    // migration and reads as a fact about the importer once it is averaged into a total.
    if (r.gaps) {
      console.log(`    ${r.recovered}/${r.gaps} creatures had no actions in v2; recovered from v1`
        + `${r.recovered < r.gaps ? ` — ${r.gaps - r.recovered} genuinely have none` : ''}`);
    }
  }
  for (const r of refused) console.log(`  DOCUMENT REFUSED — ${r}`);

  // A creature that arrives without AC, HP or an action transformed "successfully" and is still unusable.
  // Counting them is the probe B1-3 had to write by hand after the fact, made part of the run.
  // `actions` and `anything-to-do` are counted separately on purpose. A creature with only a Reaction has
  // no Actions block and is still perfectly playable; a creature with neither is the defect. Folding them
  // together reports a number nobody can act on.
  const missing = { ac: 0, hp: 0, speed: 0, cr: 0, actions: 0, 'nothing-to-do': 0, abilities: 0, senses: 0 };
  const idle = [];
  for (const r of rows) {
    if (r.statblock.ac === undefined) missing.ac += 1;
    if (r.statblock.hp === undefined) missing.hp += 1;
    if (!r.statblock.speed) missing.speed += 1;
    if (!r.cr) missing.cr += 1;
    if (!r.statblock.entries?.some((e) => e.kind === 'action')) missing.actions += 1;
    if (!r.statblock.entries?.some((e) => e.kind !== 'trait')) { missing['nothing-to-do'] += 1; idle.push(r.name); }
    if (!r.statblock.abilities || !Object.keys(r.statblock.abilities).length) missing.abilities += 1;
    if (!r.statblock.senses) missing.senses += 1;
  }
  console.log(`\n${rows.length} creatures transformed. Missing fields:`);
  for (const [k, v] of Object.entries(missing)) {
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(5)}  ${v === 0 ? '' : `(${((v / rows.length) * 100).toFixed(1)}%)`}`);
  }

  const bands = { '≤0': 0, '1–4': 0, '5–10': 0, '11–16': 0, '17+': 0 };
  for (const r of rows) {
    const n = r.cr_sort;
    if (n === undefined || n === null) continue;
    if (n < 1) bands['≤0'] += 1;
    else if (n < 5) bands['1–4'] += 1;
    else if (n < 11) bands['5–10'] += 1;
    else if (n < 17) bands['11–16'] += 1;
    else bands['17+'] += 1;
  }
  if (idle.length) console.log(`  nothing-to-do: ${idle.slice(0, 12).join(', ')}${idle.length > 12 ? `, …+${idle.length - 12}` : ''}`);
  console.log(`Challenge coverage: ${Object.entries(bands).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
  console.log(`${rows.filter((r) => r.variant_eligible).length} variant-eligible.`);

  // Two documents can name the same creature. The slug prefix keeps them apart in the database, so this is
  // only worth REPORTING — but a reader who searches "Drake" and gets four should know why.
  const names = new Map();
  for (const r of rows) names.set(r.name, (names.get(r.name) ?? 0) + 1);
  const dupes = [...names.entries()].filter(([, n]) => n > 1);
  console.log(`${dupes.length} names appear in more than one book (kept, with their own slugs).`);

  if (DRY) {
    console.log('\n--dry-run: nothing written.');
    const sample = rows.find((r) => r.statblock.entries?.some((e) => e.toHit));
    console.log('Sample:', JSON.stringify({ ...sample, statblock: { ...sample.statblock, entries: sample.statblock.entries?.slice(0, 2) } }, null, 1).slice(0, 2200));
    return;
  }

  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/);
  if (!m) throw new Error('SUPABASE_DB_URL not set in .env.local');
  const client = new pg.Client({ connectionString: m[1].trim(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  let written = 0;
  try {
    // ONE TRANSACTION, as with every other bestiary import: a half-filled catalogue looks complete.
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO dnd_creatures
           (slug, name, system, type, size, alignment, cr, cr_sort, statblock, description,
            tags, environments, source, licence, attribution, source_url, variant_eligible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (slug, system) DO UPDATE SET
           name = EXCLUDED.name, type = EXCLUDED.type, size = EXCLUDED.size,
           alignment = EXCLUDED.alignment, cr = EXCLUDED.cr, cr_sort = EXCLUDED.cr_sort,
           statblock = EXCLUDED.statblock, description = EXCLUDED.description,
           tags = EXCLUDED.tags, environments = EXCLUDED.environments,
           source = EXCLUDED.source, licence = EXCLUDED.licence, attribution = EXCLUDED.attribution,
           source_url = EXCLUDED.source_url, variant_eligible = EXCLUDED.variant_eligible,
           updated_at = now()`,
        [
          r.slug, r.name, r.system, r.type ?? null, r.size ?? null, r.alignment ?? null,
          r.cr ?? null, r.cr_sort ?? null, JSON.stringify(r.statblock), r.description ?? null,
          r.tags, r.environments, r.source, r.licence, r.attribution, r.source_url ?? null,
          r.variant_eligible,
        ],
      );
      written += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    const total = await client.query('SELECT count(*)::int n FROM dnd_creatures');
    console.log(`\n✅ Wrote ${written}. dnd_creatures now holds ${total.rows[0].n}.`);
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
