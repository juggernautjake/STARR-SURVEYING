// scripts/generate-ig-bestiary.mjs — give Intuitive Games a bestiary by transposition (B4-2).
//
//   npm run generate:ig-bestiary -- --dry-run     # report the spread, write nothing
//   npm run generate:ig-bestiary                  # upsert
//   npm run generate:ig-bestiary -- --limit=50
//
// Run through vite-node with the repo's vitest config: the two libraries it leans on are TypeScript and
// import via `@/`, which only `vitest.config.ts` resolves.
//
// ── NOTHING HERE PRETENDS TO BE PUBLISHED IG CONTENT ─────────────────────────────────────────────────
//
// Intuitive Games has no published monster manual. This does not invent one. Every row it writes is an
// SRD creature carried across by `transposeCreature`, and it says so three times over — in the slug
// (`ig-t:` for transposed), in `source`, and in the description, which leads with the origin and then
// lists every number the transposition could not honestly convert.
//
// That list is the point. G5 says transposition never invents rules, so a transposed creature arrives
// **deliberately unfinished**: its AC, HP and CR are the 5e figures, flagged as needing a human. The plan
// called this "then hand-finishing", and the finishing path already exists — the fork button on the
// creature page (B3-1b) copies it into the Studio where a DM can set the numbers for their table.
//
// ── THE LICENCE TRAVELS ──────────────────────────────────────────────────────────────────────────────
//
// A transposed creature is a DERIVATIVE of CC-BY-4.0 SRD content, so the attribution is not optional and
// not cosmetic: `licence` and `attribution` are copied from the source row, and the description names the
// specific creature it came from. `dnd_creatures` has a NOT NULL + non-blank CHECK on `attribution`
// precisely so a script like this cannot skip it.
//
// ── WHY THE SOURCE IS 5e AND NOT PATHFINDER ──────────────────────────────────────────────────────────
//
// PF2 is the bigger catalogue (492 vs 334), but it states abilities as modifiers while IG uses scores —
// so every PF2 row would arrive with a reconstructed, flagged-as-lossy ability line on top of everything
// else already flagged. 5e and IG share the ability convention, which makes the 5e path the one that
// converts the most and marks the least.
import fs from 'node:fs';
import pg from 'pg';
import { curateForIg, gridFor, CR_BANDS } from '../lib/dnd/bestiary/ig-curation.ts';
import { transposeCreature } from '../lib/dnd/bestiary/transpose.ts';

const DRY = process.argv.includes('--dry-run');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 200;

const IG = 'intuitive-games';

function conn() {
  const raw = process.env.SUPABASE_DB_URL
    || (fs.existsSync('.env.local') && (fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/) || [])[1]);
  if (!raw) throw new Error('SUPABASE_DB_URL is not set.');
  return new pg.Client({ connectionString: raw.trim(), ssl: { rejectUnauthorized: false } });
}

/** `srd51:goblin` → `ig-t:goblin`. The prefix survives in the URL, so a reader can see it is transposed
 *  before the page even loads. Stable, which is what makes re-running the script an upsert. */
const igSlug = (srcSlug) => `ig-t:${String(srcSlug).replace(/^[^:]+:/, '')}`;

async function main() {
  const client = conn();
  await client.connect();
  try {
    const { rows: src } = await client.query(
      `select slug, name, type, size, alignment, cr, cr_sort, statblock, description,
              tags, environments, source, licence, attribution, source_url, variant_eligible
         from dnd_creatures
        where system = 'dnd5e-2014'`,
    );
    console.log(`Source: ${src.length} SRD 5.1 creatures.`);

    const forCuration = src.map((r) => ({
      slug: r.slug, name: r.name, type: r.type, cr: r.cr,
      crSort: r.cr_sort === null ? null : Number(r.cr_sort),
    }));
    const { picked, emptyCells, filledCells } = curateForIg(forCuration, LIMIT);
    const bySlug = new Map(src.map((r) => [r.slug, r]));

    // ── the spread, printed BEFORE anything is written ───────────────────────────────────────────────
    // G6: "complete to the licence, visibly". A run that only printed "200 written" would hide that the
    // apex band is thin because the SRD's apex band is thin.
    const grid = gridFor(forCuration);
    const types = [...new Set(grid.map((c) => c.type))];
    console.log(`\nSpread across ${types.length} types × ${CR_BANDS.length} bands — ${filledCells} cells the SRD fills:\n`);
    const w = Math.max(...types.map((t) => t.length));
    console.log(' '.repeat(w + 2) + CR_BANDS.map((b) => b.key.padStart(8)).join(''));
    for (const t of types) {
      const cells = CR_BANDS.map((b) => {
        const n = picked.filter((p) => p.slug && grid.find((c) => c.type === t && c.band === b.key)?.rows.some((r) => r.slug === p.slug)).length;
        return (n || '·').toString().padStart(8);
      });
      console.log(t.padEnd(w + 2) + cells.join(''));
    }
    console.log(`\n${emptyCells.length} of ${types.length * CR_BANDS.length} cells have no SRD creature at all — `
      + 'those gaps are the source\'s, not the transposition\'s.');

    // ── transpose ────────────────────────────────────────────────────────────────────────────────────
    const rows = [];
    let totalUnmapped = 0;
    for (const p of picked) {
      const s = bySlug.get(p.slug);
      const t = transposeCreature(
        { name: s.name, system: 'dnd5e-2014', type: s.type, size: s.size, cr: s.cr, statblock: s.statblock },
        IG,
      );
      totalUnmapped += t.unmapped.length;

      // The unmapped list goes in the DESCRIPTION, where the creature page already renders prose, rather
      // than into the statblock — a reader must not be able to scroll past it, and a DM who forks this
      // needs the list to come with the copy.
      const description = [
        `Transposed from ${s.name} (D&D 5e SRD 5.1) into Intuitive Games. Not published IG content.`,
        s.description || null,
        t.unmapped.length
          ? `Needs a human before you run it:\n${t.unmapped.map((u) => `• ${u}`).join('\n')}`
          : null,
      ].filter(Boolean).join('\n\n');

      rows.push({
        slug: igSlug(s.slug),
        name: s.name,
        system: IG,
        type: t.type ?? s.type,
        size: t.size ?? s.size,
        alignment: s.alignment,
        cr: s.cr,
        cr_sort: s.cr_sort,
        statblock: t.statblock,
        description,
        // `transposed` is a real tag so the bestiary filter can exclude these — a DM running a pure-IG
        // table should be able to hide everything that came from somewhere else.
        tags: [...new Set([...(s.tags || []), 'transposed'])],
        environments: s.environments || [],
        source: `Transposed from ${s.source}`,
        licence: s.licence,
        attribution: s.attribution,
        source_url: s.source_url,
        // Weak/elite adjustments are a Pathfinder mechanic. Marking these variant-eligible would offer a
        // derivation IG does not define, on top of numbers that already need setting.
        variant_eligible: false,
      });
    }

    console.log(`\n${rows.length} to write · ${(totalUnmapped / Math.max(1, rows.length)).toFixed(1)} flagged items each — every one arrives unfinished by design.`);

    if (DRY) {
      console.log('\n--dry-run: nothing written.');
      console.log('Sample:', JSON.stringify({ ...rows[0], statblock: '…', description: rows[0].description.slice(0, 200) + '…' }, null, 2));
      return;
    }

    let written = 0;
    for (const r of rows) {
      await client.query(
        `insert into dnd_creatures
           (slug, name, system, type, size, alignment, cr, cr_sort, statblock, description, tags,
            environments, source, licence, attribution, source_url, variant_eligible)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (slug, system) do update set
           name = excluded.name, type = excluded.type, size = excluded.size, alignment = excluded.alignment,
           cr = excluded.cr, cr_sort = excluded.cr_sort, statblock = excluded.statblock,
           description = excluded.description, tags = excluded.tags, environments = excluded.environments,
           source = excluded.source, licence = excluded.licence, attribution = excluded.attribution,
           source_url = excluded.source_url, variant_eligible = excluded.variant_eligible,
           updated_at = now()`,
        [r.slug, r.name, r.system, r.type, r.size, r.alignment, r.cr, r.cr_sort, JSON.stringify(r.statblock),
          r.description, r.tags, r.environments, r.source, r.licence, r.attribution, r.source_url, r.variant_eligible],
      );
      written += 1;
    }
    const { rows: [{ n }] } = await client.query('select count(*)::int n from dnd_creatures where system = $1', [IG]);
    console.log(`\n✅ ${written} upserted. Intuitive Games now has ${n} creatures.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
