// scripts/migrate-dnd-content.ts — move `dnd_content` rows into the Studio (P6-19).
//
// Reads rows, calls the pure mapping in `lib/dnd/homebrew/migrate-content.ts`, writes the results. That is
// all it does: every decision that could be WRONG lives in the module, where it is tested.
//
//   npx tsx scripts/migrate-dnd-content.ts            → dry run. Prints what would happen and writes nothing.
//   npx tsx scripts/migrate-dnd-content.ts --write    → do it.
//
// DRY RUN IS THE DEFAULT, and `--write` is required, because this is a one-way copy into a table whose
// rows are hard to tell apart afterwards. It is also IDEMPOTENT: every migrated piece carries
// `payload.migratedFrom.id`, and a row already present is skipped rather than duplicated — so running it
// twice is safe, which is the property that makes it safe to run at all.
import { supabaseAdmin } from '../lib/supabase';
import { migrateContentRows, type ContentRow } from '../lib/dnd/homebrew/migrate-content';

async function main() {
  const write = process.argv.includes('--write');

  const { data, error } = await supabaseAdmin
    .from('dnd_content')
    .select('id, campaign_id, kind, name, rarity, data, requires_attunement, created_by');
  if (error) {
    console.error('Could not read dnd_content:', error.message);
    process.exitCode = 1;
    return;
  }

  const rows = (data ?? []) as ContentRow[];
  const { pieces, skipped } = migrateContentRows(rows);

  console.log(`${rows.length} rows in dnd_content.`);
  console.log(`${pieces.length} can be migrated; ${skipped.length} cannot.`);

  if (skipped.length) {
    // Printed in full, never summarised to a count. A migration that reports "12 skipped" and moves on is
    // how content disappears — the whole point of keeping the reasons is that a human reads them.
    console.log('\nSKIPPED — each of these needs a decision:');
    for (const s of skipped) console.log(`  ${s.sourceId}: ${s.reason}`);
  }

  if (!write) {
    console.log('\nDry run. Nothing was written. Re-run with --write when the list above looks right.');
    return;
  }

  // Which source rows are already in the Studio. Read once rather than per piece: this is a one-shot
  // script, and N queries to save one is a bad trade against a table someone is waiting on.
  const { data: existing } = await supabaseAdmin.from('dnd_homebrew').select('payload');
  const already = new Set(
    ((existing ?? []) as { payload?: unknown }[])
      .map((r) => {
        const p = r.payload as { migratedFrom?: { id?: unknown } } | null;
        return typeof p?.migratedFrom?.id === 'string' ? p.migratedFrom.id : '';
      })
      .filter(Boolean),
  );

  let created = 0;
  let duplicate = 0;
  const failed: string[] = [];
  for (const piece of pieces) {
    if (already.has(piece.sourceId)) { duplicate += 1; continue; }
    const { sourceId, ...row } = piece;
    const { error: insErr } = await supabaseAdmin.from('dnd_homebrew').insert(row);
    if (insErr) failed.push(`${sourceId} (${piece.name}): ${insErr.message}`);
    else created += 1;
  }

  console.log(`\nCreated ${created}. Skipped ${duplicate} already migrated.`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  ${f}`);
    process.exitCode = 1;
  }
  console.log('\nThe old rows are UNTOUCHED. Check the Studio, then retire /api/dnd/content separately.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
