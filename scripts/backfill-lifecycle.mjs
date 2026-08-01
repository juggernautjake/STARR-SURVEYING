// scripts/backfill-lifecycle.mjs — rebuild the lifecycle stream from history already recorded. A4.
//
// Everything this writes is derived from facts the database already holds: `leads.created_at` and
// `status`, the eight `jobs.date_*` columns, `job_stages_history`, and `customer_invoices.paid_at`. It
// invents nothing. It only puts them in one place, in one vocabulary.
//
// ── HISTORICAL ROWS ARE MARKED `pre_attribution`, AND THAT IS THE POINT ────────────────────────────
//
// Finding 2 of the plan: no lead before 2026-07-31 has a `gclid`, a UTM, or a referrer — not one. They
// are permanently unattributable, and nothing can recover it.
//
// So every backfilled event carries `metadata.pre_attribution = true`. Without that flag the funnel would
// happily average these into cost-per-lead and report a number that is arithmetically clean and
// completely false: real conversions divided by ad spend that never bought them. The dashboard must be
// able to exclude them, which means it must be able to SEE them.
//
// ── SAFE TO RE-RUN ────────────────────────────────────────────────────────────────────────────────
//
// Keys come from `dedupeKeyFor`'s rule — `<milestone>:<source_table>:<source_id>` — which is the SAME
// rule the live writers use. That is what makes a re-run a no-op rather than a duplicate of every
// historical milestone, and it is why the rule lives in one module instead of being written out twice.
//
//   node scripts/backfill-lifecycle.mjs            # report only
//   node scripts/backfill-lifecycle.mjs --write    # actually append
import fs from 'node:fs';
import pg from 'pg';

const WRITE = process.argv.includes('--write');
const env = fs.readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [])[1]?.trim().replace(/^["']|["']$/g, '');

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL || pick('SUPABASE_DB_URL'),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const dedupeKey = (milestone, table, id) => `${milestone}:${table}:${id}`;
const toCents = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100));

const planned = [];
const add = (e) => { if (e.occurred_at) planned.push(e); };

// ── leads ───────────────────────────────────────────────────────────────────────────────────────────
const { rows: leads } = await client.query(`
  SELECT id, customer_id, status, quote_amount, created_at, updated_at FROM public.leads`);

for (const l of leads) {
  // Every lead was an enquiry once — that is what a lead IS, so `created_at` is the milestone.
  add({ milestone: 'inquiry_received', lead_id: l.id, customer_id: l.customer_id,
    occurred_at: l.created_at, value_cents: null, source_table: 'leads', source_id: l.id });

  // The CURRENT status implies its milestone happened. `updated_at` is the best instant available — the
  // exact moment is not recorded anywhere, and pretending otherwise would be inventing a timestamp.
  const m = { contacted: 'contacted', quoted: 'quoted', accepted: 'quote_accepted', declined: 'lost', lost: 'lost' }[l.status];
  if (m) {
    add({ milestone: m, lead_id: l.id, customer_id: l.customer_id, occurred_at: l.updated_at,
      value_cents: m === 'quoted' ? toCents(l.quote_amount) : null,
      source_table: 'leads', source_id: l.id, approximate: true });
  }
}

// ── jobs: the eight date columns, each an explicit milestone ────────────────────────────────────────
const { rows: jobs } = await client.query(`
  SELECT id, customer_id, stage, result, quote_amount, final_amount, amount_paid,
         date_received, date_quoted, date_accepted, date_started,
         date_fieldwork_complete, date_drawing_complete, date_delivered, created_at
    FROM public.jobs`);

for (const j of jobs) {
  const base = { job_id: j.id, customer_id: j.customer_id, source_table: 'jobs', source_id: j.id };
  add({ ...base, milestone: 'quoted', occurred_at: j.date_quoted, value_cents: toCents(j.quote_amount) });
  add({ ...base, milestone: 'quote_accepted', occurred_at: j.date_accepted, value_cents: toCents(j.quote_amount) });
  // The job existing IS milestone 5 — the primary bidding conversion. `date_accepted` is preferred over
  // `created_at` because it is when the customer said yes, which is the event Google should attribute.
  add({ ...base, milestone: 'job_created', occurred_at: j.date_accepted || j.created_at, value_cents: toCents(j.quote_amount) });
  add({ ...base, milestone: 'research_started', occurred_at: j.date_started, value_cents: null });
  add({ ...base, milestone: 'fieldwork_complete', occurred_at: j.date_fieldwork_complete, value_cents: null });
  add({ ...base, milestone: 'deliverables_sent', occurred_at: j.date_delivered, value_cents: null });
  if (j.result === 'lost' || j.result === 'abandoned') {
    add({ ...base, milestone: 'lost', occurred_at: j.created_at, value_cents: null });
  }
}

// ── the money ───────────────────────────────────────────────────────────────────────────────────────
const { rows: invoices } = await client.query(`
  SELECT id, job_id, total_cents, paid_at FROM public.customer_invoices WHERE paid_at IS NOT NULL`);

for (const inv of invoices) {
  // Keyed on the INVOICE, not the job: a job can be invoiced more than once, and keying on the job would
  // silently drop every payment after the first.
  add({ milestone: 'payment_received', job_id: inv.job_id, occurred_at: inv.paid_at,
    value_cents: inv.total_cents, source_table: 'customer_invoices', source_id: inv.id });
}

// ── write ───────────────────────────────────────────────────────────────────────────────────────────
let inserted = 0;
let skipped = 0;

if (WRITE) {
  for (const e of planned) {
    const key = dedupeKey(e.milestone, e.source_table, e.source_id);
    const { rowCount } = await client.query(
      `INSERT INTO public.lead_lifecycle_events
         (milestone, lead_id, job_id, customer_id, occurred_at, value_cents, actor,
          source_table, source_id, metadata, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,'backfill',$7,$8,$9,$10)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [e.milestone, e.lead_id ?? null, e.job_id ?? null, e.customer_id ?? null, e.occurred_at,
        e.value_cents, e.source_table, e.source_id,
        // See the header. Without this flag the funnel averages unattributable conversions into
        // cost-per-lead and reports a number that is arithmetically clean and completely false.
        JSON.stringify({ pre_attribution: true, ...(e.approximate ? { approximate_time: true } : {}) }),
        key],
    );
    if (rowCount > 0) inserted += 1; else skipped += 1;
  }
}

const byMilestone = planned.reduce((acc, e) => { acc[e.milestone] = (acc[e.milestone] ?? 0) + 1; return acc; }, {});

console.log(WRITE ? '=== LIFECYCLE BACKFILL (writing) ===' : '=== LIFECYCLE BACKFILL (dry run — pass --write) ===');
console.log(`sources: ${leads.length} leads, ${jobs.length} jobs, ${invoices.length} paid invoices`);
console.log(`\n${planned.length} milestone(s) derivable:`);
for (const [m, n] of Object.entries(byMilestone).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${m.padEnd(20)} ${n}`);
}
if (WRITE) {
  console.log(`\ninserted ${inserted}, already present ${skipped}`);
}
console.log('\nAll backfilled rows carry metadata.pre_attribution = true. No lead before 2026-07-31 has a');
console.log('gclid, a UTM or a referrer, so these can never be attributed — the funnel must EXCLUDE them');
console.log('from cost-per-lead rather than averaging them in and reporting a clean, false number.');

await client.end();
