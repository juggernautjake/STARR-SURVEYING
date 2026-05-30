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

## monthly-revenue
- **Endpoint:** `/api/admin/reports?metric=monthly-revenue&period=…`.
- **Track:** revenue MTD/period, vs last period, goal %.
- **Per-bucket:** tiny → revenue number; small → + trend; medium+ →
  + goal bar + comparison.
- **Footer link:** "Go to finances →" `/admin/finances`.
- **Editor:** period, showTrend, showComparison (schema-driven; R4
  may upgrade to a richer editor).
- **Slices:** Build/Wire (footer link) + R1–4.

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

## pending-receipts
- **Endpoint:** `/api/admin/receipts?status=pending`.
- **Track:** vendor, amount, submitter, date, count + total.
- **Per-bucket:** tiny → count + total; small → vendor + amount;
  medium+ → + submitter + date.
- **Footer link:** "Go to receipts →" `/admin/receipts`.
- **Editor:** maxItems, showAmount.
- **Notifications:** receipt submitted → approver; approved → submitter.
- **Slices:** Build/Wire + R1–4.

## pending-time-off
- **Endpoint:** `/api/admin/time-off?status=pending`.
- **Track:** requester, date range, hours, reason, count.
- **Per-bucket:** tiny → count; small → name + hours; medium+ → +
  date range + reason.
- **Footer link:** "Go to time off →" `/admin/time-off`.
- **Editor:** maxItems, showStartDate.
- **Notifications:** request submitted → approver; decision → requester.
- **Slices:** Build/Wire + R1–4.

## Guardrails
- Money values respect existing privacy/role gates (my-pay already has
  a privacy blur — extend the pattern where amounts are sensitive).
- Approver-facing widgets (pending-*) only show items the user may
  approve; respect tenancy + role.
