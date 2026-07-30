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
const UA = { 'User-Agent': 'StarrTabletop/1.0 (bestiary import; one-off, cached)' };
const ONLY = (process.argv.find((a) => a.startsWith('--pack=')) || '').split('=')[1] || null;

/**
 * The packs catalogued, in the order they are imported.
 *
 * ── A SLUG PREFIX PER PACK ───────────────────────────────────────────────────────────────────────────
 *
 * Bestiary 1, 2 and 3 name the same creature — there is a Drake in all three — so a shared prefix would
 * make each import silently overwrite the last and leave a catalogue that looks complete and is missing
 * two thirds of what it fetched. Same rule as the 5e books in `import-open5e.mjs`, and the same rule the
 * SRD's own `srd51`/`srd52` prefixes follow.
 *
 * ── WHY NOT EVERY PACK IN THE REPOSITORY ─────────────────────────────────────────────────────────────
 *
 * `packs/` carries 60+ bestiaries, but the PFS season packs and most adventure-path packs are largely
 * stat-block VARIANTS of creatures already in the core books — importing them would put nine Goblin
 * Warriors in the catalogue, which makes the bestiary harder to search rather than richer. The core
 * bestiaries and the standalone hardcovers are the creatures that exist nowhere else.
 *
 * ── LICENCE ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * Recorded per creature by `pf2LicenceLabel`, not per pack, because it genuinely varies: Monster Core is
 * ORC, the pre-remaster Bestiary 1–3 are OGL, and `howl-of-the-wild` carries both across its actors. The
 * `licence` below is a fallback only; `pf2IsRedistributable` still refuses anything stating neither.
 */
const PACKS = [
  {
    pack: 'pathfinder-monster-core', prefix: 'pf2', licence: 'ORC',
    source: 'Pathfinder Monster Core',
    copyright: 'Pathfinder Monster Core © 2023 Paizo Inc.',
  },
  {
    pack: 'pathfinder-bestiary', prefix: 'pf2b1', licence: 'OGL',
    source: 'Pathfinder Bestiary',
    copyright: 'Pathfinder Bestiary © 2019 Paizo Inc.',
  },
  {
    pack: 'pathfinder-bestiary-2', prefix: 'pf2b2', licence: 'OGL',
    source: 'Pathfinder Bestiary 2',
    copyright: 'Pathfinder Bestiary 2 © 2020 Paizo Inc.',
  },
  {
    pack: 'pathfinder-bestiary-3', prefix: 'pf2b3', licence: 'OGL',
    source: 'Pathfinder Bestiary 3',
    copyright: 'Pathfinder Bestiary 3 © 2021 Paizo Inc.',
  },
  {
    pack: 'book-of-the-dead-bestiary', prefix: 'pf2botd', licence: 'OGL',
    source: 'Pathfinder Book of the Dead',
    copyright: 'Pathfinder Book of the Dead © 2022 Paizo Inc.',
  },
  {
    pack: 'rage-of-elements-bestiary', prefix: 'pf2roe', licence: 'OGL',
    source: 'Pathfinder Rage of Elements',
    copyright: 'Pathfinder Rage of Elements © 2023 Paizo Inc.',
  },
  {
    pack: 'howl-of-the-wild-bestiary', prefix: 'pf2hotw', licence: 'OGL',
    source: 'Pathfinder Howl of the Wild',
    copyright: 'Pathfinder Howl of the Wild © 2024 Paizo Inc.',
  },
];

const provenanceFor = (p) => ({
  source: p.source,
  licence: p.licence,
  attribution:
    `This work includes material from ${p.copyright}, used under the ${p.licence} licence. `
    + 'Statblock data via the Foundry VTT pf2e system (foundryvtt/pf2e).',
  sourceUrl: 'https://paizo.com/community/communityuse',
  slugPrefix: p.prefix,
  system: 'pathfinder2e',
});

const cacheDirFor = (pack) => path.join(ROOT, '.cache/pf2', pack);
const rawFor = (pack) => `https://raw.githubusercontent.com/${REPO}/master/packs/${pack}`;

/** One pack's file list, cached — the GitHub contents API is rate-limited far more tightly than raw. */
async function listFiles(pack) {
  const dir = cacheDirFor(pack);
  const idx = path.join(dir, '_index.json');
  if (fs.existsSync(idx)) return JSON.parse(fs.readFileSync(idx, 'utf8'));
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/packs/${pack}?ref=master`, {
    headers: UA, signal: AbortSignal.timeout(60_000),
  });
  // A pack that has been renamed or removed upstream is reported and skipped rather than killing the run —
  // one missing book must not cost the other six.
  if (!res.ok) return null;
  const body = await res.json();
  if (!Array.isArray(body)) return null;
  const names = body.filter((f) => f.name.endsWith('.json')).map((f) => f.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(idx, JSON.stringify(names));
  return names;
}

async function fetchActor(pack, name) {
  const cached = path.join(cacheDirFor(pack), name);
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'));
  const res = await fetch(`${rawFor(pack)}/${encodeURIComponent(name)}`, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const json = await res.json();
  fs.writeFileSync(cached, JSON.stringify(json));
  return json;
}

/** Fetch with a bounded window. Sequential would take minutes; unbounded would open 492 sockets at once. */
async function fetchAll(pack, names, concurrency = 8) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < names.length) {
        const name = names[i++];
        try {
          const a = await fetchActor(pack, name);
          if (a) out.push(a);
        } catch {
          // A single unreachable file must not abandon the rest; it shows up in the tally below.
        }
      }
    }),
  );
  return out;
}

async function main() {
  const packs = PACKS.filter((p) => !ONLY || p.pack === ONLY);
  if (!packs.length) throw new Error(`--pack=${ONLY} is not a catalogued pack.`);

  const rows = [];
  const refused = [];
  const thin = [];
  const perPack = [];

  for (const p of packs) {
    let names = await listFiles(p.pack);
    if (!names) { perPack.push({ p, missing: true }); continue; }
    if (LIMIT) names = names.slice(0, LIMIT);

    const actors = await fetchAll(p.pack, names);
    const prov = provenanceFor(p);
    let ok = 0;
    const packRefused = [];
    for (const a of actors) {
      const out = pf2ActorToRow(a, prov);
      // Refusals are real information: a non-npc document, a nameless actor, or a licence this import is
      // not entitled to redistribute. G6 — nothing silently truncates.
      if (!out) {
        // WITH THE REASON. "25 refused" alone reads as data loss; "25 hazards, which are not creatures"
        // reads as the importer doing its job. Book of the Dead ships haunts and environmental hazards in
        // the same pack as its undead, and a Cold Spot has no stat block to catalogue.
        const why = a?.type && a.type !== 'npc' ? `${a.type}, not a creature`
          : !a?.name ? 'unnamed'
            : 'no licence this import may redistribute under';
        packRefused.push(`${a?.name ?? '(unnamed)'} (${why})`);
        refused.push(a?.name ?? '(unnamed)');
        continue;
      }
      rows.push(out.row);
      ok += 1;
      const s = out.row.statblock;
      const gaps = [];
      if (s.ac === undefined) gaps.push('AC');
      if (s.hp === undefined) gaps.push('HP');
      if (!s.speed) gaps.push('speed');
      if (!s.entries?.length) gaps.push('strikes/actions');
      if (!out.row.cr) gaps.push('level');
      if (gaps.length) thin.push(`${out.row.name}: no ${gaps.join(', ')}`);
    }
    perPack.push({ p, listed: names.length, fetched: actors.length, ok, packRefused });
  }

  console.log('\nPack                              listed  fetched  imported  refused');
  for (const r of perPack) {
    if (r.missing) { console.log(`${r.p.pack.padEnd(32)}  — not published at this path upstream, skipped`); continue; }
    console.log(`${r.p.pack.padEnd(32)}  ${String(r.listed).padStart(6)}  ${String(r.fetched).padStart(7)}  ${String(r.ok).padStart(8)}  ${String(r.packRefused.length).padStart(7)}`);
    if (r.packRefused.length) {
      console.log(`    refused: ${r.packRefused.slice(0, 6).join(', ')}${r.packRefused.length > 6 ? ` …+${r.packRefused.length - 6}` : ''}`);
    }
  }

  console.log(`\n[pathfinder2e] transformed ${rows.length}, refused ${refused.length}.`);

  // Two packs naming the same creature is normal and is why each has its own slug prefix. Reported so a
  // reader who searches "Drake" and gets four knows why, rather than suspecting a duplicate import.
  const names = new Map();
  for (const r of rows) names.set(r.name, (names.get(r.name) ?? 0) + 1);
  console.log(`${[...names.values()].filter((n) => n > 1).length} names appear in more than one book (kept, each with its own slug).`);
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
           -- Provenance updates too, which it did not before. The licence is now read per actor rather
           -- than per pack, so a re-run has to be able to CORRECT a row that recorded the pack's value.
           -- An upsert that refuses to update the licence column makes the first run's guess permanent.
           source = EXCLUDED.source, licence = EXCLUDED.licence,
           attribution = EXCLUDED.attribution, source_url = EXCLUDED.source_url,
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
