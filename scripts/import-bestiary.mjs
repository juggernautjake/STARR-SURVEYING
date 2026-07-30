// scripts/import-bestiary.mjs — fill the bestiary from the freely-licensed SRD (B1-3).
//
//   npm run import:bestiary -- --dry-run                # 2014 SRD, report only
//   npm run import:bestiary                             # 2014 SRD, upsert
//   npm run import:bestiary -- --source=2024            # the 2024 set
//
// Run through vite-node WITH the repo's vitest config, because the transform is TypeScript and imports via
// the `@/` alias — which only `vitest.config.ts` defines. Plain `node` cannot load it and bare `vite-node`
// resolves `@/lib/...` as a missing package.
//
// ── LICENCE, STATED BEFORE ANYTHING ELSE ─────────────────────────────────────────────────────────────
//
// The D&D 5.1 System Reference Document was released by Wizards of the Coast under CC-BY-4.0 in 2023. The
// licence permits redistribution and requires attribution, which is why `source`, `licence` and
// `attribution` are NOT NULL on `dnd_creatures` — content cannot be catalogued here without the line the
// licence demands, and the creature page prints it.
//
// This imports the SRD ONLY. Monsters that are Product Identity rather than SRD — beholder, mind flayer,
// displacer beast — are not in this file and are not invented. The bestiary is complete-to-the-licence,
// and G6 says that has to be visible rather than merely true, so the run reports what it skipped and why.
//
// ── WHY A SCRIPT AND NOT A SEED ──────────────────────────────────────────────────────────────────────
//
// 334 creatures with full statblocks is ~1.3 MB of JSON. As a .sql file that is a diff nobody can review
// and a merge conflict nobody can resolve. The transform (`srdCreatureToRow`) is the reviewable artifact
// and it is under test; this is a loop that runs it. Re-running is safe: the slug is stable, so it upserts.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
// STATIC, not a lazy `await import()` inside main(). Run through vite-node (which resolves the TypeScript),
// a dynamic import races the dev server's shutdown and dies with ERR_CLOSED_SERVER — the transform is
// requested after vite has already decided the module graph is complete.
import { srdCreatureToRow } from '../lib/dnd/bestiary/import.ts';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 0;

// ── SOURCES ──────────────────────────────────────────────────────────────────────────────────────────
//
// Both editions come from the same publisher in the same shape, so one transform serves both and the only
// difference is the slug prefix (which keeps a 2014 Goblin and a 2024 Goblin apart) and the system tag.
//
// A NOTE ON THE 2024 SET, because the plan's target for it is wrong. B1-4 says "Target: 300+". The
// publication currently carries **three** monsters — Aboleth, Adult Black Dragon, Adult Blue Dragon. That
// is not a bug in this importer and not something to work around: the upstream 2024 SRD conversion is
// simply unfinished. Importing three and saying so is correct-to-source; inventing the rest would be
// exactly what Ground Rule 3 forbids. Re-run this whenever upstream grows — the upsert makes that free.
const SOURCES = {
  2014: {
    url: 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Monsters.json',
    cache: '.cache/srd51-monsters.json',
    provenance: {
      source: 'SRD 5.1',
      licence: 'CC-BY-4.0',
      attribution:
        'This work includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, ' +
        'available at https://dnd.wizards.com/resources/systems-reference-document, licensed under CC-BY-4.0.',
      sourceUrl: 'https://dnd.wizards.com/resources/systems-reference-document',
      slugPrefix: 'srd51',
      system: 'dnd5e-2014',
    },
  },
  2024: {
    url: 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Monsters.json',
    cache: '.cache/srd52-monsters.json',
    provenance: {
      source: 'SRD 5.2',
      licence: 'CC-BY-4.0',
      attribution:
        'This work includes material from the System Reference Document 5.2 by Wizards of the Coast LLC, ' +
        'available at https://dnd.wizards.com/resources/systems-reference-document, licensed under CC-BY-4.0.',
      sourceUrl: 'https://dnd.wizards.com/resources/systems-reference-document',
      slugPrefix: 'srd52',
      system: 'dnd5e-2024',
    },
  },
};

const EDITION = (process.argv.find((a) => a.startsWith('--source=')) || '').split('=')[1] || '2014';
const SOURCE = SOURCES[EDITION];
if (!SOURCE) {
  console.error(`Unknown --source=${EDITION}. Use one of: ${Object.keys(SOURCES).join(', ')}`);
  process.exit(1);
}
const SOURCE_URL = SOURCE.url;
const CACHE = path.join(ROOT, SOURCE.cache);
const PROVENANCE = SOURCE.provenance;

/** Cache the download. A re-run during development should not re-fetch 1.3 MB, and an import that only
 *  works online is one that cannot be re-run while debugging the transform. */
async function loadSource() {
  if (fs.existsSync(CACHE)) {
    const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    console.log(`Using cached source: ${raw.length} creatures (delete ${path.relative(ROOT, CACHE)} to refresh)`);
    return raw;
  }
  console.log(`Fetching the ${PROVENANCE.source} monster set…`);
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Source fetch failed: ${res.status}`);
  const raw = await res.json();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(raw));
  console.log(`Fetched ${raw.length} creatures.`);
  return raw;
}

async function main() {
  const raw = await loadSource();

  const rows = [];
  const refused = [];
  const thin = [];

  for (const src of LIMIT ? raw.slice(0, LIMIT) : raw) {
    const out = srdCreatureToRow(src, PROVENANCE);
    if (!out) { refused.push(src?.name ?? '(unnamed)'); continue; }
    rows.push(out.row);
    // G6: nothing silently truncates. A creature that transformed but arrived without the lines a stat
    // block must have is reported — it imported, but somebody should look at it.
    const s = out.row.statblock;
    const gaps = [];
    if (s.ac === undefined) gaps.push('AC');
    if (s.hp === undefined) gaps.push('HP');
    if (!s.speed) gaps.push('speed');
    if (!s.entries?.length) gaps.push('actions');
    if (!out.row.cr) gaps.push('CR');
    if (gaps.length) thin.push(`${out.row.name}: no ${gaps.join(', ')}`);
  }

  console.log(`\nTransformed ${rows.length}, refused ${refused.length}.`);
  if (refused.length) console.log('  refused (no name):', refused.join(', '));
  if (thin.length) {
    console.log(`\n${thin.length} creature(s) imported with a missing stat-block line:`);
    thin.slice(0, 20).forEach((t) => console.log('  ' + t));
    if (thin.length > 20) console.log(`  …and ${thin.length - 20} more`);
  } else {
    console.log('Every creature has AC, HP, speed, CR and at least one action.');
  }

  const byCr = {};
  for (const r of rows) {
    const band = r.cr_sort === undefined ? 'unrated'
      : r.cr_sort < 1 ? 'CR 0–1/2' : r.cr_sort <= 4 ? 'CR 1–4' : r.cr_sort <= 10 ? 'CR 5–10'
      : r.cr_sort <= 16 ? 'CR 11–16' : 'CR 17+';
    byCr[band] = (byCr[band] || 0) + 1;
  }
  console.log('\nCoverage by challenge band:');
  for (const [b, n] of Object.entries(byCr)) console.log(`  ${String(n).padStart(4)}  ${b}`);
  console.log(`  ${String(rows.filter((r) => r.variant_eligible).length).padStart(4)}  variant-eligible`);

  if (DRY) { console.log('\n--dry-run: nothing written.'); return; }

  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/);
  if (!m) throw new Error('SUPABASE_DB_URL not set in .env.local');
  const client = new pg.Client({ connectionString: m[1].trim(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  let written = 0;
  try {
    // ONE TRANSACTION. A half-imported bestiary is worse than none: the page would show 180 creatures and
    // look complete, and nobody would know the run died.
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
           variant_eligible = EXCLUDED.variant_eligible, updated_at = now()`,
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
    console.log(`\nWrote ${written}. dnd_creatures now holds ${total.rows[0].n}.`);
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
