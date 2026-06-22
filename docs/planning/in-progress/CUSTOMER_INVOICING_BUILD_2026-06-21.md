# Customer Invoicing + Payment Portal — build plan (2026-06-21)

**Owner intent (verbatim, 2026-06-21):** A frontend customer portal where a
customer enters their invoice number (or follows a direct link) to see their
billing info and pay. A backend invoice builder where we input customer +
billing info and create the stored invoice, accessible by us or by the customer
once they have the number. Generate a link straight to the digital invoice page.
Customers must pay **≥ the upfront amount we set (which can be $0)** and **≤ the
total** — never less than the upfront on the first payment, never more than the
total. Methods: **cash, check, Venmo, or Stripe.**

**Password gating (owner, 2026-06-21):** Backend admin invoice pages need **no**
extra password — admin login already gates them. The **frontend `/pay` portal**
should load but require a **temporary password** until the system is fully
built; remove the gate at launch.

## Architecture decision
Live `invoices` is the **Stripe SaaS-subscription** table (Feature A) — leave it
100% untouched. The customer-job-invoicing feature (Feature B) was authored on a
colliding `invoices` name and never applied to live. **Resolution: build Feature
B on its own `customer_invoices` table** (rename at the source, not a live-table
rename). New tables on live = non-destructive, zero billing risk.

Reuse the existing, well-built Feature-B foundation: seed 323 schema, the `/pay`
portal, the public/admin APIs, and the `lib/payments/*` helpers. Build the gaps:
upfront/deposit rules (missing), the `/admin/invoicing` dashboard + nav, and the
temporary `/pay` password gate.

**`PAYMENTS_LIVE` stays `false`** — everything ships ready; flipping it to move
real Stripe money is the owner's call after a Stripe test-mode transaction.

## Slices
- [x] **S1 — Un-collision: `invoices` → `customer_invoices`.** Shipped
  2026-06-21 (commit c0a8e7bb). Seed 323 + 10 routes + rls-allowlist + audit
  script + 3 test suites repointed; applied to live (5 tables created, Feature-A
  Stripe `invoices` untouched); 154 payment tests pass. Also ran full idempotent
  `db:seed:all` — verified all needed seeds applied (skips are pre-existing
  buckets / already-applied policies / deferred-G4 buildout). Rewrite seed 323
  (table, indexes `idx_customer_invoices_*`, 4 FK refs, trigger array, RLS
  policy). Repoint Feature-B `.from('invoices')` → `customer_invoices`: 5
  `api/public/invoice/*`, 3 `api/admin/invoices/*`, 2 `api/admin/payment-attempts/*`,
  webhook customer-payment branch (lines 391/421 only). Update
  `lib/payments/rls-allowlist.ts` + the 3 affected test suites
  (payment-foundations, payment-office-closeout, payment-rls-audit). Apply seeds
  323-327 to live; verify all 5 tables exist. Leave Feature-A sites alone.
- [x] **S2 — Upfront/deposit columns + resolver.** Shipped 2026-06-21 (adb73f0a).
  seed 360 applied; upfront-rule.ts (14 tests); create route stores deposit. New seed
  `360_customer_invoice_deposits.sql`: `ALTER TABLE customer_invoices ADD COLUMN
  IF NOT EXISTS deposit_type TEXT CHECK (deposit_type IN ('none','percent','fixed'))
  NOT NULL DEFAULT 'none', deposit_value NUMERIC(12,2), deposit_amount_cents BIGINT
  NOT NULL DEFAULT 0, upfront_paid_at TIMESTAMPTZ`. New
  `lib/payments/upfront-rule.ts`: `resolveDepositAmountCents` +
  `decideUpfrontAcceptance` (pure, vitest-tested). Wire resolve into invoice
  create so `deposit_amount_cents` is set at create time. Apply seed.
- [x] **S3 — Enforce the rule in payment paths.** Shipped 2026-06-21 (caef4a8c).
  intent + attempt return 422 + message when below upfront / above balance;
  intent accepts optional amount_cents. `intent` + `attempt` routes
  call `decideUpfrontAcceptance`; reject with HTTP 422 + message when below the
  upfront on the first payment, or above remaining balance / over total.
- [x] **S4 — Customer `/pay` upfront UX.** Shipped 2026-06-21. Amount selector
  (defaults to balance, clamped min=upfront-due / max=balance) + required-upfront
  banner + inline error mirroring the server rule; also fixed a latent bug where
  the public GET queried payments with a missing `id` (balance never decreased).
  Excluded stale `.claude/worktrees` from vitest. Banner "Your first payment must be at
  least $X" when `deposit_amount_cents > 0 && prior_paid < deposit`; constrain
  the amount input min (upfront-due) / max (balance).
- [ ] **S5 — Composer deposit picker.** `/admin/invoices/new`: none / percent /
  fixed + value input; show resolved upfront $ live; surface the generated
  invoice number + copyable pay link + send-email action.
- [x] **S6 — `/admin/invoicing` dashboard + nav.** Shipped 2026-06-21. Built the
  dashboard (list w/ status pills, search, view + copy-link actions, links to
  composer + payments inbox); registered `/admin/invoicing` in route-registry
  (Office, FileText icon). 35 registry tests pass. List invoices (status,
  customer, total, balance, upfront-met), links to composer / payments inbox /
  copy-link / view / send. Register the route in `route-registry.ts` (Office).
- [ ] **S7 — Password gating.** Remove any special-password gate from backend
  admin invoice pages (admin login suffices). Add a temporary env-gated password
  wall to the `/pay` portal (+ public invoice view), removable at launch via flag.
- [ ] **S8 — Mock-customer harness + verify.** Seed a few fixture invoices
  (no-upfront, percent, fixed, partial-rejected, exact-upfront, full-pay,
  overpay-rejected, voided) for end-to-end testing; final typecheck + lint +
  full payment suite.

## Gates (ask before executing)
- **Flipping `PAYMENTS_LIVE=true`** — moves real money. Owner flips after a
  Stripe test-mode payment. NOT done in this build.
- Applying the new `customer_invoices` tables to live is non-destructive
  (CREATE IF NOT EXISTS, never touches Feature-A `invoices`) — proceeding per
  owner's "rename/rebuild as makes sense — go ahead."
