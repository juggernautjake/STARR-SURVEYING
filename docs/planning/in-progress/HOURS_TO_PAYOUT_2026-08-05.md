# Hours → Approval → Payout

**Started** 2026-08-05 · **Status** in-progress

> "We need it so that when employees submit their hours or update their hours, that whoever is in
> charge of handling approving hours will get a notification where they can be linked to see the
> submitted hours and address it, such as revising the hours, denying them, or approving them.
> There will be a submission with the hours of what was done and what the pay for those hours will
> be. This will all be calculated to show how much is owed since the last payout to that employee.
> We can also set scheduled payouts from the linked business bank account too that will pay approved
> hours, or we can just do a random payout at anytime. We need to make this functionality full and
> complete."

---

## 0. What the platform can and cannot do with money

Stated first because the rest of this plan depends on it, and because promising otherwise would be
the defect this codebase keeps finding.

**There is no direct bank integration.** The payout rail is `payout_batches` → an **ACH CSV export**
that the office uploads to PNC's Send Payments portal (`ach-csv/route.ts`, P13 of the payment
infrastructure plan). Nothing in this repository can move money on its own, and nothing here will
pretend to.

So "scheduled payouts from the linked business bank account" resolves to: **the platform prepares
the batch on a schedule, tells somebody it is ready, and produces the file the bank consumes.** The
transfer itself is a human action in the bank's own portal. That is a smaller claim than the request
and it is the true one; building the larger claim would produce a screen that says "paid" when
nothing was.

---

## 1. Slices

| # | Slice | Status |
|---|---|---|
| **H-1** | `computeOwed` — a running balance, not a date window | ✅ Shipped |
| **H-2** | Approvers are notified on submit and resubmit, with the money in the bell | ✅ Shipped |
| **H-3** | The notification's link opens on that person's pending entries | ✅ Shipped |
| **H-4** | `/api/admin/payroll/owed` — balance per person, decisions honoured | ✅ Shipped |
| **H-5** | The balance shows on the approval queue, next to the name | ✅ Shipped |
| **H-6** | "Pay what's owed" — build a payout batch from approved, unpaid hours | ⬜ Next |
| **H-7** | The employee sees their own balance on My Pay | ⬜ |
| **H-8** | Scheduled preparation — a cron builds the batch and notifies; the bank step stays human | ⬜ |
| **H-9** | Payout marks the hours paid, so the balance actually falls | ⬜ |

---

## 2. Decisions worth not re-deriving

**The balance is a subtraction, not a date filter.** "Since the last payout" reads as *sum the hours
dated after it*. Hours get logged late — somebody forgets Thursday and logs it next week, producing
a row dated before a payout that already went out. A window drops it and says nothing, because the
window did what it was told. `computeOwed` is *everything approved minus everything paid*, so an
entry can arrive in any order and still be owed exactly once. "Since your last payout" survives as
the label.

**Dollars in, cents out.** Hours carry dollars (`daily_time_logs.total_pay`); payouts carry cents
(`payout_batch_items.total_cents`). Mixing them is a 100× error in whichever direction nobody
checks. The balance is computed in cents and converts once, at the boundary.

**An overpayment is reported, not clamped.** A negative balance means somebody was paid more than
their approved hours account for — an advance recorded as a payout, or a correction. Clamping to
zero hides the one case that needs a person. It is also excluded from the firm-wide total rather
than netted off, because netting makes a number that pays nobody correctly.

**Only people who can act get told.** `/admin/hours-approval` is reachable by admin, developer and
tech_support, but every action on it gates on `isAdmin`. A `tech_support` user can open the page and
every button 403s — a pre-existing mismatch, recorded in §3. Notifying them about a decision they
cannot make trains them to ignore the bell, and then it stops working for everyone.

**One bell per person per day submitted.** A day entered as four rows is one act. Four notifications
is how a useful signal becomes noise.

---

## 3. Found on the way, not yet fixed

- **`tech_support` can open Hours Approval and do nothing on it.** Page gate is
  `['admin','developer','tech_support']`; every action checks `isAdmin`. Either the page should
  narrow to admin, or the actions should widen — but it needs a decision about who is allowed to
  decide pay, not a guess.
- **Scheduled bonuses are invisible to the recipient.** `scheduled_bonuses` is written by the Hours
  Approval form; `employee_bonuses` is read by the employee's compensation page and history.
  **Nothing writes `employee_bonuses`.** Same duplicate-ledger shape as `employee_payouts`, already
  retired in the pay consolidation. A bonus can be scheduled and the employee never sees it.
- **Two tabs on All People still route to the Hub.** `/admin/me?tab=pay` and `?tab=hours` — the
  param has been ignored since Slice 189, and "Roles & access" links to `/admin/users` (everyone)
  rather than to that person.
