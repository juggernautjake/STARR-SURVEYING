// lib/leads/follow-up.ts — the leads nobody has rung (D1-2).
//
// The analysis: *"`follow_up_date` exists and nothing appears to chase it. A lead that nobody rings is
// the cheapest lost revenue in the business."*
//
// That is the whole argument for this file. Every other item in the surveying analysis prevents a loss;
// this one is the only place that finds money already on the floor. A lead has been paid for — an ad
// click, a form fill, somebody's time — and then sits with a follow-up date in the past because the
// column is displayed on a detail page and nowhere else.
//
// ── OVERDUE IS NOT THE SAME AS "DUE TODAY", AND BOTH MATTER ────────────────────────────────────────
//
// Yesterday's call is a mistake; today's is a plan. A list that merges them starts every morning already
// looking like a failure, and the honest office response to a list that is always red is to stop reading
// it — the same failure mode as C1-2's reconciliation report, for the same reason.
//
// ── A LEAD THAT BECAME A JOB IS DONE, WHATEVER ITS DATE SAYS ───────────────────────────────────────
//
// `converted_job_id` outranks `follow_up_date`. Nobody clears the date when they convert a lead — they
// create the job and move on, which is correct — so a chaser that ignored the conversion would fill with
// customers who are already being surveyed.
//
// Pure and total: no I/O, no clock. `asOf` is passed in.

export interface LeadRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
  quote_amount: number | null;
  follow_up_date: string | null;
  converted_job_id: string | null;
  assigned_to: string | null;
  created_at: string;
}

/** Statuses that mean the lead is finished with, whatever the follow-up date says. */
export const CLOSED_STATUSES = new Set(['won', 'lost', 'converted', 'closed', 'archived', 'spam']);

export type Due = 'overdue' | 'today' | 'upcoming';

export interface FollowUp {
  lead: LeadRow;
  due: Due;
  /** Negative for overdue. Whole days, so "3 days late" is a sentence rather than 3.47. */
  daysOut: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Midnight LOCAL for a date, so "today" means the office's today.
 *
 * `follow_up_date` is a date, not an instant. Comparing it against `Date.now()` directly makes a call due
 * "today" become overdue at one minute past midnight UTC — which for a Texas office is 6pm the previous
 * evening, so every one of tomorrow's calls is red before anyone goes home.
 */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Parse a `date` column without letting the timezone shift it a day. */
function dueAt(value: string): number | null {
  // A bare `YYYY-MM-DD` is parsed as UTC midnight by `Date.parse`, which is the day before in every
  // American timezone. Split it instead and build a LOCAL date.
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const t = Date.parse(value);
  return Number.isFinite(t) ? startOfDay(t) : null;
}

/**
 * Leads with a follow-up date that needs someone, most overdue first.
 *
 * `horizonDays` bounds the "upcoming" end. Without it the list is every lead with a date, forever, and a
 * chaser that shows a call due in four months is a chaser nobody scrolls.
 */
export function followUps(
  leads: readonly LeadRow[],
  opts: { asOf: number; horizonDays?: number },
): FollowUp[] {
  const horizon = opts.horizonDays ?? 7;
  const today = startOfDay(opts.asOf);

  const out: FollowUp[] = [];
  for (const lead of leads) {
    if (!lead.follow_up_date) continue;
    // Converted or closed outranks the date — see the header.
    if (lead.converted_job_id) continue;
    if (CLOSED_STATUSES.has((lead.status ?? '').toLowerCase())) continue;

    const at = dueAt(lead.follow_up_date);
    if (at === null) continue;
    const daysOut = Math.round((at - today) / DAY_MS);
    if (daysOut > horizon) continue;

    out.push({ lead, daysOut, due: daysOut < 0 ? 'overdue' : daysOut === 0 ? 'today' : 'upcoming' });
  }

  // Most overdue first, then by value: two calls equally late are not equally urgent, and a $12,000
  // boundary survey outranks a $400 lot stake when the office has ten minutes before lunch.
  return out.sort((a, b) => a.daysOut - b.daysOut || (b.lead.quote_amount ?? 0) - (a.lead.quote_amount ?? 0));
}

/** How the office reads one row. */
export function describeFollowUp(f: FollowUp): string {
  if (f.due === 'today') return 'Due today';
  if (f.due === 'upcoming') return `Due in ${f.daysOut} day${f.daysOut === 1 ? '' : 's'}`;
  const late = Math.abs(f.daysOut);
  return `${late} day${late === 1 ? '' : 's'} overdue`;
}

/** The counts a heading needs, without the caller re-walking the list. */
export function summarize(list: readonly FollowUp[]): { overdue: number; today: number; upcoming: number } {
  return {
    overdue: list.filter((f) => f.due === 'overdue').length,
    today: list.filter((f) => f.due === 'today').length,
    upcoming: list.filter((f) => f.due === 'upcoming').length,
  };
}

// ── D1-3 · where a lead came from ──────────────────────────────────────────────────────────────────
//
// *"Source attribution on the leads board (also G1-4 in the Google doc — do it once)."* So it is one
// function, here, and both boards call it.

export interface AttributionRow {
  source: string | null;
  gclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  how_heard: string | null;
  referrer: string | null;
}

/**
 * One short phrase for where a lead came from.
 *
 * ORDERED BY HOW MUCH THE FIELD IS WORTH BELIEVING, which is the whole design:
 *
 *  1. `gclid` — Google handed it to us. It cannot be wrong, and it is the one that decides whether a
 *     `job_secured` upload can be attributed at all.
 *  2. `utm_*` — whoever built the link said so. Usually right, occasionally stale.
 *  3. `how_heard` — the CUSTOMER said so, in their own words. Genuinely useful and frequently "internet".
 *  4. `referrer` — the browser said so. A domain, not a campaign.
 *  5. `source` — an office dropdown. Accurate about intent, useless for spend.
 *
 * A board that showed only `source` would report every paid click as "Website", which is precisely how a
 * business concludes its advertising does nothing.
 */
export function attributionOf(row: AttributionRow): { label: string; detail: string | null; paid: boolean } {
  if (row.gclid) {
    return {
      label: 'Google Ads',
      detail: row.utm_campaign ?? null,
      // The only one that is certainly paid. `utm_medium: 'cpc'` is a claim; a gclid is a receipt.
      paid: true,
    };
  }
  if (row.utm_source) {
    const medium = (row.utm_medium ?? '').toLowerCase();
    return {
      label: row.utm_source,
      detail: row.utm_campaign ?? row.utm_medium ?? null,
      paid: medium === 'cpc' || medium === 'ppc' || medium === 'paid',
    };
  }
  if (row.how_heard) return { label: row.how_heard, detail: 'customer said', paid: false };
  if (row.referrer) {
    let host = row.referrer;
    try { host = new URL(row.referrer).hostname.replace(/^www\./, ''); } catch { /* keep the raw string */ }
    return { label: host, detail: 'referrer', paid: false };
  }
  if (row.source) return { label: row.source, detail: 'entered by the office', paid: false };
  // NOT "Direct". A lead with no attribution is one we failed to attribute, and calling that direct
  // traffic is how a business decides its advertising does nothing.
  return { label: 'Unattributed', detail: null, paid: false };
}
