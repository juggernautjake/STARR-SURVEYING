// lib/ai/proactive.ts — the app tells you before you ask (audit §5, Phase 3 item 16).
//
// §5: *"Proactive, not just reactive — 'you're still clocked in at 7pm,' 'this job is 12 hours over
// estimate,' 'Bobby's RPLS renews in 30 days,' 'rain Thursday, want to move the Belton job?'"*
//
// ── THESE ARE RULES, NOT MODEL CALLS ────────────────────────────────────────────────────────────
//
// Every alert here is a deterministic query. That is a deliberate choice: "you are still clocked in"
// is a fact, and asking a model to notice it costs money, adds latency, and introduces the chance of
// a hallucinated alert — which is the one kind of notification that destroys trust in all the
// others. The model's job is phrasing and judgement, not arithmetic somebody can do in SQL.
//
// ── EVERY ALERT NAMES WHAT IT IS ABOUT AND FIRES ONCE ───────────────────────────────────────────
//
// A proactive system that repeats itself gets muted, and a muted alert is worse than no alert
// because everyone believes it is working. `dedupeKey` is the identity of the SITUATION, not of the
// check — "clocked in on job X since Tuesday" is one situation however many times the job runs.
//
// Q55 asks the owner whether they want proactive AI at all. Nothing here sends anything on its own:
// this module produces alerts, and a caller decides what to do with them. Turning it into
// notifications is one deliberate wiring step, not a default.

import { supabaseAdmin } from '@/lib/supabase';
import { assess, type ComplianceRow } from '@/lib/compliance/register';

export type AlertSeverity = 'info' | 'warn' | 'urgent';

export interface ProactiveAlert {
  /** Stable identity of the SITUATION. Two runs that find the same situation produce the same key. */
  dedupeKey: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Where to go to deal with it. An alert with no destination is a complaint. */
  href?: string;
  /** Who should see it. Empty = anyone with the roles the check requires. */
  audience?: string[];
}

/** Somebody clocked in for an implausible length of time.
 *
 *  Threshold is 12 hours rather than "after 7pm": a crew that starts at 4am is done by 3pm, and a
 *  clock-based rule fires on every one of them. Elapsed time is the thing that is actually wrong. */
async function longClockIns(): Promise<ProactiveAlert[]> {
  const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('active_clock_sessions')
    .select('user_email, clock_in_at, job_id')
    .lt('clock_in_at', cutoff);
  if (error) return [];

  return ((data ?? []) as Array<{ user_email: string; clock_in_at: string; job_id: string | null }>).map((r) => {
    const hours = Math.floor((Date.now() - Date.parse(r.clock_in_at)) / 3600_000);
    return {
      // Keyed on the clock-in, not on today: the same forgotten clock-out is one situation whether
      // the check runs hourly or nightly.
      dedupeKey: `clock:${r.user_email}:${r.clock_in_at}`,
      severity: hours >= 20 ? 'urgent' : 'warn',
      title: 'Still clocked in',
      detail: `${r.user_email} has been clocked in for ${hours} hours. If they forgot to clock out, the timesheet needs fixing before payroll.`,
      href: '/admin/hours-approval',
      audience: [r.user_email],
    };
  });
}

/** Anything expiring, from the compliance register.
 *
 *  Reuses `assess()` rather than re-deriving thresholds, so the alert fires on exactly the band the
 *  compliance page shows. Two definitions of "due soon" is how a page and a notification come to
 *  disagree about the same licence. */
async function expiringCompliance(): Promise<ProactiveAlert[]> {
  const { data, error } = await supabaseAdmin.from('compliance_register').select('*');
  if (error) return [];

  return ((data ?? []) as ComplianceRow[])
    .map((row) => assess(row))
    .filter((i) => i.state === 'expired' || i.state === 'critical' || i.state === 'due')
    .map((i) => ({
      // Includes the expiry date: a renewed licence is a NEW situation and must be able to alert
      // again on its own dates. Keyed without it, a renewal goes silent for the rest of its life.
      dedupeKey: `compliance:${i.register_key}:${i.expires_on}:${i.band}`,
      severity: (i.state === 'expired' ? 'urgent' : i.state === 'critical' ? 'warn' : 'info') as AlertSeverity,
      title: i.state === 'expired' ? `Expired: ${i.title}` : `Expiring: ${i.title}`,
      detail:
        i.daysRemaining === null
          ? i.title
          : i.daysRemaining < 0
            ? `${i.subject_label} — expired ${Math.abs(i.daysRemaining)} days ago.`
            : `${i.subject_label} — ${i.daysRemaining} days left.`,
      href: '/admin/compliance',
    }));
}

/** Jobs invoiced past their agreed estimate.
 *
 *  §3's "estimate vs actual is the number that tells you if you're pricing right", turned into a
 *  notification. Measured against the ACCEPTED quote plus APPROVED change orders — the same
 *  definition `job_estimate_vs_actual` uses, because a scope change is not an overrun. */
async function jobsOverEstimate(): Promise<ProactiveAlert[]> {
  const { data, error } = await supabaseAdmin
    .from('job_estimate_vs_actual')
    .select('job_id, job_number, name, estimate_cents, invoiced_cents')
    .gt('estimate_cents', 0);
  if (error) return [];

  return ((data ?? []) as Array<{ job_id: string; job_number: string | null; name: string | null; estimate_cents: number; invoiced_cents: number }>)
    .filter((j) => j.invoiced_cents > j.estimate_cents * 1.1)
    .map((j) => {
      const overBy = j.invoiced_cents - j.estimate_cents;
      const pct = Math.round((overBy / j.estimate_cents) * 100);
      return {
        // Bucketed by 10% so a job drifting from 11% to 12% over does not re-alert, while a jump to
        // 40% does.
        dedupeKey: `over-estimate:${j.job_id}:${Math.floor(pct / 10)}`,
        severity: (pct >= 50 ? 'urgent' : 'warn') as AlertSeverity,
        title: `Over estimate: ${j.job_number ?? j.name ?? 'a job'}`,
        detail: `Invoiced ${pct}% above the accepted quote plus approved change orders (${(overBy / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} over). If the extra work was agreed, it may need a change order.`,
        href: `/admin/jobs/${j.job_id}`,
      };
    });
}

/** Receivables aged past 60 days.
 *
 *  Sixty rather than thirty: an invoice one day past 30-day terms is normal, and alerting on it
 *  trains people to ignore the channel before it has told them anything worth knowing. */
async function agedReceivables(): Promise<ProactiveAlert[]> {
  const { data, error } = await supabaseAdmin
    .from('ar_aging')
    .select('id, invoice_number, customer_name, balance_cents, days_overdue, bucket')
    .in('bucket', ['61_90', '90_plus']);
  if (error) return [];

  return ((data ?? []) as Array<{ id: string; invoice_number: string; customer_name: string | null; balance_cents: number; days_overdue: number | null; bucket: string }>)
    .map((r) => ({
      dedupeKey: `ar:${r.id}:${r.bucket}`,
      severity: (r.bucket === '90_plus' ? 'urgent' : 'warn') as AlertSeverity,
      title: `Unpaid ${r.days_overdue} days: ${r.invoice_number}`,
      detail: `${r.customer_name ?? 'A customer'} owes ${(r.balance_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, ${r.days_overdue} days past due.`,
      href: '/admin/receivables',
    }));
}

/** Instruments with no calibration on record.
 *
 *  Not "overdue" — never recorded. The compliance page makes the same distinction for the same
 *  reason: an instrument with no history cannot become overdue, so it never appears in any list that
 *  only reads dates. */
async function uncalibratedInstruments(): Promise<ProactiveAlert[]> {
  const { data, error } = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, name, brand, model, equipment_type')
    .is('next_calibration_due_at', null)
    .is('next_calibration_due', null)
    .is('retired_at', null)
    .limit(50);
  if (error) return [];

  const INSTRUMENTS = new Set(['total_station', 'gnss', 'gnss_receiver', 'level', 'data_collector', 'instrument']);
  return ((data ?? []) as Array<{ id: string; name: string | null; brand: string | null; model: string | null; equipment_type: string | null }>)
    .filter((e) => !e.equipment_type || INSTRUMENTS.has(e.equipment_type))
    .map((e) => ({
      dedupeKey: `uncalibrated:${e.id}`,
      severity: 'info' as AlertSeverity,
      title: 'No calibration on record',
      detail: `${e.name || [e.brand, e.model].filter(Boolean).join(' ') || 'An instrument'} has no calibration date. It cannot be flagged as overdue because there is nothing to compare against.`,
      href: '/admin/compliance',
    }));
}

/** Everything, worst first.
 *
 *  Each check is independent and a failure in one does not silence the rest — a compliance query
 *  that errors must not also hide the forgotten clock-outs. */
export async function collectProactiveAlerts(): Promise<ProactiveAlert[]> {
  const results = await Promise.allSettled([
    longClockIns(),
    expiringCompliance(),
    jobsOverEstimate(),
    agedReceivables(),
    uncalibratedInstruments(),
  ]);

  const rank: Record<AlertSeverity, number> = { urgent: 0, warn: 1, info: 2 };
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Which alerts have not been delivered yet.
 *
 *  Reuses `compliance_alerts_sent` as the ledger — one table for "what have we already said", rather
 *  than a second one that can disagree with the first about whether a licence warning went out. */
export async function undelivered(alerts: ProactiveAlert[]): Promise<ProactiveAlert[]> {
  if (alerts.length === 0) return [];
  const keys = alerts.map((a) => a.dedupeKey);
  const { data, error } = await supabaseAdmin
    .from('compliance_alerts_sent')
    .select('register_key')
    .in('register_key', keys);
  // On a read failure, send NOTHING rather than everything. A duplicate storm across every alert is
  // how a notification channel gets muted permanently; a delayed alert is recoverable.
  if (error) {
    console.error('[proactive] could not read the alert ledger; suppressing this run:', error.message);
    return [];
  }
  const sent = new Set(((data ?? []) as Array<{ register_key: string }>).map((r) => r.register_key));
  return alerts.filter((a) => !sent.has(a.dedupeKey));
}

/** Mark alerts as delivered. */
export async function markDelivered(alerts: ProactiveAlert[], sentTo: string[]): Promise<void> {
  if (alerts.length === 0) return;
  await supabaseAdmin.from('compliance_alerts_sent').upsert(
    alerts.map((a) => ({
      register_key: a.dedupeKey,
      // 0 = "this situation was announced". The band arithmetic belongs to the compliance register;
      // a proactive alert either fired or did not.
      threshold_days: 0,
      expires_on: null,
      sent_to: sentTo,
    })),
    { onConflict: 'register_key,threshold_days,expires_on', ignoreDuplicates: true },
  );
}
