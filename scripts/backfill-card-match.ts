// scripts/backfill-card-match.mts — ask the card question about the receipts nobody ever asked it about.
//
// Owner, 2026-08-13: *"Please make sure that all current receipts are checked in that way. We should
// not have any cards on file right now, so all of the receipts should be flagged as having been paid
// for with an unknown card."*
//
// ── WHY A SCRIPT AT ALL, WHEN THE CRON NOW DOES THIS ─────────────────────────────────────────────
//
// It does, and from the next tick onward the backlog would clear itself. This exists so the answer
// is true NOW and so somebody can see what changed, one line per receipt, before trusting the sweep
// to keep doing it unattended. It is idempotent — the sweep only writes when an answer actually
// changes — so running it twice is a no-op and running it after the cron has run is a report.
//
// ── WHY IT IMPORTS THE REAL SWEEP INSTEAD OF DOING ITS OWN UPDATE ────────────────────────────────
//
// The obvious shape for a backfill is a bit of SQL that sets the column. That would have been a
// second implementation of the matching rules — the brand/holder conflict logic, the retired-card
// preference, which review flags to replace and which to keep — living in a script nobody runs
// again, free to drift from the rules the product uses. So this calls `rematchOpenReceipts()`, the
// same function the cron and the card-registry save call. What it proves is what will keep happening.
//
// Usage:  npx tsx --env-file=.env.local scripts/backfill-card-match.mts [--dry-run]

import { supabaseAdmin } from '../lib/supabase';
import { rematchOpenReceipts } from '../lib/receipts/rematch-cards';

const DRY = process.argv.includes('--dry-run');

interface Row {
  id: string;
  vendor_name: string | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  card_match_status: string | null;
  payment_card_id: string | null;
}

const COLUMNS = 'id, vendor_name, total_cents, payment_method, payment_last4, card_match_status, payment_card_id';

async function snapshot(): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from('receipts')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw new Error(`could not read receipts: ${error.message}`);
  return (data ?? []) as Row[];
}

const label = (r: Row) =>
  `${(r.vendor_name ?? 'unnamed').slice(0, 24).padEnd(24)} ${String(((r.total_cents ?? 0) / 100).toFixed(2)).padStart(8)}`;

const status = (s: string | null) => s ?? 'NULL (never checked)';

async function main(): Promise<void> {
  const before = await snapshot();

  const { data: cards } = await supabaseAdmin.from('payment_cards').select('id, label, last4, role');
  console.log(`\nCards on file: ${cards?.length ?? 0}`);
  for (const c of cards ?? []) console.log(`  · ${c.label ?? 'unnamed'} ···· ${c.last4} — role ${c.role}`);

  console.log(`\nReceipts: ${before.length}`);
  const unchecked = before.filter((r) => r.card_match_status === null);
  console.log(`  never checked (card_match_status IS NULL): ${unchecked.length}`);

  if (DRY) {
    console.log('\n--dry-run: no writes. Receipts that would be re-asked:');
    for (const r of before.filter((r) => !['on_file', 'retired'].includes(r.card_match_status ?? ''))) {
      console.log(`  ${label(r)}  ${r.payment_method ?? '(no method)'} ····${r.payment_last4 ?? '----'}  ${status(r.card_match_status)}`);
    }
    return;
  }

  const summary = await rematchOpenReceipts();
  console.log(
    `\nSweep: ${summary.considered} considered, ${summary.updated} updated, ${summary.resolved} now matched to a card.`,
  );

  const after = new Map((await snapshot()).map((r) => [r.id, r]));
  console.log('\nEvery receipt, after:');
  let flagged = 0;
  for (const b of before) {
    const a = after.get(b.id);
    if (!a) continue;
    const changed = a.card_match_status !== b.card_match_status;
    if (a.card_match_status === 'not_on_file' || a.card_match_status === 'unknown') flagged += 1;
    console.log(
      `  ${label(a)}  ${(a.payment_method ?? '(none)').padEnd(6)} ····${(a.payment_last4 ?? '----').padEnd(4)}  `
        + `${status(a.card_match_status).padEnd(22)}${changed ? `  <- was ${status(b.card_match_status)}` : ''}`,
    );
  }

  // The owner's own acceptance test, stated as a number rather than left for them to count.
  console.log(
    `\n${flagged} receipt(s) are now flagged as paid on a card that is not on file (or not established).`
      + `\nRegistering a matching card under /admin/cards clears each of these automatically.`,
  );
}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
