# Pay Model Consolidation

**Started** 2026-08-04 · **Status** in-progress · **Owner request** verbatim below

> "We need one central consolidated model for all payments, and we need to have full control over
> custom pay rates and that kind of thing. Please make everything uniform and intuitive and easy to
> use."

> "Please make sure that if an employee's base pay gets changed, then that should be attached to all
> of the bonuses and scaling rates for different jobs too and everything should automatically adjust
> to the currently saved base pay."

---

## 0. tl;dr

Four independent implementations of "what does this hour cost" existed, off three sets of tables,
and they could not agree except by coincidence. All four are now retired into one model.

**The owner then simplified the model itself** (2026-08-04), which resolved the blocked decision in
§4 by removing it. The pay system is now two rules and one escape hatch:

1. **Every person has a base pay.** Ordinary work pays it. One person is on $25, another on $18.
2. **Some activities have a set rate, the same for everybody.** Riding to a job pays $15 for the
   party chief and $15 for the intern. The set rate **replaces** base pay for those hours — it is
   not added to it and it is not floored by it.
3. **Whoever pays can override anything**, per entry or as a standing pin.

> *"I want it so that people are just set at base pay… Then we will have specific activity payment,
> such as driving and stuff. Those types of activities should just be set and should be the same for
> everyone… Let's just simplify the whole thing and put the whole pay progression and seniority thing
> on hold and hide it from surfacing for now."*

Role tiers, seniority brackets, credential bonuses and XP milestones are **parked, not deleted**:
tables stay seeded, `lib/payroll/effective-rate.ts` keeps the graduated formula and its tests, and
`/admin/pay-progression` still resolves but appears in no menu and no search. Restoring it is
wiring, not a rebuild.

---

## 1. What was found

Live config, 2026-08-04. For the firm's one employee — party chief, hired 2025-07-15, one year in:

| Model | Tables | Says for field work |
|---|---|---|
| Flat base | `employee_profiles.hourly_rate` | **$25.00** |
| Activity stack | `work_type_rates` + `role_tiers` + `seniority_brackets` + `credential_bonuses` + `xp_pay_milestones` | **$30.50** |
| Title standards | `pay_rate_standards` + `role_pay_adjustments` | **$28.00** |
| Inline copy | hand-rolled in `app/api/admin/time-logs/route.ts` | **$30.00** (lost seniority — see below) |

The vocabularies disagreed too: `pay_rate_standards.job_title` spells grades `survey_technician` /
`lead_rpls` / `office_tech` where `role_tiers.role_key` spells them `survey_tech` / `rpls` /
`admin_staff`. A join between them matched nothing and raised nothing.

**Two live bugs found while consolidating**, both of the same shape — a lookup that finds nothing
returns an absence that renders as a legitimate zero:

1. `findSeniorityBracket` tested `years < max_years`. The live brackets are inclusive (0–0, 1–1,
   2–2, 3–4, 5–6, 7–9, 10–14, 15–19, 20–null), so it matched **nothing** at 1, 2, 4, 6, 9, 14 and 19
   years, and three of the nine brackets could never match anybody. Fixed: inclusive,
   most-specific-wins, so half-open tables keep answering as they did.
2. The inline copy matched tiers with `.eq('role_key', job_title)` and no alias bridge, so a profile
   reading `survey_technician` silently lost its $6/hr role bonus.

**Why consolidating was safe now:** every transactional pay table was empty — `daily_time_logs`,
`job_time_entries`, `payroll_runs`, `pay_stubs`, `payout_batches`, `pay_advance_requests`,
`balance_transactions`. Only config was seeded. No history to migrate, nobody paid on a wrong number.

---

## 2. The model

`lib/payroll/resolve-rate.ts` — pure, deterministic, source-attributed. Precedence, highest first:

| Source | Meaning |
|---|---|
| `manual` | Whoever is paying typed a rate for this entry. Outranks everything. |
| `override` | `user_pay_overrides.fixed_rate` — a standing per-person pin. |
| `activity` | The activity's set rate, when `work_type_rates.rate_mode = 'flat'`. Same for everybody. |
| `base` | `employee_profiles.hourly_rate` — ordinary work, including `rate_mode = 'base'` activities. |
| `unset` | Nothing to go on. Returns **null, not zero**. |

`rate_mode` (seed 575) is the whole of the activity distinction. `base` means the activity pays the
person's own rate and `base_rate` on the row is ignored — field work is $25/hr for someone on $25
and $18/hr for someone on $18. `flat` means it pays `base_rate` to everybody. Anything unrecognised
is treated as `base`, so a misconfigured row pays people their normal rate rather than whatever
number is sitting in the column.

Two screens manage all of it: `/admin/pay-rates` (what each activity pays) and `/admin/payroll`
(what each person is on).

Supporting modules:

- `lib/payroll/tier-match.ts` — the alias bridge and the `tier_key ?? job_title` fallback. Job-title
  labels only; it has nothing to do with money.
- `lib/payroll/pay-context.ts` — the single server-side load. Config is firm-wide and small, so it
  is fetched once and the maths done in memory (the retired inline calculator did six sequential
  queries **per entry**).
- `lib/payroll/pay-decision.ts` + `time_log_pay_decisions` (seed 574) — what the approver decided,
  kept as its own record beside the employee's submission.

---

## 3. Slices

| # | Slice | Status |
|---|---|---|
| **C-1** | `resolvePayRate` + `totalHourBlocks`, source-attributed | ✅ Shipped — `e89b955e4` |
| **C-2** | `tier-match.ts`: alias bridge + `tier_key` fallback | ✅ Shipped — `e89b955e4` |
| **C-3** | `findSeniorityBracket` inclusive-bounds fix (now parked with progression) | ✅ Shipped — `e89b955e4` |
| **C-4** | `pay-context.ts`: one load, one answer | ✅ Shipped — `e89b955e4` |
| **C-5** | Retire the inline formula in `time-logs/route.ts` (145 lines) | ✅ Shipped — `e89b955e4` |
| **C-6** | Hours submittable with no activity; picker priced per person | ✅ Shipped — `e89b955e4` |
| **C-7** | `time_log_pay_decisions` + history + view (seed 574, applied to production) | ✅ Shipped — `01196879a` |
| **C-8** | "Set pay" — split a day across rates, unique amounts, undecided blocks, payout note | ✅ Shipped — `01196879a` |
| **C-9** | Employee sees the split, the note, and who wrote it | ✅ Shipped — `01196879a` |
| **C-10** | **Simplify to base pay + set rates**; park progression | ✅ Shipped |
| **C-11** | `work_type_rates.rate_mode` (seed 575, applied to production); driving set to $15 | ✅ Shipped |
| **C-12** | `/admin/pay-rates` — manage what each activity pays; registered in nav + middleware | ✅ Shipped |
| **C-13** | `parked` flag on the route registry; hidden from rail AND search, still resolves | ✅ Shipped |
| **C-14** | Payroll runs pay from `daily_time_logs` at model rates, honouring approver decisions; FLSA half-time premium on blended rates | ✅ Shipped |
| **C-15** | Source guards + negative control: no route may re-implement a rate, progression stays parked | ✅ Shipped |
| **C-16** | One payout ledger — `payout_log`, `employee_payouts`, `payout_batches`, `balance_transactions` all exist and are empty | ⬜ Not started |
| **C-17** | Pay advances are recovered from pay: seed 576 (repayment ledger + outstanding view), instalments, protected share of net, mark-paid step, employee sees the balance | ✅ Shipped |
| **C-19** | Week summary in `lib/payroll/week-summary.ts`: hours not entry counts, adjustments honoured, rejected excluded, approver decisions used, undecided hours surfaced | ✅ Shipped |
| **C-20** | `UNPRICED_WORK_TYPE` — hours loggable with no rate at all, and that is the picker default | ✅ Shipped |
| **C-18** | Backfill `employee_profiles.tier_key` (NULL for everybody; `job_title` carries the title) | ⬜ Not started |

---

## 4. RESOLVED — the blocked decision was removed, not answered

This section previously held a three-way fork on what base pay "already includes", worth $10+/hr in
real wages, and said not to implement any of it without an answer. The owner's answer was to delete
the question: base pay is base pay, activity rates are flat and universal, and nothing is stacked on
anything.

Kept here because the reasoning is the useful part. The fork existed because the grade was expressed
twice — `employee_profiles.hourly_rate` was $25 *because the person is a party chief*, and
`role_tiers` added *+$10 because the person is a party chief*. Any graduated system layered on a
per-person agreed rate has to say which one owns the grade. The simple model has no such problem
because it has no layers.

**If progression is ever restored, this is the question to answer first.**

---

## 5. Parked, not deleted

Everything graduated stays in the repository and in the database:

- `lib/payroll/effective-rate.ts` — the full formula with caps and overrides, plus its unit tests.
- `role_tiers`, `seniority_brackets`, `credential_bonuses`, `xp_pay_milestones`,
  `pay_rate_standards`, `role_pay_adjustments` — all still seeded.
- `/admin/pay-progression` and `/admin/pay-progression/[email]` — still render, still resolve for
  breadcrumbs and bookmarks, hidden from every menu and from search via `parked: true`.

`role_tiers` is still read in the live path, for **job-title labels only**. A grade is a useful thing
to show next to somebody's name; it just does not change what they are paid.

Two ideas from the retired duplicate tables are worth keeping in mind if progression returns:
`pay_rate_standards` held a min/max band per grade, and `role_pay_adjustments` held acting-up pay
(a technician who runs a crew for the day). Neither has a place in the simple model, and the code
that folded them in was removed rather than left dangling.

---

## 6. Gotchas worth not re-deriving

- **`employee_profiles.tier_key` is NULL for everybody.** `PAY_PROGRESSION_OVERHAUL.md` P-6 added it
  with a backfill that never ran. Code reading `tier_key` alone finds no grade for anyone and strips
  every role bonus — a pay cut with no error. `resolveTierKey` falls back to `job_title`.
- **`daily_time_logs.work_type` is NOT NULL**, so "no activity" is the sentinel
  `UNSPECIFIED_WORK_TYPE = 'unspecified'`. It deliberately matches no `work_type_rates` row; adding
  one would give the sentinel a price and turn "undecided" back into a number.
- **`total_pay` is NULL, never 0, when no rate is set.** A zero totals into a pay period as "worked
  for free" instead of "waiting on a decision".
- **XP is counted two ways.** `pay-context.ts` counts milestones reached
  (`xp_milestone_achievements`); `/admin/pay-progression/[email]` reads `total_earned`. Noted rather
  than silently reconciled — picking one quietly is how the split started.
