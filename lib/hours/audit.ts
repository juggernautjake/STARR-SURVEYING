// lib/hours/audit.ts — say WHO, every time an hours entry changes.
//
// The history itself is written by a database trigger (seeds/664_time_log_events.sql), which sees
// every insert, update and delete on `daily_time_logs` no matter where it came from. What the
// trigger cannot know is the person: every API write arrives as the service role. So each write the
// app makes carries a stamp — `last_actor`, `last_action`, `last_stamp_at` — in the same statement,
// and the trigger copies it into the event.
//
// A delete cannot carry columns, so `deleteTimeLogAudited` stamps the row first and deletes it a
// moment later. The trigger only believes a delete stamp less than a minute old.

import { supabaseAdmin } from '@/lib/supabase';

export type TimeLogAction =
  | 'submitted'
  | 'entered_by_office'
  | 'resubmitted'
  | 'edited'
  | 'approved'
  | 'rejected'
  | 'adjusted'
  | 'disputed'
  | 'paid'
  | 'unpaid'
  | 'deleted'
  | 'replaced'
  | 'restored';

/** The three columns that tell the history trigger who did this and what they meant by it. */
export function auditStamp(actor: string, action: TimeLogAction): {
  last_actor: string;
  last_action: TimeLogAction;
  last_stamp_at: string;
} {
  return { last_actor: actor.toLowerCase(), last_action: action, last_stamp_at: new Date().toISOString() };
}

/**
 * Delete one hours entry, recording who removed it.
 *
 * `action` is 'deleted' for a plain removal and 'replaced' when the day is being re-submitted and
 * this row is the old version — the history screen shows the two differently, because "Jane fixed
 * her Tuesday" and "somebody removed Jane's Tuesday" are not the same event.
 *
 * The stamp is written before the delete, so even if the delete then fails nothing is lost: the row
 * is still there, carrying a stamp the trigger will ignore once it is a minute old.
 */
export async function deleteTimeLogAudited(
  id: string,
  actor: string,
  action: 'deleted' | 'replaced' = 'deleted',
): Promise<{ error: string | null }> {
  const { error: stampError } = await supabaseAdmin
    .from('daily_time_logs')
    .update(auditStamp(actor, action))
    .eq('id', id);
  if (stampError) return { error: stampError.message };

  const { error } = await supabaseAdmin.from('daily_time_logs').delete().eq('id', id);
  return { error: error?.message ?? null };
}
