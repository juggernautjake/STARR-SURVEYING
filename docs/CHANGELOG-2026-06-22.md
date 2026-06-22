# Shipping log — 2026-06-22

## Customer Invoicing + Payment Portal (Phase 2) — COMPLETE

Built the full customer invoicing feature the owner specified: a frontend
portal where customers enter an invoice number (or follow a direct link) to see
their bill and pay, and a backend composer to create/track invoices — with
upfront/deposit rules and cash / check / Venmo / Stripe methods.

Branch: `claude/sitewide-ui-audit-2026-06-20`. Plan:
`docs/planning/completed/CUSTOMER_INVOICING_BUILD_2026-06-21.md`.

| Slice | What shipped |
|------|--------------|
| S1 | **Un-collision** — gave Feature B its own `customer_invoices` table (seed 323 + 10 routes + rls-allowlist + audit script + 3 test suites), applied to live; the live Stripe SaaS-billing `invoices` table is untouched. |
| S2 | **Upfront/deposit** — `customer_invoices.deposit_type/value/amount_cents/upfront_paid_at` (seed 360) + `lib/payments/upfront-rule.ts` (`resolveDepositAmountCents`, `decideUpfrontAcceptance`, 14 tests); create route resolves the upfront at create time. |
| S3 | **Enforcement** — `/intent` + `/attempt` reject (HTTP 422 + message) when a payment is below the upfront on the first payment or above the remaining balance; intent accepts an optional partial amount. |
| S4 | **/pay UX** — customer chooses how much to pay (clamped to [upfront-due, balance]) with a required-upfront banner + inline error mirroring the server rule. Fixed a latent bug where the public balance never decreased (payments queried with a missing `id`). |
| S5 | **Composer** — `/admin/invoices/new` gets a none/percent/fixed upfront picker with a live preview, plus Copy-link / Open-customer-page on success. |
| S6 | **Dashboard + nav** — `/admin/invoicing` (list, search, status, view + copy-link), registered in the Office workspace nav. |
| S7 | **Launch gate** — temporary password wall on `/pay` (`PAY_PORTAL_PASSWORD`, server-validated, httpOnly cookie); backend admin pages need no extra password. Clearing the env var opens the portal at launch. |
| S8 | **Fixtures** — 6 `[TEST]` invoices on live (every upfront state) for click-through testing (seed 363). |

### Owner action items
- **Enable the launch gate:** set `PAY_PORTAL_PASSWORD` in Vercel prod (local is
  `starr-preview`). Clear it at launch to open the portal.
- **Go live on real money:** flip `PAYMENTS_LIVE=true` (Stripe) only after a
  Stripe test-mode payment. Until then, card pay shows "not yet enabled";
  cash/check/Venmo pledges already record.
- **Remove test data when done:** `DELETE FROM customer_invoices WHERE
  invoice_number LIKE 'TEST-%';`

### Notes
- Pre-existing/unrelated: `__tests__/admin/nav-store.test.ts` (15) needs a DOM
  test env (jsdom/happy-dom) not installed in the repo; left untouched.
- The Property-Research self-healing build is specced
  (`docs/planning/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md`, Part II) but not
  implemented here — its work-order prerequisites live on another branch.
