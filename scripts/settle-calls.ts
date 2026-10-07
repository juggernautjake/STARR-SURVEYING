// scripts/settle-calls.ts — judge every call and rebuild every number's catalogue entry.
//
//   npx tsx scripts/settle-calls.ts            # report only: what each call would be judged
//   npx tsx scripts/settle-calls.ts --write    # write verdicts, counts, links and automatic blocks
//
// The backfill for seeds/672_call_screening.sql. It runs exactly the code the webhooks and the
// quarter-hourly cron run (lib/receptionist/screening.ts), so what it writes is what the live
// system would have written had it existed when the calls came in.
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const { supabaseAdmin } = await import('../lib/supabase');
  const { judgeCall } = await import('../lib/receptionist/call-verdict');
  const { settleUnsettled, SETTLE_COLUMNS } = await import('../lib/receptionist/screening');

  const { data, error } = await supabaseAdmin.from('phone_calls').select(`${SETTLE_COLUMNS}, ended_at`).eq('is_test', false).order('started_at');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<Parameters<typeof judgeCall>[0] & { from_number: string }>;
  const tally: Record<string, number> = {};
  const byNumber = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const v = judgeCall(r, { final: true }).verdict;
    tally[v] = (tally[v] ?? 0) + 1;
    const n = byNumber.get(r.from_number) ?? {};
    n[v] = (n[v] ?? 0) + 1;
    byNumber.set(r.from_number, n);
  }
  console.log(`${rows.length} live calls:`, tally);
  for (const [num, t] of [...byNumber.entries()].sort()) console.log(' ', num.padEnd(16), JSON.stringify(t));

  if (!write) { console.log('\nReport only. Pass --write to save.'); return; }
  const res = await settleUnsettled(supabaseAdmin, { all: true, limit: 5000 });
  console.log('\nwritten:', res);
}

main().catch((e) => { console.error(e); process.exit(1); });
