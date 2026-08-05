# Hours → Approval → Payout → Money in someone's hand

**Started** 2026-08-05 · **Status** in-progress

> "We need it so that when employees submit their hours or update their hours, that whoever is in
> charge of handling approving hours will get a notification where they can be linked to see the
> submitted hours and address it, such as revising the hours, denying them, or approving them.
> There will be a submission with the hours of what was done and what the pay for those hours will
> be. This will all be calculated to show how much is owed since the last payout to that employee.
> We can also set scheduled payouts from the linked business bank account too that will pay approved
> hours, or we can just do a random payout at anytime. We need to make this functionality full and
> complete."

> "My dad needs to get notifications whenever hours are submitted. He is Hank Maddux."

> "We need to be able to access real bank info and display it if possible, and we need to be able to
> have money accounts for the employees, and they can move money to their connected bank account or
> card. We need to also be able to pay people by cash or check or venmo or cashapp and record it."

> "We need to be able to track all payouts for everyone and find specific payouts."

---

## 0. Hank

**Already handled, and verified against the live database rather than assumed.**
`hankmaddux@starr-surveying.com` carries roles `["employee","admin"]`. Notifications go to everyone
whose roles satisfy `canDecideHours` — which is `admin` — so H-2 reaches him with no further work.

Worth stating because the alternative design was tempting and wrong: hard-coding Hank's address
would have broken the day somebody else starts approving hours, and would have hidden the fact that
**four other people currently hold `admin`** and will also be notified. If that is too many bells,
the fix is to narrow who holds the role — or to add a per-person notification preference (**H-12**)
— not to special-case one name.

---

## 1. What the platform can and cannot do with money

Stated first because everything below depends on it, and because promising otherwise would be the
defect this codebase keeps finding.

**There is no direct bank integration today.** The payout rail is `payout_batches` → an **ACH CSV
export** the office uploads to PNC's Send Payments portal (`ach-csv/route.ts`, P13 of the payment
infrastructure plan). Nothing in this repository can move money on its own.

So the requests resolve like this:

| Asked for | What is actually buildable |
|---|---|
| "Scheduled payouts from the linked business bank account" | The platform **prepares** the batch on a schedule, notifies, and produces the file the bank consumes. The transfer is a human action in the bank's portal. |
| "Access real bank info and display it" | Needs a provider — Plaid, or Stripe Financial Connections. Both need an account, credentials and (for Plaid) a use-case approval. **Owner-blocked**; the data model and UI can be built against it, the connection cannot. |
| "Employees move money to their bank or card" | Same dependency, plus a payout rail that can actually send (Stripe Connect / Treasury). Until then this is a **request** an employee raises and an admin fulfils by whatever means — which is what `withdrawal_requests` already models. |
| "Pay by cash, check, Venmo, CashApp, and record it" | **Fully buildable now.** These are records of a payment made outside the system, which is exactly what the payout ledger is for. |

The distinction that matters throughout: **recording a payment is not making one.** A screen that
says "Paid" when somebody handed over cash is true. A screen that says "Paid" because a button was
pressed and no money moved is the defect.

---

## 2. Slices

### Shipped

| # | Slice | Note |
|---|---|---|
| **H-1** | `computeOwed` — a running balance, not a date window | Late-logged hours cannot be lost |
| **H-2** | Approvers notified on submit and resubmit, money in the bell | Reaches Hank via his `admin` role |
| **H-3** | The notification link opens on that person's pending entries | The page read no URL params at all before |
| **H-4** | `/api/admin/payroll/owed` — balance per person, decisions honoured | |
| **H-5** | The balance shows on the approval queue, next to the name | |
| **H-6** | Committed vs settled — a draft batch cannot silently zero a balance | See §3 |
| **H-7** | **Pay what is owed** — preview, then build a draft batch from approved unpaid hours. Seed 578 adds a per-person payout method | The "random payout at anytime" half |
| **H-13** | Scheduled preparation — Friday 8am CST cron builds the draft batch and tells the admins. **Needs `CRON_SECRET` set in Vercel**, same variable the other crons use | |
| **H-12** | Per-person opt-out for hours notifications (seed 579), reachable on Settings. Opt-OUT so shipping it never silences anybody | |
| **H-10** | My Pay shows what you are owed and every payout to you, from the same endpoints the approval queue uses | |
| **H-9** | **Payout search** at /admin/payouts/search — by person, check number, Venmo reference, method, status, date, amount. Also relabelled `/admin/payout-log`, which said "Payout History" and showed pay-RATE changes | |
| **H-8** | **One payment-method vocabulary.** Three disagreed; `check` was recordable and invisible to dispatch. `stripe` removed — no rail can send it. Guarded, with a control | cash · check · venmo · cashapp · zelle · ach · other |

### Next

| # | Slice | Why it is next |
|---|---|---|




| **H-11** | **Employee money accounts** — `balance_transactions` + `withdrawal_requests` already model this; wire them to the consolidated pay model and let an employee request a withdrawal | The owner has now asked for the "second money path" I flagged as undecided; this resolves that question |



### Owner-blocked

| # | Slice | What is needed |
|---|---|---|
| **H-14** | Real bank account display | A Plaid or Stripe Financial Connections account + credentials. Plaid additionally requires use-case approval before production access. |
| **H-15** | Employee-initiated transfer to bank or card | A sending rail — Stripe Connect payouts or Treasury. Until then H-11's withdrawal request + a recorded manual payment is the honest version. |

---

## 3. Decisions worth not re-deriving

**The balance is a subtraction, not a date filter.** "Since the last payout" reads as *sum the hours
dated after it*. Hours get logged late — somebody forgets Thursday and logs it next week, producing
a row dated before a payout that already went out. A window drops it silently, because the window
did what it was told. `computeOwed` is *everything approved minus everything committed*, so an entry
can arrive in any order and still be owed exactly once. "Since your last payout" survives as the
label.

**Committed and settled are different, and both are needed.** A **draft** batch has not paid
anybody — but paying those hours again would be a double payment. So the balance subtracts
*committed* money (draft included) while reporting *settled* separately: `"$0.00 owed — $420.00 of
that is already in a payout that has not gone out yet."` Counting only settled invites double
payment; counting only committed tells somebody they were paid when they were not. A **voided**
batch and a **failed** item are neither: the money never left, and the debt is still owed.

**Dollars in, cents out.** Hours carry dollars (`daily_time_logs.total_pay`); payouts carry cents
(`payout_batch_items.total_cents`). Mixing them is a 100× error in whichever direction nobody
checks. The balance is computed in cents and converts once, at the boundary.

**An overpayment is reported, not clamped.** A negative balance means somebody was paid more than
their approved hours account for. Clamping to zero hides the one case that needs a person. It is
also excluded from the firm-wide total rather than netted off — netting produces a number that pays
nobody correctly.

**Only people who can act get told.** `/admin/hours-approval` is reachable by admin, developer and
tech_support, but every action gates on `isAdmin`. Notifying somebody about a decision they cannot
make trains them to ignore the bell, and then it stops working for everyone.

**One bell per person per day submitted.** A day entered as four rows is one act.

---

## 4. Found on the way, not yet fixed

- **`tech_support` can open Hours Approval and do nothing on it.** Page gate is
  `['admin','developer','tech_support']`; every action checks `isAdmin`. Needs a decision about who
  may decide pay, not a guess.
- **Scheduled bonuses are invisible to the recipient.** `scheduled_bonuses` is written by the Hours
  Approval form; `employee_bonuses` is read by the employee's compensation page and history.
  **Nothing writes `employee_bonuses`.** Same duplicate-ledger shape as `employee_payouts`, already
  retired in the pay consolidation. A bonus can be scheduled and the employee never sees it.
- **Two tabs on All People still route to the Hub.** `/admin/me?tab=pay` and `?tab=hours` — the
  param has been ignored since Slice 189 — and "Roles & access" links to `/admin/users` (everyone)
  rather than to that person.
- **`/admin/pay-progression` still renders the graduated pay model.** Parked and hidden from every
  menu and search, but a bookmark shows numbers the firm no longer uses.

---

## 5. Closed — 2026-08-05

Every buildable slice shipped. The two that remain are blocked on an account nobody in this
repository can open. Moved to `completed/` per the rubric in `docs/planning/README.md`.

### The loop, end to end

1. An employee submits hours — with or without choosing a rate.
2. **Everyone who can approve them is told**, with the hours, what they are worth, and a link that
   opens on that person's pending entries. Opt-out per person, so five admins need not be five bells.
3. The approval queue shows each person's **running balance** beside their name.
4. The approver approves, adjusts, rejects, or **sets the pay** — splitting a day across rates,
   paying a flat amount, or leaving part of it undecided, with a note the employee reads.
5. **"What is owed right now?"** previews who would be paid what, and who would be skipped and why.
6. **"Prepare payout"** builds a draft batch — or the Friday cron does it before anybody arrives.
7. The office dispatches it: ACH CSV to the bank, Venmo, cheque, cash — or **credits it to the
   person's account**, which they later withdraw.
8. Every payment is **searchable** by person, cheque number, Venmo reference, method, status, date
   or amount.
9. The employee sees **what they are owed and every payout to them**, from the same endpoints.

### Deferred, and why

| Slice | Why it is not built |
|---|---|
| **H-14** — display real bank balances | Needs Plaid or Stripe Financial Connections: an account, credentials, and for Plaid a use-case approval before production access. The data model and UI can be built against a provider; the connection cannot be faked, and a screen showing a bank balance that came from nowhere would be the worst thing in this document. |
| **H-15** — employee-initiated transfer to a bank or card | Needs a sending rail (Stripe Connect or Treasury). Until then the honest version exists: the employee requests a withdrawal, an admin fulfils it by whatever means, and the payment is recorded. |

### The line everything rests on

**Recording a payment is not making one.**

There is no bank integration. Every method carries `sendsItself: false`, including ACH — which
produces a CSV a human uploads. The Friday cron says *prepared*, never *paid*. The batch it builds
is a draft. The employee is told their pay is *queued*. `account` credits a balance and states
plainly that the money has not left the firm.

Every one of those was a place where it would have been easier to say "paid", and the screen would
have been wrong in the direction that costs somebody money and trust.

### The defect, again

Nine slices, and the same shape underneath most of them: **an absence rendering as an answer.**

My Pay showed **$0.00** to somebody owed forty hours, because the field it read is written by an
engine pay no longer flows through. "Payout History" showed **rate changes**, so somebody hunting a
cheque would conclude it was never recorded. A payout recorded as **check** was invisible to the
dispatch grouping and landed under "Method not assigned". The employee money **account existed,
worked, and could never be credited**. A **draft batch** would have zeroed a balance before any
money moved.

None of them raised anything. Each was found by asking what a number would say if the thing behind
it were missing — and then checking.

### Guards

`__tests__/payroll/one-pay-model.test.ts` reads the live route files: the balance shown and the
balance paid come from one loader; no route re-derives a rate; no second payment-method vocabulary;
the scheduled run may only create drafts; the account credit is keyed to its payout item. Every one
was verified by breaking the thing it claims to catch. Three, over the course of this work, were
found to be satisfied by a function's own *definition* standing in for a call site — the same defect
they existed to guard against.
