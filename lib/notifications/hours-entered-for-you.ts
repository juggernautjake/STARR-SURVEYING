// lib/notifications/hours-entered-for-you.ts
//
// "The office put hours on your timesheet."
//
// Owner, 2026-08-12: *"The employer will also be able to log hours for employees and create entries
// setting the hours and pay for the employee."*
//
// ── WHY THIS NOTIFICATION IS NOT OPTIONAL ─────────────────────────────────────────────────────────
//
// Every other write to a person's timesheet is one they made. This is the first that isn't, and it
// arrives already approved — so without a bell, eight hours and a rate appear on somebody's pay with
// nothing anywhere saying when, or by whom, or that it happened at all. The person most likely to
// notice an office entry is wrong is the person who worked the day, and they can only notice it if
// they are told.
//
// It also names the pay, not just the hours. "6h added for 2026-08-11" invites a shrug; "6h at
// $22.00 — $132.00" is a number somebody checks. The whole reason an employee reviews a timesheet is
// the money, and hiding it behind another click is how a wrong rate survives to payday.
//
// Pure and dependency-free, like every builder in this directory, so the sentence can be tested
// without a database and the route maps it through `notify`.

export interface HoursEnteredForYouInput {
  /** Whose timesheet was written to. */
  employeeEmail?: string | null;
  /** Who wrote it — named in the body so there is somebody to ask. */
  enteredBy?: string | null;
  logDate?: string | null;
  hours?: number | null;
  /** What it was priced at, in dollars. Null when no rate is set — see below. */
  payDollars?: number | null;
  entryCount?: number;
}

export interface HoursEnteredForYouNotification {
  user_email: string;
  type: 'approval';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'hours_entered_for_you';
}

/**
 * Build the notification, or null when there is nobody to send it to.
 *
 * Null rather than a throw: this runs inside the best-effort block after the hours are already
 * saved, and a missing email must not turn a filed timesheet into a 500.
 */
export function buildHoursEnteredForYouNotification(
  input: HoursEnteredForYouInput,
): HoursEnteredForYouNotification | null {
  const email = input.employeeEmail?.trim();
  if (!email) return null;

  const count = input.entryCount ?? 1;
  const hours = typeof input.hours === 'number' && Number.isFinite(input.hours)
    ? `${Math.round(input.hours * 100) / 100}h`
    : `${count} ${count === 1 ? 'entry' : 'entries'}`;

  const when = input.logDate ? ` for ${input.logDate}` : '';
  const who = input.enteredBy?.trim() ? ` by ${input.enteredBy.trim()}` : '';

  // No rate set is a real, ordinary state (`unpriced` work, a person with no agreed rate) and it is
  // NOT $0.00. Printing a zero would tell somebody they worked for free; saying the pay has not been
  // decided is both true and the thing they should chase.
  const money = typeof input.payDollars === 'number' && Number.isFinite(input.payDollars)
    ? ` — $${input.payDollars.toFixed(2)}`
    : ' — pay not decided yet';

  return {
    user_email: email,
    type: 'approval',
    title: '🗒️ Hours added to your timesheet',
    // "already approved" is stated because it changes what the person should do: there is no
    // decision coming, so if it is wrong, saying so now is the only remaining step.
    body: `${hours}${when} ${count === 1 ? 'was' : 'were'} entered${who} and approved${money}. Check it and say if anything is wrong.`,
    icon: '🗒️',
    link: '/admin/hours?tab=my-time',
    source_type: 'hours_entered_for_you',
  };
}
