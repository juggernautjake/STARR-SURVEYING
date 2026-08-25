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
import { microsToCents } from '@/lib/integrations/google-ads/spend';
import { findDuplicateExpenses } from '@/lib/finances/duplicate-expenses';
import { looksLikeAdVendor } from '@/lib/finances/ad-spend-reconcile';
import { assess, type ComplianceRow } from '@/lib/compliance/register';
import { notifyMany } from '@/lib/notifications';

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
  // `started_at`, NOT `clock_in_at`. This shipped asking for `clock_in_at`, which does not exist on
  // `active_clock_sessions` — PostgREST answered 400, the `if (error) return []` below swallowed it,
  // and the check reported "nobody is over 12 hours" forever. Verified against the live schema
  // 2026-08-01; the error path is why a wrong column name here is invisible rather than loud.
  const { data, error } = await supabaseAdmin
    .from('active_clock_sessions')
    .select('user_email, started_at, job_id')
    .lt('started_at', cutoff);
  if (error) {
    console.error('[proactive] long clock-in check failed:', error.message);
    return [];
  }

  return ((data ?? []) as Array<{ user_email: string; started_at: string; job_id: string | null }>).map((r) => {
    const hours = Math.floor((Date.now() - Date.parse(r.started_at)) / 3600_000);
    return {
      // Keyed on the clock-in, not on today: the same forgotten clock-out is one situation whether
      // the check runs hourly or nightly.
      dedupeKey: `clock:${r.user_email}:${r.started_at}`,
      severity: hours >= 20 ? 'urgent' : 'warn',
      title: 'Still clocked in',
      detail: `${r.user_email} has been clocked in for ${hours} hours. If they forgot to clock out, the timesheet needs fixing before payroll.`,
      href: '/admin/hours?tab=approvals',
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

/** The same money counted twice.
 *
 *  Owner ask, 2026-08-07: *"systems and checks in place that trigger alerts whenever it seems like
 *  receipt/expenditures are counted multiple times."*
 *
 *  A duplicate expense is the quietest error in the ledger. Nothing fails, both rows are individually
 *  correct, and net profit simply reads low — an error in the flattering direction, which nobody
 *  investigates. It surfaces months later, if ever, when somebody reconciles against a statement.
 *
 *  Ninety days rather than the whole year: the point is to catch it while somebody still remembers
 *  the purchase, and a check that re-examines all of history has to re-decide every old pair on every
 *  run. `warn`, not `urgent` — money is at stake but nothing is on fire. */
async function duplicateExpenses(): Promise<ProactiveAlert[]> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [recRes, adRes] = await Promise.all([
    supabaseAdmin
      .from('receipts')
      .select('id, vendor_name, total_cents, transaction_at')
      .in('status', ['approved', 'exported'])
      .is('deleted_at', null)
      // Seed 590. This alert hunts duplicate expenses, so a superseded bill would be its most
      // reliable false positive: it IS a second receipt for one purchase, already recognised as one
      // and already excluded from every total. Reporting it would be the system flagging its own fix.
      .is('superseded_by_receipt_id', null)
      // Seed 591 — a purchase somebody marked personal is not the business's, whatever card paid
      // for it. NULL still counts: a receipt nobody has questioned is a business purchase.
      .or('expense_nature.is.null,expense_nature.eq.business')
      .gte('transaction_at', since),
    supabaseAdmin
      .from('ad_spend_daily')
      .select('cost_micros')
      .gte('spend_date', since.slice(0, 10)),
  ]);

  if (recRes.error) {
    console.error('[proactive] duplicate-expense check failed:', recRes.error.message);
    return [];
  }

  const receipts = ((recRes.data ?? []) as Array<{
    id: string; vendor_name: string | null; total_cents: number | null; transaction_at: string | null;
  }>)
    .filter((r) => Boolean(r.transaction_at))
    .map((r) => ({
      id: r.id,
      vendor_name: r.vendor_name,
      total_cents: r.total_cents ?? 0,
      transaction_at: r.transaction_at as string,
    }));

  const adSpendCents = microsToCents(
    ((adRes.data ?? []) as Array<{ cost_micros: number | string | null }>)
      .reduce((s, x) => s + Math.max(0, Number(x.cost_micros ?? 0)), 0),
  );

  // Only the confident findings become notifications. The low-confidence ones — same vendor and
  // amount a week apart — are real signals but ordinary enough that alerting on them nightly would
  // train somebody to dismiss the channel, taking the high-confidence ones with it. They stay
  // visible on the finance overview, where they are looked at deliberately rather than pushed.
  return findDuplicateExpenses(receipts, { adSpendCents, isAdVendor: looksLikeAdVendor })
    .filter((f) => f.confidence === 'high')
    .map((f) => ({
      dedupeKey: f.dedupe_key,
      severity: 'warn' as const,
      title: `Possible double-counted expense — ${formatCents(f.total_cents)}`,
      detail: f.explanation,
      href: '/admin/finances/overview',
    }));
}

/** Cents → "$84.50", for alert text that a person reads on a phone. */
function formatCents(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
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
    duplicateExpenses(),
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

// ── Delivery ────────────────────────────────────────────────────────────────────────────────────
//
// The header above says turning alerts into notifications is "one deliberate wiring step, not a
// default". This is that step (audit §5 item 16), and it goes into the EXISTING `notifications`
// table rather than a new proactive-alerts feed.
//
// That is the whole design decision. D4b asks which channel an alert must reach — "a channel they
// actually watch". There is one of those already: the bell in the top bar, polled every 15 seconds,
// with a toast for high-severity items and a read/unread state people maintain. A parallel feed would
// be a second inbox, and the failure mode of a second inbox is that neither gets watched.

/** Who hears about a firm-wide alert: everyone who could act on it.
 *
 *  `registered_users` is the addressable population — the same table every other cron in this repo
 *  resolves recipients from. Approved and not banned, because a notification to a revoked account is
 *  a row nobody will ever read that still counts as "we told them".
 *
 *  `admin` and `developer` and nothing else, matching `isAdmin`/`isDeveloper` and the GET route's own
 *  visibility rule. Inventing an "owner" or "manager" role here would resolve to nobody: the role
 *  vocabulary is a closed union in `lib/auth`, and a query for a role that does not exist fails by
 *  returning an empty recipient list — which reads in the logs as "nothing to send". */
async function adminRecipients(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .select('email, roles, is_approved, is_banned')
    .or('roles.cs.{admin},roles.cs.{developer}');
  if (error) {
    console.error('[proactive] could not resolve alert recipients:', error.message);
    return [];
  }

  return ((data ?? []) as Array<{ email: string | null; is_approved: boolean | null; is_banned: boolean | null }>)
    .filter((u) => !!u.email && u.is_approved !== false && u.is_banned !== true)
    .map((u) => u.email as string);
}

/** The bell's escalation vocabulary, not ours. Two severity scales on one notification is how a
 *  screen ends up colouring an urgent alert as normal. */
const ESCALATION: Record<AlertSeverity, 'low' | 'normal' | 'high' | 'urgent'> = {
  urgent: 'urgent',
  warn: 'high',
  info: 'normal',
};

export interface DeliveryReport {
  considered: number;
  delivered: number;
  recipients: number;
  /** Alerts that had an audience nobody could be found for — reported, not swallowed. */
  undeliverable: string[];
}

/**
 * Send every not-yet-announced alert to the people who can act on it, and record that it was sent.
 *
 * ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE. The ledger is written AFTER the notifications, so a
 * crash between the two re-sends rather than silently swallowing. A duplicate is an annoyance; a
 * swallowed "this licence expired" is the failure the whole module exists to prevent.
 */
export async function deliverProactiveAlerts(): Promise<DeliveryReport> {
  const all = await collectProactiveAlerts();
  const fresh = await undelivered(all);
  if (fresh.length === 0) return { considered: all.length, delivered: 0, recipients: 0, undeliverable: [] };

  const admins = await adminRecipients();
  const undeliverable: string[] = [];
  const sentTo = new Set<string>();
  const announced: ProactiveAlert[] = [];

  for (const alert of fresh) {
    // A named audience is the person the alert is ABOUT ("you have been clocked in for 14 hours").
    // Everything else is firm business and goes to the people who can act on it — telling the crew
    // that a job is over estimate is neither actionable nor theirs to know.
    const recipients = alert.audience?.length ? alert.audience : admins;
    if (recipients.length === 0) {
      undeliverable.push(alert.dedupeKey);
      continue;
    }
    await notifyMany(recipients, {
      type: 'system',
      title: alert.title,
      body: alert.detail,
      link: alert.href,
      // `source_id` carries the dedupe key so a notification can be traced back to the situation that
      // produced it — otherwise "why did I get this twice" is unanswerable.
      source_type: 'proactive_alert',
      source_id: alert.dedupeKey,
      escalation_level: ESCALATION[alert.severity],
    });
    recipients.forEach((r) => sentTo.add(r));
    announced.push(alert);
  }

  await markDelivered(announced, [...sentTo]);
  return { considered: all.length, delivered: announced.length, recipients: sentTo.size, undeliverable };
}
