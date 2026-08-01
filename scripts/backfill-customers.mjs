// scripts/backfill-customers.mjs — give every existing lead and job a customer. A3.
//
// The plan says "backfill from existing leads and jobs; **report the match rate rather than asserting
// it**", and that phrasing is the whole design of this script. A backfill that prints "done" tells you
// nothing about whether identity actually worked; one that prints how many rows it could NOT match tells
// you exactly how much of the history is now queryable and how much never will be.
//
// SAFE TO RE-RUN. Matching is by exact hashed identifier, so a second pass finds the customer the first
// pass created and changes nothing. Rows already carrying a `customer_id` are skipped outright.
//
// DRY RUN BY DEFAULT. `--write` performs the writes; without it the script reports what it would do. A
// backfill over the live business database should have to be asked for twice.
//
//   node scripts/backfill-customers.mjs            # report only
//   node scripts/backfill-customers.mjs --write    # actually link them
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

const WRITE = process.argv.includes('--write');

const env = fs.readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [])[1]?.trim().replace(/^["']|["']$/g, '');

// The SAME normalisation as lib/integrations/google/hash.ts. Duplicated here only because this is a plain
// node script outside the TS build — and because it is duplicated, it is worth stating what must stay in
// step: lowercase + trim for every email, and dots/`+tags` stripped for Gmail ONLY. If that rule ever
// changes there, it must change here, or a backfilled customer and a live one will hash differently and
// the same person will end up as two rows.
const GMAIL = new Set(['gmail.com', 'googlemail.com']);
const sha256 = (v) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  if (!t.includes('@')) return null;
  const at = t.lastIndexOf('@');
  let local = t.slice(0, at);
  const domain = t.slice(at + 1);
  if (!local || !domain || !domain.includes('.')) return null;
  if (GMAIL.has(domain)) {
    const plus = local.indexOf('+');
    if (plus > -1) local = local.slice(0, plus);
    local = local.replace(/\./g, '');
    if (!local) return null;
  }
  return `${local}@${domain}`;
}

function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('+')) {
    const d = t.slice(1).replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  const d = t.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

const hashEmail = (v) => { const n = normalizeEmail(v); return n ? sha256(n) : null; };
const hashPhone = (v) => { const n = normalizePhone(v); return n ? sha256(n) : null; };

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL || pick('SUPABASE_DB_URL'),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

/** Find-or-create by exact identifier. Returns null when there is nothing to match on. */
async function resolveCustomer(details, stats) {
  const emailHash = hashEmail(details.email);
  const phoneHash = hashPhone(details.phone);

  if (!emailHash && !phoneHash) {
    stats.unmatchable += 1;
    return null;
  }

  const { rows: found } = await client.query(
    `SELECT id FROM public.customers
      WHERE (email_sha256 IS NOT NULL AND email_sha256 = $1)
         OR (phone_sha256 IS NOT NULL AND phone_sha256 = $2)
      ORDER BY (email_sha256 = $1) DESC
      LIMIT 1`,
    [emailHash, phoneHash],
  );
  if (found.length) { stats.matched += 1; return found[0].id; }

  if (!WRITE) { stats.wouldCreate += 1; return null; }

  const displayName = (details.name || '').trim() || (details.company || '').trim() || 'Unnamed customer';
  const { rows: made } = await client.query(
    `INSERT INTO public.customers
       (display_name, company, primary_email, primary_phone, email_sha256, phone_sha256, first_lead_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [displayName, details.company || null, normalizeEmail(details.email), normalizePhone(details.phone),
      emailHash, phoneHash, details.created_at || null],
  );
  if (made.length) { stats.created += 1; return made[0].id; }

  // ON CONFLICT DO NOTHING fired: another row already holds one of these hashes. Re-read rather than
  // reporting a failure — the constraint doing its job is a match, not an error.
  const { rows: raced } = await client.query(
    `SELECT id FROM public.customers WHERE email_sha256 = $1 OR phone_sha256 = $2 LIMIT 1`,
    [emailHash, phoneHash],
  );
  if (raced.length) { stats.matched += 1; return raced[0].id; }
  stats.failed += 1;
  return null;
}

async function backfill(table, columns, stats) {
  const { rows } = await client.query(
    `SELECT id, ${columns} FROM public.${table} WHERE customer_id IS NULL ORDER BY created_at`,
  );
  stats.scanned = rows.length;
  for (const row of rows) {
    const id = await resolveCustomer(row, stats);
    if (id && WRITE) {
      await client.query(`UPDATE public.${table} SET customer_id = $1 WHERE id = $2`, [id, row.id]);
      stats.linked += 1;
    }
  }
}

const fresh = () => ({ scanned: 0, matched: 0, created: 0, linked: 0, unmatchable: 0, wouldCreate: 0, failed: 0 });

const leadStats = fresh();
await backfill('leads', 'name, email, phone, company, created_at', leadStats);

const jobStats = fresh();
await backfill('jobs', 'client_name AS name, client_email AS email, client_phone AS phone, client_company AS company, created_at', jobStats);

// Rollups, from the jobs now linked. Only meaningful after a --write pass.
if (WRITE) {
  await client.query(`
    UPDATE public.customers c SET
      job_count = COALESCE(j.n, 0),
      lifetime_value_cents = COALESCE(j.value_cents, 0),
      is_repeat = COALESCE(j.n, 0) > 1,
      updated_at = now()
    FROM (
      SELECT customer_id,
             count(*)::int AS n,
             -- FINAL beats QUOTE, and a missing final is not a zero: a quote is a forecast, an invoice is
             -- a fact. Summing quotes for delivered jobs reports money nobody paid.
             sum(round(COALESCE(final_amount, quote_amount, 0) * 100))::bigint AS value_cents
        FROM public.jobs WHERE customer_id IS NOT NULL GROUP BY customer_id
    ) j
    WHERE c.id = j.customer_id`);
}

const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
const report = (label, s) => {
  const identified = s.matched + s.created + s.wouldCreate;
  console.log(`\n${label}`);
  console.log(`  scanned            ${s.scanned}`);
  console.log(`  matched existing   ${s.matched}`);
  console.log(WRITE ? `  created           ${s.created}` : `  would create      ${s.wouldCreate}`);
  console.log(`  UNMATCHABLE        ${s.unmatchable}   (no usable email or phone — permanently unlinkable)`);
  if (s.failed) console.log(`  failed             ${s.failed}`);
  console.log(`  match rate         ${pct(identified, s.scanned)}`);
};

console.log(WRITE ? '=== BACKFILL (writing) ===' : '=== BACKFILL (dry run — pass --write to apply) ===');
report('leads', leadStats);
report('jobs', jobStats);

const totalUnmatchable = leadStats.unmatchable + jobStats.unmatchable;
if (totalUnmatchable > 0) {
  console.log(`\n${totalUnmatchable} row(s) have no usable email or phone and cannot ever be linked by`);
  console.log('identity. That is a fact about the historical data, not a failure of this script — they');
  console.log('predate the intake form capturing anything matchable.');
}

await client.end();
