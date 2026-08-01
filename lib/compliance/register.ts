// lib/compliance/register.ts — how close is each obligation to lapsing (audit §3, Phase 2 item 12).
//
// The dates live in the tables that own them and are unioned by the `compliance_register` view
// (seeds/520). This is the part that turns a date into a decision.
//
// ── URGENCY IS PER-ITEM, NOT GLOBAL ──────────────────────────────────────────────────────────────
//
// One threshold for everything is wrong in both directions. An E&O renewal needs sixty days because
// the underwriter needs sixty days; a vehicle registration needs about a week because you renew it
// online in ten minutes. A single 30-day warning either buries people in notices about registrations
// or tells them about their insurance a month too late — and the second one is how a firm ends up
// working uninsured for a fortnight without noticing.
//
// So `renewal_lead_days` rides on each row and the bands are computed relative to it.
//
// ── "EXPIRED" IS NOT THE SAME AS "MISSING" ──────────────────────────────────────────────────────
//
// An instrument with no calibration date recorded is not compliant — it is *unknown*, which for a
// firm signing and sealing plats is arguably worse, because nobody is going to be reminded about it.
// The view only emits rows that have a date, so absence is measured separately by `unrecorded()`.

export type ComplianceState = 'expired' | 'critical' | 'due' | 'ok' | 'no_expiry';

export interface ComplianceRow {
  register_key: string;
  org_id: string | null;
  subject_kind: 'employee' | 'vehicle' | 'equipment' | 'organization';
  subject_label: string;
  subject_id: string | null;
  category: string;
  title: string;
  identifier: string | null;
  issued_on: string | null;
  expires_on: string | null;
  renewal_lead_days: number;
  document_url: string | null;
}

export interface ComplianceItem extends ComplianceRow {
  /** Whole days from `today` to `expires_on`. Negative once lapsed. Null when there is no expiry. */
  daysRemaining: number | null;
  state: ComplianceState;
  /** Which alert band this item currently sits in, or null when none has been crossed. Used as the
   *  idempotency key for notifications — see `compliance_alerts_sent`. */
  band: number | null;
}

/** The bands an item passes through, as fractions of its own lead time plus a fixed final warning.
 *
 *  Fractions rather than fixed days so a 60-day obligation warns at 60/30/14/0 and a 14-day one warns
 *  at 14/7/3/0, without a table of special cases. */
const BAND_FRACTIONS = [1, 0.5, 0.25];

/** Midnight-anchored day difference.
 *
 *  Not `(b - a) / 86400000`: that answers "how many 24-hour periods", which is off by one for most of
 *  the day and makes an item expiring tomorrow report 0 days remaining all afternoon. A licence
 *  expires on a DATE, so the arithmetic is in dates. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/** Parse a `date` column without letting the local timezone move it.
 *
 *  `new Date('2026-08-01')` is midnight UTC, which is the previous evening in Texas — so an item
 *  expiring today reports as expired yesterday for everyone west of Greenwich. Constructed in UTC
 *  from the parts instead. */
export function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function assess(row: ComplianceRow, today = new Date()): ComplianceItem {
  const expiry = parseDateOnly(row.expires_on);
  if (!expiry) {
    return { ...row, daysRemaining: null, state: 'no_expiry', band: null };
  }

  const daysRemaining = daysBetween(today, expiry);
  const lead = Math.max(1, row.renewal_lead_days || 30);
  const bands = BAND_FRACTIONS.map((f) => Math.max(1, Math.round(lead * f)));

  const state: ComplianceState =
    daysRemaining < 0 ? 'expired'
    : daysRemaining <= bands[2] ? 'critical'
    : daysRemaining <= bands[0] ? 'due'
    : 'ok';

  // The TIGHTEST band already crossed — the smallest threshold the item is now inside. `find` on a
  // descending list returns the LOOSEST match instead, which pins the item at band 60 for its whole
  // life; since the band is the alert ledger's idempotency key, the 30-day and final warnings would
  // then never fire at all. 0 is its own band so "expired" alerts exactly once.
  const crossed = bands.filter((b) => daysRemaining <= b);
  const band = daysRemaining < 0 ? 0 : crossed.length ? Math.min(...crossed) : null;

  return { ...row, daysRemaining, state, band };
}

/** Sort worst-first. The point of the page is what needs doing, not an alphabetical inventory. */
export function bySeverity(a: ComplianceItem, b: ComplianceItem): number {
  const rank: Record<ComplianceState, number> = { expired: 0, critical: 1, due: 2, ok: 3, no_expiry: 4 };
  if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
  if (a.daysRemaining === null) return b.daysRemaining === null ? 0 : 1;
  if (b.daysRemaining === null) return -1;
  return a.daysRemaining - b.daysRemaining;
}

export interface ComplianceSummary {
  expired: number;
  critical: number;
  due: number;
  ok: number;
  noExpiry: number;
  /** True when anything needs attention. What a badge in the nav hangs off. */
  needsAttention: boolean;
}

export function summarise(items: ComplianceItem[]): ComplianceSummary {
  const s: ComplianceSummary = { expired: 0, critical: 0, due: 0, ok: 0, noExpiry: 0, needsAttention: false };
  for (const i of items) {
    if (i.state === 'expired') s.expired++;
    else if (i.state === 'critical') s.critical++;
    else if (i.state === 'due') s.due++;
    else if (i.state === 'no_expiry') s.noExpiry++;
    else s.ok++;
  }
  s.needsAttention = s.expired + s.critical + s.due > 0;
  return s;
}

/** Human phrasing. "in -3 days" is what happens when this is left to a template. */
export function describeDeadline(item: ComplianceItem): string {
  if (item.daysRemaining === null) return 'No expiry recorded';
  const d = item.daysRemaining;
  if (d < 0) return `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`;
  if (d === 0) return 'Expires today';
  if (d === 1) return 'Expires tomorrow';
  return `Expires in ${d} days`;
}

/** Assets whose obligation has no date recorded at all.
 *
 *  Deliberately a separate function from the register: the view can only union rows that HAVE a date,
 *  so an instrument that has never been calibrated does not appear in it. "No calibration on record"
 *  and "calibration up to date" are opposite answers and the register cannot tell them apart, which is
 *  precisely the §1.1b failure mode — so the page asks this question separately. */
export interface UnrecordedObligation {
  subject_kind: ComplianceRow['subject_kind'];
  subject_id: string;
  subject_label: string;
  what: string;
}
