# Money area catalogue

Entries are in `money.json` (33 entries, `area: "money"`). Every claim there cites `file:line`.

## What the area is for

Get the firm paid and know where the money went. That means:

- quote the work and get it accepted;
- invoice it and take payment;
- track expenses (receipts, cards, mileage);
- pay people;
- reconcile to the bank and hand the CPA clean numbers.

It also holds the platform's own SaaS subscription screens (`/admin/billing`, `/pricing/software`), which are the operator's business and not the firm's.

## How the parts fit

After the 2026-08 consolidation there are four tabbed portals behind a `/admin/money` landing page. Most of the old routes are one-line redirects.

| Portal | Tabs | Notes |
|---|---|---|
| Customer Money, `/admin/invoicing` | Invoices, Collections, Incoming, Categories | Invoice composer is separate, at `/admin/invoices/new`. |
| Books and Tax, `/admin/finances` | Overview, "Job profitability", Reconcile, Payroll tax, Reports | The "Job profitability" tab is actually the Schedule C tax report. |
| Receipts and Cards, `/admin/receipts` | Queue, Cards, Rebilled, Mileage | About 10,800 lines, with a 2,532-line queue component. |
| Billing, `/admin/billing` | Overview, Invoices, Plan history | Software subscription only. |

- **Public pages:** `/pay`, `/pay/[invoice]`, `/proposal/[token]`, `/change-order/[token]`, `/portal/[token]`, `/pricing` (services) and `/pricing/software`.
- **Adjacent, mostly the people area:** payouts, checks, NACHA and payroll. These are covered by one entry (`money.payouts-rails`).

## The flow: quote, invoice, payment, reconciliation

1. **Quote.** An admin API appends proposal versions to `lead_quotes` and sends a tokenised link. The customer types their name on `/proposal/[token]`. Acceptance writes evidence, creates the **job**, and marks the lead won.
   - **Break:** no admin screen calls the proposals, change-orders or portal-access APIs. Only tests do. The front half of the flow cannot be driven from the product.
   - **Break:** acceptance does not create an invoice or ask for a deposit.
2. **Invoice.** Office staff retype the customer and line items in the composer.
   - They type the tax amount by hand.
   - They set an optional deposit rule.
   - "Create and send" emails a `/pay/<slug>` link through Resend.
   - Change orders and receipts to rebill are not pulled in.
3. **Payment.** The customer chooses a method.
   - **Stripe card or bank.** The PaymentIntent route returns 503 until `PAYMENTS_LIVE=true`. The webhook then writes a `payments` row and sets the invoice to paid or partial.
     - It sends no receipt, records no fees or payout, and handles no refund, dispute or ACH return.
   - **Venmo, Cash App or Zelle.** The customer taps a deep link and claims "I sent it".
   - **Cash or check.** The customer pledges.
   - Claims land in the Incoming tab. Staff compare them by eye against their Venmo or bank history and press "Mark cleared". That writes a payment, updates the invoice and emails the receipt.
4. **Reconciliation.** The Reconcile tab imports a PNC CSV and suggests matches to payouts, expenses and customer payments.
   - It is independent of invoice status. An invoice becomes paid by a click or a webhook, never by the bank row.
   - There is no ledger. Stripe deposits (net of fees, with several charges bundled in one payout) cannot be matched.
   - Collections (aging) is read-only. There is no dunning.

## Main user journeys

- **Office manager sends an invoice.** Invoices tab, New invoice, retype everything, send. Works, but slow and error-prone.
- **Customer pays.** `/pay/<number>`. Works for viewing. Card payment is off until the owner finishes the pending checklist.
- **Bookkeeper clears incoming money.** Incoming tab, one click per claim. Works but is manual.
- **Crew member files a receipt.** Capture page or mobile app. AI reads it. The bookkeeper approves in the slideshow, which also deals with duplicates, payer and card role. This is the most developed part of the area.
- **Owner at tax time.** The "Job profitability" tab (Schedule C), the Payroll tax tab (1099 flags) and CSV exports to the CPA.

## Duplicates and overlaps (what to merge or remove)

- **Billing vs Invoicing vs Finances.** Three portals, three meanings of "invoice" and "finances".
  - Billing is the software subscription: Stripe subscription invoices in the `invoices` table.
  - Invoicing is customer invoices, in `customer_invoices`.
  - Finances is books, tax and reports.
  - Move Billing to Settings and use Stripe's hosted customer portal. Then Billing, its invoices tab and the upgrade page vanish from the firm's money menu.
- **Invoices list vs Collections.** The same invoice set shown twice. Collections should be an aging filter on the invoice list plus automated reminders.
- **Incoming (payment claims) vs Reconcile (bank rows).** Two queues for the same question, "did this money arrive?". They should be one bank-driven "Money in" queue where claims only boost the match score.
- **Overview vs Reports vs "Job profitability".** Three money-in-vs-out views. The job-margin view that is actually useful lives at `/admin/reports/job/[id]`, behind a link in another tab. It belongs on the job page.
- **Categories tab.** It edits allocation percentages, and nothing allocates payments with them (the engine is imported only by report and editor code). Its hint claims it is "the line items invoices are built from", which is wrong. Remove it, and build a real service catalogue instead.
- **Receipts review.** Row-expand editor, slideshow, deep read, duplicate review and payer panel all serve one decision. Keep the slideshow as the single path.
- **Customer entry points.** `/pay` by invoice number and `/portal/[token]` by job token. One per-job customer link would do.
- **Capture.** The web capture page and the mobile app both capture receipts.
- **Stale plan.** `docs/payments-invoices-collision-2026-06-21.md` still says "BLOCKED", with `/pay` broken on live. The code already uses `customer_invoices` in about 20 places and `invoices` in only two. Mark it resolved after checking the live schema (not verified here).

## Biggest problems

1. **Quote-to-cash is not connected.** The proposal and change-order screens do not exist. Acceptance does not feed an invoice. Invoices are retyped. This is the main thing the owner would feel.
2. **Payments are not live and are single-tenant.**
   - `PAYMENTS_LIVE` is off.
   - Venmo, Cash App and Zelle handles are constants in `lib/payments/live.ts`.
   - The checklist items for live Stripe keys, the publishable key and handle verification are still the owner's.
   - The Stripe flow has no refund, dispute, ACH-return, fee or payout handling.
3. **No accounting integration and no ledger.** The app builds a mini set of books (overview, reconcile, tax summary) in place of syncing to QuickBooks or Xero. A CPA cannot audit it.
4. **Tax.** Sales tax is a hand-typed number. Tax reporting is Schedule C only, so there is nothing for an LLC or S-corp. 1099 handling has only a fixed $600 flag and no W-9 or TIN collection, no filing and no vendor 1099s.
5. **Multi-firm scoping.**
   - The invoice list and several admin routes query by role only, with no org filter.
   - `org_id` defaults to the Starr org UUID in seed 323.
   - The PDF letterhead says "STARR SURVEYING".
   - The composer placeholder and the card-form colours are Starr's.
   - The reconcile parser handles only PNC.
   - The mileage rate is a 2025 constant.
   - `/pricing` is Texas-central price ranges in JSX.
6. **Size and clutter.** The receipts area is about 10,800 lines. `QueueTab` is 2,532 lines, `ScheduleCTab` 1,008, `invoices/new` 889 and `billing` 847.
7. **Dead or unreachable.** The categories and allocation engine, the finance audit and compare APIs (no visible entry), and the proposals, change-orders and portal-access APIs.

## Integrations a nationwide firm expects

| Integration | State today | Priority |
|---|---|---|
| QuickBooks Online | None. CSV export only (mentioned in comments). | P1 |
| Xero | None. | P1 |
| Stripe | Partial. Platform key, PaymentIntent and one webhook. No Connect, so each firm cannot hold its own funds. No refunds, disputes, fees or payout capture. | P1 |
| ACH | Only the Stripe `us_bank_account` method id. No micro-deposit or Financial Connections flow, no ACH-return handling. Outbound ACH is a NACHA file for payouts, per the autopilot plan. | P1 |
| Sales tax by state | None. One manual dollar field. Needs per-firm registration states, taxable service flags, rate lookup by job address (Stripe Tax, Avalara or TaxJar, or the accounting package), exemption certificates and a report. | P1 |
| Bank feeds | None by design. Only a PNC CSV. Needs Plaid or an accounting-package feed and generic CSV or OFX mapping. | P1 |
| Payroll and 1099 filing | In-house payouts and a report. Needs a payroll provider (Gusto, ADP, Check) and a 1099 e-file service, plus W-9 collection. | P1 |
| E-signature | Typed name and optional drawn image. Adequate as evidence, but has no signer email verification. | P2 |
| Check printing, PayPal Payouts, cards | Built on a branch per the autopilot plan. Whether it is merged and live is unconfirmed (status unknown). | P2 |

## Rebuild recommendation

Treat money as one workspace with one chain: **proposal, job, billing schedule (deposit, milestones, change orders, billable expenses), invoice, payment, bank match, accounting package.**

- **Proposal.**
  - Build the missing proposal and change-order screens on the lead and job pages.
  - Acceptance creates the job and the deposit invoice.
  - The same page takes payment.
- **Invoice.**
  - Built from the billing schedule, not typed.
  - Per-line taxability, with the rate computed from the job address.
  - PDF and email preview.
  - Credit memos and void.
- **Payment.**
  - Stripe Connect per firm, with ACH as the default for large invoices.
  - Per-org settings for the offered methods and handles.
  - Webhook handling for refunds, disputes and ACH returns, plus fee and payout capture.
- **Money in.**
  - One queue driven by bank deposits.
  - Customer claims only hint at a match.
  - Reminders replace the read-only Collections tab.
- **Books.**
  - Use QuickBooks Online and Xero as the ledger, with a connector layer that maps customers, invoices, payments, expenses, and jobs as classes or projects.
  - Keep a small Books dashboard that reads from them.
  - Drop the home-made P&L, allocation buckets and per-bank CSV parsing.
- **Expenses.** Keep the receipts slideshow, card register, rebilled flow and mileage, and trim to one review path. Push approved expenses to the accounting package. Add email-in receipts.
- **Tax and people.** Entity-aware tax export, W-9 and 1099 handling, and payroll through a provider. Keep the payout rails for contractors and vendors.
- **Software billing.** Move to Settings and use Stripe's hosted portal.
- **Configuration.** All of: handles, firm name and logo, price lists, mileage rate by year, states and tax rules, and the bank format must come from per-org settings and not from code.

Suggested order:

1. Org scoping and the per-org payment settings.
2. Proposal, billing schedule and invoice from job.
3. Stripe Connect plus refund and dispute handling.
4. QuickBooks Online sync.
5. Sales tax.
6. Bank feed.
7. Merge the duplicate screens.
