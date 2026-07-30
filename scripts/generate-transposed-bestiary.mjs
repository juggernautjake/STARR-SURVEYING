// scripts/generate-transposed-bestiary.mjs — give a system a bestiary by transposition (B4-2, B6-3).
//
//   npm run generate:bestiary -- --target=intuitive-games --dry-run
//   npm run generate:bestiary -- --target=intuitive-games
//   npm run generate:bestiary -- --target=dnd5e-2024 --limit=300
//
// Run through vite-node with the repo's vitest config: the two libraries it leans on are TypeScript and
// import via `@/`, which only `vitest.config.ts` resolves.
//
// ── NOTHING HERE PRETENDS TO BE PUBLISHED CONTENT ────────────────────────────────────────────────────
//
// Two systems in the catalogue have no monster book anyone can import:
//
//   · **Intuitive Games** is Brendan's indie system and has never published one.
//   · **D&D 5e 2024** has an SRD, but the open conversion of it contains THREE monsters. That is not a
//     limitation of the importer and not something to route around — the upstream work is unfinished.
//
// Neither gets an invented bestiary. Every row this writes is a creature carried across by
// `transposeCreature`, and it says so three times over — in the slug, in `source`, and in a description
// that leads with the origin and then lists every number the transposition could not honestly convert.
//
// That list is the point. G5 says transposition never invents rules, so a transposed creature arrives
// **deliberately unfinished**: its AC, HP and CR are the source figures, flagged as needing a human. The
// finishing path already exists — the fork button on the creature page (B3-1b) copies it into the Studio.
//
// ── THE LICENCE TRAVELS ──────────────────────────────────────────────────────────────────────────────
//
// A transposed creature is a DERIVATIVE of the source's licensed content, so `licence` and `attribution`
// are copied from the source row and the description names the specific creature it came from.
// `dnd_creatures` has a NOT NULL + non-blank CHECK on `attribution` precisely so a script cannot skip it.
//
// ── WHY THE SOURCE IS ALWAYS 5e ──────────────────────────────────────────────────────────────────────
//
// Pathfinder is the bigger single catalogue, but it states abilities as MODIFIERS while both targets use
// scores — so every PF2 row would arrive with a reconstructed, flagged-as-lossy ability line on top of
// everything else already flagged. The 5e catalogue shares the ability convention with both targets, which
// makes it the path that converts the most and marks the least.
import fs from 'node:fs';
import pg from 'pg';
import { curateForIg, gridFor, CR_BANDS } from '../lib/dnd/bestiary/ig-curation.ts';
import { transposeCreature } from '../lib/dnd/bestiary/transpose.ts';

const DRY = process.argv.includes('--dry-run');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const LIMIT = Number(arg('limit', '')) || 300;
const TARGET = arg('target', 'intuitive-games');

/**
 * The systems this can fill, and how each is marked.
 *
 * A PREFIX PER TARGET, and never the prefix the target's own importer uses: `srd52:aboleth` is one of the
 * three genuinely-published 2024 creatures and `srd52t:aboleth` is a transposed one. Collapsing them would
 * let a generated row overwrite a published one, which is the worst thing this script could do.
 */
const TARGETS = {
  'intuitive-games': {
    prefix: 'ig-t',
    label: 'Intuitive Games',
    from: 'dnd5e-2014',
    // Intuitive Games has NO published bestiary, so nothing here competes with a real one.
    note: 'Not published IG content.',
  },
  'dnd5e-2024': {
    prefix: 'srd52t',
    label: 'D&D 5e (2024)',
    from: 'dnd5e-2014',
    // The open 2024 SRD conversion contains three monsters. These fill the catalogue out; they are 2014
    // creatures, and a 2024 table should expect 2014 maths until someone revises them.
    note: 'Carried from the 2014 catalogue, not from the 2024 Monster Manual.',
  },
};

const cfg = TARGETS[TARGET];
if (!cfg) throw new Error(`--target=${TARGET} is not a system this can fill. Try: ${Object.keys(TARGETS).join(', ')}`);

function conn() {
  const raw = process.env.SUPABASE_DB_URL
    || (fs.existsSync('.env.local') && (fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/) || [])[1]);
  if (!raw) throw new Error('SUPABASE_DB_URL is not set.');
  return new pg.Client({ connectionString: raw.trim(), ssl: { rejectUnauthorized: false } });
}

/**
 * `srd51:goblin` → `ig-t:srd51-goblin`.
 *
 * The target prefix survives in the URL, so a reader can see it is transposed before the page even loads,
 * and the slug is stable — which is what makes re-running the script an upsert rather than a duplication.
 *
 * ── THE SOURCE PREFIX IS KEPT, AND DROPPING IT WAS A REAL BUG ────────────────────────────────────────
 *
 * The first version wrote `ig-t:goblin`, discarding which book the creature came from. That was invisible
 * while the SRD was the only 5e source: 334 creatures, 334 distinct names. With the wider corpus imported
 * there are **252 names that appear in more than one book** — `srd51:aboleth`, `a5emm:aboleth` and
 * `bfrd:aboleth` are three different stat blocks — and all three collapsed onto one slug, so each
 * overwrote the last. The run reported "300 upserted" and the system held 263.
 *
 * Every other importer already prefixes per book for exactly this reason. This one skipped it because its
 * input had been unambiguous, which is the shape of most bugs that survive a first release.
 */
const targetSlug = (srcSlug) => `${cfg.prefix}:${String(srcSlug).replace(':', '-')}`;

async function main() {
  const client = conn();
  await client.connect();
  try {
    const { rows: src } = await client.query(
      `select slug, name, type, size, alignment, cr, cr_sort, statblock, description,
              tags, environments, source, licence, attribution, source_url, variant_eligible
         from dnd_creatures
        where system = $1`,
      [cfg.from],
    );
    console.log(`Source: ${src.length} ${cfg.from} creatures → ${cfg.label}.`);

    const forCuration = src.map((r) => ({
      slug: r.slug, name: r.name, type: r.type, cr: r.cr,
      crSort: r.cr_sort === null ? null : Number(r.cr_sort),
    }));
    const { picked, emptyCells, filledCells } = curateForIg(forCuration, LIMIT);
    const bySlug = new Map(src.map((r) => [r.slug, r]));
    const pickedSlugs = new Set(picked.map((p) => targetSlug(p.slug)));

    // ── the spread, printed BEFORE anything is written ───────────────────────────────────────────────
    // G6: "complete to the licence, visibly". A run that only printed "300 written" would hide that the
    // apex band is thin because the source's apex band is thin.
    const grid = gridFor(forCuration);
    const types = [...new Set(grid.map((c) => c.type))];
    const pickedSet = new Set(picked.map((p) => p.slug));
    console.log(`\nSpread across ${types.length} types × ${CR_BANDS.length} bands — ${filledCells} cells the source fills:\n`);
    const w = Math.max(...types.map((t) => t.length));
    console.log(' '.repeat(w + 2) + CR_BANDS.map((b) => b.key.padStart(8)).join(''));
    for (const t of types) {
      const cells = CR_BANDS.map((b) => {
        const cell = grid.find((c) => c.type === t && c.band === b.key);
        const n = cell ? cell.rows.filter((r) => pickedSet.has(r.slug)).length : 0;
        return (n || '·').toString().padStart(8);
      });
      console.log(t.padEnd(w + 2) + cells.join(''));
    }
    console.log(`\n${emptyCells.length} of ${types.length * CR_BANDS.length} cells have no source creature at all — `
      + "those gaps are the source's, not the transposition's.");

    // ── transpose ────────────────────────────────────────────────────────────────────────────────────
    const rows = [];
    let totalUnmapped = 0;
    for (const p of picked) {
      const s = bySlug.get(p.slug);
      const t = transposeCreature(
        { name: s.name, system: cfg.from, type: s.type, size: s.size, cr: s.cr, statblock: s.statblock },
        TARGET,
      );
      totalUnmapped += t.unmapped.length;

      // The unmapped list goes in the DESCRIPTION, where the creature page already renders prose, rather
      // than into the statblock — a reader must not be able to scroll past it, and a DM who forks this
      // needs the list to come with the copy.
      const description = [
        `Transposed from ${s.name} (${s.source}) into ${cfg.label}. ${cfg.note}`,
        s.description || null,
        t.unmapped.length
          ? `Needs a human before you run it:\n${t.unmapped.map((u) => `• ${u}`).join('\n')}`
          : null,
      ].filter(Boolean).join('\n\n');

      rows.push({
        slug: targetSlug(s.slug),
        name: s.name,
        system: TARGET,
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
        // derivation neither target defines, on top of numbers that already need setting.
        variant_eligible: false,
      });
    }

    console.log(`\n${rows.length} to write · ${(totalUnmapped / Math.max(1, rows.length)).toFixed(1)} flagged items each — every one arrives unfinished by design.`);

    // A COLLISION CHECK BEFORE THE WRITE, not a count comparison after it.
    //
    // This is the guard the slug bug got past. An upsert cannot tell the difference between "the same
    // creature again" and "a different creature that happens to hash to the same slug" — it happily writes
    // 300 rows and leaves 263, and the only symptom is two numbers in the last line of the output not
    // matching. Refusing up front turns a silent 12% loss into a stopped run.
    const bySlugOut = new Map();
    for (const r of rows) bySlugOut.set(r.slug, [...(bySlugOut.get(r.slug) ?? []), r.name]);
    const collisions = [...bySlugOut.entries()].filter(([, names]) => names.length > 1);
    if (collisions.length) {
      throw new Error(
        `${collisions.length} slug collision(s) — ${collisions.length} creatures would silently overwrite `
        + `each other: ${collisions.slice(0, 5).map(([s, n]) => `${s} (${n.join(', ')})`).join('; ')}`,
      );
    }

    // ── orphans ──────────────────────────────────────────────────────────────────────────────────────
    //
    // The curation is deterministic given its input, and the INPUT GROWS: the 5e catalogue went from 334
    // creatures to 2,828, so a re-run picks a different and better-spread set. Rows from a previous run
    // that are no longer picked would otherwise sit in the catalogue forever, never refreshed and absent
    // from every report — the first run's arbitrary choices, fossilised.
    //
    // Only ever this target's own TRANSPOSED rows, matched on the prefix. A published creature carries a
    // different prefix and is never a candidate, which is the entire reason the prefixes are distinct.
    const { rows: existing } = await client.query(
      'select slug from dnd_creatures where system = $1 and slug like $2',
      [TARGET, `${cfg.prefix}:%`],
    );
    const orphans = existing.map((r) => r.slug).filter((s) => !pickedSlugs.has(s));
    if (orphans.length) {
      console.log(`\n${orphans.length} previously-transposed creature(s) are no longer in the spread and will be removed:`);
      console.log(`  ${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? ` …+${orphans.length - 8}` : ''}`);
      console.log('  (Forks are unaffected — a fork is a dnd_homebrew row and does not reference the catalogue.)');
    }

    if (DRY) {
      console.log('\n--dry-run: nothing written.');
      console.log('Sample:', JSON.stringify({ ...rows[0], statblock: '…', description: rows[0].description.slice(0, 220) + '…' }, null, 2));
      return;
    }

    let written = 0;
    // ONE TRANSACTION. A half-written catalogue that had already deleted the orphans would leave the
    // system holding fewer creatures than it started with.
    await client.query('BEGIN');
    try {
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
      if (orphans.length) {
        await client.query('delete from dnd_creatures where system = $1 and slug = any($2)', [TARGET, orphans]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
    const { rows: [{ n }] } = await client.query('select count(*)::int n from dnd_creatures where system = $1', [TARGET]);
    console.log(`\n✅ ${written} upserted, ${orphans.length} removed. ${cfg.label} now has ${n} creatures.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
