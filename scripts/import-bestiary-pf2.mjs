// scripts/import-bestiary-pf2.mjs — fill the bestiary from Pathfinder Monster Core (B1-5).
//
//   npm run import:bestiary:pf2 -- --dry-run    # transform and report, write nothing
//   npm run import:bestiary:pf2                 # upsert into dnd_creatures
//   npm run import:bestiary:pf2 -- --limit=20   # a quick slice while iterating
//
// ── WHY THIS IS A SECOND SCRIPT AND NOT A `--source=pf2` FLAG ────────────────────────────────────────
//
// The 5e importer reads ONE bulk document. Monster Core is ~492 individual actor files in the Foundry
// `pf2e` repository, so this one needs a directory listing, per-file caching, throttling and a
// concurrency limit — none of which the other script has any use for. Sharing them behind a flag would
// mean one script where half the code is inert on every run.
//
// ── LICENCE ──────────────────────────────────────────────────────────────────────────────────────────
//
// Pathfinder Monster Core is published under the ORC licence, which permits redistribution with
// attribution. Every Foundry item states its own `publication.license`, and `pf2ActorToRow` REFUSES
// anything not marked ORC rather than assuming — Foundry ships several packs and they do not all carry
// the same terms.
//
// ── BE A GOOD CITIZEN OF SOMEONE ELSE'S SERVER ───────────────────────────────────────────────────────
//
// 492 files from raw.githubusercontent.com, fetched politely: a small concurrency window, a descriptive
// User-Agent, and a local cache so a re-run costs nothing. An importer that hammers the source is one that
// stops working when the source blocks it.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { pf2ActorToRow } from '../lib/dnd/bestiary/import-pf2.ts';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 0;

const REPO = 'foundryvtt/pf2e';
const PACK = 'packs/pathfinder-monster-core';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/${PACK}`;
const CACHE_DIR = path.join(ROOT, '.cache/pf2-monster-core');
const UA = { 'User-Agent': 'StarrTabletop/1.0 (bestiary import; one-off, cached)' };

const PROVENANCE = {
  source: 'Pathfinder Monster Core',
  licence: 'ORC',
  attribution:
    'This work includes material from Pathfinder Monster Core © 2023 Paizo Inc., used under the ORC ' +
    'licence. Statblock data via the Foundry VTT pf2e system (foundryvtt/pf2e).',
  sourceUrl: 'https://paizo.com/community/communityuse',
  slugPrefix: 'pf2',
  system: 'pathfinder2e',
};

/** The pack's file list, cached — the GitHub contents API is rate-limited far more tightly than raw. */
async function listFiles() {
  const idx = path.join(CACHE_DIR, '_index.json');
  if (fs.existsSync(idx)) {
    const names = JSON.parse(fs.readFileSync(idx, 'utf8'));
    console.log(`Using cached file list: ${names.length} actors.`);
    return names;
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${PACK}?ref=master`, {
    headers: UA, signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Listing failed: ${res.status} ${await res.text()}`);
  const names = (await res.json()).filter((f) => f.name.endsWith('.json')).map((f) => f.name);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(idx, JSON.stringify(names));
  console.log(`Listed ${names.length} actors.`);
  return names;
}

async function fetchActor(name) {
  const cached = path.join(CACHE_DIR, name);
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'));
  const res = await fetch(`${RAW}/${encodeURIComponent(name)}`, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const json = await res.json();
  fs.writeFileSync(cached, JSON.stringify(json));
  return json;
}

/** Fetch with a bounded window. Sequential would take minutes; unbounded would open 492 sockets at once. */
async function fetchAll(names, concurrency = 8) {
  const out = [];
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < names.length) {
        const name = names[i++];
        try {
          const a = await fetchActor(name);
          if (a) out.push(a);
        } catch {
          // A single unreachable file must not abandon the other 491; it is reported in the tally below.
        }
        done += 1;
        if (done % 100 === 0) console.log(`  …${done}/${names.length}`);
      }
    }),
  );
  return out;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let names = await listFiles();
  if (LIMIT) names = names.slice(0, LIMIT);

  console.log(`Fetching ${names.length} actors…`);
  const actors = await fetchAll(names);
  console.log(`Fetched ${actors.length} of ${names.length}.`);

  const rows = [];
  const refused = [];
  const thin = [];
  for (const a of actors) {
    const out = pf2ActorToRow(a, PROVENANCE);
    // Refusals are real information: a non-npc document, a nameless actor, or a licence this import is not
    // entitled to redistribute. G6 — nothing silently truncates.
    if (!out) { refused.push(a?.name ?? '(unnamed)'); continue; }
    rows.push(out.row);
    const s = out.row.statblock;
    const gaps = [];
    if (s.ac === undefined) gaps.push('AC');
    if (s.hp === undefined) gaps.push('HP');
    if (!s.speed) gaps.push('speed');
    if (!s.entries?.length) gaps.push('strikes/actions');
    if (!out.row.cr) gaps.push('level');
    if (gaps.length) thin.push(`${out.row.name}: no ${gaps.join(', ')}`);
  }

  console.log(`\n[${PROVENANCE.source} → ${PROVENANCE.system}] transformed ${rows.length}, refused ${refused.length}.`);
  if (refused.length) console.log('  refused:', refused.slice(0, 10).join(', ') + (refused.length > 10 ? ` …+${refused.length - 10}` : ''));
  if (thin.length) {
    console.log(`\n${thin.length} imported with a missing line:`);
    thin.slice(0, 15).forEach((t) => console.log('  ' + t));
    if (thin.length > 15) console.log(`  …and ${thin.length - 15} more`);
  } else {
    console.log('Every creature has AC, HP, speed, level and at least one strike or action.');
  }

  const bands = {};
  for (const r of rows) {
    const l = r.cr_sort ?? 0;
    const b = l < 1 ? 'Level ≤0' : l <= 4 ? 'Level 1–4' : l <= 10 ? 'Level 5–10' : l <= 16 ? 'Level 11–16' : 'Level 17+';
    bands[b] = (bands[b] || 0) + 1;
  }
  console.log('\nCoverage by level band:');
  for (const [b, n] of Object.entries(bands).sort()) console.log(`  ${String(n).padStart(4)}  ${b}`);

  if (DRY) { console.log('\n--dry-run: nothing written.'); return; }

  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/);
  if (!m) throw new Error('SUPABASE_DB_URL not set in .env.local');
  const client = new pg.Client({ connectionString: m[1].trim(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  let written = 0;
  try {
    // One transaction: a half-imported bestiary showing 250 creatures would look complete.
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO dnd_creatures
           (slug, name, system, type, size, alignment, cr, cr_sort, statblock, description,
            tags, environments, source, licence, attribution, source_url, variant_eligible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (slug, system) DO UPDATE SET
           name = EXCLUDED.name, type = EXCLUDED.type, size = EXCLUDED.size,
           cr = EXCLUDED.cr, cr_sort = EXCLUDED.cr_sort, statblock = EXCLUDED.statblock,
           description = EXCLUDED.description, tags = EXCLUDED.tags,
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
    const t = await client.query("SELECT count(*)::int n FROM dnd_creatures WHERE system = 'pathfinder2e'");
    const all = await client.query('SELECT count(*)::int n FROM dnd_creatures');
    console.log(`\nWrote ${written}. pathfinder2e: ${t.rows[0].n}. Bestiary total: ${all.rows[0].n}.`);
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
