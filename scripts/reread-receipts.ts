// scripts/reread-receipts.ts — read existing receipts again with the zoomed two-read reader.
//
//   npx tsx scripts/reread-receipts.ts [limit] [--ids=a,b,c]
//
// Runs exactly what an upload runs (lib/receipts/extract.ts extractReceipt, forced), so a re-read
// corrects what the old single-look reader got wrong, fills in each line item's category, and
// records how sure the reading is — and never replaces anything a person entered
// (lib/receipts/reread-corrections.ts). Three at a time; prints what changed.
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

async function main(): Promise<void> {
  const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1000);
  const idsArg = process.argv.find((a) => a.startsWith('--ids='));
  const { supabaseAdmin } = await import('../lib/supabase');
  const { extractReceipt } = await import('../lib/receipts/extract');
  let q = supabaseAdmin.from('receipts').select('id').is('deleted_at', null).not('photo_url', 'is', null).order('created_at', { ascending: false }).limit(limit);
  if (idsArg) q = q.in('id', idsArg.slice(6).split(','));
  const { data } = await q;
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  console.log(`re-reading ${ids.length} receipts`);
  const tally: Record<string, number> = {};
  let cost = 0;
  for (let i = 0; i < ids.length; i += 3) {
    await Promise.all(ids.slice(i, i + 3).map(async (id) => {
      const res = await extractReceipt(id, { force: true } as never);
      const { data: row } = await supabaseAdmin.from('receipts').select('vendor_name, total_cents, read_status, read_details, extraction_cost_cents').eq('id', id).maybeSingle();
      const r = row as { vendor_name: string | null; total_cents: number | null; read_status: string | null; read_details: { notes?: string[]; corrections?: unknown[] } | null; extraction_cost_cents: number | null } | null;
      tally[r?.read_status ?? res.status] = (tally[r?.read_status ?? res.status] ?? 0) + 1;
      cost += r?.extraction_cost_cents ?? 0;
      const corr = (r?.read_details?.corrections ?? []) as Array<{ field: string; from: unknown; to: unknown }>;
      console.log(`${id.slice(0, 8)} ${res.status} ${r?.read_status ?? '-'} ${r?.vendor_name ?? ''} $${((r?.total_cents ?? 0) / 100).toFixed(2)}${corr.length ? ` · corrected ${corr.map((c) => `${c.field}: ${JSON.stringify(c.from)}→${JSON.stringify(c.to)}`).join(', ')}` : ''}${res.status !== 'done' ? ` · ${(res as { error?: string }).error ?? ''}` : ''}`);
    }));
  }
  console.log(`\nstatuses: ${JSON.stringify(tally)}  ·  recorded cost ~$${(cost / 100).toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
