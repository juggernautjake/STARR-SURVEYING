// lib/notifications/hours-submitted.ts
//
// TELLING THE APPROVER THAT HOURS ARRIVED
// ═══════════════════════════════════════
//
// *"When employees submit their hours or update their hours, whoever is in charge of handling
// approving hours will get a notification where they can be linked to see the submitted hours and
// address it, such as revising the hours, denying them, or approving them."*
//
// Notifications ran one way only: approve, reject or adjust told the EMPLOYEE. Nothing told anybody
// that hours were waiting. A timesheet sat in `pending` until somebody happened to open the
// approval page, which is a queue nobody is watching — and unwatched pending hours are the same
// failure as everything else in this codebase: an absence that looks like nothing to do.
//
// ── WHO GETS TOLD ───────────────────────────────────────────────────────────────────────────────
//
// Only people who can actually act. `/admin/hours-approval` is reachable by admin, developer and
// tech_support, but every action on it — `time-logs/approve`, the single-entry decision, the payout
// decision — gates on `isAdmin`, which is `roles.includes('admin')` and nothing else.
//
// So a `tech_support` user can open the page and every button 403s. That mismatch is pre-existing
// and is NOT papered over here; what this module refuses to do is add insult to it by sending them
// work they cannot do. Notifying somebody about a decision they are not permitted to make trains
// them to ignore the bell, and then the bell stops working for everyone.
//
// ── ONE NOTIFICATION PER SUBMISSION ─────────────────────────────────────────────────────────────
//
// A day submitted as four entries is one act by one person. Four bells for it is how a useful
// notification becomes noise — the same reasoning as `buildHoursDecisionNotifications`, which sends
// one bell per worker rather than one per row.

/** What was submitted, already priced by the pay model. */
export interface SubmittedHours {
  employeeEmail: string;
  employeeName?: string | null;
  /** The date the work was done. One submission covers one day. */
  logDate: string;
  /** Total hours across every entry in this submission. */
  totalHours: number;
  /** What the pay model made of it, in dollars. Null when no entry carries a rate. */
  totalPayDollars: number | null;
  /** Hours in this submission that carry no rate — deliberately, or because none is set. */
  unpricedHours: number;
  /** How many entries. Used only to say "3 entries", never to send three notifications. */
  entryCount: number;
  /** True when this replaces hours already submitted for that day. */
  isResubmission: boolean;
  /** What is owed to this person overall, for context at the moment of deciding. */
  owedStatement?: string | null;
}

export interface HoursNotification {
  user_email: string;
  type: string;
  title: string;
  body: string;
  link: string;
  source_type: string;
  source_id: string;
}

const money = (dollars: number) => `$${dollars.toFixed(2)}`;

/**
 * The deep link an approver follows.
 *
 * Carries the employee and the week so the page opens on the submission rather than on whatever
 * week it last showed. A notification that lands you on a generic queue is a notification that
 * makes you do the search again.
 */
export function hoursApprovalLink(employeeEmail: string, logDate: string): string {
  const params = new URLSearchParams({ employee: employeeEmail, date: logDate, status: 'pending,disputed' });
  return `/admin/hours-approval?${params.toString()}`;
}

/** Roles permitted to decide hours. Mirrors `isAdmin`, which is what every action actually checks. */
export const HOURS_DECIDER_ROLES = ['admin'] as const;

/** Does this person's role set let them act on submitted hours? */
export function canDecideHours(roles: readonly string[] | null | undefined): boolean {
  return !!roles && roles.some((r) => (HOURS_DECIDER_ROLES as readonly string[]).includes(r));
}

/**
 * Build the notification for one submission, addressed to each approver.
 *
 * Returns an empty list when there is nobody to tell, rather than throwing — a firm with no admin
 * is a configuration problem, not a reason to fail somebody's timesheet submission.
 */
export function buildHoursSubmittedNotifications(
  submission: SubmittedHours,
  approverEmails: readonly string[],
): HoursNotification[] {
  const who = submission.employeeName?.trim() || submission.employeeEmail;
  const hours = Number(submission.totalHours);
  if (!Number.isFinite(hours) || hours <= 0) return [];

  const verb = submission.isResubmission ? 'updated' : 'submitted';
  const title = `${who} ${verb} ${hours}h for ${submission.logDate}`;

  const parts: string[] = [];
  parts.push(`${hours}h across ${submission.entryCount} ${submission.entryCount === 1 ? 'entry' : 'entries'}.`);

  if (submission.totalPayDollars !== null && submission.totalPayDollars !== undefined) {
    // The whole point of showing the money here is that the approver decides with it in view.
    parts.push(`At the standard rates that is ${money(submission.totalPayDollars)}.`);
  }

  if (submission.unpricedHours > 0) {
    // Said explicitly. An approver who does not notice this approves hours worth nothing.
    parts.push(
      submission.unpricedHours >= hours
        ? 'No pay rate was attached — you decide what these hours are worth.'
        : `${submission.unpricedHours}h of that carry no rate and need one set.`,
    );
  }

  if (submission.owedStatement) parts.push(submission.owedStatement);

  const body = parts.join(' ');
  const link = hoursApprovalLink(submission.employeeEmail, submission.logDate);

  // Deduplicated: the submitter may themselves be an admin, and telling somebody their own
  // timesheet arrived is noise. They already know.
  const recipients = [...new Set(approverEmails)].filter(
    (e) => e && e.toLowerCase() !== submission.employeeEmail.toLowerCase(),
  );

  return recipients.map((user_email) => ({
    user_email,
    type: submission.isResubmission ? 'hours_resubmitted' : 'hours_submitted',
    title,
    body,
    link,
    source_type: 'daily_time_logs',
    source_id: `${submission.employeeEmail}::${submission.logDate}`,
  }));
}
