# Customer Invoicing — Phase 2 (upfront / categories / under-construction gate)

**Date:** 2026-06-21
**Status:** in-progress — planning the four additions the user asked for that
weren't in the original Phase-1 payment-infrastructure-2026-06-18 plan, plus
the table-name collision fix that's blocking that whole earlier work from
shipping to live.

> User directive (verbatim, 2026-06-21):
> "Ok, please actually wire the payment page so that customers can pay their
> bills online. For now I just want debit card and venmo payments, and then
> they can also select check or cash payment as an option. My dad sometimes
> has the customer pay a percentage of the cost up front, so we will need to
> account for that. […] We also need to handle edge cases in case the customer
> did not pay the up front payment in full. if they make a payment initially
> that is less than the upfront cost, then it should notify them and tell them
> that they will need to pay the rest of upfront cost before they can make a
> payment. Like, we shouldn't accept any money for the job until they pay the
> full upfront cost or more. […] Some of the money will be allotted to buying
> equipment and supplies, some for travel expenses such as food and gas, some
> for the employees salaries, some for savings, and some for investing. […]
> make it so that we can actually route to it on the frontend. However, make
> it so that it is password protected and so that only developers and admins
> can use their personal account passwords to login and see the page. It
> should say that the page is under construction."

## 1. What already exists (Phase 1, payment-infrastructure-2026-06-18)

P1–P22 all shipped + 509 tests passing. The complete customer-invoicing
system is built but **blocked on a table-name collision** documented in
`docs/payments-invoices-collision-2026-06-21.md` (live `invoices` table is
the SaaS Stripe billing one; seed 323's identically-named table can't apply).

Already live in code (just blocked on the live DB rename):

- **Customer-facing UI** `/pay` + `/pay/[invoice]` — landing form, lookup,
  six-method picker (Stripe / Venmo / CashApp / Zelle / Cash / Check), paid
  status with receipt download + resend, mobile-first WCAG AA.
- **Admin UI** `/admin/invoices/new` (compose + send), `/admin/payments/inbox`
  (close-out queue for pledges + deep-link attempts), `/admin/payouts/*` (batch
  builder, approval, dispatch, ad-hoc, tax report).
- **API** 12 endpoints (public + admin) — Stripe PaymentIntent creation,
  webhook routing, pledge tracking, close-out, ACH-CSV export.
- **Lib code** under `lib/payments/*` (9 files) + `lib/payouts/*` (4 files).

## 2. What the user asked for that ISN'T built yet

This phase. Four pieces:

### 2.1 Upfront-payment rule
Dad sometimes requires a deposit before work begins (a percentage of total or
a fixed dollar amount). The system must:
- Let dad set `deposit_type` (`percent` | `fixed_cents` | `none`) and the
  matching value on each invoice at creation time.
- **Hard-reject** any payment attempt whose amount + already-paid total
  doesn't reach the upfront threshold. Show the customer: "Your first payment
  must cover the upfront amount of $X". The user spec is explicit:
  *"we shouldn't accept any money for the job until they pay the full upfront
  cost or more."*
- Once upfront is fully paid, accept any positive amount up to remaining
  balance.
- Notify dad on the transition `→ upfront_paid` so he knows to start research.

### 2.2 Financial-allocation categories + ledger + reports
Every dollar received needs to be allocated against a category (equipment /
travel / salaries / savings / investing / etc.) with a target percentage. Dad
sets the percentages once; every payment auto-allocates per those percentages
into a ledger row. Reports roll up:
- Revenue by period
- Allocated $ per category (target vs actual)
- Per-customer history

User-named categories:
- Equipment and supplies
- Travel expenses (food, gas)
- Employee salaries
- Savings
- Investing

Additional categories worth adding (proposed for confirmation in §6):
- Insurance (general liability, vehicle, equipment, errors-and-omissions)
- Office overhead (rent, utilities, software, internet, phone)
- Vehicle maintenance + fuel (separate from travel "food" portion)
- Professional development (RPLS CEUs, training, conferences)
- Licenses & renewals (RPLS license, business permits, vehicle registration)
- Accounting / bookkeeping
- Legal
- Marketing / advertising
- Quarterly estimated taxes (set aside before owner draw)
- Emergency reserve (≥3 months operating expenses, separate from "savings")
- Owner's draw (what flows to dad personally)
- Healthcare / benefits (if/when employees get coverage)
- Charitable giving (if desired)

### 2.3 Under-construction admin route + auth gate
A new top-level route at `/admin/invoicing` that:
- Auth-gates on `session.user.roles` ⊇ {`admin` | `developer`}.
- Shows an "Under Construction — Phase 2 build" banner on every sub-page.
- Lets dad + me preview what's coming, with checkboxes for each slice's
  state (planned / in-progress / done).
- Eventually graduates into the real dashboard for Phase 2 features (upfront
  config, allocation %, category management, reports).

### 2.4 Mock-customer testing harness
A `lib/invoicing/mock-customers.ts` + admin button "Seed test invoices" that
creates a deterministic set of fake invoices covering every edge case (no
upfront, percent upfront, fixed upfront, partial payment below upfront,
partial payment equal to upfront, full payment, over-payment, voided, paid
months ago) so we can verify the end-to-end flow against real-looking data
without mocking the route handlers.

## 3. The table-name collision (must land FIRST)

Already documented end-to-end in
`docs/payments-invoices-collision-2026-06-21.md`. Renames seed 323-327's
`invoices` table to `customer_invoices` + repoints 18 code sites + the
customer-payment branch of the Stripe webhook. **Until this lands, none of
Phase 2 can be wired live** because the columns the Phase-2 helpers will read
(`total_cents`, `paid_at`, `status`) don't exist on the live `invoices`
table (that's the SaaS schema).

This is **Slice 1** of Phase 2 — every other slice depends on it.

## 4. Slice sequence

| # | Slice | Type | Notes |
|---|---|---|---|
| **0** ✅ | Planning doc + under-construction route stub + upfront-rule pure helper | mixed | Shipped 2026-06-21 (commit 48301b0). Planning doc + `/admin/invoicing` auth-gated dashboard + `lib/payments/upfront-rule.ts` + 28 tests. |
| **7+8** ✅ | Allocation categories schema + engine | migration + pure helper | Shipped 2026-06-21 (this commit). `seeds/374_financial_allocation_categories.sql` (5 user-named + 13 §2.2 proposed categories, all at 0% pending dad's decision) + `lib/payments/allocation-engine.ts` (pure splitter, last-active-category absorbs rounding, refuses writes when target_percent ≠ 100). 30 source-locked tests including the books-balance sweep across 7 distributions × 7 amounts. Independent of the customer_invoices rename — the ledger FKs to `payments`, which is unchanged. |
| 1 | Phase-1 collision fix (rename to customer_invoices) | migration + repoint | Per the existing reconciliation doc. Unblocks every other slice + the existing 22-slice payment work. Single-PR risky — split into 1a (seeds), 1b (code repoint), 1c (webhook + verify) if needed. |
| 2 | Schema: `deposit_type` + `deposit_value` + `upfront_paid_at` columns on customer_invoices | migration | Idempotent ALTER TABLE. CHECK constraint on enum values. |
| 3 | Backend: wire upfront-rule into `/api/public/invoice/[number]/intent` + `/attempt` | route | Reject under-upfront payments at the route, return 422 with the rejection-reason from the pure helper. |
| 4 | Customer-facing UI: show "your first payment must cover $X" + the upfront amount | UI | On `/pay/[invoice]`, when `deposit_value > 0 && already_paid < deposit_amount`, surface a banner above the method picker that says exactly what they need to pay. |
| 5 | Admin invoice composer: deposit-type picker + deposit-value field | UI | On `/admin/invoices/new`, add a "Deposit required?" dropdown (none / percent / fixed) + a value field. Saved into the new columns from slice 2. |
| 6 | Notification: on transition → `upfront_paid`, fire admin notification | route | "Customer X paid the upfront amount; you can start the research phase." Email + in-app via existing pipeline. |
| 7 | Schema: `financial_allocation_categories` + `financial_allocations` tables + default-category seed | migration | Includes every user-named category + the §2.2 additions. Default percentages = 0 (user sets them later). |
| 8 | Allocation engine: `allocatePayment(payment, categories) → AllocationRow[]` (pure) | helper + tests | Splits a payment by target %. Handles rounding (last category absorbs the remainder). Idempotent. |
| 9 | Wire allocation engine into the office-closeout path + stripe-webhook success path | route | Every cleared payment writes its allocation ledger rows automatically. |
| 10 (data) ✅ | Reports — pure-aggregator data layer | helper + tests | Shipped 2026-06-21. `lib/payments/allocation-reports.ts` ships `rollupAllocationsByCategory` (target vs actual + variance + share_of_actual + window filtering + inactive-category gating) and `revenueByPeriod` (day / ISO-week / month / year bucketing with from/to range). 22 source-locked tests. The UI half (the actual `/admin/invoicing/reports` page) ships once the collision fix lands so outstanding-invoices section can pull from `customer_invoices`. |
| 11 (data) ✅ | Category editor — pure validators + preview helpers | helper + tests | Shipped 2026-06-21. `lib/payments/category-editor.ts`: `validateSingleCategory` (snake_case key, 80-char label cap, 0–100 percent with 2-decimal NUMERIC(5,2) check, `#RRGGBB` color), `validateCategorySet` (active-sum = 100 ± 0.01, duplicate-key detection, no-active-categories warning), `previewEdit(original, draft)` (added / modified-with-fields_changed / removed + percent_delta), `suggestCategoryKey(label)` (snake_case coercion with leading-digit escape). 30 source-locked tests including floating-point fuzz tolerance + the 401(k) → `_401_k_contributions` edge case. |
| 11 (UI) ✅ | Category editor — `/admin/invoicing/categories` route + API | route + page | Shipped 2026-06-21. `GET /api/admin/invoicing/categories` lists every row from seed 374; `PUT` accepts a partial-update batch, runs the slice-11 validators FIRST (returns 422 with the typed `ValidationResult` on a bad sum / dup / out-of-range), then per-row `UPDATE`s. UI at `/admin/invoicing/categories` (admin+developer gated, identical Shell + Gate components to the parent route) — table of every bucket with color swatch + snake_case key + editable percent input + "changed" pill + footer total in green/red based on the live `validateCategorySet` verdict. Save button disabled when validation is invalid or there are no pending changes. Reset reverts the local draft to persisted state. No ADD or DELETE in this cut (the 18-default seed is comprehensive). |
| 12 | Mock-customer test harness: seeder + dashboard button | route + test | Seeds 8 fake invoices covering every edge case. |
| 13 | "Under construction" banner stays visible until every slice above is green | config | Then the banner is removed + the route graduates to the real dashboard. |

## 5. Edge cases the build must handle

- Customer pays $0 / negative / NaN → reject with friendly message.
- Customer pays exactly the upfront → accept + flip status to `upfront_paid`.
- Customer pays less than the upfront (the explicit user spec) → reject with
  "Your first payment must cover the upfront of $X" + show exact required.
- Customer pays more than the total balance → cap at balance, OR refund the
  overage. Phase-2 default: cap at balance (route rejects amount > balance).
- Customer pays the upfront in one shot, then comes back later and pays a
  partial remainder → accept any positive amount ≤ balance.
- Invoice has `deposit_type = 'none'` → upfront rule is a no-op; partial
  payments accepted from the first transaction.
- Invoice is `voided` → all payment routes 410 Gone.
- Invoice already paid in full → all payment routes 409 Conflict with "this
  invoice is already paid" + a link to the receipt page.
- Allocation categories sum to ≠ 100% → block save (admin UI) + warn on
  reports (defensive).
- A new category is added mid-stream → only allocates future payments to it;
  prior payments' ledger rows are NOT retroactively rebalanced. Reports
  show "Allocation rules changed on YYYY-MM-DD" header.
- Stripe webhook fires twice for the same charge → idempotent via existing
  `external_id` dedupe (already handled in P-stream).

## 6. Open questions / user confirmations needed

- **Categories to add beyond what you named?** Confirm or trim the §2.2
  proposed list (insurance / vehicle / professional dev / licenses /
  accounting / legal / marketing / taxes / reserve / owner's draw / etc).
- **Default upfront when none specified?** Today: `none`. Confirm or pick a
  global default (e.g. "always require 25% by default unless dad opts out").
- **Allocate before or after operating expenses?** I'm building the allocation
  engine to split GROSS revenue. If you want NET-of-expenses allocation,
  we'd need a second pass (gross → expense buckets → net to category %).
  Default: gross.
- **Refunds / overpayments?** Out of scope for Phase 2 unless prioritized.
  Phase-1 has refund hooks via Stripe but no UI for marking cash overpayments.

## 7. Non-goals (deferred)

- Tax 1099-NEC generation for subcontractors (no subcontractor table yet).
- Recurring / subscription invoicing (Phase-1 SaaS billing already handles
  that for the SaaS side; this is one-off customer surveying).
- Multi-currency (USD only).
- Payment plans beyond upfront / remainder (no "monthly installments" for
  Phase 2).
- Texas state sales tax — survey services are exempt under § 151.0048 Tex.
  Tax Code; if maps are sold separately and become taxable, add tax handling
  in a future phase.
