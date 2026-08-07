# Ad spend → finance integration, and the reporting around it

**Started** 2026-08-07 · **Owner ask:** *"go through all of the google integrations and analytics and
everything on starr surveying to make sure we can have super robust summaries and results and
comparisons and ad spend control. We need to see exactly how much we are spending month to month and
have that integrated into the website fully. We need it to be fully synced with our finances."*

---

## What already exists (audited 2026-08-07 — do not rebuild)

| Piece | State |
|---|---|
| `ad_spend_daily` table | Daily grain, campaign + ad group, `platform` column, `source` (api / manual) |
| `/api/cron/google-ads-spend` | Scheduled `30 7 * * *`. Imports spend once Basic Access lands |
| `/api/cron/google-ads-upload` | Scheduled `0 7 * * *`. Uploads offline conversions |
| `/admin/marketing/spend` | Manual spend entry, works TODAY without API. Re-entry corrects a day |
| `/api/admin/marketing/dashboard` | Already joins `ad_spend_daily` to leads/jobs/events → funnel, cost per lead, cost per job |
| `lib/pipeline/funnel.ts` | Pure funnel arithmetic |
| `lib/integrations/google-ads/spend.ts` | GAQL builder + `searchStream` parser, micros-safe |
| `/api/admin/finances/overview` | revenue (`payments`) + payouts (`payout_batch_items`) + expenses (`receipts`) |
| `lib/payments/finance-overview.ts` | Pure `summarizeFinances` / `financesByPeriod` |

## The gaps this document closes

1. **`ad_spend_daily` is invisible to finance.** The overview aggregates three streams and advertising
   is not one of them. P&L, month-to-month, and the tax summary all exclude what is plausibly the
   largest controllable expense in the business.
2. **Three of four marketing pages import no stylesheet.** Only `/uploads` has one. `/admin/marketing`
   — the dashboard itself — plus `/spend` and `/exports` render unstyled.
3. **Nothing compares two periods.** The owner asked for comparisons explicitly. No code computes
   "this month vs last".

---

## Two decisions that shape everything below

### Ad spend is a FOURTH stream, not extra receipts

The lazy version folds ad spend into `expenses` and ships in an hour. It is wrong, and it defeats the
stated purpose: *"ad spend control"* means seeing advertising as its own line and steering it. Folded
into receipts it becomes indistinguishable from fuel and equipment, and the one number the owner
asked to watch is the one number the page cannot show.

So `FinanceOverview` grows `ad_spend_cents`, `outflow_cents` includes it, and every period row carries
it separately.

### The double-count is the real hazard

Google charges the card monthly and that charge can arrive as a **receipt** — photographed, approved,
and counted — while `ad_spend_daily` counts the same money from the API. Nothing in either system
knows about the other, so advertising would silently appear twice in outflow, and net profit would
read low by exactly one month of ad spend.

This is the defect most likely to survive to production, because both numbers are individually
correct. S3 exists solely for it.

### Units

`ad_spend_daily.cost_micros` is millionths; finance is cents. `micros / 10_000 = cents`, floored once
at the boundary, never re-divided downstream. `$12.34` = `12_340_000` micros = `1234` cents.

---

## Slices

Each slice is independently shippable: types, tests, `npm run build`, commit.

### S1 — Ad spend enters the pure finance model
`lib/payments/finance-overview.ts`
- `MoneyEvent[]` fourth parameter `adSpend`.
- `FinanceOverview` gains `ad_spend_cents`; `outflow_cents = payouts + expenses + ad_spend`.
- `PeriodRow` gains `ad_spend_cents`.
- Signature change is deliberate: every caller must decide what to pass, so no caller silently keeps
  reporting an outflow that is missing a category.
- Tests: totals, per-period bucketing, empty stream, negative guard.

### S2 — `microsToCents` helper, with the rounding argument settled once
`lib/integrations/google-ads/spend.ts`
- One exported function. Floor, not round: reporting spend lower than Google charged is the direction
  that causes an unpleasant surprise, so round *toward* the charge.
- Tests: exactness at `$12.34`, sub-cent micros, zero, huge months.

### S3 — The double-count guard
`lib/finances/ad-spend-reconcile.ts` (new, pure)
- Detects receipts that look like a Google Ads charge inside the window (vendor/description match) and
  returns them as `suspected_duplicates` with their amounts.
- The route surfaces the warning; it does NOT silently drop either number. Deleting data because a
  heuristic matched is worse than showing two numbers and a sentence explaining them.
- Tests: exact-month match, near-miss amount, no receipts, multiple platforms.

### S4 — Finance overview route reads `ad_spend_daily`
`app/api/admin/finances/overview/route.ts`
- Fourth query, `spend_date` in range, mapped to `MoneyEvent`.
- Response gains `ad_spend`: `{ cents, manual_share, suspected_duplicates }`.
- `manual_share` carried through from `source` — a figure typed off an invoice must never be presented
  with the same authority as one the API reported.

### S5 — Month-over-month comparison, pure
`lib/finances/compare-periods.ts` (new)
- `comparePeriods(current, previous)` → per-metric `{ current, previous, delta, pct }`.
- Handles divide-by-zero (previous = 0) explicitly: `pct: null`, not `Infinity`, and the UI renders
  "new" rather than "∞%".
- Tests: growth, decline, zero baseline, negative net.

### S6 — Comparison endpoint
`app/api/admin/finances/compare/route.ts` (new)
- `?period=month|quarter|year&offset=0` → this period vs the one before, all four streams plus net.
- Also returns lead/job counts and cost-per-job so marketing and money sit in one payload.

### S7 — Finances overview page shows advertising
`app/admin/finances/overview/page.tsx`
- Ad spend as its own row/column and its own colour in the period table.
- The manual-share note and duplicate warning rendered where the number is, not in a footnote.

### S8 — Marketing dashboard: stylesheet + comparison
`app/admin/marketing/page.tsx` + new `Marketing.css`
- Match the admin design system. Summary cards, funnel, slice table.
- Month-over-month deltas on the headline metrics.

### S9 — Spend page: stylesheet + usability
`app/admin/marketing/spend/page.tsx` + `MarketingSpend.css`
- Style the manual entry form and the totals.
- Monthly rollup, since "how much did we spend in July" is the actual question and the page currently
  answers "how much on each day".

### S10 — Exports page stylesheet
`app/admin/marketing/exports/page.tsx` + `MarketingExports.css`

### S11 — Tax summary includes advertising
`app/api/admin/finances/tax-summary/route.ts`
- Advertising is a deductible category and its absence is a real filing error, not a display gap.

### S12 — Navigation + cross-links
- `/admin/finances` ↔ `/admin/marketing` reachable from each other.
- Route registry entries so the icon rail, mobile drawer, ⌘K palette and breadcrumbs all agree.

### S13 — Final QA
- Browser pass over all six pages at two viewports.
- Full `npm test`, `npm run build`.
- Verify no ratchet regressions.

---

## Ground rules

- **Pure first.** Arithmetic in `lib/`, tested with frozen inputs. Routes are query layers.
- **Micros stay micros** until the one documented boundary.
- **Never present an estimate as a measurement.** Manual spend is labelled everywhere it appears.
- **A warning beats silent correction.** The duplicate guard explains; it does not delete.
- **Every page gets a stylesheet.** "Authored but not wired" is this repo's signature defect and three
  unstyled pages are the current instance of it.

## Progress

- [x] S1 · [x] S2 · [x] S3 · [x] S4 · [x] S5 · [x] S6 · [x] S7
- [x] S8 · [x] S9 · [x] S10 · [ ] S11 · [ ] S12 · [ ] S13

---

## Completion notes — 2026-08-07

**S1–S4 · shipped** (`2521343c4`). Advertising is a fourth money stream. The required-argument design
found exactly two call sites, both of which had to decide rather than silently keep reporting an
outflow with a category missing.

**S5–S6 · shipped** (`e36282a3c`). `comparePeriods` + `/api/admin/finances/compare`. Calendar-aware
window: a whole month compares against the whole previous month, so February no longer looks like a
collapse and a 31-day month no longer looks like growth.

**S7–S10 · shipped**. One page bigger than expected — the finance overview (`fin-*`) had the same
unstyled defect as the three marketing pages, found while adding the advertising column. Four screens
had referenced classes nothing defined. The new test guards the *class* of defect rather than the four
instances: every class a page uses must resolve to a rule.

**S11 · shipped**. Advertising joins the tax summary on Schedule C Line 8, in the JSON and in the CSV
the CPA is handed, with the manual-share note and the duplicate warning inline. Its absence was a
filing error rather than a display gap — tax computed on money already spent.

**S12 · shipped**. Registry entries all existed; the overview's keywords and description now carry
advertising so ⌘K reaches the P&L from "ad spend", and the two screens cross-link. A total with no
route to its cause is a number you can only worry about.

**S13 · DEFERRED — needs a signed-in browser, not more code.**
The automated half is done: `tsc` clean, full suite green, `npm run build` exit 0, and the styling
assertions cover class coverage, scoping, table overflow, responsive stacking and dark theme. What
remains is a human looking at six pages, and the Chrome profile the automation is attached to has no
admin session (the same blocker that stopped the Google Ads OAuth connect — the OAuth app is
`org_internal`, so only an `@starr-surveying.com` account can sign in, and that account is in a
different Chrome profile). Deferring rather than faking it: a QA pass nobody performed is worse than
an honest gap, because it gets recorded as done.

**Live-data caveat.** Until Google approves Basic Access, `ad_spend_daily` holds only what is typed
at `/admin/marketing/spend`. Every figure added here is correct and will populate itself when the
nightly cron starts importing; none of it needs revisiting then.
