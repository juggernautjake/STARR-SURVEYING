// lib/hours/period-lock.ts
//
// Pay-period lock helpers (slice H6 of the hours-correction plan). A
// locked pay period (a row in pay_period_locks whose [period_start,
// period_end] range covers a date) freezes employees out of editing or
// deleting their own time logs for that date; admins can still adjust.
//
// All helpers are BEST-EFFORT: if the pay_period_locks table doesn't
// exist yet (migration 378 not applied) or the query errors, they treat
// the date/range as UNLOCKED so the app keeps working pre-migration.

import { supabaseAdmin } from '@/lib/supabase';

export interface PayPeriodLock {
  id: string;
  period_start: string;
  period_end: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}

/** True when `logDate` (YYYY-MM-DD) falls inside any locked period. */
export async function isDateLocked(logDate: string | null | undefined): Promise<boolean> {
  if (!logDate) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from('pay_period_locks')
      .select('id')
      .lte('period_start', logDate)
      .gte('period_end', logDate)
      .limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Locks whose range overlaps [from, to]. Empty on error/missing table. */
export async function locksOverlapping(from: string, to: string): Promise<PayPeriodLock[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('pay_period_locks')
      .select('*')
      .lte('period_start', to)
      .gte('period_end', from)
      .order('period_start', { ascending: false });
    if (error || !data) return [];
    return data as PayPeriodLock[];
  } catch {
    return [];
  }
}
