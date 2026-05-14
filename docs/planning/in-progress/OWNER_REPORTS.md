# Owner Reports

**Status:** Planning — not yet implemented.
**Estimate:** 2–3 weeks of engineering.
**Owner:** TBD.

---

## 0. tl;dr

The owner (Hank) wants to pull a single comprehensive report for any time
window — day, week, month, year, or custom range — that shows every job
(by status), every employee's hours, every receipt, and the financial
roll-up across all of it. The report needs to render on screen, export to
PDF for archiving / emailing, and ideally be one click from his phone.

This is an **admin-only**, **org-scoped** report surface. Lives at
`/admin/reports` for web; mirrored as a "Reports" tab in the mobile app.

---

## 1. Goals & non-goals

### Goals

1. **One screen** at `/admin/reports` where an admin picks a date range and
   sees a full operational snapshot of the firm.
2. **Configurable time window**: preset buttons for *Today / This Week /
   This Month / This Quarter / This Year / Year-to-Date* + a custom
   start/end date picker.
3. **Five report sections** in a single rendered view:
   - **Jobs Summary** — counts by status (completed / in progress / not
     started / lost) with drill-down lists.
   - **Employee Hours** — per-employee totals, per-job-attribution, OT
     flags.
   - **Receipts** — per-employee + per-job totals, by category, paid vs.
     pending vs. rejected.
   - **Mileage** — per-employee totals + dollar value.
   - **Financial roll-up** — quoted vs. invoiced vs. paid; cost-of-labor
     vs. revenue; gross margin per job.
4. **PDF export** of the rendered report (one button, opens a print-styled
   page that the browser can save as PDF or send to a printer).
5. **CSV export** per section for spreadsheet drill-down.
6. **Scheduled weekly email** to the owner: every Monday at 6 AM CST,
   the previous-week's report renders + the PDF is attached + a summary
   is in the email body.
7. **Mobile** — accessible from the existing Hub via a "Reports" tile.
   Renders responsively in the existing Expo WebView shell (no native
   PDF generation needed — uses the system print-to-PDF on share).

### Non-goals

- **Real-time dashboards.** The /platform/* operator dashboard already
  covers cross-tenant headline stats. This is org-scoped, point-in-time.
- **Forecasting / pipeline analytics.** "Jobs expected to close in
  Q3" isn't part of v1. The report is a historical snapshot.
- **Customer-facing.** Customer admins (other firms using the SaaS)
  also get their own version of this report — same code path, scoped
  to their own org via the existing RLS pattern. The owner-specific
  weekly-email-to-Hank wrapper is a Starr-tenant-only configuration
  (`org_settings.weekly_report_recipients`).
- **Multi-org consolidation.** A user in two orgs sees one report per
  active org (driven by the existing `/admin/orgs` switcher).
- **CSV import / ingestion.** Read-only output.

---

## 2. Current state

What already exists that this report consumes:

| Table | What it has | Source |
|---|---|---|
| `jobs` | `id, name, client_name, stage, quote_amount, final_amount, date_received, date_quoted, date_accepted, date_started, date_delivered, assigned_to, org_id` | seeds/01x core schema |
| `job_stages_history` | Every stage transition with timestamp | seeds/01x |
| `job_time_entries` | Per-employee per-job clock-in/out, billable / OT flags | seeds/0xx payroll |
| `receipts` | Per-employee receipts with `status ∈ {pending, approved, paid, rejected}`, amount_cents, category, job_id, org_id | seeds/220_starr_field_receipts.sql |
| `mileage_entries` | Per-employee mileage logs with date / distance / start+end / rate / job_id | seeds/0xx field |
| `employee_profiles` | Roster + pay rate + active/inactive | seeds/0xx payroll |
| `payroll_runs`, `pay_stubs` | Already-run payroll snapshots | seeds/0xx payroll |
| `audit_log` | Org-scoped action history (for "what changed in this period") | seeds/265 |

What's missing today:

- **Job result classification.** The current `stage` taxonomy is `quote
  / research / fieldwork / drawing / legal / delivery / completed` — a
  workflow ladder, not an outcome. There's no field for "this job was
  rejected by the client" or "we walked away" or "still active." Need
  a `result` column on `jobs` (nullable while active; one of `won /
  lost / abandoned` once the job exits the pipeline). Schema slice
  below in §3.
- **A reports surface.** No `/admin/reports` route exists yet.
- **Print-styled HTML.** No `@media print` stylesheet — needed for
  clean PDF output via browser print.

---

## 3. Data model changes

One schema slice up front (small):

```sql
-- seeds/280_reports_job_result.sql

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS result TEXT
    CHECK (result IS NULL OR result IN ('won','lost','abandoned')),
  ADD COLUMN IF NOT EXISTS result_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_result_org
  ON public.jobs(org_id, result, result_set_at DESC)
  WHERE result IS NOT NULL;

COMMENT ON COLUMN public.jobs.result IS
  'Pipeline outcome. NULL = still active (any stage). won = completed +
   billed. lost = client rejected our quote or chose competitor.
   abandoned = we walked away (unresponsive client, scope creep, etc.).';
```

Backfill: every row with `stage = completed` gets `result = won` +
`result_set_at = date_delivered` so historical jobs show up correctly.

UI side: when a job stage moves to `completed`, set `result = won`
automatically. From the job detail page, an admin can mark a job
`lost` or `abandoned` from any pipeline stage with a one-click action
that prompts for `result_reason`.

---

## 4. Report sections

The single rendered page is a vertical stack of cards. Each card has a
header, a summary block, and an expandable detail table.

### 4.1 Header — date range selector

Always pinned at the top. Preset chips:

> Today · This Week · This Month · This Quarter · YTD · Last 7d · Last 30d · Custom

"Custom" expands a two-date-picker row.

The selected range is encoded in the URL: `/admin/reports?from=2026-05-01&to=2026-05-31`. Refreshable / bookmarkable / shareable via link.

### 4.2 Jobs Summary

```
JOBS                                              May 1 – May 31, 2026
─────────────────────────────────────────────────────────────────────
Started             12      Completed (won)        8     $42,300
In Progress         15      Lost                   3
Not yet started      4      Abandoned              1

Quoted total: $89,400   Invoiced: $42,300   Outstanding: $11,250
```

Drill-down list under the summary: every job that started, completed,
was lost, or was abandoned in the window, with link to `/admin/jobs/[id]`.

### 4.3 Employee Hours

```
EMPLOYEE HOURS                                    May 1 – May 31, 2026
─────────────────────────────────────────────────────────────────────
Employee             Regular   OT     Total   $ Labor
Hank Maddux            168.0   0.0   168.0   $13,440
Jacob Maddux           172.5   4.5   177.0   $11,063
…                       …       …     …       …
─────────────────────────────────────────────────────────────────────
Totals                 X,XXX   XXX  X,XXX   $XX,XXX
```

Drill-down per employee → list of `job_time_entries` rows with
job-name / date / duration / billable flag.

### 4.4 Receipts

```
RECEIPTS                                          May 1 – May 31, 2026
─────────────────────────────────────────────────────────────────────
By Status         Approved $4,820   Pending $1,200   Paid $4,820   Rejected $230
By Category       Fuel $1,840   Supplies $1,210   Meals $670   Lodging $1,100
By Employee       Hank $2,300   Jacob $1,820   …
```

Drill-down: every receipt with thumbnail link to the receipt detail page.

### 4.5 Mileage

```
MILEAGE                                           May 1 – May 31, 2026
─────────────────────────────────────────────────────────────────────
Total miles 3,420   @ $0.67/mi   = $2,291

Per employee:
  Hank Maddux        1,420 mi    $951
  Jacob Maddux       1,210 mi    $811
  …                   …           …
```

Drill-down: every mileage entry with date / start+end / job link.

### 4.6 Financial roll-up

```
FINANCIALS                                        May 1 – May 31, 2026
─────────────────────────────────────────────────────────────────────
Revenue (jobs completed)                              $42,300
  – Labor cost (hours × rate)                        ($24,503)
  – Receipts (approved + paid)                        ($5,050)
  – Mileage                                           ($2,291)
─────────────────────────────────────────────────────────────────────
Gross margin                                          $10,456     24.7%

Outstanding invoices                                  $11,250
Quotes pending acceptance                             $34,800
```

This is computed by the report endpoint — no schema changes needed.

---

## 5. UI surface

### 5.1 `/admin/reports`

```
┌──────────────────────────────────────────────────────────────────┐
│ Reports                                            Print  Export │
│                                                                  │
│ ┌──── Date Range ────────────────────────────────────────────┐   │
│ │ [Today] [Week] [Month] [Quarter] [YTD] [Custom]            │   │
│ │ May 1, 2026 → May 31, 2026                                 │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌──── Jobs ──────────────────────────────────────────────────┐   │
│ │ … cards from §4 …                                          │   │
│ └────────────────────────────────────────────────────────────┘   │
│ … each subsequent section as its own card …                      │
└──────────────────────────────────────────────────────────────────┘
```

Print stylesheet (`@media print`):
- Hide the rail, the topbar, action buttons.
- Force cards to break cleanly across pages.
- Include org name + date-range subtitle on every page (`@page` header).
- Black-on-white; no gradients.

This means **the same page** is the on-screen report, the print preview,
and the PDF source. Browser → Print → "Save as PDF" produces a
clean, dated, paginated PDF.

### 5.2 `/admin/reports/email-settings` (admin only)

Configures who gets the weekly email + which day of the week. Defaults:
recipient = the org's primary admin email; schedule = Monday 6 AM CST.

### 5.3 Mobile

The same `/admin/reports` URL loads in the Expo WebView Hub shell. The
header "Print" button is replaced with a native **Share** action that
hands off to the OS's PDF generator (iOS → "Print" → "Share" → "Save
to Files" or email; Android → Chrome's print-to-PDF dialog).

---

## 6. API surface

One route does the heavy lifting:

### `GET /api/admin/reports/operations?from=<iso>&to=<iso>`

Admin-only (same role gate as `/admin/audit`). Returns one JSON body
covering all five sections. Shape:

```typescript
{
  range: { from: string; to: string };
  org: { id: string; name: string; slug: string };

  jobs: {
    started: number;
    inProgress: number;
    notStarted: number;
    completed: number;
    lost: number;
    abandoned: number;
    quotedTotalCents: number;
    invoicedTotalCents: number;
    outstandingCents: number;
    details: Array<{
      id: string; name: string; client: string; stage: string;
      result: 'won'|'lost'|'abandoned'|null;
      quoteCents: number; finalCents: number | null;
      dateStarted: string | null; dateDelivered: string | null;
      assignedTo: string | null;
    }>;
  };

  hours: {
    perEmployee: Array<{
      email: string; name: string;
      regularHours: number; otHours: number; totalHours: number;
      laborCostCents: number;
    }>;
    totalRegularHours: number;
    totalOtHours: number;
    totalLaborCostCents: number;
    entries: Array<{ /* drill-down rows */ }>;
  };

  receipts: {
    byStatus: { approved: number; pending: number; paid: number; rejected: number };
    byCategory: Record<string, number>;
    byEmployee: Array<{ email: string; name: string; totalCents: number }>;
    entries: Array<{ id: string; date: string; vendor: string; amountCents: number; status: string; category: string; jobId: string | null }>;
  };

  mileage: {
    totalMiles: number;
    ratePerMile: number;
    totalDollars: number;
    perEmployee: Array<{ email: string; name: string; miles: number; dollars: number }>;
    entries: Array<{ /* drill-down */ }>;
  };

  financials: {
    revenueCents: number;
    laborCostCents: number;
    receiptsCostCents: number;
    mileageCostCents: number;
    grossMarginCents: number;
    grossMarginPct: number;
    outstandingInvoicesCents: number;
    pendingQuotesCents: number;
  };
}
```

Server-side, this hits ~6 queries (one per table) all scoped by `org_id`
+ `date >= from AND date <= to`. Targets < 1s for a year-range query.

### `GET /api/admin/reports/operations.csv?section=<name>&from=<iso>&to=<iso>`

Per-section CSV export. `section ∈ {jobs, hours, receipts, mileage}`.

### `GET /api/admin/reports/operations.pdf?from=<iso>&to=<iso>`

Server-rendered PDF via a print-CSS pipeline (puppeteer or
`@react-pdf/renderer` — see §9 Open question 1). Used by the weekly
email cron to attach the PDF without the recipient needing to click
through.

### `POST /api/cron/weekly-reports`

Vercel cron. Runs every Monday 06:00 CST (12:00 UTC). For every org with
`org_settings.weekly_report_recipients` set:

1. Compute last-week range (previous Mon 00:00 → Sun 23:59 in org's TZ).
2. Call the PDF endpoint internally.
3. Dispatch `weekly_report_ready` event via the existing notifications
   pipeline → email lands in inbox with PDF attached + a one-paragraph
   text summary in the body.

Adds a new entry to `vercel.json` crons:
```json
{ "path": "/api/cron/weekly-reports", "schedule": "0 12 * * 1" }
```

---

## 7. Output formats

| Format | How | Use case |
|---|---|---|
| **HTML on-screen** | Render at `/admin/reports` | Owner clicks date range, sees numbers immediately. |
| **Print → Save as PDF** | Browser print dialog; `@media print` stylesheet | Ad-hoc archive, send via email manually. |
| **Server-rendered PDF** | `/api/admin/reports/operations.pdf` | Used by the weekly cron. Same print stylesheet, rendered headless. |
| **CSV per section** | `/api/admin/reports/operations.csv?section=hours` | Open in Excel / Numbers / Sheets for further analysis. |
| **Weekly email** | `POST /api/cron/weekly-reports` dispatches `weekly_report_ready` | Hand-free: every Monday Hank gets last week's report attached. |

---

## 8. Phased delivery

| Slice | Description | Estimate |
|---|---|---|
| **R-1** | Schema: `jobs.result` + backfill + auto-set on stage→completed | 1 day | ✅ Schema shipped — `seeds/280_reports_job_result.sql` adds `result` / `result_set_at` / `result_reason` columns + CHECK constraint + partial index on `(org_id, result, result_set_at)`. Backfills `result='won'` + `result_set_at = COALESCE(date_delivered, updated_at, created_at)` for every existing row in `stage='completed'`. Auto-set-on-stage-→completed is the next slice (R-10 job-result UI lands the manual lost/abandoned action; the auto-`won` on stage transition piggy-backs there). |
| **R-2** | `/api/admin/reports/operations` GET — all five sections | 3 days | ✅ Shipped — `app/api/admin/reports/operations/route.ts`. Admin-gated, org-scoped, returns jobs (counts by status + result + per-row detail + quoted/invoiced/outstanding totals) + hours (per-employee with OT computed per ISO-week against 40h threshold × 1.5× multiplier + labor cost from `employee_profiles.hourly_rate`) + receipts (by status / category / employee + per-row detail) + mileage (per-employee from `mileage_entries`) + a derived financial roll-up (revenue minus labor + receipts + mileage; gross margin pct). Each section's loader is fault-tolerant — a missing column or table appends to `warnings[]` rather than failing the whole report. Defaults to month-to-date when no `from`/`to` is provided. |
| **R-3** | `/admin/reports` page — header + date range selector + on-screen render | 3 days | ✅ Shipped — `app/admin/reports/page.tsx`. Preset chips (Today / Week / Month / Quarter / YTD / Last 7d / Last 30d / Custom), custom date pickers when "Custom" is selected, range params drive a fresh fetch of `/api/admin/reports/operations`. Five-card layout with stats grid, expandable detail tables, color-coded financial roll-up. Warning banner surfaces any per-section `warnings[]` from the endpoint. |
| **R-4** | `@media print` stylesheet + Print button | 1 day | ✅ Shipped — Print/Save PDF button in the header calls `window.print()`. `@media print` stylesheet on the same page hides the range chips, action buttons, and warning banner; swaps to a print-only header with org name + date range; removes shadows + gradients; forces page-break-inside: avoid on every card; sets letter-size pages with 0.6in margins via `@page`. The browser's Save-as-PDF produces a clean, paginated, dated archive. |
| **R-5** | Per-section CSV exports | 1 day | ✅ Shipped — `app/api/admin/reports/operations.csv/route.ts` returns spreadsheet-friendly rows for `section ∈ {jobs, hours, receipts, mileage}` with proper RFC 4180 escaping + `Content-Disposition: attachment` so browsers download (rather than render). Each card on `/admin/reports` has an "Export CSV ↓" link in the header that hands off the active date range. Print stylesheet hides the links. |
| **R-6** | Server-rendered PDF endpoint (`/api/admin/reports/operations.pdf`) | 2 days | ✅ Shipped — refactored the section loaders out of the JSON route into `lib/reports/operations-data.ts` (`buildOperationsReport()`) so both the JSON, PDF, and weekly-cron paths share one source of truth. New `lib/reports/render-report-html.ts` produces a print-ready HTML document (proper `@page` letter sizing + page-break-inside: avoid + escape-html everywhere). `app/api/admin/reports/operations.pdf/route.ts` runs Playwright + `@sparticuz/chromium` (same pattern as `lib/research/browser-scrape.service.ts`) with `maxDuration: 60`. Returns `application/pdf` with a content-disposition attachment filename. |
| **R-7** | Weekly cron + `weekly_report_ready` email template + Resend attachment wiring | 2 days | ✅ Shipped — `app/api/cron/weekly-reports/route.ts` runs every Monday 14:00 UTC (08:00 CST), pulls every active+trialing org, builds last-week's report → PDF → emails via Resend with the PDF attached. New `WEEKLY_REPORT_READY` template in `lib/saas/notifications/templates.ts` renders the summary (jobs counts, hours total, labor cost, receipts total, mileage, gross margin). `EmailDispatchInput` extended with `attachments[]` field (base64 content + filename + content_type) — wired through to Resend's `attachments` API field. Cron is `CRON_SECRET`-authed. vercel.json updated with `0 14 * * 1` schedule. Audit_log row written per successful send. |
| **R-8** | `/admin/reports/email-settings` admin page | 1 day |
| **R-9** | Mobile: ensure responsive layout works in Expo WebView; add Hub tile | 1 day |
| **R-10** | Job-result UI: "Mark as lost / abandoned" action on `/admin/jobs/[id]` | 1 day |
| **R-11** | Filter the operations report by employee + section toggles | 2 days | ✅ Shipped — `lib/reports/operations-data.ts` accepts a `ReportFilter` with `employeeEmail`. Every section loader respects it: jobs filters by `assigned_to`, hours by `user_email`, receipts by resolved `user_id`, mileage by `user_email`. New `/api/admin/reports/employees` returns the roster. UI: employee dropdown (active + inactive optgroup) and five section-toggle chips on `/admin/reports`; conditional rendering of each card respects toggle state. URL params already encode the active employee through the JSON and PDF endpoints. |
| **R-12** | Per-job report at `/admin/reports/job/[jobId]` (timeline + hours + receipts + mileage scoped to one job) | 2 days |
| **R-13** | Payouts surface: per-employee owed-this-period total + "Record payout" form (Venmo / CashApp / Stripe / Check / Cash) writing to a new `employee_payouts` table | 3 days | ✅ Shipped — schema in `seeds/281_employee_payouts.sql` (org_id + user_email + amount_cents + method enum + reference + period_start/end + paid_at + notes + created_by). `/api/admin/payouts` GET (filterable by employee + method, returns totals + by-method aggregates) + POST (admin-only, audits `PAYOUT_RECORDED`). `/admin/payouts` page: total + per-method pills, record-payout modal (employee dropdown / amount / method / reference / paid-on / notes), filter chips. Method-color pills (Venmo blue / CashApp green / Stripe purple / etc.). |
| **R-14** | Payment report section + `/admin/reports/payments` page showing every payout (in + out) by method/employee/window | 2 days |

**Total: ~2 weeks** with one engineer focused.

---

## 9. Open questions

1. **PDF rendering stack.** Options:
   - Puppeteer / Playwright → headless Chrome renders the live URL.
     Highest fidelity, biggest dependency, slowest cold start. Adds ~200MB
     to the Vercel build.
   - `@react-pdf/renderer` → React components compile straight to PDF.
     Faster, smaller, but requires a separate component tree from the
     HTML view. Mild code duplication.
   - **Recommendation:** Puppeteer behind the `playwright-core` package
     we already use for the research scraper — reuses the existing dep.
2. **Time zone.** Reports should be in the org's local time (most jobs
   logged 8–5 in TX). `organizations.metadata.timezone` doesn't exist
   today — recommend adding (or hard-code `America/Chicago` for Starr v1
   and revisit when the second tenant lands).
3. **Labor cost per hour.** Today `employee_profiles.hourly_rate`
   exists; OT multiplier (1.5×) is fixed. Recommend reading both from
   the employee row at the time of the time-entry to handle rate
   changes mid-period (use `pay_stubs` rate snapshots when available).
4. **Receipts: which date field?** `purchased_at` or `submitted_at` or
   `paid_at`? Recommend **`purchased_at`** so the report shows "money
   spent in this window" regardless of when the receipt was filed.
   Status counts separately reflect paid-vs-pending state at report time.
5. **Drill-down depth.** v1: each section's detail table is the leaf.
   v2 (deferred): click a row → open the underlying job / receipt
   modal inline without leaving the report.
6. **Granularity in the weekly email body.** Full HTML report inline
   vs. summary-paragraph-plus-PDF-attachment? Recommend the latter —
   keeps the email scannable on mobile, the PDF is the canonical
   record.
7. **Multi-employee filter.** Should the report support "only show
   data for these N employees"? Recommend deferring — the per-employee
   breakdown is already in every section, and adding a filter doubles
   the URL state complexity. Future R-11 if requested.

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Year-range query is slow on large orgs | Medium | Indexes on `(org_id, date_*)` already exist for jobs / receipts / mileage; the report endpoint caches per (org, range, day-bucket) for 60s |
| PDF render times out on Vercel function (10s limit) | Medium | Move the PDF route to `maxDuration: 60` in `vercel.json` (same as the research analyze endpoint already uses); use `runtime: nodejs` |
| Weekly cron sends after a row was deleted / corrected | Low | Report shows "as of report generation time"; corrections after the fact appear in next week's diff |
| Owner forwards the PDF externally and exposes PII | Low | Add an "Internal — Do Not Forward" footer; rely on the audit log if a leak investigation is ever needed |
| Mobile WebView print-to-PDF inconsistency | Low | Test on iOS Safari + Android Chrome; if quality varies, fall back to opening the server PDF endpoint directly |

---

## 11. Cross-references

- `docs/planning/completed/STARR_FIELD_MOBILE_APP_PLAN.md` — the mobile
  shell that hosts the Reports tab.
- `docs/planning/completed/MOBILE_MULTI_TENANT.md` — org-scoping for the
  mobile session (the report URL inherits the active org).
- `docs/planning/completed/CUSTOMER_PORTAL.md` §11 — RLS / admin gating
  pattern this report follows.
- `vercel.json` — where the new weekly cron schedule lands.
- `lib/saas/notifications/templates.ts` — where the
  `weekly_report_ready` email template lives.
- `app/api/admin/audit/route.ts` — the gate pattern (admin-only +
  org-scoped) this endpoint copies.

---

## 12. Definition of done

The reports feature is complete when:

1. An admin opens `/admin/reports`, picks "This Month", and within 2
   seconds sees a fully-populated five-section report.
2. The admin clicks Print, the browser opens a print preview, and the
   saved PDF is clean, paginated, and includes org name + date range
   in the header.
3. Each section has a working "Export CSV" button.
4. The owner gets an email every Monday at 6 AM CST with last week's
   report PDF attached + a summary in the email body.
5. The same `/admin/reports` URL renders correctly on iOS Safari and
   Android Chrome, and the share action produces the same PDF.
6. Marking a job `lost` or `abandoned` from `/admin/jobs/[id]` is one
   click, requires a reason, writes an `audit_log` entry.
7. Year-to-date for a busy org returns in under 2 seconds on cold cache.
8. Every report query is `org_id`-scoped (verified by a vitest case
   that asserts a second-tenant row never leaks).
