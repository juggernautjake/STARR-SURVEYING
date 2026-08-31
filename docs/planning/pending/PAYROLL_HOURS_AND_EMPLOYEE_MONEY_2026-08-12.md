# Hours, payroll, and the money employees can see

**Back in `pending/` — 2026-08-31.** Briefly moved to `in-progress/` and returned the same day
on the owner's direction: *"I just want to build stuff that is related to the research software
that researches properties."*

Not abandoned, and not obsolete. `in-progress/` drives an automated slice loop, so a doc sitting
there is a doc that gets worked; parking this one is what keeps that loop pointed at research.
Move it back when the owner wants this subject built.

> ## STATUS 2026-08-12: mostly shipped · **D2 is now ANSWERED** · back in progress
>
> Parked in `pending/` for part of a day awaiting D2, then reactivated when the owner delegated the
> decision: *"Do what you think makes the most sense."*
>
> **D2 is decided: `payout_batches` survives. `payroll_runs` becomes read-only history.** The full
> reasoning is in §D2 below; the short version is that the batch path already has everything money
> movement needs (dispatch methods, IP-stamped approval, ACH export, void, tax reporting,
> employee-visible history) and is what the live UI drives, while the legacy engine's only unique
> contributions are pay stubs and balance crediting — both of which move rather than being lost.
>
> **Shipped:** S0 (double-pay guard), S1 (rejection reason reaches the employee), S2 (the office can
> log hours for an employee, seed 585), S3 (totals by day/week/month/year), S4 (the `finance` role),
> S6 (the withdrawal queue), the balance-vs-ledger integrity check from S5, the payout-method picker
> (seed 586), employee-visible pay-period locks, the late-entry marker, and the close snapshot
> (seed 587). Plus two live bugs found on the way: a payroll run that 500s on an unpriced employee
> (§2b), and an approval queue whose week started on the wrong day west of Greenwich.
>
> **Everything buildable has been built.** S9a′ (advance recovery re-homed), §2b (the
> unpriced-employee crash), S7 (close→batch link, seed 589) and S5 (answered: approval must NOT
> credit, guarded by `balance-writers.test.ts`) all shipped on 2026-08-12, in that order — the first
> attempt put S9c first and would have silently stopped advance recovery for ever, see the boxed
> correction in §D2.
>
> **Two items remain, and neither is waiting on engineering effort:**
>
> | | Waiting on |
> |---|---|
> | **S9b / S9c** | **An accountant.** Porting the legacy engine's flat 12% / 6.2% / 1.45% ESTIMATES onto a wage statement would print invented tax figures on a document an employee is entitled to, while the surviving path withholds nothing and pays gross (§S9b). Until somebody decides whether the firm should withhold — and therefore whether real pay stubs are required — there is nothing to port, and closing `POST /payroll/runs` would leave no way to produce a stub at all. |
> | **S8** | **Elapsed time.** Auto-transfer should sit on a ledger that has been reconciling in production for a while. The integrity check that makes that judgement possible only shipped today. |
>
> **This doc therefore moves to `pending/`**, per the rubric in `docs/planning/README.md`: *"planned
> work we intend to build later — scoped and parked deliberately, or a doc that is unfinished/on
> hold. Not being worked now; move it to `in-progress/` when work starts."* It is neither
> `completed/` (two real items are unbuilt) nor deferred (deferring means the cost exceeds the
> value, and here the cost is a conversation with an accountant).
>
> **To restart:** answer the withholding question, move this back to `in-progress/`, and build
> S9b → S9c.

**Opened 2026-08-12** from the owner's spec, given in one long burst:

> Employees need a UI to submit hours, check whether they were approved, check whether they were
> paid, and review by day / week / month / year. The employer sees submitted hours and can **reject**
> (with a required reason, and the employee is notified), **adjust** (hours *and* pay), or
> **approve**. The employer can also log hours **for** an employee, and create entries setting hours
> and pay. Saved per pay period. Once payment is set up, create money accounts; employees see money
> earned and withdraw to their private accounts. Payment approved → employer finalises at the end of
> the pay period → money owed shows as a number on their account. Money does not leave until a manual
> withdrawal, unless auto-transfer is set up. Only people with money-handling permissions can view
> accounts. Possibly a setting for no intermediate account — an immediate wire.
>
> *"It will basically just serve as an online bank account of sorts, when really it is just a number
> on a screen relating to how much money they are able to pull from the company bank account."*

---

## 0. What already exists — read this before building anything

This repo's most expensive recurring mistake is rebuilding something that already shipped. A full
audit was run on 2026-08-12; **most of this spec already exists.** Each slice below states what it
adds to.

| Capability | State |
|---|---|
| Employee submits hours, edits, resubmits | ✅ Shipped. `/admin/my-hours` → `daily_time_logs`. `pending`/`rejected` are employee-editable (`lib/hours/permissions.ts`) |
| Employer approves / rejects / adjusts, single + bulk | ✅ Shipped. `/admin/hours-approval` → `PUT /api/admin/time-logs` (`approve`\|`reject`\|`adjust`\|`dispute`) |
| Rejection **reason** | ✅ Stored (`daily_time_logs.rejection_reason`), required by the UI, shown back on the row |
| Employee **notified** on rejection / adjustment | ✅ Shipped. `lib/notifications/hours-decision.ts` → `notify()` → bell + push |
| Approvers notified on submission, with per-admin opt-out | ✅ Shipped. `hours_notification_preferences` (seed 579) |
| Adjust hours **and** pay | ✅ Shipped, in two pieces: `adjusted_hours` + `adjustment_note` on the entry, and `time_log_pay_decisions` (seed 574) for the money, with revision history and an employee bell |
| Pay period lock | ✅ Shipped. `pay_period_locks` (seed 378), HTTP 423 on employee edits inside a locked window |
| "Money owed" as a number | ✅ Shipped. `lib/payroll/owed.ts` — a running balance in cents, admin and employee views from one endpoint |
| Payout batches: build → approve → dispatch → mark paid → ACH CSV → void → tax report | ✅ Shipped. `payout_batches` + `payout_batch_items` (seed 325) |
| Employee balance + withdrawal request UI | ✅ Shipped. `BalanceCard.tsx` on `/admin/my-pay`; `withdrawal_requests`, `balance_transactions` |
| Pay advances, request → approve → paid → repaid | ✅ Shipped, with instalment recovery |
| Per-person base rate + per-activity rates | ✅ Shipped. `employee_profiles.hourly_rate`, `work_type_rates`, `user_pay_overrides` |

**Genuinely missing** — and therefore what this plan is actually about:

1. **The employer cannot log hours for somebody else.** There is exactly one `INSERT` into
   `daily_time_logs` in the codebase and it hard-codes `user_email: session.user.email`. No route, no
   UI, no request shape.
2. **There is no admin queue for withdrawal requests.** The API verbs exist
   (`approve`/`reject`/`process`) and nothing in the UI calls them. An employee can ask for money and
   nobody can see that they asked.
3. **The balance is almost never funded.** `available_balance` is credited by exactly two paths: the
   legacy `payroll_runs` engine, and a payout item marked with `method: 'account'`. In normal use
   neither happens, so the "online bank account" reads $0 forever while `owed` says otherwise.
   **Corrected 2026-08-12 while building S5:** the `account` path is fully wired and guarded — the
   gap is that nobody is ever offered that method. See S5.
4. **There are two parallel money engines that do not reconcile** — `payroll_runs`/`pay_stubs`
   (legacy) and `payout_batches`/`payout_batch_items` (live). Both can pay the same hours.
5. **There is no money-handling permission.** Everything gates on `isAdmin`, plus one
   `PAYOUT_ADMIN_EMAILS` env allowlist whose own header calls itself a placeholder.
6. **There is no period close.** Only a lock, which freezes edits and computes nothing.
7. **The rejection notification does not carry the reason**, though the reason is stored and
   rendered on the approval page.
8. **No day / week / month / year review for the employee.** `/admin/my-hours` is a week at a time.

---

## 1. Two decisions that must be made before any of this is built

These are the owner's to make. Everything downstream depends on them and building either way first
would mean building it twice.

### D1. Is the balance real money, or a statement of what is owed?

The owner's own framing answers this and it should be written down before somebody reads the phrase
"online bank account" and builds something else:

> *"when really it is just a number on a screen relating to how much money they are able to pull from
> the company bank account."*

That is a **ledger**, not an account. Nobody deposits into it, no interest accrues, and the money is
in the company's bank the whole time. Building it as a ledger keeps this firmly outside money
transmission: a business telling its own employees what it owes them is a payroll record, whereas
holding customer or employee funds on their behalf is a regulated activity requiring state-by-state
money transmitter licensing.

**The line not to cross, stated plainly:** the moment an employee can move a balance to anyone other
than themselves, or the firm holds a balance for someone who is not being paid wages by it, this
stops being a payroll ledger. Every slice below is written on the ledger side of that line.

**Not a lawyer, and this is not legal advice.** Wage payment is separately regulated — several
states restrict payroll deductions, require pay stubs with specified fields, and mandate payment
within set periods regardless of what an employee has "withdrawn". A payroll provider or an
accountant should confirm the design before real wages run through it.

### D2. Which money engine survives?

`payroll_runs`/`pay_stubs` and `payout_batches` both exist, both work, and both can pay the same
hours. That is the single most dangerous thing in this subsystem: paying a week twice is a real
outcome and neither engine knows about the other.

The recommendation is **`payout_batches` survives** — it is the one with dispatch methods, an
IP-stamped approval, ACH export, void, tax reporting and employee-visible history, and it is the one
the live UI drives. `payroll_runs` retains one thing the batches lack: it is the only writer of
`available_balance` and the only producer of `pay_stubs`, which some states require. So the work is
to move stub generation and balance crediting onto the batch path, not to delete the legacy engine
in place.

Until that is done, **there is a guard test to write today** (S0 below) rather than a rewrite.

### ✅ D2 ANSWERED — 2026-08-12: `payout_batches` survives

The owner delegated the call (*"Do what you think makes the most sense"*). Recorded here rather than
in a commit message, because every remaining slice reads back to it.

**`payout_batches` + `payout_batch_items` is the surviving engine. `payroll_runs` + `pay_stubs`
becomes read-only history.**

Why, in the order the reasons actually matter:

1. **It is the one that pays people.** Dispatch methods, an IP-stamped approval with no-self-approve,
   ACH CSV export, void, the tax report, per-item mark-paid with an external reference, and
   employee-visible history. `payroll_runs` computes and credits; it does not move money anywhere.
2. **It is what the UI drives.** `/admin/payouts` and its five sub-screens are built on batches. The
   legacy engine's surface is one panel.
3. **It is the one already integrated with everything else built this week** — the withdrawal queue
   draws on the balance the batch path credits via `method: 'account'`, and `lib/payroll/owed.ts`
   counts batch items (drafts included) as committed.
4. **The legacy engine's two unique contributions both move rather than die.** It is the only
   producer of `pay_stubs` — which several states require — and, with the `account` method, one of
   two writers of `available_balance`. Stub generation moves onto the batch path (S9b); crediting is
   already there.

**What this decision does NOT license.** It is not a mandate to delete `payroll_runs`. Historical
runs are records of payments actually made, and `pay_stubs` rows are documents employees are
entitled to. "Read-only history" means exactly that: the tables stay, the reads stay, and only the
ability to create NEW work through that path goes away.

**The order the remaining work must happen in**, because getting it wrong leaves a window where
nobody can run payroll at all:

> ### ⚠️ THIS ORDERING WAS WRONG, AND WAS CORRECTED THE SAME DAY
>
> The table below originally opened with *"S9a — close the legacy engine to new work. Cheap,
> reversible, and it makes every later step safe. **Do this first.**"* That reasoning is exactly
> backwards, and it was caught by trying it: retiring `POST /api/admin/payroll/runs` turned seven
> tests in `__tests__/payroll/one-pay-model.test.ts` red, and the most important of them said
> *"the payroll run recovers outstanding advances"*.
>
> **`planAdvanceRecovery` is called in exactly one place in the entire codebase: the run-creation
> body.** The batch path does not recover advances at all. So closing that door first would have
> silently stopped the firm ever recovering a pay advance again — and, as that test's own comment
> puts it, *an advance that is never recovered is a gift.* Nothing would have failed; the money
> would just have stopped coming back.
>
> **The rule that ordering violated:** retiring an engine cannot come before re-homing the
> guarantees that only live in it. "Cheap and reversible" described the code change, not the
> consequence.
>
> The change was reverted before it was committed. The corrected order is below.

| | |
|---|---|
| **S9a′** | ✅ **SHIPPED 2026-08-12.** Advance recovery now runs in both batch builders (hand-built and the weekly cron), writes a `pay_advance_repayments` row per (advance, item), and every money-moving surface sends the disbursed figure. Seed 588. **The schema decision:** the recovery is a WITHHOLDING from `total_cents`, not a component of it — `owed.ts` counts `total_cents` as paid, so netting it would leave the person owed the advance for ever. `adjustments_cents` was the tempting home and is wrong for exactly that reason (seed 325 defines the total as the sum of its components). |
| **§2b** | ✅ **SHIPPED 2026-08-12.** Unpriced employees are skipped and NAMED — never written as `base_rate: 0`, which would be a stub claiming somebody worked for free. A run that ends up paying nobody now deletes itself and returns 409 rather than reporting an empty $0.00 payroll as complete; that second half was found by testing, not by reading. |
| **S9b** | ⚠️ **SCOPE WAS WRONG — corrected 2026-08-12, see §S9b below.** Porting stub generation would print invented tax figures on a wage statement. The honest half shipped (`lib/payroll/payment-statement.ts`); whether the firm should withhold at all is an accountant's decision, not this codebase's. |
| **S9c** | *Now* close `POST /api/admin/payroll/runs` — once nothing unique lives behind it. Keep `GET` (historical runs and stubs are records of real payments) and `PUT` (an existing run must still be finishable). |
| **S7** | ✅ **SHIPPED 2026-08-12** (seed 589). Closing a week offers "Prepare the payout" and records which batch it produced, so "did we ever pay the week we closed?" stops being a comparison of dates by eye. The link means *what prompted the payout* — NOT "this batch holds exactly this week's hours", because the surviving engine is balance-driven and reading it that way would re-introduce the period-window thinking `owed.ts` exists to avoid. |
| **S5** | ✅ **ANSWERED + GUARDED 2026-08-12: no.** `available_balance` means "we hold this and you can withdraw it"; approving a batch means "the firm agrees it owes this" and the batch can still be voided. Crediting at approval would let somebody withdraw against a payment that never happened. The credit stays where the obligation actually changes shape — an `account`-method item marked paid. Closed by a decision plus `__tests__/payroll/balance-writers.test.ts`, not by new crediting code. |
| **S8** | Auto-transfer. Last, on a ledger that has been reconciling for a while. |

**One thing D2 settles for free.** The surviving engine is **balance-driven, not period-driven**:
`pay-owed` and `payout-prepare` both build batches with no `week_start`/`week_end`, from
`loadOwed` = approved minus everything already committed. Two batches for the same week cannot
double-pay, because the second finds nothing owed. Period-overlap comparison
(`lib/payroll/engine-overlap.ts`, S0) therefore guards a risk that only exists while the legacy
engine can still create period-scoped runs — it retires with S9c, and should be deleted rather than
left as an uncalled module.

---

## 1b. Where this stands — 2026-08-12

**Shipped:** S0, S1, S2 (seed 585), S3, S4, S6, and the integrity guard from S5.

**Not shipped, and why this doc stays open.** S5 (the rest), S7, S8 and S9 all depend on **D2** —
which of the two payroll engines survives — and that is the owner's decision, not a cost/value
judgement this build can make. They are NOT deferred: every one of them is worth doing, and each
would have to be redone if D2 came back the other way.

Concretely, what each is waiting on:

| Slice | Waiting on |
|---|---|
| S5 (rest) | Whether **approval** credits the balance, which only makes sense if the batch path survives |
| S7 | Whether a period close builds a payout batch or a payroll run |
| S8 | A ledger that has been reconciling in production for a while first — and S7 |
| S9 | D2 by definition; it *is* retiring the loser |

Until D2 is answered, S0's overlap guard is what stands between the two engines and a week paid
twice. That is a guard, not a resolution, and it is stated that way on purpose.

---

## 2. Slices

Ordered so that each one is shippable on its own and the dangerous ones come after the guards.

---

### S0. A guard against paying the same hours twice — ✅ SHIPPED 2026-08-12

The only slice that is urgent. Both engines can pay the same `daily_time_logs` rows, and nothing
notices.

- A shared helper — `lib/payroll/already-paid.ts` — answering *"has this time log already been
  included in a settled payout or a completed payroll run?"* for a set of log ids.
- Both `POST /api/admin/payroll/runs` and the batch builder consult it and **refuse**, naming the
  batch or run that already covers the hours.
- A vitest guard mirroring `__tests__/payroll/one-pay-model.test.ts` (which already prevents the
  retired `employee_payouts` table from coming back): assert no new code path credits money for a
  log id that a settled row references.

*Test:* two batches over the same week; the second must refuse and name the first.

---

### S1. The rejection reason reaches the employee — ✅ SHIPPED 2026-08-12

The smallest real gap, and the one the owner asked for by name: *"reject… with required reason and
employee notified."*

`buildHoursDecisionNotifications(rows, approved)` in `lib/notifications/hours-decision.ts` takes
`{user_email, log_date, hours}` and produces *"8h (2026-08-04) has been rejected."* — the reason is
stored and displayed to the admin and never sent. `buildHoursAdjustmentNotification` in the same file
already appends `Reason: …`; this is that, applied to the rejection path.

- Widen the row type to carry `rejection_reason`; append it to the body.
- Both call sites (`time-logs/approve/route.ts:51`, `time-logs/route.ts:427`) already have rows that
  carry the reason after the update.

*Test:* a rejected row with a reason produces a body containing it; a rejection with no reason
produces the existing sentence and no dangling "Reason:".

---

### S2. The employer logs hours for an employee — ✅ SHIPPED 2026-08-12 (seed 585)

Build from zero. *"The employer will also be able to log hours for employees and create entries
setting the hours and pay for the employee."*

- `POST /api/admin/time-logs` gains an optional `user_email`. Supplying it requires `isAdmin`;
  omitting it behaves exactly as today.
- The entry is **marked as entered by somebody else** — a new `entered_by` column, NULL for
  self-submitted rows. This is not decoration: an employee looking at a week that contains hours they
  never submitted must be able to see who put them there, and an audit needs to distinguish "the
  employee claimed this" from "the office recorded this".
- The row is created `approved` when an admin creates it (they are the approver; making them approve
  their own entry is ceremony), with `approved_by` set.
- Pay set in the same action, by reusing `time_log_pay_decisions` rather than inventing a second way
  to price an entry.
- The employee is **notified**: hours appearing on your timesheet that you did not enter is exactly
  the event a person needs told about.
- UI: an "Add entry for…" control on `/admin/hours-approval`, with the employee picker, date, hours,
  activity and an optional pay override.

*Tests:* a non-admin supplying `user_email` is refused; an admin-created row carries `entered_by` and
`approved_by`; the pay decision is linked; the notification fires.

---

### S3. Employee review by day, week, month and year — ✅ SHIPPED 2026-08-12

*"They need to be able to review their hours by day, week, month, and year."*

`/admin/my-hours` shows one week. The data is all there; the aggregation is not.

- A `lib/hours/summarise.ts` — pure, testable — turning a set of logs plus their pay decisions into
  totals by day / week / month / year, with hours, pay, and a status breakdown.
- The period switcher on `/admin/my-hours`, plus a "paid / approved / awaiting" split so the third
  of the owner's three questions ("was I paid?") is answered on the same screen as the first two.
- Use `effectiveHours()` (`lib/hours/hours-flags.ts`) throughout, so an adjusted entry counts as
  adjusted — the same fix already applied to the approval page's totals.

*Tests:* a month spanning a lock boundary; an adjusted entry counting once at its adjusted value;
timezone edges (a log dated the 1st must not fall into the previous month).

---

### S4. A money-handling permission — ✅ SHIPPED 2026-08-12 (the `finance` role)

*"Only people with money handling permissions will be able to see the accounts of the employees."*

Today: `isAdmin` for everything, plus `PAYOUT_ADMIN_EMAILS`, whose own header says *"tomorrow this
becomes a role + threshold-based flow."* Tomorrow is this slice.

- A `finance` role added to `ALL_ROLES` in `lib/auth-roles.ts`, with `isFinance(roles)` beside
  `isAdminRoles`.
- **Three separable capabilities**, because they are genuinely different jobs and one person holding
  all three is a choice, not a default:
  `hours.decide` (approve/reject/adjust) · `pay.set` (rates, pay decisions) · `money.move`
  (create/approve/dispatch payouts, approve withdrawals, view balances).
- Enforced in the routes, not only in `route-registry.ts` — the registry controls nav visibility and
  is not enforcement. There is already a live example of the failure: `/admin/hours-approval` is
  reachable by `developer` and `tech_support`, and every button on it 403s for them.
- `PAYOUT_ADMIN_EMAILS` stays as an override for the approval step, since "only Hank approves
  payouts" is a real rule and outranks a role.
- No-self-approve, already enforced for payout batches, extends to withdrawals.

*Tests:* each capability gate independently; an admin without `finance` cannot read a balance; the
env allowlist still wins for batch approval.

---

### S5. Fund the balance from the payout path — **integrity guard SHIPPED; the rest is gated on D2**

**Correction, made while building this.** The slice above was written as *"in normal use nothing
credits the balance"*, and that overstates it. `lib/payroll/account-credit.ts` is complete, tested
and **wired**: marking a payout item paid with `method: 'account'` credits `balance_transactions`
and `available_balance`, guarded against double-crediting by `alreadyCredited()` keyed on the item.

The real gap is narrower and duller: **nobody chooses that method**, and nothing on the payout
screens says it exists or what it means. So the remaining work is not plumbing:

1. ~~Make `account` a visible, explained choice.~~ **✅ SHIPPED 2026-08-12**, and it turned out to be
   the whole of the gap. `employee_profiles.payout_method` — what the batch builder stamps onto every
   item — was read by two routes and **written by nothing**: no form, no API field, no default. Every
   payout item was built with no method and arrived on the dispatch screen as "Method not assigned".
   And it was unreachable twice over: seed 578's CHECK listed seven methods and `account` was added
   to `lib/payouts/methods.ts` afterwards, so even with a form the database would have refused the
   one value that funds a balance. Seed 586 widens it; the employee page now sets it.
2. Decide whether **approval alone** should credit, ahead of dispatch. **That is D2**: it only makes
   sense if the batch path is the surviving engine, and wiring balance crediting into a path that may
   be retired is the wrong order. Deferred until the owner answers D2.

**✅ Shipped 2026-08-12 — the invariant this slice asked for.** `lib/payroll/balance-integrity.ts`
checks `available_balance` against the sum of `balance_transactions` and reports in both directions
without ever repairing anything: which of the two figures is right is a person's decision, and
"correcting" either would destroy evidence or invent a transaction. It runs on the withdrawal queue —
the last useful moment before somebody sends money against a number that cannot be derived from
anything. Three separate paths write that balance with an unguarded read-modify-write and nothing
had ever checked it. 14 tests.

Two findings worth keeping: the first version rounded both figures to cents *before* differencing,
which made its own float-dust tolerance unreachable — any surviving difference was already a whole
cent, so the branch could never fire. And a NaN amount is skipped rather than counted as zero,
because a silent zero turns a data problem into a confident wrong verdict about somebody's wages.

---

### S6. The withdrawal queue — ✅ SHIPPED 2026-08-12

The API verbs exist. Nothing calls them, so a request goes into a void.

- `/admin/payouts/withdrawals` — pending requests across employees, with approve / reject (reason
  required, mirroring hours) / mark processed. Gated on `money.move`.
- Employee notified at every transition. There are currently **no** withdrawal notifications at all;
  a person who asked for their money and heard nothing assumes the system is broken, and they are
  not wrong.
- A withdrawal cannot exceed `available_balance`, checked server-side at approval time as well as at
  request time — the balance can move between the two.
- The bank details already live on `employee_profiles` (`bank_name`, `bank_account_last4`,
  `bank_verified`); the queue shows the last four and the verified flag, never the full number.

*Tests:* over-balance refusal at both moments; rejection requires a reason; each transition notifies.

---

### S7. Period close, and how it coexists with the running balance

*"Once the payment is approved, the employer can finalize it at the end of the pay period and it will
show up as money owed."*

This needs a decision recorded, not just a button. `lib/payroll/owed.ts` is deliberately
**window-less** — everything approved minus everything paid — precisely so a late-logged entry from
three weeks ago is not silently dropped. A naive "close the period" would reintroduce exactly that
bug.

The resolution: **closing a period does not close the balance.** A close snapshots *"this is what
this period contained"* and builds a payout batch from it. Anything logged for that period
afterwards lands in the next batch, flagged as late, and is still paid. The running total stays the
source of truth; the period is a reporting and dispatch boundary.

- A `pay_period_closes` row: period, closed_by, closed_at, the batch it produced, totals.
- Closing implies locking (`pay_period_locks`), so the two stop being separate rituals.
- Late entries against a closed period carry a visible "late — paid in period N+1" marker.

**✅ Shipped 2026-08-12 — the half of this that needs no engine decision: the lock is now visible to
the person it constrains.** `pay_period_locks` froze employee edits and was invisible on
`/admin/my-hours`: an employee whose week had been closed saw the ordinary form, filled in a day,
pressed submit and found out from a 423. The office had a lock banner; the people the lock actually
applies to did not.

The `GET` on `lock-period` was admin-only, which is what made that impossible to fix on the client —
so it now answers any signed-in user, because a locked period is a fact about the calendar rather
than a secret, and the employee is the party subject to it. Writing a lock stays admin-only, and
`note` is withheld from non-admins: it is free text an admin wrote for other admins and is the one
field that could carry something not meant for the person being locked out.

**✅ Also shipped — the late-entry marker.** `lib/hours/late-entry.ts` compares an entry's
`created_at` against the `locked_at` of whichever lock covers its own day, so a day added *after* its
week was closed off is marked on the approval row and counted on the lock banner. It needed no engine
decision: the running-balance model already pays such an entry in the next payout, and what was
missing was anyone being able to SEE that a closed week had moved. Comparing dates instead of
timestamps would have marked every entry in a locked week as late, including the ones the lock was
closed over. 12 tests.

**A live bug found by driving that check in a browser:** this page's `getMonday` omitted the
`setHours(0, 0, 0, 0)` that `MyHoursPanel`'s copy has always had, and every caller immediately does
`.toISOString()`. West of Greenwich, any local time past about 19:00 has already rolled over in UTC —
so opening the approval queue on a Wednesday evening in Texas produced a week starting **Tuesday**,
header and all. Not merely cosmetic: `weekStart` is the API's week filter and is compared for an
exact match against `pay_period_locks.period_start`, so a real Monday–Sunday lock silently failed to
match and the "this period is locked" banner never appeared for anybody working late. Fixed.

**✅ Also shipped — the close snapshot, on the lock rather than in a new table.** Seed 587 adds
`closed_hours`, `closed_pay_cents`, `closed_entry_count` and `closed_people` to `pay_period_locks`,
recorded at the instant a period is locked and shown on the banner ("Closed at 31.5h · $703.50 across
3 people").

**Why not the `pay_period_closes` table this section sketched.** That row was to carry *"the batch it
produced"*, and whether a close produces a batch or a run is exactly what D2 has not answered — a
second table whose relationship to `pay_period_locks` is undecided would have to be reshaped once it
is. What IS decided is that closing and locking are the same act (this section says so), so the
snapshot goes on the lock. Adding `payout_batch_id` here, or migrating the rows, is no harder later.

The snapshot matters because a closed period does not stop moving: admins are exempt from locks by
design, hours get adjusted, decisions get revised, and the office can add days on somebody's behalf.
Re-totalling later says what the week holds NOW; the figure a payment was made against is otherwise
unrecoverable. Columns are nullable and deliberately **not backfilled** — recomputing an old week
would store today's number wearing a historical date, which is the fabrication the record exists to
prevent. 14 tests.

Nothing of S7 now remains except linking a close to whatever settles it, which is D2.

*Tests:* an entry logged after close is paid in the following batch and never dropped; closing twice
is refused; the running total is unaffected by a close.

---

### S8. Auto-transfer, and the no-account setting

*"The money will not leave the account unless they manually withdraw it, unless they have set up an
auto transfer."* / *"There could be a possible setting where there is no intermediate account and it
just wires the money immediately."*

Deliberately last. Both are automated money movement, and both should sit on top of a ledger that has
been running correctly and reconciling for a while first.

- `employee_payout_preferences`: `mode` (`hold` | `auto` | `immediate`), method, handle, threshold,
  schedule.
  - `hold` — today's behaviour, and the default. A default that moves money without being asked for
    is the wrong default.
  - `auto` — on close, an approved balance over the threshold is queued for dispatch automatically.
  - `immediate` — no balance step; approval dispatches. Worth stating: this removes the safety of a
    reviewable balance, so it should be per-employee and set by someone with `money.move`, not by the
    employee.
- Every automatic movement produces the same `balance_transactions` rows and the same notification a
  manual one does. An automated payment nobody was told about is how a payroll error is discovered
  by an employee's landlord.

*Tests:* threshold boundaries; `hold` never auto-dispatches; an `immediate` employee still gets a
stub and a ledger row.

---

### S9b. Pay statements — why "move the stub across" was the wrong instruction

**Found 2026-08-12 by reading both engines before building.** They do fundamentally different things
with tax, and the difference is not a detail of stub generation — it is what payroll *means* here:

| | withholding | pays | tax handled by |
|---|---|---|---|
| `payroll_runs` (retiring) | flat ESTIMATES — 12% federal, 6.2% SS, 1.45% medicare (`DEFAULT_DEDUCTIONS`) | net | itself |
| `payout_batches` (surviving) | **none** | gross | downstream: W-2/1099 classification → a tax preparer |

`pay-stub.ts`'s own comment disclaims its figures: *"an estimate … real withholding depends on a
W-4, filing status and year-to-date wages, and belongs to a payroll provider rather than to this
codebase."*

So porting it would print **"Federal Tax −$120.00"** and a net figure on a document an employee is
entitled to, while the payment they actually received was the GROSS amount. A wage statement whose
net does not equal the payment is worse than no statement: it is wrong, and the reader has no way to
know which number to believe.

**✅ Shipped instead: `lib/payroll/payment-statement.ts`** — what happened, from figures that exist,
inventing nothing. Earned, advance repaid (named a *repayment*, never a "deduction" — an advance is
money already handed over), and what was actually sent. It states out loud that **no tax was
withheld**, because silence invites the reader to assume it was, and they would discover otherwise
from a tax bill. 16 tests, including one asserting the statement carries no federal/state/SS/medicare
line at all.

**Still open, and it is not an engineering question.** Whether the firm should be withholding —
and therefore whether real pay stubs are required — is for an accountant or a payroll provider, as
D1 already flags. Until that is answered there is nothing to port, and inventing the figures in the
meantime is the one thing that must not happen.

---

### S9. Retire the second engine

Only after S0, S5 and S7 have been live long enough to trust.

- Move `pay_stubs` generation onto the batch path (states require stubs; batches do not produce
  them).
- `payroll_runs` becomes read-only history.
- Extend `__tests__/payroll/one-pay-model.test.ts` to cover it, exactly as it already covers the
  retired `employee_payouts` table.

---

## 2b. Found while building S0 — a live crash in the legacy engine

Creating a payroll run for a clear week returns **500: `null value in column "base_rate" of relation
"pay_stubs" violates not-null constraint`**. `pay_stubs.base_rate` is `NOT NULL`, and
`resolvePayRate` correctly returns `null` for an active employee who has no agreed rate and no
override — which is a real and ordinary state, deliberately distinguished from zero everywhere else
in `lib/payroll`.

So the legacy engine cannot run payroll at all while any active employee is unpriced. Not fixed here
because the fix is a decision, not a patch, and it belongs with S9:

- omit unpriced people from the run and report them by name (they are not owed a *computed* amount —
  somebody has to decide), **or**
- relax the constraint and let a stub carry a null rate, which means every screen reading a stub has
  to handle it.

The first is almost certainly right: a payroll run that silently skips somebody is the same failure
class as everything else in this document, so it must skip them *loudly*. Writing zero is the one
option that must not be taken — it is the "worked for free" bug the rest of `lib/payroll` was
rewritten to avoid.

---

## 3. Things found during the audit that are not slices

Worth recording so nobody re-derives them:

- **`weekly_pay_periods` does not exist.** No `CREATE TABLE` anywhere. It appears in a drop list, an
  `ALTER`, and an org-scope allowlist. Do not build against it.
- **`payroll_positions` does not exist** in any form. "Positions" today = `employee_profiles.job_title`
  matched to `role_tiers` for a display label only; the tier never affects money while progression is
  parked.
- **`employee_payouts` is retired** with two conflicting seed definitions (281 and 298) and a guard
  test preventing its return.
- **`employee_bonuses` and `employee_salary_history` are read-only** — surfaced in history views,
  written by nothing.
- **`payout_log` is misnamed**: it is a pay-*change* audit trail, not a payout ledger. The UI already
  calls it "Pay Change History".
- The graduated pay formula (`lib/payroll/effective-rate.ts`, 211 lines, tested) and its tables
  (`role_tiers`, `seniority_brackets`, `credential_bonuses`, `xp_pay_milestones`) are **parked by
  owner decision**, not broken. Restoring them is wiring, not a rebuild.
