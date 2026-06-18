# SAQ A eligibility — Stripe Elements path

Plan: `docs/planning/in-progress/payment-infrastructure-2026-06-18.md`
P19 — PCI scope review.

PCI DSS's "SAQ A" Self-Assessment Questionnaire applies to merchants
who have fully outsourced cardholder data handling to a PCI DSS
validated third party. Stripe Elements is the canonical SAQ A
pattern when integrated correctly. This checklist confirms our
integration meets every SAQ A condition.

## Quick verdict

If every box below is **YES**, we qualify for SAQ A and the only
PCI requirements we need to attest to are the ones SAQ A covers
(~22 controls). Anything answered **NO** drops us to SAQ A-EP or
worse — a 10× compliance burden. Re-run this checklist whenever
the `/pay` integration changes.

## The conditions

### Outsourced cardholder data

- [ ] **Card-data fields are rendered by Stripe Elements, not by
      our HTML.** The customer never types a card number into a
      DOM element we control. Stripe's iframe collects the PAN.

  *Where we enforce this:* `app/pay/[invoice]/page.tsx` renders no
  `<input type="text" name="card-number" />` of our own. The
  Stripe form lives inside Stripe's iframe via the Elements SDK
  (front-end wiring lands when `PAYMENTS_LIVE=true` is set).

- [ ] **No raw card data ever transits our server.** The browser
      tokenises with Stripe directly; our backend only sees the
      opaque `payment_method.id` (or the `payment_intent.id`).

  *Where we enforce this:* `app/api/public/invoice/[number]/intent/route.ts`
  accepts no card data in its POST body — only the invoice key.
  Stripe's webhook (P5) returns the intent id; we store that id
  and nothing else.

- [ ] **No raw card data is stored in our database.** No `card_number`,
      `cvv`, `expiry`, `cardholder_name` column anywhere.

  *Where we enforce this:* schema review across every payment seed
  (323 / 324 / 325 / 327). The `payments.external_id` column
  stores the Stripe `pi_…` / `ch_…` token — opaque, not PAN.

### Hosted entirely by the PCI-DSS validated third party

- [ ] **The card-collection iframe is loaded from Stripe's domain
      (`js.stripe.com`).** Not self-hosted, not proxied through us.

- [ ] **Webhook is signature-verified before any DB write.** Stripe
      signs every webhook delivery; the route rejects anything that
      doesn't verify.

  *Where we enforce this:* `app/api/webhooks/stripe/route.ts`
  calls `stripe.webhooks.constructEvent(body, signature, secret)`
  and 400s on signature failure. (Existing route from a prior
  slice; P5 extended it for invoice intents.)

- [ ] **Webhook secret + Stripe secret key are in environment
      variables, not committed to the repo.** Verified by the
      live-money gate doc.

  *Where we enforce this:* `paymentsAreLive()` short-circuits when
  the env vars are absent; CI rejects PRs that hard-code keys
  (covered by the existing repo `.gitignore` for `.env*`).

### Webhook integrity

- [ ] **Webhook replay protection.** Stripe's `processed_webhook_events`
      table deduplicates by `stripe_event_id`.

  *Where we enforce this:* `app/api/webhooks/stripe/route.ts` →
  `processStripeEvent()` INSERTs into `processed_webhook_events`
  with `ON CONFLICT DO NOTHING`, then short-circuits on dupe.

- [ ] **Webhook fails closed.** Unverified events return 400; the
      route never writes a `payments` row without a verified event.

### Non-Stripe methods stay out of scope

- [ ] **Venmo / Cash App / Zelle.** The portal generates only a
      deep link. The customer's payment app handles the funds
      transfer; we never see card data because there isn't any
      (these are bank-funded P2P).

  *Where we enforce this:* `app/pay/[invoice]/page.tsx` →
  `onMethodClick` calls `window.open(buildDeepLink(...))` and
  records a `payment_attempts` row marked `pending_confirmation`.
  No financial data crosses our server.

- [ ] **Cash + check.** The portal records the customer's intent;
      the actual payment happens off-app. No PCI surface.

  *Where we enforce this:* `app/pay/[invoice]/page.tsx` →
  pledge strip + `/api/public/invoice/[number]/attempt` writes
  a `payment_attempts` row in `pledged` status. No financial data
  crosses our server.

- [ ] **ACH (employee payouts).** Encrypted at rest via pgcrypto
      (P17); decrypts audit-logged. Out of PCI scope but covered
      by GLBA / state bank-data rules.

  *Where we enforce this:* `seeds/324_employee_payment_methods.sql`
  + `lib/payments/secrets.ts` (key assertion, mask helper, audit
  shape).

### Operational

- [ ] **Quarterly external scan.** SAQ A requires an ASV (Approved
      Scanning Vendor) scan of any web pages that contain the
      Stripe payment iframe. The `/pay` and `/pay/[invoice]` routes
      are in scope; nothing else is (they're the only pages that
      load `js.stripe.com`).

- [ ] **Annual SAQ A attestation.** Office signs the
      ~22-control questionnaire once per year. Stripe publishes
      [a template](https://stripe.com/guides/pci-compliance).

- [ ] **Incident response runbook.** What we do if Stripe alerts
      us to suspected fraud or a leaked webhook secret.

  *Where to add this:* future doc `docs/security/incident-response.md`
  (out of scope for P19 itself; flagged for follow-up).

## Out-of-band — what would push us OUT of SAQ A

Any of these would force a re-classification (to SAQ A-EP at best,
SAQ D at worst):

- Adding a non-Stripe card capture flow (Square, Authorize.Net
  drop-in form, hand-keyed entry into our UI).
- Proxying Stripe's iframe through our own CDN.
- Storing the customer's card last-4 + expiry from Stripe's
  callback (we currently store only `payments.external_id` =
  Stripe charge id — opaque, not card data).
- Accepting a card number through a non-Stripe path (over the
  phone, email, paper) and entering it anywhere into our UI.

If the user asks for any of those: stop, re-read PCI DSS, and
budget the compliance work BEFORE writing the code.

## Re-running this checklist

Re-check the conditions whenever:
- The `/pay` route changes (any DOM near the Stripe iframe).
- The Stripe webhook route changes (verification or storage).
- We add a new payment method.
- Stripe rotates the API version (the existing `as any` cast on
  `apiVersion` is intentional; pinning to the version the prod
  types accept is the safest interim).

Last reviewed: P19 of `payment-infrastructure-2026-06-18.md`.
