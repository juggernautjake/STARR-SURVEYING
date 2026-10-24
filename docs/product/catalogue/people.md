# People, roles, hours and pay: catalogue

Entries are in `people.json` (44, `area: "people"`). Every claim cites code there. Where I did not verify something, it says so. I ran nothing against live data, so statuses come from reading code, seeds and plan documents.

## What this area is for

It answers four questions for a surveying firm:

1. Who works here and what may they do? (People, Accounts, Roles)
2. When did they work, and on what? (Clock, timesheet, approvals)
3. What are they owed? (Pay model, owed balance, overtime)
4. How do they get paid, and what is on record? (Payout batches, rails, ledger, tax report)

Rewards, pay progression, the employee pond and the Me hub are attached to this area but are not what a firm needs first.

## How the parts fit together

```
 clock pill / hub tile ──> localStorage clock ──mirror──> active_clock_sessions
        │ clock-out (hours only, no punch times)
        ▼
 My time (typed entry) ─────────────> POST /api/admin/time-logs ──> daily_time_logs
 Office entry for someone ──────────>         (price stamped from pay model)
        │
        ▼ Approvals tab (approve / reject / adjust, PayDecisionModal, lock week)
        ▼
 owed balance (approved $ minus committed) ──> payout batch (draft > approved > dispatched > paid)
        │                                           │
        │                                           ├ Venmo via PayPal API
        │                                           ├ bank via NACHA file (PNC)
        │                                           ├ check PDF, cash sheet, Cash App / Zelle manual
        │                                           └ ledger "account" balance
        ▼
 payroll tax report (W-2 / 1099 split)

 Legacy: payroll_runs + pay_stubs (the only place overtime is computed, estimated taxes)
 Separate: job_time_entries (job cost, mileage, Field team page) — not fed by the clock
```

Front doors: `/admin/hours` (7 tabs), `/admin/pay` (11 tabs), `/admin/people` (6 tabs), `/admin/me`. About 21 old routes redirect into them.

## Main user journeys

- **Crew member, day.** Press the clock pill, pick a job and tags, work, clock out, enter lunch and per-job split. If offline the entry waits in the browser queue.
- **Crew member, week.** Open My time, fix or add entries, resubmit rejected ones, see approved pay and what is owed.
- **Office manager, Monday.** Approvals tab: people with pending hours first, flags (duplicate, long day, 60h), approve in bulk or adjust. Lock the week, prepare a payout batch.
- **Office manager, payday.** Payout run: preview lines, Commit (or approve and dispatch per method). Fix held lines and Commit again. Mark checks or cash paid.
- **Owner.** Tax report by W-2 and 1099, payout settings and fees, role changes in Accounts.

## Biggest problems

1. **The clock does not record a time record.** Punch times are not stored; only a date and a decimal on `daily_time_logs`. The running clock is browser-local with a server mirror. This is the root of most hours clumsiness.
2. **Two sources of "who is on the clock" and "hours on a job."** The Field team tab and the team drill-down read `job_time_entries`, which the clock never writes (payroll code itself says it has zero rows). They cannot show anyone clocked in. Job reports and mileage also read that table, so job labour cost and payroll hours can disagree. Its job-page POST/DELETE need only a login.
3. **Overtime is in the wrong engine.** Only `payroll_runs` computes overtime (weekly 40, 1.5). The plans chose `payout_batches` as the survivor and make `payroll_runs` read-only. The surviving path (owed balance to batch) has no overtime step. Retire the old engine as planned and overtime disappears from pay.
4. **No state rules.** No daily overtime, double time, seventh day, meal breaks, paid sick accrual, exempt status, or state pay-frequency and deduction rules.
5. **Classification does nothing.** W-2 vs 1099 is a label on the login, used only on the tax report. Contractors and employees take the same path; nothing is withheld for anyone, and stub taxes are flat estimates (12 / 6.2 / 1.45%, state 0) that the plan parked for an accountant.
6. **Too many places for one thing.** Seven hours tabs, eleven pay tabs, five employee record pages, two employee lists, four "payment record" tables, two money engines.
7. **Authority is by role name.** `isAdmin` gates nearly all of it. Payout approval uses an env-var email allowlist (the code calls it a placeholder). The `finance` role exists but is barely wired.
8. **Starr and Texas are baked in.** America/Chicago, the 6pm reminder, Monday weeks, PNC NACHA wording, `ADMIN_EMAILS` fallbacks, Texas zero state tax.
9. **Weight without function.** Employee pond (1,600 lines), pay progression (3,200 lines, not read by pay), three rewards tabs.

## What to keep

The audit trigger and restore on hours, the idempotency key on clock-out, the owed-as-running-balance idea, the one pure pay-rate function, per-line payout preflight with idempotent Commit, the payout event log, the check register, and the duplicate-payment guard concept.

## Rebuild recommendation (area as a whole)

- One **Person** (profile, access, worker type, work state, pay setup, hours, time off, documents).
- Three hours surfaces: **Clock** (crew), **Timesheet** (crew week), **Review and close** (office).
- One **time record** shared by pay, job cost and mileage.
- One **rules module** that turns punches into pay classes.
- One **payment ledger**, fed either by the firm's own rails or by a payroll provider.
- **Permissions** with role templates per firm.
- Pay Progression, Rewards, the Pond and "account balance" are removed or hidden until wanted.

---

# Recording hours: the owner's focus

## 1. The hours flow as it is now

**Clock in and out.**
`ClockInPill` and the hub Quick Actions tile open the same modals. Clock-in takes an optional job and activity tags. The session lives in `localStorage` and is mirrored to `active_clock_sessions` (one row per user). Clock-out asks for per-job hours, lunch minutes and notes. Only roles in `CLOCKABLE_ROLES` see it. (`lib/time-tracking/clock-session.ts`, `clock-modals.tsx`, `clock-eligibility.ts`)

**Offline.** Clock-out is written to the device first, then POSTed with a `client_submission_id` (unique index) so retries cannot duplicate. Refusals are kept with the reason. (`lib/time-tracking/pending-hours.ts:1-22`)

**What is stored.** One `daily_time_logs` row per person, day, job and activity: `log_date`, `hours` (0 to 24, 2 decimals), `work_type`, `job_id`, description, notes, `lunch_minutes`, tag ids, status, rate and `total_pay` stamped at submit. Start and end times are not stored. Clock-out writes `work_type = 'general'`. (`seeds/000_baseline_tables.sql:181-209`, `pending-hours.ts:141-147`)

**Field versus office.** There is no field/office flag on a time record. The nearest things are activity tags (about 28, including office tasks such as billing and estimating, seed 375), the pay activity (`work_type`, such as driving), and role. Geofences and location pings exist for jobs (seed 227) but are not tied to clock-in.

**Per job or task.** Per-job split happens at clock-out (hours allocated by job) or by typing separate rows on My time. A second path, the job page "add time entry", writes `job_time_entries` instead.

**Approvals.** Statuses: pending, approved, rejected (reason required), adjusted, disputed. Approver is anyone with `admin`. Single approve, bulk approve, adjust (hours and pay via `PayDecisionModal`). The employee is notified of every decision. Employees may edit only pending and rejected rows. Flags: duplicate, long day over 14h, period over 60h, needs review, late after lock. Office can enter hours for someone (`entered_by`).

**Close.** Lock a Monday-to-Sunday week (`pay_period_locks`): employees get HTTP 423, admins can still adjust; a snapshot of the period is taken. "Prepare payout" builds a draft batch.

**Overtime.** Calculated only inside the legacy payroll run: threshold and multiplier from config (40, 1.5), regular-rate method for mixed rates, half-time premium. Not applied to owed balances or payout batches.

**Payroll export.** There is none to a provider. The outputs are a NACHA file for PNC, a PayPal Payouts call for Venmo, a check PDF, a cash sheet, manual Cash App/Zelle, plus a year-end tax report grouped W-2 vs 1099.

## 2. Where it is clumsy or duplicated

1. **The record is not a punch.** No start or end, no breaks, no source, no device, no location. Meal breaks are a note that is "recorded, never deducted". A labour-board question ("show me this person's punches for that week") cannot be answered, and overlapping entries cannot be detected.
2. **Three ways in, three shapes.** Clock (client-side, becomes a row), typed row (My time), office entry (approvals form), plus `job_time_entries` from the job page. Four doors, two tables.
3. **Live status is split.** `active_clock_sessions` (read by the reminder cron and the AI tool) versus `job_time_entries` (read by Field team, team drill-down, mileage, job reports). The first is written, the second is not. The Field team page is, by code reading, unable to show anyone on the clock.
4. **Client owns the truth.** The clock, the day split (device timezone) and the started-at value all come from the browser. Several patches exist to stop duplicate clock-outs across devices.
5. **Pay is decided at the wrong time.** A rate and `total_pay` are stamped at submit and can then be replaced by a pay decision, so there are two numbers per entry. Overtime, which depends on the whole week, cannot be known at submit.
6. **The employee chooses the pay activity** on their own timesheet, so the pay model is exposed to the person paid.
7. **Approval is one tier.** Any admin; a party chief cannot sign off their crew first. Every admin is notified of every submission unless they opt out.
8. **Approvals tab does six jobs** (review, close, payout start, advances, bonuses, office entry) in 1,819 lines.
9. **Period close does not compute.** A lock only freezes edits. It gives no regular/OT/PTO totals per person.
10. **Overtime lives in the engine being retired**, and covers weekly 40 only.
11. **Time off is a calendar event.** Approved leave does not (that I found) become a paid-leave line.
12. **Hard-coded Starr assumptions:** America/Chicago and 6pm nag, Monday weeks, a 14h and 60h flag, admin-only approval.

## 3. A clean design for a multi-state firm

### Principles

- Record **facts** (punches), derive **pay** later, never the other way round.
- One time record feeds payroll, job cost, billing and mileage.
- Rules are **data per jurisdiction**, versioned and named on the output, so an approver can see why an hour was overtime.
- The platform does time and gross pay lines; **tax and filings go to a payroll provider** unless the firm is certified to do them. This matches the existing plan conclusion that stubs must not print invented tax.

### Data model (sketch)

```
worker            id, person_id, type (employee | contractor), exempt (bool), pay_type (hourly | salary | day | piece),
                  base_rate, work_state, work_city, workweek_start, pay_schedule_id, provider_worker_id, effective_from/to

time_punch        id, worker_id, start_at, end_at (null while open), kind (work | meal | rest | travel | pto-only),
                  job_id, task_code, vehicle_id, is_driver, source (clock | crew-lead | office | import | gps),
                  device, lat/lon (opt), created_by, edited_by, edit_reason, client_id (unique)
                  — one open work punch per worker (partial unique index)

timesheet_period  id, worker_id, pay_period_id, state (open | submitted | crew-approved | approved | exported | paid),
                  submitted_at/attested_by, approved_by, locked_at

pay_line          id, period_id, class (regular | ot | dt | pto | sick | holiday | prevailing | per_diem), hours, rate,
                  rule_id + rule_version, source_punches[]

pay_calendar      id, firm_id, frequency, workweek_start, pay_day_offset, holiday set
rule_set          jurisdiction (US-fed, US-TX, US-CA, ...), daily_ot, weekly_ot, dt, seventh_day, meal_break, rest_break,
                  min_wage, pay_frequency_max_days, final_pay_days, sick_accrual — versioned by effective date
```

Keep from today: the history trigger and restore, the idempotency client id, the lock concept (now a state on the period), the owed running balance, the audit stamp on every decision.

### The hours flow

1. **Clock (crew, phone-first).** One big button. Server sets the time. Job defaults from today's schedule or the nearest geofenced job (prompt, never silent). Breaks are one tap. Offline events buffer on the device and sync with idempotency keys. A party chief can clock a crew in together.
2. **Field versus office** is the job and task, not a separate mode: field jobs, office tasks (drafting, research, admin) and non-billable codes are task codes on the punch. Travel can be its own class so driving pay (today's $15 driving rate) and mileage come from the same record.
3. **Timesheet (crew, week).** Punches grouped into a week grid by job. Missing clock-outs and overlaps are highlighted at the top. Manual entry is allowed and labelled `manual` with an optional reason. At period end the employee submits and attests (required or advised in several states).
4. **Review (office).** Exceptions first: missing punches, over-daily-limit, no meal break, edits after submit. Two tiers: crew lead signs their crew, office manager signs the period. Approvers are routed per worker, not "all admins".
5. **Rules run at close, not at entry.** The rules module takes a worker's punches for the period and the worker's state, classification and exempt flag, and returns pay lines (regular, OT, DT, PTO). A preview shows each person's regular, OT and total hours before approval. Approver edits change punches (with reason) or add an adjustment line; they do not overwrite a dollar total.
6. **Close and export.** Closing the period locks it and produces a **payroll export**. Choose one per firm:
   - **Provider mode** (Gusto, ADP, QuickBooks Payroll, Paychex): push or export gross hours and pay lines by earning code, mapped from the firm's task codes. The provider handles withholding, deposits, filings and pay stubs. The platform imports the "paid" result back to mark periods paid.
   - **Own-rails mode** (today's payout batches): build a batch from pay lines; contractors are paid gross, employees only if the firm accepts the tax caveat. Keep Commit, idempotency and the event log.
7. **Period states** make the old double-pay worry (`engine-overlap.ts`) structural: a punch belongs to one period and one export; a batch references the exact pay lines.

### State rules, concretely

Ship a small, accurate rule set and be honest about what is not covered:

- **Federal:** weekly 40 hours over a configured workweek, regular-rate method for mixed rates (already coded), exempt and non-exempt, contractors excluded.
- **Texas (Starr's home):** federal rules only; no state income tax.
- **Daily-overtime states** (for example California, Alaska, Nevada, Colorado): daily thresholds, double time, seventh-day rule, meal and rest premium pay. Add one state at a time with tests from official rules.
- **Per firm setting:** work state per worker (and per job when a crew works across state lines; the rule that applies is usually the state where the work is done, so the punch carries the job's state).
- **Paid sick leave, final pay timing, pay frequency, allowed deductions:** stored in the rule set, used for warnings first and enforcement later.
- Every rule is versioned by date and cited in the output so a reviewer or auditor can see the basis.
- A "not legal advice; confirm with your accountant or provider" footer, as the existing plans already require.

### W-2 versus 1099

- Classification, exempt flag, pay type and work state live on `worker` with effective dates, not on the login.
- **Employee:** punches, rules, overtime, PTO, payroll provider, W-4 and I-9 collected through the provider's onboarding link.
- **Contractor:** no overtime, no PTO; hours optional (invoice by hours or by job); paid from an invoice or a payout batch; tracked toward the $600 1099-NEC threshold; W-9 on file. The platform flags (does not decide) misclassification risks such as fixed schedule plus hourly pay plus company equipment.

### Payroll provider integrations

Build one **export port** with adapters, so a firm picks a provider and the rest of the platform does not change:

| Provider | Fit | Notes |
|---|---|---|
| Gusto | Small firms; REST API with OAuth, time and pay import, "Embedded" option | Likely first adapter: the existing plan already names Gusto Embedded and Check |
| QuickBooks Payroll | Firms already on QuickBooks | Time entries and earning codes through Intuit's API; also covers accounting sync |
| ADP | Larger firms | Partner program and marketplace approval needed; start with CSV in ADP's import layout |
| Paychex / others | Later | CSV first |

Common behaviours: field mapping screen (task code to earning code, worker to provider id), dry-run preview, one-click export that is idempotent per period, return of pay date and paid state, and a CSV fallback for everyone. Credentials are stored per firm and never in client code. This is also where a firm's own accountant-approved withholding module would plug in, if ever built.

### Permissions this design needs

`hours.clock`, `hours.edit_own`, `hours.enter_for_others`, `hours.approve_crew`, `hours.approve_all`, `payroll.close`, `payroll.export`, `pay.view_all`, `pay.settings`, `people.manage`. Role templates (Owner, Office manager, Party chief, Crew, Drafter, Bookkeeper) are bundles of these, editable per firm.

### Build order (hours first)

1. **Time record.** `time_punch` and server clock; migrate `daily_time_logs` rows as `manual` punches with synthetic times or keep them as a legacy daily total; retire `job_time_entries` and make Field team read open punches. (Fixes problems 1 to 4 above, and the broken Field team page.)
2. **Timesheet and review.** Week grid, exceptions-first review, crew-lead tier, period states replacing the plain lock.
3. **Rules module** (federal and Texas first, one daily-OT state as the proof), run at close with a preview.
4. **Classification and worker profile.**
5. **Export port**: CSV first, then Gusto, QuickBooks Payroll, ADP.
6. Remove: legacy `payroll_runs` UI, pay progression, rewards tabs, employee pond, account balance.

### Open items from the plans that this design touches

- `PAYROLL_HOURS_AND_EMPLOYEE_MONEY` (pending): S9b/S9c (withholding and real pay stubs) wait on an accountant; S8 (auto-transfer) waits on reconciliation history. Provider mode answers S9b/S9c without the firm computing tax.
- `payouts-and-holding-money` (in progress): holding and investing employee money, and crypto, are not built and need a regulated partner. The design above does not need them.
- `PAYOUT_AUTOPILOT` (in progress): built on a branch, not merged as of its last note. I could not verify main.

## What I did not verify

- Live database contents (for example whether `job_time_entries` has zero rows today; I rely on a code comment).
- That the Field team page is empty in practice; I infer it from the read paths.
- Whether time-off approval decrements the PTO balance.
- Depth of the personnel/assignments APIs and the invite accept flow.
- Whether the payout autopilot branch is merged.
