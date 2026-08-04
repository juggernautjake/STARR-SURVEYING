// lib/payroll/week-summary.ts
//
// WHAT A WEEK IS ACTUALLY WORTH (pay consolidation C-19, 2026-08-04)
// ═════════════════════════════════════════════════════════════════
//
// *"Please make sure the week history and pay advances are totally built out and functional too."*
//
// The week summary on My Hours was computed inline, and every one of its five figures was answering
// a slightly different question from the one on its label:
//
//   • **"Est. Pay" summed `total_pay` across every entry, including rejected ones.** Rejected hours
//     pay nothing. The headline figure a person reads to know what is coming counted work that had
//     been explicitly refused.
//   • **It read `total_pay`, which is the rate the RULES set at submission** — not the approver's
//     decision. Once somebody sets pay by hand, splits a day across rates, or leaves part of it
//     undecided, the summary quietly kept showing the original figure. That is the same "two numbers
//     for one question" this whole consolidation exists to end.
//   • **"Approved: 3" counted ENTRIES, not hours.** Three entries might be two hours or twenty-four.
//     On a timesheet the unit that matters is hours.
//   • **Total hours ignored `adjusted_hours`.** A manager who cut a day from ten hours to eight left
//     the employee's own summary still reading ten.
//   • **Hours awaiting a rate were invisible** — they contributed $0 and appeared nowhere, so a week
//     could show less pay than expected with nothing on screen accounting for the gap.
//
// Pure so the arithmetic can be tested. Every figure it returns is labelled with the question it
// answers, because a number whose meaning has to be inferred is how the above happened.

/** One entry as the hours API returns it. */
export interface WeekEntry {
  log_date: string;
  hours: number;
  /** The approver's revision to the hours, when there is one. This is what gets paid. */
  adjusted_hours?: number | null;
  status: string;
  /** What the rules priced the entry at when it was submitted. */
  total_pay?: number | null;
  /** What the approver decided instead, when they decided anything. */
  pay_decision?: {
    total_pay: number;
    undecided_hours: number;
  } | null;
}

export interface WeekSummary {
  /** Every hour on the timesheet, adjustments applied, whatever its status. */
  totalHours: number;
  approvedHours: number;
  pendingHours: number;
  rejectedHours: number;
  /** Money for approved hours only. This is what is actually coming. */
  approvedPay: number;
  /** Money for hours still awaiting a decision. Not yours yet, but not nothing either. */
  pendingPay: number;
  /** Approved hours nobody has priced. They pay nothing until somebody sets a rate. */
  undecidedHours: number;
  /** True when an approver has overridden the rules somewhere in this week. */
  hasDecisions: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The hours that count: the approver's revision when there is one, else what was submitted. */
function payableHours(entry: WeekEntry): number {
  const adjusted = entry.adjusted_hours;
  const hours = adjusted !== null && adjusted !== undefined ? Number(adjusted) : Number(entry.hours);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/**
 * What an entry is worth: the approver's decision where one exists, otherwise the figure the rules
 * produced. Never both, and never the rules' figure once a person has overruled it.
 */
function entryPay(entry: WeekEntry): number {
  if (entry.pay_decision) {
    const decided = Number(entry.pay_decision.total_pay);
    return Number.isFinite(decided) ? decided : 0;
  }
  const resolved = Number(entry.total_pay);
  return Number.isFinite(resolved) ? resolved : 0;
}

/**
 * Summarise a week of entries.
 *
 * `adjusted` and `disputed` entries are counted as pending: neither is settled, and both are still
 * capable of changing. Treating `adjusted` as approved would tell somebody a disputed figure is
 * final.
 */
export function summarizeWeek(entries: WeekEntry[]): WeekSummary {
  const summary: WeekSummary = {
    totalHours: 0,
    approvedHours: 0,
    pendingHours: 0,
    rejectedHours: 0,
    approvedPay: 0,
    pendingPay: 0,
    undecidedHours: 0,
    hasDecisions: false,
  };

  for (const entry of entries ?? []) {
    const hours = payableHours(entry);
    if (hours === 0) continue;

    summary.totalHours += hours;
    if (entry.pay_decision) {
      summary.hasDecisions = true;
      const undecided = Number(entry.pay_decision.undecided_hours);
      if (Number.isFinite(undecided) && undecided > 0) summary.undecidedHours += undecided;
    }

    switch (entry.status) {
      case 'approved':
        summary.approvedHours += hours;
        summary.approvedPay += entryPay(entry);
        break;
      case 'rejected':
      case 'cancelled':
        // Rejected hours pay nothing. Counting them in the headline figure told people money was
        // coming for work that had been explicitly refused.
        summary.rejectedHours += hours;
        break;
      default:
        // pending, disputed, adjusted — not settled, still capable of changing.
        summary.pendingHours += hours;
        summary.pendingPay += entryPay(entry);
        break;
    }
  }

  return {
    totalHours: round2(summary.totalHours),
    approvedHours: round2(summary.approvedHours),
    pendingHours: round2(summary.pendingHours),
    rejectedHours: round2(summary.rejectedHours),
    approvedPay: round2(summary.approvedPay),
    pendingPay: round2(summary.pendingPay),
    undecidedHours: round2(summary.undecidedHours),
    hasDecisions: summary.hasDecisions,
  };
}
