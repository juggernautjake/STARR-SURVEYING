// lib/learn/trigger-credential.ts
//
// Helper called by learn-completion handlers (modules, exam-prep, etc.)
// to record that a user earned a credential. The row is inserted with
// verified=FALSE so the pay bump doesn't apply until an admin approves
// it via the queue in P-21.
//
// Idempotent: if the user already has a row for this credential, the
// helper updates `source` rather than creating a duplicate.
//
// P-19 of PAY_PROGRESSION_OVERHAUL.md.

import { supabaseAdmin } from '@/lib/supabase';

export interface TriggerCredentialInput {
  userEmail: string;
  credentialKey: string;
  source: string;        // 'module:<id>', 'exam-prep:fs', 'manual:<admin>'
  earnedDate?: string;   // ISO YYYY-MM-DD; defaults to today
  autoVerify?: boolean;  // admin-initiated path can set true to skip the queue
  verifiedBy?: string;   // required when autoVerify=true
}

export interface TriggerCredentialResult {
  ok: boolean;
  inserted: boolean;
  reason?: string;
}

export async function triggerCredential(input: TriggerCredentialInput): Promise<TriggerCredentialResult> {
  const { userEmail, credentialKey, source, autoVerify, verifiedBy } = input;
  const earnedDate = input.earnedDate || new Date().toISOString().slice(0, 10);

  if (!userEmail || !credentialKey) {
    return { ok: false, inserted: false, reason: 'userEmail and credentialKey required' };
  }
  if (autoVerify && !verifiedBy) {
    return { ok: false, inserted: false, reason: 'verifiedBy required when autoVerify=true' };
  }

  // Confirm the credential exists in credential_bonuses — silently skip if not
  // (no pay bump is configured so there's nothing to gate).
  const { data: cred } = await supabaseAdmin
    .from('credential_bonuses')
    .select('credential_key')
    .eq('credential_key', credentialKey)
    .maybeSingle();
  if (!cred) {
    return { ok: false, inserted: false, reason: `credential ${credentialKey} not configured` };
  }

  // Check for an existing row — credentials are unique per (user, key).
  const { data: existing } = await supabaseAdmin
    .from('employee_earned_credentials')
    .select('verified, source')
    .eq('user_email', userEmail)
    .eq('credential_key', credentialKey)
    .maybeSingle();

  if (existing) {
    // Don't downgrade an already-verified row. Just append the source if it differs.
    if (existing.verified) return { ok: true, inserted: false, reason: 'already verified' };
    // Re-trigger: update source so the queue shows the latest path.
    await supabaseAdmin
      .from('employee_earned_credentials')
      .update({ source })
      .eq('user_email', userEmail)
      .eq('credential_key', credentialKey);
    return { ok: true, inserted: false, reason: 'pending — source updated' };
  }

  const insertRow = {
    user_email: userEmail,
    credential_key: credentialKey,
    earned_date: earnedDate,
    source,
    verified: !!autoVerify,
    verified_at: autoVerify ? new Date().toISOString() : null,
    verified_by: autoVerify ? verifiedBy : null,
  };

  const { error } = await supabaseAdmin
    .from('employee_earned_credentials')
    .insert(insertRow);

  if (error) {
    return { ok: false, inserted: false, reason: error.message };
  }

  return { ok: true, inserted: true };
}
