# Business Go-Live — Payments, Finance, Mobile & Deploy

**Status:** 🟡 In progress — master plan (created 2026-06-25).
**Owner:** Jacob (Starr Software / Starr Surveying).
**Legal entity:** STARR TECHNICAL SERVICES, INC. (EIN on file — never committed).
**Brands:** *Starr Software* = developer/app brand (bundle `com.starrsoftware.starrfield`); *Starr Surveying* = customer-facing brand (invoices, `/pay`, `@StarrSurveying`).

## How this doc is driven
Stop-hook style: next unchecked slice → read live code → smallest shippable change →
typecheck + lint + test → commit + push → check the box + note what shipped. Each
slice is tagged **[me]** (code/config I do) or **[you]** (account/identity/banking
you do — I pull up the page + guide every click; I cannot enter your SSN/bank/2FA).

---

## 1. Goals (consolidated from the owner's asks this session)

1. **Customer payments online:** Stripe (card/ACH) **+ Venmo + cash/check** options.
2. **Pay employees weekly** via **Venmo or Stripe**, fully tracked.
3. **Complete financial visibility:** money **IN** (how much, from where, when) and
   **OUT** (expenses + payouts, when); save receipts; **reconcile every bank
   withdrawal** to either a payout or a business expense; complete finance reports;
   file taxes easily; **track cash/check payments to employees**.
4. **Handle 1099 vs W-2 employees appropriately.**
5. **`info@starr-surveying.com`** receives customer email and forwards to Hank
   (`hankmaddux@`) + Jacob (`jacobmaddux@`).
6. **Mobile apps** ("Starr Field") onto employee phones.
7. **Every SQL seed applied to the live database**; schema fully fleshed out for
   everything built and to-be-built.
8. **Go live** (production deploy).
9. Build it all, **in order**, tracked by this document.

---

## 2. What already EXISTS (inventory — do NOT rebuild)

| Area | Where | State |
|---|---|---|
| Customer invoicing + `/pay` portal | `app/pay/*`, `app/admin/invoices/new`, `customer_invoices`, seeds 323/324 | Built; gated by `PAYMENTS_LIVE` |
| Stripe **backend** (PaymentIntent + webhook) | `app/api/public/invoice/[number]/intent`, `app/api/webhooks/stripe`, `lib/payments/stripe.ts` | Built |
| Deep-link methods (Venmo/CashApp/Zelle) + cash/check pledge | `app/pay/[invoice]`, `lib/payments/live.ts` | Built + wired |
| Receipts (email + PDF), return-to-portal | `lib/payments/receipt-pdf.ts`, `app/api/public/invoice/.../receipt*` | Built |
| Employee **payouts** (weekly batch → approval → dispatch → audit → tax export, ACH-CSV for PNC, ad-hoc bonuses, cash) | `app/admin/payouts/*`, `lib/payouts/*`, seeds 325/326 | Built |
| Business **expenses** = receipt capture (mobile AI extract → admin approval), IRS Schedule-C categories, tax flags, vendors, retention | `app/admin/receipts/*`, mobile `lib/receipts.ts`, seeds 220/230 | Built |
| **Revenue allocation** engine (categories, target %, variance, revenue-by-period) | `lib/payments/allocation-*`, seed 374 | Built |
| **Tax-time finances** (Schedule-C summary, mileage deduction at IRS rate, period locking, CSV for CPA) | `app/admin/finances`, `app/api/admin/finances/*` | Built |
| Equipment **depreciation** + tax-asset schedules | `lib/equipment/depreciation.ts`, `app/api/admin/equipment/asset-detail-schedule` | Built |
| Payroll / pay progression / my-pay | `app/admin/payroll/*`, `app/admin/pay-progression`, `app/admin/my-pay` | Built |
| Outbound email (compose to customers/employees, templates, role broadcast, sent log) via **Resend** | `app/admin/email/*`, `lib/email/templates.ts`, seed 381 | Built |
| Mobile app "Starr Field" (Expo/RN) — jobs, time/GPS, capture, money, receipts, Apple Sign-In, offline sync, OTA | `mobile/*` | Built; needs store accounts |
| `/admin/install` distribution page + env links | `.env` `NEXT_PUBLIC_MOBILE_*` | Built |
| Go-live guide / Vercel env checklist | `docs/GO_LIVE_GUIDE.md`, `docs/VERCEL_ENV_CHECKLIST.md` | Built (reference) |

---

## 3. Real GAPS to build

- **G1 — Stripe customer card form** (Elements front-end). Backend exists; the in-page card UI does not (`@stripe/stripe-js` not installed; the card button still toasts "not yet wired").
- **G2 — Unified finance dashboard** (money IN vs OUT / P&L / cash-flow over time). No combined view today (revenue allocation and Schedule-C expenses live on separate pages; no net-income/cash-flow rollup). Confirmed: no P&L/income-statement code.
- **G3 — Bank reconciliation.** No bank-feed / `bank_transactions` table today. Need to import PNC transactions and match each withdrawal to a payout or a receipt/expense; surface an "unmatched" queue.
- **G4 — Stripe payouts to employees** (Stripe Connect/transfers). Today payout dispatch does Venmo/CashApp/Zelle deep-links + cash + ACH-CSV; the `stripe` method is a deferred stub. Confirmed: no `transfers.create`/Connect code.
- **G5 — 1099 vs W-2 worker classification.** Payout tax-report explicitly leaves this to the preparer. Need a classification field + appropriate handling (1099-NEC ≥ $600 tracking, W-2 vs 1099 split in tax reports, dispatch/labeling).
- **G6 — Live-DB completeness.** Verify all 192 seeds are applied to live Supabase; apply any missing (never `000_reset.sql`); confirm storage buckets.

---

## 4. Phased roadmap (ordered)

### Phase 0 — Database is complete (foundation) **[me]**
Everything else assumes the live schema exists.
- [x] **0.1** ✓ 2026-06-25 — read-only audit via `SUPABASE_DB_URL` found the 10 newest
  seeds (370–381) un-applied (214 tables present). **Never ran `000_reset.sql`.**
- [x] **0.2** ✓ 2026-06-25 — applied 370–381 via `node scripts/apply-seeds.mjs --from 370`
  (`npm i pg --no-save` first); re-audit → **228 tables, 0 real missing**.
- [ ] **0.3** Confirm storage buckets exist (`message-attachments`, `receipts`,
  `lead-attachments`, `user-files`) with the service-role policies the seed comments
  describe (bucket policies are dashboard-side, not SQL) **[you, I provide exact list]**.

### Phase 1 — Finish customer payments code **[me]**
- [x] **1.1** ✓ 2026-06-25 — shipped `lib/payments/stripe-elements.ts` (pure helpers:
  publishable-key gate, `?paid=1` return URL, intent-response interpreter — sourced-locked
  by `__tests__/admin/payment-stripe-elements.test.ts`) + `app/pay/[invoice]/StripeCardForm.tsx`
  (`<Elements>`/`<PaymentElement>` → `confirmPayment` → `?paid=1`), wired into the method
  picker: the Stripe button opens the form when `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set,
  else the existing not-yet-wired toast (so portal-landing test stays green). Added
  `@stripe/stripe-js` + `@stripe/react-stripe-js`; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in
  `.env.example`. type-check clean; 39 payment tests green.

### Phase 2 — Financial completeness **[me]**
- [ ] **2.1** 1099/W-2: add `worker_classification` (`w2` | `contractor_1099`) to the
  employee/registered-user record (seed); surface on the employee profile + payout
  rows; split the payout **tax report** by classification; flag any 1099 contractor
  whose annual paid total ≥ $600 (1099-NEC threshold); label W-2 vs 1099 on dispatch.
- [ ] **2.2** Unified **finance dashboard**: one page that nets revenue (cleared
  `payments`) − payouts (`payout_batch_items` paid) − expenses (approved `receipts`)
  by day/week/month/year, with "where money came from / went" breakdowns. Reuses the
  allocation + finances + payout aggregators; pure helpers + tests.
- [ ] **2.3** **Bank reconciliation**: `bank_transactions` table + CSV import (PNC
  export format; Plaid/Stripe feed deferred), a match engine that links each
  withdrawal to a payout or receipt (and each deposit to a customer payment), and an
  **unmatched queue** so nothing is unexplained. Pure matcher + tests.
- [ ] **2.4** Stripe **Connect payouts** (employee pay via Stripe): add the `stripe`
  dispatch path (transfers to a connected/verified bank), keep Venmo/cash/check.
  Gated on Stripe live + Connect onboarding (Phase 3).

### Phase 3 — Payment accounts (go-live money) **[you, I prep + guide]**
- [ ] **3.1** Create **Stripe** account as STARR TECHNICAL SERVICES, INC. (EIN), set
  statement descriptor "Starr Surveying"; I wire `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, the **webhook** (`/api/webhooks/stripe`) +
  `STRIPE_WEBHOOK_SECRET`.
- [ ] **3.2** Connect **PNC** business account to Stripe (payout deposits) + confirm
  ACH-CSV format PNC accepts.
- [ ] **3.3** Create **Venmo Business** profile `@StarrSurveying` (handle already in
  code); for employee Venmo payouts, capture each employee's handle on their profile.
- [ ] **3.4** Set `PAYMENT_ENCRYPTION_KEY`, `PAYOUT_ADMIN_EMAILS`, then flip
  `PAYMENTS_LIVE=true`; run a $1 live test of each path.

### Phase 4 — Email: `info@` forwarding (Google Workspace) **[you, I guide]**
- [ ] **4.1** Confirm/lock `info@starr-surveying.com` delivers to **both** inboxes.
  Cleanest in Workspace: make `info@` a **Group** (Admin → Directory → Groups) with
  `hankmaddux@` + `jacobmaddux@` as members and "Who can post = Anyone on the
  internet" (so customers + website forms can email in). Verify a test send hits both.
  (Optional: "Send mail as `info@`" so replies go out as info@.)

### Phase 5 — Mobile distribution **[you for accounts, me for build/config]**
- [ ] **5.1** Free **Expo** account → `eas init` (writes projectId to `app.json`).
- [ ] **5.2** **Apple Developer Program** $99/yr (org enroll = STARR TECHNICAL
  SERVICES, INC. via **D-U-N-S**, ~1–5 day lead; or individual to start). Google Play
  optional ($25) — **not needed** for the direct-APK path.
- [ ] **5.3** I fill `eas.json` placeholders + EAS secrets + app icon/splash; run
  `eas build` iOS (TestFlight) + Android (APK); host the APK; set
  `NEXT_PUBLIC_MOBILE_TESTFLIGHT_URL` + `NEXT_PUBLIC_MOBILE_ANDROID_APK_URL`.
- [ ] **5.4** Crew installs via `/admin/install`.

### Phase 6 — Production deploy **[you for accounts, me for config]**
- [ ] **6.1** Domain DNS → Vercel; Supabase project (Phase 0 done); Google OAuth;
  Resend domain verify; paste env per `docs/VERCEL_ENV_CHECKLIST.md` (incl.
  `AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAILS`, `CRON_SECRET`).

---

## 5. Accounts & costs (the "you" track)

| Account | For | Cost (2026) | Lead time |
|---|---|---|---|
| Stripe | Card/ACH in, Connect payouts | 2.9%+30¢/charge; payouts fee | minutes–days (bank verify) |
| Venmo Business | `@StarrSurveying` in + employee payouts | ~1.9%+10¢ | minutes |
| PNC business | Deposits + ACH | — | existing |
| Apple Developer | iPhone (TestFlight) | $99/yr | 1–5 days (D-U-N-S) |
| Expo/EAS | Build the apps | free to start | minutes |
| Google Play | *Optional* public Android listing | $25 once | 1–2 days |
| Resend | Email (already set) | free→$20/mo | done |
| Vercel + Supabase | Host + DB | ~$20 + ~$25/mo | minutes |

---

## 6. Decisions & guardrails
- **No real-money path** until `PAYMENTS_LIVE=true` + Stripe live keys (every clearing
  route short-circuits otherwise).
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `PAYMENT_ENCRYPTION_KEY`)
  live only in server env (Vercel) — never in mobile / `NEXT_PUBLIC_*` / git.
- **1099 vs W-2** classification is recorded + reported, but we do **not** file taxes
  or run withholding — exports feed the CPA / payroll provider.
- Live DB writes (Phase 0) are **verify-first, apply-only-missing, never reset**.
- I cannot create financial/identity accounts or enter SSN/bank/2FA for you — I prep
  all code/config/assets and walk you through each external screen.
</content>
