// scripts/audit-native-coverage.mjs — can the lens actually answer, for every creature? (N4-1)
//
//   npm run audit:natives
//
// The plan's N4-1: *"Per system: how many creatures have a native block, how many are transposed-only, and
// which fields are derived versus published. Exits non-zero on a native block whose numbers fall outside
// its own table's band."*
//
// ── WHAT CHANGED ABOUT THIS SLICE, AND WHY IT IS BETTER ─────────────────────────────────────────────
//
// It was written expecting `nat-<sys>:<slug>` rows to count. N3-1 was dropped: the lens derives at RENDER
// time, so there are no stored derived rows to audit. That makes this a different and more useful
// question — not *"how many rows did we generate?"* but ***"for how many creatures can the lens actually
// produce an answer, and what kind of answer is it?"*** Which is what a reader experiences.
//
// Every creature × every system falls into exactly one bucket:
//
//   published  — the catalogue holds this creature in this system. A designer's numbers.
//   derived    — rebuilt from that system's own measured tier table (N2-1).
//   converted  — no table for the system (IG), or no readable tier. Transposition, clearly labelled.
//
// REPORTS, NEVER REPAIRS — like audit-bestiary.mjs. It exits non-zero only on the one thing that is
// genuinely checkable: a derived block whose AC or HP does not match the table row it claims to come from.
// That is a real invariant (the derivation IS the table lookup), so a mismatch means the derivation and
// the table have drifted apart, which no amount of eyeballing would catch across 3,659 creatures.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

import { deriveNativeStatblock, isRefusal } from '../lib/dnd/statblocks/derive-native.ts';
import { mapTier, parseTier, rowFor, nativeScaleFor } from '../lib/dnd/statblocks/tier.ts';

const ROOT = process.cwd();
const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const DB_URL = (env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)/) || [])[1];

const SYSTEMS = ['dnd5e-2024', 'dnd5e-2014', 'pathfinder2e', 'intuitive-games'];
const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—');
const bar = (n, total, width = 24) => {
  const filled = total ? Math.round((n / total) * width) : 0;
  return '█'.repeat(filled) + '·'.repeat(width - filled);
};

async function main() {
  const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let hardFailures = 0;

  // One representative row per creature, exactly as the LIST shows it — auditing the raw table would
  // report the same Badger ten times and make every percentage meaningless.
  const { rows: creatures } = await c.query(`
    SELECT slug, name, system, type, size, cr, statblock, published_systems
    FROM dnd_creatures_canonical
  `);
  console.log(`\n═══ NATIVE COVERAGE — ${creatures.length} creatures × ${SYSTEMS.length} systems ═══`);

  const buckets = Object.fromEntries(SYSTEMS.map((s) => [s, { published: 0, derived: 0, converted: 0, reasons: new Map() }]));
  const mismatches = [];
  const thin = [];

  for (const row of creatures) {
    const source = {
      name: row.name, system: row.system, type: row.type, size: row.size, cr: row.cr,
      statblock: row.statblock ?? {},
    };
    const published = new Set(row.published_systems ?? []);

    for (const target of SYSTEMS) {
      const b = buckets[target];
      // Same order of trustworthiness the lens uses (SystemLens.build). Auditing a different order would
      // measure a page nobody is looking at.
      if (row.system === target || published.has(target)) { b.published += 1; continue; }

      const d = deriveNativeStatblock(source, target);
      if (isRefusal(d)) {
        b.converted += 1;
        b.reasons.set(d.reason, (b.reasons.get(d.reason) ?? 0) + 1);
        continue;
      }
      b.derived += 1;

      // ── THE ONE AUTOMATIC CHECK WORTH HAVING ────────────────────────────────────────────────────
      // A derived block's AC and HP ARE the table row for its tier. If they are not, the derivation and
      // the measured table have drifted — a whole-catalogue error that reads as perfectly normal numbers
      // on any single page.
      // Recomputed from the tier map rather than read back off the result: reading the derivation's own
      // answer would make this check agree with itself no matter what the table says.
      const toScale = nativeScaleFor(target);
      const fromScale = nativeScaleFor(source.system);
      const parsed = parseTier(row.cr);
      const found = toScale && fromScale && parsed !== null
        ? rowFor(mapTier(parsed, fromScale, toScale).tier, toScale)
        : null;
      if (found) {
        const e = found.row;
        if (d.statblock.ac !== e.ac || d.statblock.hp !== e.hp) {
          mismatches.push(`${row.slug} → ${target}: block AC ${d.statblock.ac}/HP ${d.statblock.hp}, table AC ${e.ac}/HP ${e.hp}`);
        }
        if (e.sample < 10) thin.push(`${row.slug} → ${target} (tier ${d.tier}, measured from ${e.sample})`);
      }
    }
  }

  console.log('\n── What the lens can offer, per system ──');
  for (const s of SYSTEMS) {
    const b = buckets[s];
    const total = b.published + b.derived + b.converted;
    console.log(`\n  ${s}`);
    console.log(`    published  ${String(b.published).padStart(5)}  ${bar(b.published, total)}  ${pct(b.published, total)}`);
    console.log(`    derived    ${String(b.derived).padStart(5)}  ${bar(b.derived, total)}  ${pct(b.derived, total)}`);
    console.log(`    converted  ${String(b.converted).padStart(5)}  ${bar(b.converted, total)}  ${pct(b.converted, total)}`);
    // WHY it fell back, never just THAT it did — "no table for this system" and "this creature has no
    // readable tier" are completely different problems and only one of them is fixable.
    for (const [why, n] of [...b.reasons.entries()].sort((a, x) => x[1] - a[1]).slice(0, 3)) {
      console.log(`        ${String(n).padStart(5)}  ${why.slice(0, 96)}`);
    }
  }

  console.log('\n── Derived blocks against their own table ──');
  if (mismatches.length) {
    hardFailures += mismatches.length;
    console.log(`  ❌ ${mismatches.length} derived block(s) do not match the tier row they claim:`);
    mismatches.slice(0, 10).forEach((m) => console.log(`      ${m}`));
    if (mismatches.length > 10) console.log(`      … and ${mismatches.length - 10} more`);
  } else {
    console.log('  ✅ every derived AC and HP equals its tier row exactly');
  }

  // NOT a failure — a thin row is a weaker claim, not a wrong one, and the block says so in its own notes.
  // Reported because "derived from the table" reads identically whether the table row was measured from
  // 250 creatures or from 4.
  console.log(`  ${thin.length ? '⚠️ ' : '✅'} ${thin.length} derivation(s) rest on a tier measured from fewer than 10 creatures`);
  thin.slice(0, 5).forEach((t) => console.log(`      ${t}`));

  // ── N4-2, in the place it cannot be missed ────────────────────────────────────────────────────────
  console.log('\n── What is NOT promised ──');
  console.log('  Derived blocks are built from each system\'s own measured tier tables at a defensible tier.');
  console.log('  They are NOT hand-balanced encounters. Balance is a per-creature design judgement — whether');
  console.log('  THIS dragon is a fair fight for THAT party — and no process short of a designer playing each');
  console.log('  one produces it. A DM should read a derived block before running it.');

  console.log(hardFailures ? `\n❌ ${hardFailures} hard failure(s).\n` : '\n✅ No hard failures.\n');
  await c.end();
  process.exitCode = hardFailures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
