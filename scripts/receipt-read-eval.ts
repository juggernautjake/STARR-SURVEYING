// scripts/receipt-read-eval.ts — measure the receipt reader on real receipts.
//
//   npx tsx scripts/receipt-read-eval.ts [count] [runs]
//
// For each of `count` receipts (those a person corrected first — they are the answer key), runs
// lib/receipts/zoom-read.ts `runs` times and reports: what it read, whether repeated runs agree with
// each other (consistency), and how it compares with what is stored — and with the person's
// correction where there is one (accuracy). Reads only; writes nothing to the database.
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const FIELDS = ['vendor_name', 'transaction_at', 'subtotal_cents', 'tax_cents', 'tip_cents', 'total_cents', 'payment_last4'] as const;

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 10);
  const runs = Number(process.argv[3] ?? 2);
  const { supabaseAdmin } = await import('../lib/supabase');
  const { zoomRead, sameValue } = await import('../lib/receipts/zoom-read');
  const { data } = await supabaseAdmin.from('receipts')
    .select('id, vendor_name, transaction_at, subtotal_cents, tax_cents, tip_cents, total_cents, payment_last4, photo_url, user_review_edits')
    .is('deleted_at', null).not('photo_url', 'is', null).order('created_at', { ascending: false }).limit(200);
  const rows = (data ?? []) as Array<Record<string, any>>;
  // Corrected receipts first: their stored values are the person's, so they are the answer key.
  rows.sort((x, y) => Number(Boolean(y.user_review_edits)) - Number(Boolean(x.user_review_edits)));
  const sample = rows.slice(0, count);

  let consistent = 0;
  let fieldsCompared = 0;
  let fieldsMatchStored = 0;
  let totalCost = 0;
  const statusCounts: Record<string, number> = {};
  for (const r of sample) {
    const { data: blob } = await supabaseAdmin.storage.from('starr-field-receipts').download(r.photo_url);
    if (!blob) { console.log(`skip ${r.id}: no photo`); continue; }
    const bytes = Buffer.from(await blob.arrayBuffer());
    const isPdf = String(r.photo_url).toLowerCase().endsWith('.pdf');
    const results = [];
    const t0 = Date.now();
    for (let i = 0; i < runs; i += 1) results.push(await zoomRead(bytes, { isPdf }));
    const ms = Math.round((Date.now() - t0) / runs);
    const first = results[0];
    const same = results.every((x) => FIELDS.every((f) => sameValue(f as never, x.extracted[f], first.extracted[f])));
    if (same) consistent += 1;
    for (const res of results) statusCounts[res.status] = (statusCounts[res.status] ?? 0) + 1;
    const cost = results.reduce((s, x) => s + (x.inputTokens * 3 + x.outputTokens * 15) / 1e6, 0) / runs;
    totalCost += cost;
    const corrected = r.user_review_edits ? ' [person-corrected]' : '';
    console.log(`\n${r.id.slice(0, 8)}${corrected} — ${first.status}, ${first.details.sections} sections${first.details.cropped ? ', cropped' : ''}, ${ms} ms, ~$${cost.toFixed(3)}/read, runs ${same ? 'IDENTICAL' : 'DIFFER'}`);
    for (const f of FIELDS) {
      const got = first.extracted[f];
      const stored = r[f];
      const ok = sameValue(f as never, got, stored);
      fieldsCompared += 1;
      if (ok) fieldsMatchStored += 1;
      console.log(`  ${f.padEnd(16)} read ${JSON.stringify(got)}${ok ? '' : `   ≠ stored ${JSON.stringify(stored)}`}`);
    }
    console.log(`  items: ${first.extracted.line_items.map((l) => `${l.description} ${l.amount_cents}${l.category ? ` [${l.category}]` : ''}`).join(' | ').slice(0, 400)}`);
    if (first.details.disputes.length) console.log(`  disputes: ${JSON.stringify(first.details.disputes)}`);
    const bad = first.details.checks.filter((c) => !c.ok);
    if (bad.length) console.log(`  checks failing: ${bad.map((c) => c.message).join(' | ')}`);
    if (!same) for (const res of results.slice(1)) console.log(`  other run: ${JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, res.extracted[f]])))}`);
  }
  console.log(`\n=== ${sample.length} receipts, ${runs} runs each`);
  console.log(`consistent across runs: ${consistent}/${sample.length}`);
  console.log(`fields matching stored values: ${fieldsMatchStored}/${fieldsCompared}`);
  console.log(`statuses: ${JSON.stringify(statusCounts)}`);
  console.log(`average cost per read: ~$${(totalCost / Math.max(1, sample.length)).toFixed(3)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
