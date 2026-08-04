// lib/saas/onboarding.ts — a firm with no data (audit §3c.1 item 8i, Phase 4 item 19).
//
// §3c.1: *"Today the app assumes Starr's data exists. A new firm needs empty states, a first-run
// setup, and defaults that are not ours."*
//
// ── THE HARD PART IS NOT THE WIZARD ─────────────────────────────────────────────────────────────
//
// A setup wizard is easy and mostly useless on its own, because the failure a new firm actually hits
// is not "I was not asked for my phone number" — it is opening a page, seeing nothing, and being
// unable to tell whether the software is broken, still loading, or simply empty because they are new.
// This repo has already paid for that confusion in three places (§1.1b's silent empty results, the
// compliance page's all-clear, the receivables page's "nobody owes us anything").
//
// So this module answers two questions and the UI hangs off both:
//
//   1. What has this firm actually set up? — measured, not remembered. A stored "onboarding_complete"
//      flag lies the moment somebody deletes their only vehicle, and it cannot tell a firm that
//      abandoned setup halfway from one that finished.
//   2. Which step is next? — one at a time, in dependency order, because a checklist of twelve items
//      on day one is a wall rather than a path.
//
// ── THE STEPS ARE ORDERED BY WHAT BLOCKS WHAT ───────────────────────────────────────────────────
//
// Not by importance, and not by how quick they are. A firm cannot invoice before it has a customer,
// cannot run a job before it has staff, and cannot send anything with its name on it before the name
// exists. Getting this order wrong produces a wizard that asks for things in an order that does not
// work, which people abandon.

export type OnboardingStepId =
  | 'firm_identity'
  | 'team'
  | 'counties'
  | 'work_types'
  | 'equipment'
  | 'first_customer'
  | 'first_job'
  | 'payments';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  /** Why this matters, in one sentence, in the firm's terms rather than the schema's. */
  why: string;
  href: string;
  /** Steps that must be done first. A step whose blockers are unmet is shown but not offered. */
  blockedBy: OnboardingStepId[];
  /** False when the firm can run without it. Skippable steps never block "you are set up". */
  required: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'firm_identity',
    title: 'Your firm’s details',
    // First, because every outbound document carries it and a blank one is visible to a customer.
    // §3c.3 shipped the blank-rather-than-borrowed default precisely so this step is obvious.
    why: 'Your name, phone and address go on every proposal, invoice and receipt you send.',
    href: '/admin/org-settings',
    blockedBy: [],
    required: true,
  },
  {
    id: 'team',
    title: 'Add your people',
    why: 'Staff need accounts before they can clock in, be assigned work, or appear on a schedule.',
    href: '/admin/invites',
    blockedBy: ['firm_identity'],
    required: true,
  },
  {
    id: 'counties',
    title: 'Counties you work in',
    // Not cosmetic: the research pipeline reports "no adapter for this county" against this list, and
    // an empty list makes that message useless.
    why: 'Records research and property lookups use this to know where to look.',
    href: '/admin/org-settings#counties',
    blockedBy: ['firm_identity'],
    required: false,
  },
  {
    id: 'work_types',
    title: 'What you charge for',
    why: 'Your survey types and rates — so a proposal starts from your prices instead of a blank page.',
    href: '/admin/settings#rates',
    blockedBy: ['firm_identity'],
    required: false,
  },
  {
    id: 'equipment',
    title: 'Your instruments',
    why: 'Total stations and GNSS receivers, with serial numbers — this is also where calibration dates are tracked.',
    href: '/admin/equipment',
    blockedBy: ['team'],
    required: false,
  },
  {
    id: 'first_customer',
    title: 'Your first customer',
    why: 'A customer to attach a job and an invoice to.',
    href: '/admin/leads',
    blockedBy: ['firm_identity'],
    required: false,
  },
  {
    id: 'first_job',
    title: 'Your first job',
    why: 'Everything else — hours, mileage, field data, drawings, invoices — hangs off a job.',
    href: '/admin/jobs/new',
    blockedBy: ['first_customer'],
    required: false,
  },
  {
    id: 'payments',
    title: 'Getting paid',
    why: 'Connect a payment method so customers can pay an invoice online.',
    href: '/admin/billing',
    blockedBy: ['firm_identity'],
    required: false,
  },
];

/** What we measured about the firm's data. Counts, not booleans — "0 jobs" and "we did not check"
 *  must not be the same value, and a count of null says the check itself failed. */
export interface OnboardingFacts {
  hasFirmName: boolean;
  hasFirmContact: boolean;
  memberCount: number;
  countyCount: number;
  workTypeCount: number;
  equipmentCount: number;
  customerCount: number;
  jobCount: number;
  paymentsConfigured: boolean;
}

export interface OnboardingStepState extends OnboardingStep {
  done: boolean;
  blocked: boolean;
  /**
   * The specific things still missing, named the way the target page labels them (owner report,
   * 2026-08-04: *"there needs to be clearer instructions… I am not seeing a clear way to make sure
   * everything that needs to be updated can be updated"*).
   *
   * `why` explains the GOAL — "your name, phone and address go on every proposal". That is the
   * right sentence for deciding whether to care and the wrong one for finishing: it never says
   * which of the three is blank, so a firm that has filled in two sees "0 of 2 done" and no way to
   * tell what is left. Empty when the step is done.
   */
  missing: string[];
}

export interface OnboardingState {
  steps: OnboardingStepState[];
  /** The one thing to do next, or null when every required step is done. */
  next: OnboardingStepState | null;
  requiredDone: number;
  requiredTotal: number;
  /** True when every REQUIRED step is done. Optional steps never hold a firm hostage. */
  ready: boolean;
  /** True when the firm has essentially no data — what the empty states key off. */
  isBrandNew: boolean;
}

function isDone(id: OnboardingStepId, f: OnboardingFacts): boolean {
  switch (id) {
    case 'firm_identity': return f.hasFirmName && f.hasFirmContact;
    // >1, not >0: the founder's own account exists the moment they sign up, so ">0 members" is true
    // for a firm that has invited nobody and would tick the step before it was started.
    case 'team': return f.memberCount > 1;
    case 'counties': return f.countyCount > 0;
    case 'work_types': return f.workTypeCount > 0;
    case 'equipment': return f.equipmentCount > 0;
    case 'first_customer': return f.customerCount > 0;
    case 'first_job': return f.jobCount > 0;
    case 'payments': return f.paymentsConfigured;
  }
}

/**
 * What is still blank for a step, in the words the target page uses.
 *
 * Derived from the same `facts` as `isDone`, so "done" and "nothing missing" are the same
 * statement made twice rather than two opinions — a card that says "0 of 2 done" beside an empty
 * list of what to do is precisely the state the owner reported.
 */
function missingFor(id: OnboardingStepId, f: OnboardingFacts): string[] {
  switch (id) {
    case 'firm_identity': {
      const gaps: string[] = [];
      if (!f.hasFirmName) gaps.push('Firm name');
      // Either channel counts — see the fact's own note. Named as one gap, not two, so nobody
      // fills in a phone and still sees "email missing".
      if (!f.hasFirmContact) gaps.push('A contact email or phone number');
      return gaps;
    }
    case 'team': return f.memberCount > 1 ? [] : ['At least one teammate invited'];
    case 'counties': return f.countyCount > 0 ? [] : ['One county you work in'];
    case 'work_types': return f.workTypeCount > 0 ? [] : ['One service with a rate'];
    case 'equipment': return f.equipmentCount > 0 ? [] : ['One vehicle or instrument'];
    case 'first_customer': return f.customerCount > 0 ? [] : ['One customer'];
    case 'first_job': return f.jobCount > 0 ? [] : ['One job'];
    case 'payments': return f.paymentsConfigured ? [] : ['A way to get paid'];
  }
}

export function evaluateOnboarding(facts: OnboardingFacts): OnboardingState {
  const doneById = new Map<OnboardingStepId, boolean>();
  for (const s of ONBOARDING_STEPS) doneById.set(s.id, isDone(s.id, facts));

  const steps: OnboardingStepState[] = ONBOARDING_STEPS.map((s) => ({
    ...s,
    done: doneById.get(s.id) ?? false,
    // Blocked only by steps that are not done. A step can be blocked and done at once — somebody
    // added a job before adding a customer — and that is not an error, so `done` wins in the UI.
    blocked: s.blockedBy.some((b) => !doneById.get(b)),
    missing: doneById.get(s.id) ? [] : missingFor(s.id, facts),
  }));

  const required = steps.filter((s) => s.required);
  const next = steps.find((s) => !s.done && !s.blocked) ?? null;

  return {
    steps,
    next,
    requiredDone: required.filter((s) => s.done).length,
    requiredTotal: required.length,
    ready: required.every((s) => s.done),
    // Measured from the things a working firm cannot avoid having. A firm with jobs is not brand new
    // whatever its settings look like.
    isBrandNew: facts.jobCount === 0 && facts.customerCount === 0 && facts.memberCount <= 1,
  };
}

/** The sentence an empty list should show a brand-new firm.
 *
 *  Separate from the generic "nothing here" because they mean different things: an established firm
 *  seeing an empty jobs list has archived everything, and a new one has simply not started. Telling
 *  the second "no jobs found" is technically true and completely unhelpful. */
export function emptyStateFor(what: string, isBrandNew: boolean): { title: string; body: string } {
  if (!isBrandNew) {
    return { title: `No ${what} yet`, body: `Nothing matches. If you expected something here, check your filters.` };
  }
  return {
    title: `No ${what} yet — that is expected`,
    body: `You are still setting up. This page fills in as you start using it; nothing is broken.`,
  };
}
