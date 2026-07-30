// scripts/generate-creature-variants.mjs — weak and elite versions of every eligible creature (B3-1).
//
//   npm run variants:creatures -- --dry-run    # derive and report, write nothing
//   npm run variants:creatures                 # upsert into dnd_creature_variants
//
// ── WHY THIS SCRIPT EXISTS ───────────────────────────────────────────────────────────────────────────
//
// `deriveVariant` has been built, argued over and covered by tests for weeks. `dnd_creature_variants` has
// existed since seed 462. **385 creatures are flagged `variant_eligible` and the table has zero rows** —
// the derivation had never once been run against real data. Complete, tested machinery with nothing in it
// is this repo's signature defect, and the third instance found in this session alone.
//
// The judgement all lives in `lib/dnd/bestiary/variants.ts`: PF2 uses the published Weak/Elite adjustments
// (±2 flat to AC/attacks/DCs/saves, HP banded by level), 5e uses a documented house formula (HP ±25%, AC
// and attack ±1, CR deliberately NOT recomputed). This is the loop that applies it.
//
// ── ELIGIBILITY IS NOT RE-DECIDED HERE ───────────────────────────────────────────────────────────────
//
// `deriveVariant` returns null for an ineligible creature and for the `base` tier, so this cannot
// accidentally produce three versions of a rabbit. The rule lives in `eligibility.ts` with its own tests;
// duplicating the check would give two places for it to drift.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { deriveVariant } from '../lib/dnd/bestiary/variants.ts';
import { variantReason } from '../lib/dnd/bestiary/eligibility.ts';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 0;

const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const DB_URL = (env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)/) || [])[1];

async function main() {
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: creatures } = await client.query(
    `SELECT id, slug, name, system, type, size, cr, statblock, tags
       FROM dnd_creatures
      WHERE variant_eligible
      ORDER BY cr_sort DESC NULLS LAST, name
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}`,
  );
  console.log(`${creatures.length} variant-eligible creature(s).\n`);

  const derived = [];
  const skipped = [];
  const byReason = {};

  for (const c of creatures) {
    const input = {
      name: c.name, system: c.system, cr: c.cr, type: c.type, size: c.size,
      tags: c.tags ?? [], statblock: c.statblock ?? {},
    };
    // The SAME reason the row was flagged with, recomputed from the stored row rather than assumed — if
    // the taxonomy has changed since the import, this notices instead of generating against a stale flag.
    const reason = variantReason(input);
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    if (reason === 'none') { skipped.push(c.name); continue; }

    for (const tier of ['weak', 'elite']) {
      const v = deriveVariant(input, tier, reason);
      if (v) derived.push({ creatureId: c.id, parent: c.name, ...v });
    }
  }

  console.log('why each creature qualifies:');
  for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${r}`);
  }
  // G6 — a creature flagged eligible that derives nothing is a disagreement between two modules, and it is
  // reported rather than quietly dropped.
  if (skipped.length) {
    console.log(`\n${skipped.length} flagged eligible but derived nothing (flag vs. taxonomy drift):`);
    console.log('  ' + skipped.slice(0, 12).join(', ') + (skipped.length > 12 ? ` …+${skipped.length - 12}` : ''));
  }

  console.log(`\nDerived ${derived.length} variants from ${creatures.length - skipped.length} creatures.`);
  const sample = derived.slice(0, 4);
  for (const s of sample) {
    console.log(`  ${s.name}  (${s.tier})  — ${s.derivation.slice(0, 96)}…`);
  }

  if (DRY) { console.log('\n--dry-run: nothing written.'); await client.end(); return; }

  let written = 0;
  try {
    // One transaction: a partial variant set would show some creatures with an elite and no weak, which
    // reads as a deliberate design choice rather than an interrupted run.
    await client.query('BEGIN');
    for (const v of derived) {
      await client.query(
        `INSERT INTO dnd_creature_variants (creature_id, tier, name, cr, cr_sort, statblock, derivation)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (creature_id, tier) DO UPDATE SET
           name = EXCLUDED.name, cr = EXCLUDED.cr, cr_sort = EXCLUDED.cr_sort,
           statblock = EXCLUDED.statblock, derivation = EXCLUDED.derivation`,
        [
          v.creatureId, v.tier, v.name, v.statblock?.cr ?? null,
          v.statblock?.cr ? Number(v.statblock.cr) || null : null,
          JSON.stringify(v.statblock), v.derivation,
        ],
      );
      written += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    const { rows: [t] } = await client.query('SELECT count(*)::int n FROM dnd_creature_variants');
    console.log(`\nWrote ${written}. dnd_creature_variants now holds ${t.n}.`);
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
