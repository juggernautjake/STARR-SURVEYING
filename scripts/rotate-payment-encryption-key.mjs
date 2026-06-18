#!/usr/bin/env node
// scripts/rotate-payment-encryption-key.mjs
//
// P17 of payment-infrastructure-2026-06-18.md — rotate the
// PAYMENT_ENCRYPTION_KEY used by the pgcrypto-backed ACH columns.
//
// Usage:
//   PAYMENT_ENCRYPTION_KEY_OLD=… \
//   PAYMENT_ENCRYPTION_KEY=… \
//   SUPABASE_URL=… \
//   SUPABASE_SERVICE_ROLE_KEY=… \
//   node scripts/rotate-payment-encryption-key.mjs [--dry-run]
//
// Flow:
//   1. Verify both keys are configured + non-trivial.
//   2. Page through every row in employee_payment_methods that has
//      ACH ciphertext.
//   3. For each row, decrypt with the OLD key + re-encrypt with the
//      NEW key via the SQL helpers from seed 324.
//   4. Verify the new ciphertext round-trips with the new key
//      before writing.
//   5. UPDATE the row in a single statement (atomic per row).
//   6. Insert a `payment_secret_reads` audit row per touched row
//      with reason='rotation'.
//
// --dry-run: only counts + verifies; no UPDATEs.

import { createClient } from '@supabase/supabase-js';

const oldKey = process.env.PAYMENT_ENCRYPTION_KEY_OLD;
const newKey = process.env.PAYMENT_ENCRYPTION_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

function bail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function strong(key, label) {
  if (!key || key.length < 16 || key === 'changeme' || key === 'your_encryption_key') {
    bail(`${label} must be set to a strong (≥16 chars) value.`);
  }
}
strong(oldKey, 'PAYMENT_ENCRYPTION_KEY_OLD');
strong(newKey, 'PAYMENT_ENCRYPTION_KEY');
if (oldKey === newKey) bail('PAYMENT_ENCRYPTION_KEY must differ from PAYMENT_ENCRYPTION_KEY_OLD.');
if (!supabaseUrl || !supabaseServiceKey) {
  bail('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const reader = process.env.ROTATION_OPERATOR_EMAIL ?? 'rotation@cli';

async function rotateOneField(row, field) {
  const ciphertext = row[field];
  if (!ciphertext) return { skipped: true };
  // 1. Decrypt with the OLD key.
  const { data: plaintextRow, error: decErr } = await supabase.rpc('decrypt_ach_secret', {
    ciphertext, key: oldKey,
  });
  if (decErr) {
    await audit({ row, field, succeeded: false, error_message: 'decrypt with old key failed' });
    return { error: `decrypt failed (id=${row.id}, field=${field})` };
  }
  // 2. Re-encrypt with the NEW key.
  const { data: newCiphertext, error: encErr } = await supabase.rpc('encrypt_ach_secret', {
    plaintext: plaintextRow, key: newKey,
  });
  if (encErr) {
    await audit({ row, field, succeeded: false, error_message: 're-encrypt with new key failed' });
    return { error: `re-encrypt failed (id=${row.id}, field=${field})` };
  }
  // 3. Round-trip verification with the new key.
  const { data: verify, error: vErr } = await supabase.rpc('decrypt_ach_secret', {
    ciphertext: newCiphertext, key: newKey,
  });
  if (vErr || verify !== plaintextRow) {
    await audit({ row, field, succeeded: false, error_message: 'round-trip verify failed' });
    return { error: `round-trip verify failed (id=${row.id}, field=${field})` };
  }
  // 4. UPDATE (skipped in dry-run).
  if (dryRun) return { dryRun: true };
  const { error: upErr } = await supabase
    .from('employee_payment_methods')
    .update({ [field]: newCiphertext })
    .eq('id', row.id);
  if (upErr) {
    await audit({ row, field, succeeded: false, error_message: upErr.message });
    return { error: upErr.message };
  }
  await audit({ row, field, succeeded: true });
  return { rotated: true };
}

async function audit({ row, field, succeeded, error_message = null }) {
  await supabase.from('payment_secret_reads').insert({
    reader_email: reader,
    reader_ip: null,
    target_table: 'employee_payment_methods',
    target_id: row.id,
    subject_email: row.user_email ?? null,
    field_name: field,
    reason: 'rotation',
    succeeded,
    error_message,
  });
}

(async () => {
  console.log(`→ rotation starting${dryRun ? ' (dry-run)' : ''}`);
  let rotated = 0; let skipped = 0; let errors = 0;
  let page = 0;
  const pageSize = 100;
  for (;;) {
    const { data: rows, error } = await supabase
      .from('employee_payment_methods')
      .select('id, user_email, ach_account_number_enc, ach_routing_number_enc')
      .eq('kind', 'ach')
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) bail(`fetch failed: ${error.message}`);
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      for (const field of ['ach_account_number_enc', 'ach_routing_number_enc']) {
        const r = await rotateOneField(row, field);
        if (r.skipped) skipped += 1;
        else if (r.rotated) rotated += 1;
        else if (r.dryRun) skipped += 1;
        else if (r.error) {
          console.error(`✗ ${r.error}`);
          errors += 1;
        }
      }
    }
    page += 1;
  }
  console.log(`→ rotation done: ${rotated} rotated, ${skipped} skipped, ${errors} errors`);
  if (errors > 0) process.exit(2);
})();
