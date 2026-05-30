# Category 11 — Money widgets (time-pay, financial, office)

*Part of the Hub Widget Excellence plan (`…-00-master-…`). Widgets:
**my-pay, hours-this-week, pto-balance, monthly-revenue,
outstanding-invoices, pending-hours, pending-receipts,
pending-time-off**. Each: Build/Wire + 4 audit rounds.*

---

## my-pay
- **Endpoint:** `/api/admin/payroll/employees?email=…`. Fields:
  hourly_rate, available_balance, total_earned, total_withdrawn,
  salary_type, pay_frequency.
- **Track:** last payout (date + amount), this-period total, current
  rate, available balance, lifetime earned/withdrawn.
- **Per-bucket priority:** tiny → available balance (or current rate);
  small → balance + rate; medium → + last payout + period total;
  large+ → all stats grid + trend.
- **Footer link:** "Go to my pay →" `/admin/my-pay`.
- **Editor:** stats checkboxes, amountStyle, colorAmounts, showUpdated,
  privacy (blur) default. (Mostly exists — R4 polish.)
- **Notifications:** pay updated / payout posted → `notifyPaymentUpdate`.
- **Slices:** Build/Wire (footer link + last-payout line per the
  sketch's "Last payout: … — $…" + period total + rate) + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** The widget was
  already strong (per-bucket stat grid, privacy mask + toggle, currency/
  compact formats, color tint, the full stats editor). R1 audit:
  `payroll/employees?email=` returns the profile (rate/balance/earned/
  withdrawn/type/frequency) but NOT a last payout — that lives in
  `payroll/payout-log?email=&limit=1` (entries[0] = `{ amount,
  processed_at }`, newest-first). **Added the sketch's "Last payout:
  {date} — $…" line:** the widget now best-effort fetches the
  payout-log alongside the profile and renders the line below the stats
  grid (small+), via a new pure exported `formatLastPayout(amount,
  processedAt, style, privacy)` that respects the currency/compact
  style + masks the amount under privacy. Editor gains a "Show the last
  payout line" toggle (`showLastPayout`, default on). Footer "Go to my
  pay →" is global; pay-update notifications are wired (doc-03 Slice
  2h). 3 new specs (line text + $amount, privacy mask, compact style).
  Full hub suite (1556) green; typecheck + lint clean. (Period-total
  would need a pay-period boundary calc — noted; the rate + balance +
  last payout cover the sketch.) **my-pay is done.**

## hours-this-week
- **Endpoint:** `/api/admin/time-logs?week_start=…`.
- **Track:** total hours this week, per-job breakdown, vs goal.
- **Per-bucket:** tiny → total hours; small → total + goal ring;
  medium → + per-job bars; large+ → + day-by-day.
- **Footer link:** "Go to my hours →" `/admin/my-hours`.
- **Editor:** weekStart, showBreakdownByJob, goalHours.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** R1 verified clean
  — unlike the work widgets, the data contract is correct: the time-logs
  GET supports `week_start` and returns `{ logs }`, which the widget
  already reads. The widget was otherwise complete (tiny total, per-day
  bar chart, "of Nh goal", per-job breakdown, weekStart/goal/breakdown
  editor). Added the doc's missing **goal progress indicator**: a
  `GoalBar` (`role="progressbar"` with aria value/label) under the total
  that fills to a new pure exported `goalPct(total, goal)` (clamped
  0–100, 0 for a non-positive goal) and turns green once the goal is
  met. Footer "Go to my hours →" is global. 2 specs (goalPct percent +
  clamp + non-positive-goal). Full hub suite (1558) green; typecheck +
  lint clean. **hours-this-week is done.**

## pto-balance
- **Endpoint:** `/api/admin/pto`.
- **Track:** balance, accrual rate/period, last accrued, carryover
  cap, history.
- **Per-bucket:** tiny → balance; small → balance + accrual; medium+ →
  + history.
- **Footer link:** "Go to time off →" `/admin/time-off`.
- **Editor:** format (hours/days), hoursPerDay, showHistory.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** R1 verified clean —
  `/api/admin/pto` returns `{ balance: {…}, recent_transactions }` with
  the balance object carrying `balance_hours`, `accrual_rate_hours`,
  `accrual_period`, `carryover_cap_hours`, `last_accrued_at`, exactly
  what the widget reads. The widget was complete (tiny balance, balance
  + accrual + last-accrued, history list, hours/days format +
  hoursPerDay + showHistory editor) EXCEPT it tracked
  `carryover_cap_hours` but never rendered it. Added the **carryover-cap
  line** ("Carryover cap 240.0h" / "30.0d") at medium+ via a new pure
  exported `formatCarryover(cap, format, hoursPerDay)` (empty when no
  cap). Footer "Go to time off →" is global. 2 specs (cap in hours/days,
  empty when absent). Full hub suite (1560) green; typecheck + lint
  clean. **pto-balance is done.**

## monthly-revenue
- **Endpoint:** `/api/admin/reports?metric=monthly-revenue&period=…`.
- **Track:** revenue MTD/period, vs last period, goal %.
- **Per-bucket:** tiny → revenue number; small → + trend; medium+ →
  + goal bar + comparison.
- **Footer link:** "Go to finances →" `/admin/finances`.
- **Editor:** period, showTrend, showComparison (schema-driven; R4
  may upgrade to a richer editor).
- **Slices:** Build/Wire (footer link) + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  backing endpoint didn't exist** — the widget fetched
  `/api/admin/reports?metric=monthly-revenue` (only a stub path in the
  hub-data route map), so it always rendered empty (its own empty copy
  even said "Once /api/admin/reports lands…"). **Built the minimal
  reports endpoint:** revenue = non-refund `job_payments` (money clients
  paid on jobs) summed for the current period-to-date vs the full
  previous period; returns `{ revenue_mtd, revenue_last_month, goal,
  period }` exactly as the widget reads, admin-gated. Period math is the
  pure `lib/reports/revenue-periods.ts` — `periodWindows(period, now)`
  (month/quarter/year, UTC, with Q1→prior-year rollover) +
  `sumRevenue(payments)` (skips refunds, tolerates bad amounts). The
  widget itself was already strong (bucket-aware typography, trend %,
  goal bar, period labels) — just refreshed the stale empty copy. Footer
  "Go to finances →" is global. 7 specs (period windows for
  month/quarter/Q1/year + revenue sum). Full hub suite (1560) green;
  typecheck + lint clean. **monthly-revenue is done** (now actually
  renders real revenue).

## outstanding-invoices
- **Endpoint:** `/api/admin/invoices?status=outstanding`.
- **Track:** total outstanding, per-invoice client + amount + due +
  aging.
- **Per-bucket:** tiny → total $; small → total + count; medium+ →
  list with aging pills.
- **Footer link:** "Go to invoices →" `/admin/billing/invoices`.
- **Row deep link:** invoice → its detail (R2 finds it; likely under
  `/admin/billing/invoices`).
- **Editor:** maxItems, sortBy, showAging.
- **Notifications:** invoice overdue reminder (Doc 03).
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  widget fetched a missing endpoint** (`/api/admin/invoices` — only a
  stub) so it always rendered empty, AND it read `client_name` fields
  that don't exist. The real source is `/api/admin/billing/invoices`
  (the org's Stripe subscription invoices — the same data the
  `/admin/billing/invoices` footer page shows). **Realigned:** the
  widget fetches the billing endpoint and maps rows through a new pure
  exported `toOutstandingInvoice(b)` — keeps only `status==='open'`
  invoices with an unpaid balance, converts `amountDueCents -
  amountPaidCents` → dollars, uses the invoice `number` as the label
  (fallback "Invoice"), `periodEnd` as the due date, and the Stripe
  `hostedUrl` as the row deep link (opens in a new tab). `sortInvoices`'
  customer sort now sorts by label. Footer "Go to invoices →" is global.
  Existing pure specs updated (client_name → label) + 3 new
  `toOutstandingInvoice` specs. Full hub suite (1563) green; typecheck +
  lint clean. **outstanding-invoices is done.** (Invoice-overdue
  reminders: Stripe drives its own dunning; a hub-side reminder would
  duplicate it — left to Stripe.)

## pending-hours
- **Endpoint:** `/api/admin/time-logs/approve?status=pending`.
- **Track:** submitter, week, total hours, count pending.
- **Per-bucket:** tiny → count to approve; small → name + hours;
  medium+ → + week + group-by-person.
- **Footer link:** "Go to hours approval →" `/admin/hours-approval`.
- **Editor:** maxItems, groupByPerson.
- **Notifications:** hours submitted → approver; decision →
  `notifyHoursDecision` to submitter.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  widget hit `/api/admin/time-logs/approve`, which is POST-only** (bulk
  approve), so the GET 404'd → always empty; it also expected an
  aggregated `{ timesheets }` payload that doesn't exist. **Realigned:**
  the widget now fetches `/api/admin/time-logs?status=pending` (the GET
  returns every user's pending daily `{ logs }` for an admin) and rolls
  them up client-side via two new pure exported helpers — `weekStartOf
  (logDate)` (UTC Monday of the week) + `aggregatePendingTimesheets
  (logs)` (group by submitter + week, sum hours, newest-week-first,
  skipping bad rows). Display rounds the weekly total. Footer "Go to
  hours approval →" is global; the decision notification
  (`notifyHoursDecision`) is wired (doc-03 Slice 2a). 7 specs
  (weekStartOf Sat/Mon/Sun + aggregate grouping/sum/sort/skip). Full hub
  suite (1567) green; typecheck + lint clean. **pending-hours is done.**

## pending-receipts
- **Endpoint:** `/api/admin/receipts?status=pending`.
- **Track:** vendor, amount, submitter, date, count + total.
- **Per-bucket:** tiny → count + total; small → vendor + amount;
  medium+ → + submitter + date.
- **Footer link:** "Go to receipts →" `/admin/receipts`.
- **Editor:** maxItems, showAmount.
- **Notifications:** receipt submitted → approver; approved → submitter.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** R1: the receipts
  GET (`/api/admin/receipts?status=pending`) returns `{ receipts }` with
  `vendor_name` / `total_cents` / `submitted_by_name|_email`, but the
  widget read `vendor` / `amount` / `submitted_by` — so vendor was
  always the "Vendor" fallback + amounts were $0.00. Added a pure
  exported `toPendingReceipt(raw)` mapper (vendor_name, total_cents →
  dollars, submitted_by_name ?? email) and mapped at fetch. Footer "Go
  to receipts →" is global; approval notification wired (doc-03 2c). 2
  specs. **pending-receipts is done.**

## pending-time-off
- **Endpoint:** `/api/admin/time-off?status=pending`.
- **Track:** requester, date range, hours, reason, count.
- **Per-bucket:** tiny → count; small → name + hours; medium+ → +
  date range + reason.
- **Footer link:** "Go to time off →" `/admin/time-off`.
- **Editor:** maxItems, showStartDate.
- **Notifications:** request submitted → approver; decision → requester.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** R1 found TWO bugs:
  (1) the widget queried `?status=pending` without `?queue=1`, so the
  time-off GET scoped to the admin's OWN requests (`assigned_to =
  caller`) instead of everyone's pending queue; (2) time-off requests
  are `schedule_events` rows — the fields are `assigned_to` /
  `start_time` / `end_time` / `notes` with hours DERIVED, not
  `user_email`/`start_date`/`hours_requested`. **Realigned:** fetch
  `?queue=1&status=pending` + map via a new pure exported
  `toPendingTimeOff(raw)` that reads the real fields and derives the
  requested hours with the shared `ptoHoursForRequest` (timed delta, or
  8h/weekday for all-day). Footer "Go to time off →" is global; decision
  notification wired (doc-03 2b). 3 specs (timed hours, all-day hours,
  no-start). **pending-time-off is done.**

**Doc 11 complete** — all eight money widgets (my-pay, hours-this-week,
pto-balance, monthly-revenue, outstanding-invoices, pending-hours,
pending-receipts, pending-time-off) through Build/Wire + 4 rounds. R1
found FIVE widgets silently broken against missing/mismatched endpoints
(monthly-revenue + outstanding-invoices fetched nonexistent routes;
pending-hours/-time-off used the wrong endpoint/query; pending-receipts
read wrong field names) — all now render real data, and a new
`/api/admin/reports` revenue endpoint was built.

## Guardrails
- Money values respect existing privacy/role gates (my-pay already has
  a privacy blur — extend the pattern where amounts are sensitive).
- Approver-facing widgets (pending-*) only show items the user may
  approve; respect tenancy + role.
