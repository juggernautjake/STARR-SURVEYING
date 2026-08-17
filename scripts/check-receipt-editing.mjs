// scripts/check-receipt-editing.mjs — correct a misread receipt field, and prove it stuck.
//
// Owner, 2026-08-16: *"We also need to be able to edit all of the details of a receipt once it has
// been analyzed … I uploaded a receipt that had the date 8/12/2016, but because the ink quality was
// poor when the receipt was printed, it looked like 8/2/2026."*
//
// Replays that exact scenario against a real receipt: set the date to the wrong reading, correct it
// to the right one, and check the correction landed, was recorded as a human edit, and dropped the
// AI's confidence note for the field. Everything is restored afterwards — this runs against real
// bookkeeping records.
//
// Usage: node --env-file=.env.local scripts/check-receipt-editing.mjs [--base URL]

import { encode } from '@auth/core/jwt';
import pg from 'pg';
import fs from 'node:fs';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = arg('--base') ?? 'http://127.0.0.1:3111';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';

const secret = (process.env.AUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
const dbUrl = fs.readFileSync('.env.local', 'utf8')
  .match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();

const target = (await db.query(
  `SELECT id, vendor_name, transaction_at, total_cents, payment_last4,
          ai_confidence_per_field, ai_extras, user_review_edits
   FROM receipts WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
)).rows[0];
if (!target) { console.log('no receipts to test against'); await db.end(); process.exit(0); }

const ORIGINAL = { ...target };
console.log(`\n  receipt ${target.id} — vendor "${target.vendor_name}", date ${target.transaction_at}\n`);

const cookie = `authjs.session-token=${await encode({
  token: { email: AS, name: 'QA', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600,
})}`;
const patch = (body) => fetch(`${BASE}/api/admin/receipts/${target.id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body),
});
const reread = async () => (await db.query(
  `SELECT vendor_name, transaction_at, total_cents, payment_last4, ai_confidence_per_field,
          ai_extras, user_review_edits, user_reviewed_at
   FROM receipts WHERE id = $1`, [target.id])).rows[0];

// Seed the exact failure: the AI "read" 8/2/2026 and was confident about it.
await db.query(
  `UPDATE receipts SET transaction_at = '2026-08-02T12:00:00Z',
     ai_confidence_per_field = '{"transaction_at":0.95,"vendor_name":0.9}'::jsonb
   WHERE id = $1`, [target.id],
);

// ── 1. The correction the product could not previously make ────────────────────────────────────
let r = await patch({ transaction_at: '2016-08-12' });
if (r.ok) ok('the date can be corrected after extraction');
else bad(`correcting the date failed: ${r.status} ${await r.text()}`);

let row = await reread();
const y = new Date(row.transaction_at).getFullYear();
const d = new Date(row.transaction_at).getDate();
if (y === 2016 && d === 12) ok(`stored as 2016-08-12 (not shifted by a timezone) — got ${row.transaction_at}`);
else bad(`expected 2016-08-12; stored ${row.transaction_at}`);

// ── 2. The AI's confidence for that field is dropped ───────────────────────────────────────────
if (row.ai_confidence_per_field?.transaction_at === undefined) {
  ok('the AI confidence note for the corrected field is gone');
} else {
  bad(`confidence for transaction_at survived: ${JSON.stringify(row.ai_confidence_per_field)}`);
}
if (row.ai_confidence_per_field?.vendor_name === 0.9) ok('…and other fields keep theirs');
else bad('confidence for an untouched field was wiped too');

// ── 3. The correction is on the record, with what it changed FROM ──────────────────────────────
const edits = row.user_review_edits ?? {};
const entry = Object.values(edits).at(-1);
if (entry?.by === AS && entry?.changed?.transaction_at?.from) {
  ok(`recorded as ${AS}'s correction, with the previous value`);
} else {
  bad(`user_review_edits did not record the change: ${JSON.stringify(edits).slice(0, 160)}`);
}
if (row.user_reviewed_at) ok('user_reviewed_at is stamped');
else bad('user_reviewed_at was not stamped');

// ── 4. Validation actually refuses bad values ──────────────────────────────────────────────────
for (const [label, body] of [
  ['a future date', { transaction_at: '2099-01-01' }],
  ['a dollar amount sent as cents', { total_cents: 42.18 }],
  ['a three-digit last four', { payment_last4: '405' }],
]) {
  r = await patch(body);
  if (r.status === 400) ok(`${label} is refused`);
  else bad(`${label} was ACCEPTED (${r.status})`);
}

// ── 5. A no-op does not stamp a correction ─────────────────────────────────────────────────────
const before = JSON.stringify((await reread()).user_review_edits);
r = await patch({ vendor_name: (await reread()).vendor_name });
const after = JSON.stringify((await reread()).user_review_edits);
if (before === after) ok('re-saving an unchanged value records nothing');
else bad('a no-op was recorded as a correction');

// ── 6. ai_extras is merged, not replaced ───────────────────────────────────────────────────────
await db.query(
  `UPDATE receipts SET ai_extras = jsonb_set(COALESCE(ai_extras,'{}'::jsonb), '{summary}', '"keep me"')
   WHERE id = $1`, [target.id],
);
r = await patch({ card_brand: 'mastercard' });
row = await reread();
if (row.ai_extras?.summary === 'keep me' && row.ai_extras?.card_brand === 'mastercard') {
  ok('editing an ai_extras field merges rather than clobbering the summary and flags');
} else {
  bad(`ai_extras was replaced: ${JSON.stringify(row.ai_extras).slice(0, 160)}`);
}

// ── Restore ────────────────────────────────────────────────────────────────────────────────────
await db.query(
  `UPDATE receipts SET vendor_name = $2, transaction_at = $3, total_cents = $4, payment_last4 = $5,
     ai_confidence_per_field = $6, ai_extras = $7, user_review_edits = $8, user_reviewed_at = NULL
   WHERE id = $1`,
  [target.id, ORIGINAL.vendor_name, ORIGINAL.transaction_at, ORIGINAL.total_cents,
   ORIGINAL.payment_last4, ORIGINAL.ai_confidence_per_field, ORIGINAL.ai_extras,
   ORIGINAL.user_review_edits],
);
const restored = await reread();
const sameDate = String(restored.transaction_at) === String(ORIGINAL.transaction_at);
const sameVendor = restored.vendor_name === ORIGINAL.vendor_name;
if (sameDate && sameVendor) ok('the receipt is back exactly as it was');
else bad(`RESTORE FAILED — vendor ${restored.vendor_name} date ${restored.transaction_at}`);

await db.end();
console.log(findings.length ? `\n  ${findings.length} finding(s)\n` : '\n  clean\n');
process.exit(findings.length ? 1 : 0);
