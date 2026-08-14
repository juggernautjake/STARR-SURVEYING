// lib/phone/calls.ts — slices I2/I3 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Creating and updating the `calls` row as a call progresses, and working out who is ringing.
//
// ── THE UPSERT IS NOT AN OPTIMISATION ───────────────────────────────────────────────────────────
//
// Twilio retries a webhook it believes failed, and "believes failed" includes a response that
// arrived slowly. A plain insert therefore turns one call into two or three rows, and since the
// duplicates arrive seconds apart with the same caller and the same timestamp they look like a
// customer who rang three times — which is exactly the reading that gets somebody called back and
// annoyed. `provider_call_sid` is UNIQUE and every write goes through the upsert.
//
// ── AND WHY A MATCH IS A SUGGESTION ─────────────────────────────────────────────────────────────
//
// `matched_kind`/`matched_id` are deliberately not the FK columns. The system guessing "this is
// Bob's job" and the office DECIDING it are different facts, and collapsing them means a wrong guess
// is indistinguishable from a filing decision — nobody can tell which links to trust, so none of
// them get trusted.
import { supabaseAdmin } from '@/lib/supabase';
import { normalizePhone } from '@/lib/integrations/google/hash';
import type { ClosedReason } from './hours';

export interface CallRow {
  id: string;
  provider_call_sid: string | null;
  direction: string;
  status: string;
  from_number: string | null;
  to_number: string | null;
  is_voicemail: boolean;
  job_id: string | null;
  recording_path: string | null;
  transcript: string | null;
  summary: string | null;
}

export interface RegisterCallInput {
  callSid: string;
  direction: 'inbound' | 'outbound';
  from: string | null;
  to: string | null;
  callerName?: string | null;
  status?: string;
}

/**
 * Create or refresh the row for a call. Safe to call for every webhook of the same call.
 *
 * `started_at` is left to the column default on insert and never written on update — otherwise each
 * retry would push the start time forward, and a call's duration would shrink every time Twilio
 * spoke to us.
 */
export async function registerCall(input: RegisterCallInput): Promise<CallRow | null> {
  const payload = {
    provider: 'twilio',
    provider_call_sid: input.callSid,
    direction: input.direction,
    status: input.status ?? 'ringing',
    from_number: normalizePhone(input.from) ?? input.from ?? null,
    to_number: normalizePhone(input.to) ?? input.to ?? null,
    caller_name: input.callerName ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('calls')
    .upsert(payload, { onConflict: 'provider_call_sid' })
    .select('id, provider_call_sid, direction, status, from_number, to_number, is_voicemail, job_id, recording_path, transcript, summary')
    .single();

  if (error) {
    console.error('[phone/calls] could not register call', error.message);
    return null;
  }
  return data as CallRow;
}

/** Patch a call by its Twilio SID. Returns false when nothing was updated. */
export async function updateCallBySid(callSid: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error, data } = await supabaseAdmin
    .from('calls')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('provider_call_sid', callSid)
    .select('id');
  if (error) {
    console.error('[phone/calls] update failed', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Record that this call went to voicemail, and why. */
export async function markVoicemail(callSid: string, reason: ClosedReason | 'no_answer'): Promise<void> {
  await updateCallBySid(callSid, { is_voicemail: true, voicemail_reason: reason });
}

export interface CallerMatch {
  kind: 'lead' | 'contact' | 'customer' | 'job';
  id: string;
  label: string;
}

/**
 * Who does this number belong to?
 *
 * Every phone column in this database is free text — "(512) 555-0143", "512.555.0143 ext 2",
 * "512-555-0143 (cell)". Matching on equality against those finds nothing, so the comparison is done
 * on DIGITS: the last ten, which is the part that identifies a US line regardless of how somebody
 * typed the rest.
 *
 * Ten and not seven. A seven-digit match ignores the area code, and area codes are exactly what
 * distinguishes two customers who share a local number — a false match here files a call under the
 * wrong customer, which is worse than filing it under nobody.
 */
export async function matchCaller(rawNumber: string | null): Promise<CallerMatch | null> {
  const e164 = normalizePhone(rawNumber);
  if (!e164) return null;
  const last10 = e164.replace(/\D/g, '').slice(-10);
  if (last10.length < 10) return null;

  // Most-specific first: an active job beats the lead it came from, and a named contact beats a
  // customer record, because the office wants the thing they are currently working on.
  const lookups: Array<{ kind: CallerMatch['kind']; table: string; column: string; labelCols: string }> = [
    { kind: 'job', table: 'jobs', column: 'client_phone', labelCols: 'id, job_number, title, client_name' },
    { kind: 'contact', table: 'contacts', column: 'phone', labelCols: 'id, name, company' },
    { kind: 'customer', table: 'customers', column: 'primary_phone', labelCols: 'id, name' },
    { kind: 'lead', table: 'leads', column: 'phone', labelCols: 'id, name, company' },
  ];

  for (const l of lookups) {
    try {
      // Compare on digits only, in the database, so "(512) 555-0143" and "+15125550143" meet.
      // `regexp_replace` is not available through PostgREST filters, so the candidate set is
      // narrowed by a LIKE on the last four and then confirmed in JS. Four digits is selective
      // enough to keep this small and loose enough to survive any formatting.
      const last4 = last10.slice(-4);
      const { data } = await supabaseAdmin
        .from(l.table)
        .select(l.labelCols)
        .ilike(l.column, `%${last4}%`)
        .limit(25);

      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const stored = String(row[l.column] ?? '');
        const stored10 = stored.replace(/\D/g, '').slice(-10);
        if (stored10.length === 10 && stored10 === last10) {
          return { kind: l.kind, id: String(row.id), label: labelFor(l.kind, row) };
        }
      }
    } catch (err) {
      // A missing column on one table must not stop the other three from matching.
      console.warn(`[phone/calls] match lookup failed for ${l.table}`, (err as Error).message);
    }
  }
  return null;
}

function labelFor(kind: CallerMatch['kind'], row: Record<string, unknown>): string {
  if (kind === 'job') {
    const num = row.job_number ? `#${row.job_number}` : '';
    return [num, row.title ?? row.client_name ?? 'Job'].filter(Boolean).join(' ').trim();
  }
  const name = (row.name as string) ?? '';
  const company = (row.company as string) ?? '';
  return [name, company && company !== name ? `(${company})` : ''].filter(Boolean).join(' ').trim() || 'Unknown';
}

/** Attach a best-effort match to a call, without ever setting the real FK columns. */
export async function applyCallerMatch(callSid: string, rawNumber: string | null): Promise<CallerMatch | null> {
  const match = await matchCaller(rawNumber);
  if (!match) return null;
  await updateCallBySid(callSid, {
    matched_kind: match.kind,
    matched_id: match.id,
    matched_label: match.label,
  });
  return match;
}

/** The Supabase bucket recordings are copied into. Follows the `starr-*` convention. */
export const CALL_RECORDING_BUCKET = 'starr-call-recordings';

/** Where a given call's recording lives. Grouped by month so the bucket stays browsable. */
export function recordingPath(callSid: string, startedAt: Date = new Date()): string {
  const yyyy = startedAt.getUTCFullYear();
  const mm = String(startedAt.getUTCMonth() + 1).padStart(2, '0');
  // The SID is already unique and URL-safe, so it needs no sanitising — but it is the only thing in
  // the path that varies, so a collision here would silently overwrite another call's recording.
  return `${yyyy}/${mm}/${callSid}.mp3`;
}
