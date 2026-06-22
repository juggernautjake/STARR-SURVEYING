# Payment portal discoverability + deferred-items build-out — 2026-06-22

**Status:** in-progress
**Owner:** Jacob Maddux
**Branch:** `claude/gifted-ramanujan-lQaEI`

## 0. Purpose

The customer-facing payment portal at `/pay` was built in
`payment-infrastructure-2026-06-18.md` (P0–P9) and
`CUSTOMER_INVOICING_BUILD_2026-06-21.md` (S0–S7), but **nothing on the
public site links to it**. A customer who hasn't been emailed a direct
invoice link literally cannot find the portal without typing `/pay`
into the address bar.

This plan closes that discoverability gap **and** picks up the other
deferred items in the same branch so we can ship the full payments
story end-to-end:

1. Public discoverability (Header + Footer + scattered marketing CTAs)
2. Navbar geometry verification (the parallelogram clip-path background
   has to be wide enough to host a new nav item)
3. Invoice composer polish (link an invoice to an existing job at
   create-time, link an existing customer)
4. Plan + slice schedule for **Research Phase II** (Playwright +
   AI-vision self-healing) — the only remaining "deferred until human
   go-ahead" item from the outstanding-list

## 1. State audit

| Surface | What's there today | What still needs work |
|---|---|---|
| `/pay` landing | Single field invoice lookup, PayGate password wall, brand-aligned hero. Mobile-first. | None — content is done. |
| `/pay/[invoice]` | Full invoice view, payment-method picker, deposit-rule enforcement, Stripe + cash/check pledges, receipt page. | None — done. |
| `/api/public/invoice/*` | GET, intent, attempt, receipt, receipt PDF. | None — done. |
| `/api/public/pay-gate` | GET (required + unlocked check), POST (unlock with password). | None — done. |
| `customer_invoices` table | Renamed at create-time (seed 323) to avoid SaaS-billing `invoices` collision. Every API uses the renamed table. | None — done. |
| `/admin/invoicing` dashboard | Card grid, search, status-tone color, linked-job badge, copy direct link, view button. | None — shipped earlier today. |
| `/admin/invoices/new` composer | Customer fields, line items, tax, due date, notes, deposit rule, create + send, copy link. | **Linking to an existing job** at create-time (currently free-text only). **Customer-contact picker** so you don't retype on every invoice. |
| Public site discoverability | **Zero links**. Header + Footer + marketing pages don't mention `/pay` anywhere. | **Build out (this plan, S1–S4).** |
| Navbar background | Parallelogram clip-path (`clip-path: polygon(0 0, 100% 0, 100% 100%, 10% 100%)`). Width is `auto` with `max-width: 90%`. | Verify the polygon still looks right when we go from 8 → 9 nav items. |
| Research Phase II self-healing | Plan + apply-policy + safety-flagged. Slices not built. | **Build the slice schedule (S5).** Execution gated on user go-ahead but the slice plan should be queued. |

## 2. Slice schedule

### S1 — Public-site link surfaces (Footer + Header)

**S1a — Footer.** Add a `payLinks` array next to `quickLinks` /
`serviceLinks`. Surface a new column or a new entry under "Quick
Links" called **"Pay an invoice"** that routes to `/pay`. The footer's
column grid already supports four columns; we add the "Pay invoice"
row under "More Info" so the column count stays steady and the bottom
bar's "Need to pay an invoice? Click here →" mini-CTA fits in the
existing right-side stack next to the Employee Login link.

**S1b — Header / Navbar.** Add a navbar item `{ href: '/pay', label:
'Pay Invoice' }` between Contact and the (mobile) hamburger. The
desktop nav `clip-path` polygon auto-extends via `width: auto`; we
verify the left-extend leg still reads as a parallelogram (no clipping
artifacts) by adjusting `--navbar-left-extend` if the new wider nav
shrinks the slope.

Also style the new link with a subtle accent (green pill or the same
`navbar__link--pricing` red treatment) so it reads as a CTA-flavored
item, not just a 9th regular link.

**S1c — Scrolled mini-nav.** The compact bar that appears after scroll
also needs the link. Add it next to "Get Free Quote" since both are
high-intent customer actions.

### S2 — Scattered marketing-page CTAs

Drop a `Need to make a payment? Click here →` ribbon on:

- **`/contact`** — under the contact form, since "I need to pay" is a
  reasonable interpretation of "contact us about my invoice."
- **`/services`** — a single sentence at the bottom of the services
  list ("Already a customer? Pay your invoice").
- **Home page hero or below-fold** — a low-key chip under the
  primary CTA.
- **`/pricing`** — small footer note pointing existing customers to
  `/pay`.

All four reuse one component (`<PayInvoiceCTA />`) so copy + styling
stay consistent and we can flip one variable to change wording later.

### S3 — Navbar geometry

Re-check `app/styles/Header.css` after S1b lands:

- `clip-path: polygon(0 0, 100% 0, 100% 100%, 10% 100%)` — verify the
  10% bottom-left corner still looks intentional (not pinched) at the
  new width.
- `--navbar-left-extend: 90px` — bump to ~110px if the new wider nav
  shrinks the slope angle visibly.
- Mobile dropdown — confirm the new link slots into the dropdown
  cleanly + still bottom-aligns with the menu trigger.

### S4 — Invoice composer polish

`/admin/invoices/new`:

- **Job picker.** Replace the absent `job_id` input with a typeahead
  that hits `/api/admin/jobs?search=…&limit=10` and lets the user pick
  an existing job. Falls back to an "(unlinked)" pill when omitted.
  POST body includes `job_id` — the dashboard's already-shipped
  job-badge will then light up for these invoices.
- **Customer-contact picker.** If the user types an email/name and we
  already have it in `contacts`, surface a small "Use existing
  contact →" chip that prefills name, phone, billing address from the
  contact row. The composer keeps the free-text path for one-off
  customers.
- **Validation polish.** Highlight the deposit-rule preview
  (`depositPreviewCents`) when it exceeds the total — same `tone:
  warn` color as the dashboard.

### S5 — Research Phase II slice plan

`docs/planning/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md` already
defines the architecture. This plan picks up where that one stops and
defines the **slice schedule for execution**, gated behind the two
existing flags:

- `RESEARCH_SELF_HEAL_AUTOAPPLY` — must default OFF; queued repairs
  land in a review queue, never auto-applied.
- `RESEARCH_SELF_HEAL_SCHEDULE` — must default OFF; the cron loop is
  manual until we trust the detection.

The slice schedule:

**Phase II.A — passive monitoring (low risk).**

- **R1** — Adapter health check: hit each county's search URL with a
  HEAD request, parse the response, record latency + status into
  `research_adapter_health` (already exists from seed 371).
- **R2** — DOM-shape snapshot: extract a stable hash of the search
  form's structure (input names, button positions, hidden-field
  defaults) and store it. Use the existing `playwright` package
  available in `node_modules` per the prior plan.
- **R3** — Snapshot diff job: when R1 / R2 detect drift, write a row
  to `adapter_anomalies` (new table). No auto-action — just a
  notification feed.

**Phase II.B — assisted repair (medium risk).**

- **R4** — Repair-suggestion endpoint: given an anomaly row, run an
  AI-vision pass over the live page vs the last-good snapshot,
  propose a diff to the adapter's `selectors` JSON.
- **R5** — Review UI at `/admin/research/repairs` lists pending
  repairs with side-by-side before/after, "Approve" + "Reject"
  buttons. Approve writes the new selectors; reject closes the row.

**Phase II.C — generic Playwright fallback (high risk, off by default).**

- **R6** — When no vendor adapter matches a county, drive Playwright:
  open the search URL, locate the search form via heuristics
  (`form:has(input[name~='deed' i])`, etc.), submit, parse the
  results table. Capture both screenshot and DOM for the review UI.
- **R7** — Adversarial verification: for every result, take a fresh
  Playwright screenshot + parsed values, ship to an AI-vision model
  to confirm the parsed values match what the page renders. Catch
  hallucinated rows.
- **R8** — Rate limiter + jitter: at most N requests per host per
  hour, randomized so we don't look like a bot. Hard-blocked from
  ever solving captchas — if a captcha appears, the row is flagged
  for human follow-up.

**Phase II.D — automation flips (only when user explicitly approves).**

- **R9** — Flip `RESEARCH_SELF_HEAL_AUTOAPPLY` to ON for low-risk
  repair types (selector renames, attribute tweaks). High-risk
  (entire form re-walks) stays manual.
- **R10** — Flip `RESEARCH_SELF_HEAL_SCHEDULE` to ON to run the
  monitoring loop every 6 hours.

## 3. Execution order

S1 → S2 → S3 (this branch, this session).
S4 (this branch, this session if budget allows; otherwise next session).
S5 — slice plan is documented above; actual execution is a separate
multi-week build that needs explicit user go-ahead per slice. Not
shipped in this session.

## 4. Tests

- `__tests__/components/footer.test.tsx` — assert the Pay invoice link
  exists in the footer DOM and points at `/pay`.
- `__tests__/components/header.test.tsx` — same for the desktop nav.
- `__tests__/components/pay-invoice-cta.test.tsx` — pure render check
  on the shared CTA component.
- Visual regression — none added in this session; the navbar polygon
  is exercised by manual review.

## 5. Rollback

Every slice is purely additive — new links, a new CTA component, a new
job-picker dropdown. If anything looks wrong:

- Revert the slice's commit.
- The `/pay` portal itself is untouched.
- The under-construction PayGate password wall stays in effect, so
  even if a stray link slips out to a customer before we're ready,
  they see the password prompt rather than a half-built payment page.
