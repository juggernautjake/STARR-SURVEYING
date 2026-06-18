# Payment infrastructure — security + PCI scope

Plan: `docs/planning/in-progress/payment-infrastructure-2026-06-18.md`
(P17 — Secrets handling, P18 — RLS audit, P19 — PCI scope review).

## Encryption at rest — ACH

Bank account + routing numbers for employee payouts are encrypted
at rest via `pgcrypto`. The schema lives in
[`seeds/324_employee_payment_methods.sql`](../../seeds/324_employee_payment_methods.sql):

  - `employee_payment_methods.ach_account_number_enc BYTEA`
  - `employee_payment_methods.ach_routing_number_enc BYTEA`

Encrypted via the SQL wrappers `public.encrypt_ach_secret(plaintext, key)`
and decrypted via `public.decrypt_ach_secret(ciphertext, key)`. Both
use `pgp_sym_encrypt` / `pgp_sym_decrypt` under the hood. The key
NEVER lives in the database — it's resolved at call time from the
env var `PAYMENT_ENCRYPTION_KEY`.

App-layer access goes through
[`lib/payments/secrets.ts`](../../lib/payments/secrets.ts):

  - `assertEncryptionKeyConfigured(env)` — refuses if the key is
    absent or trivial (`changeme`, `your_encryption_key`, <16 chars).
  - `maskAchAccount(plaintext)` — UI-side display only ever shows
    `•••1234` (last 4).
  - `scrubAchFromMessage(msg)` — runs every error/log message
    through a regex that masks any 8+ digit run before it hits
    the console.
  - `buildAuditEntry(...)` — single source of truth for the
    `payment_secret_reads` row shape.

## Audit log

Every decrypt operation through the app-layer helper INSERTs a row
in `payment_secret_reads` (seed 327) BEFORE returning plaintext.

Columns:

  - `reader_email` — who triggered the read
  - `reader_ip` — Vercel `x-forwarded-for` first entry
  - `target_table` / `target_id` — `employee_payment_methods` row
  - `subject_email` — the employee whose secret was read
  - `field_name` — which column (`ach_account_number_enc` /
    `ach_routing_number_enc`)
  - `reason` — one of `payroll_dispatch`, `employee_self_view`,
    `admin_review`, `audit`, `rotation`
  - `succeeded` + `error_message` — failures are logged too

The table is service-role-only (RLS) — there's no employee-self-read.
A compliance officer queries it for audits; the employee doesn't
need (or get) to see who looked at their secret.

## Key rotation

Run [`scripts/rotate-payment-encryption-key.mjs`](../../scripts/rotate-payment-encryption-key.mjs)
with both old + new keys in the environment:

```
PAYMENT_ENCRYPTION_KEY_OLD=… \
PAYMENT_ENCRYPTION_KEY=… \
SUPABASE_URL=… \
SUPABASE_SERVICE_ROLE_KEY=… \
node scripts/rotate-payment-encryption-key.mjs [--dry-run]
```

The script pages through every ACH row, decrypts with the old key,
re-encrypts with the new key, **round-trip verifies** with the new
key before writing, then UPDATEs the row. Every touched row stamps
a `payment_secret_reads` audit entry with `reason='rotation'`.
`--dry-run` counts + verifies but writes nothing.

After the script reports `0 errors`, update the production env var
to the new key and remove `PAYMENT_ENCRYPTION_KEY_OLD`.

## PCI scope

> **SAQ A eligibility checklist:**
> [`docs/security/saq-a-eligibility-checklist.md`](./saq-a-eligibility-checklist.md)
> — one-page audit the office runs whenever the `/pay` route or the
> Stripe webhook changes. Confirms every PCI DSS SAQ A condition is
> still met by our integration.

| Method | PCI scope | Notes |
|---|---|---|
| **Stripe (card / ACH)** | SAQ A | Stripe Elements tokenises in the browser. The app never sees or stores raw card data. We store only the Stripe `payment_intent.id` (P5). |
| **Venmo / CashApp / Zelle** | Out of scope | Customer-to-customer P2P transfers. The app stores tokenless transaction references (last-4 of the platform tx id) only after the office confirms receipt. |
| **Cash / check** | Out of scope | No card data touches the app. |
| **ACH (employee payouts)** | Out of scope for PCI; subject to GLBA / state bank-data rules | Account + routing are encrypted at rest (this doc). Reads are audit-logged. The export to PNC is a CSV the office uploads via their bank's portal — no raw card numbers. |

### What we store vs. what Stripe stores

The PCI boundary lives at Stripe's iframe. Everything to the right
of the boundary is Stripe's PCI surface; everything to the left is
ours.

| Data | Our DB | Stripe |
|---|---|---|
| Full card number (PAN) | **never** | yes |
| Card CVV / CVC | **never** | tokenised, not stored |
| Card expiry | **never** | yes |
| Card last-4 | **never** | yes |
| Cardholder name | **never** | yes |
| Stripe `payment_intent.id` (`pi_…`) | yes (`payments.external_id`) | yes |
| Stripe `charge.id` last-4 | yes (`PublicPaymentSummary.external_id_tail`) | full id only |
| Payer email | yes (gated) | yes |
| Receipt URL | not stored — receipt PDF is rendered server-side from our data | n/a |

**No card numbers are ever stored in this database.** Stripe's
tokenization keeps card-PAN out of our control entirely — only
their opaque PaymentIntent id (`pi_...`) and the last-4 of the
charge id (P8 receipt summary) ever land in our tables.

## Public surface — invoice number is the auth token

The customer-facing `/pay/<invoice_number>` route gates every public
endpoint on **possession of the invoice number or public_slug**.
That's the customer's only credential — by design (the spec calls
for a one-step UX). The `public_slug` (16-char unambiguous alphabet,
generated by `lib/payments/invoice-number.ts`) prevents enumeration
of sequential ids.

Public columns are explicitly enumerated in the route's `.select()`
call — never `SELECT *`. Internal columns (`org_id`, `created_by`,
`billing_address`, `customer_email`) NEVER reach the public boundary.
Receipt payment summaries mask:

  - Stripe `external_id` → last-4 (`lastFour`)
  - Payer email → `m***@example.com` (`maskPayerEmail`)

(See `lib/payments/invoice-public.ts`.)

## RLS posture

> **Runtime audit:** paste
> [`scripts/audit-payment-rls.sql`](../../scripts/audit-payment-rls.sql)
> into the Supabase SQL editor after every payment-domain seed
> deploy. The query enumerates every table in
> [`lib/payments/rls-allowlist.ts`](../../lib/payments/rls-allowlist.ts)
> and reports `rls_enabled`, `service_role_policy_present`,
> `employee_self_read_policy_present`, + a single `pass` boolean
> column you can `WHERE pass = FALSE` to surface drift in one
> query.

| Table | Service role | Authenticated | Anon |
|---|---|---|---|
| `invoices` | full | — | — (route-mediated) |
| `payments` | full | — | — (route-mediated) |
| `payment_intents` | full | — | — |
| `payment_attempts` | full | — | — (route-mediated) |
| `payment_receipts` | full | — | — |
| `employee_payment_methods` | full | self-read (own row) | — |
| `payout_batches` | full | — | — |
| `payout_batch_items` | full | self-read (own row) | — |
| `payment_secret_reads` | full | — | — |

Customer-facing reads route through service-role API endpoints that
gate by invoice number / public_slug; anon + authenticated never
touch the invoices table directly. Employee-facing reads route
through service-role API endpoints that compare `auth.jwt() ->>
'email'` against the row's `user_email`.

## Live-money gate

The `PAYMENTS_LIVE` env var gates every real-money path:

  - The PaymentIntent creation route (P5) — 503 when off.
  - The webhook handler routes invoice intents to the clearance
    helper only when on; logs + drops otherwise.

Set `PAYMENTS_LIVE=true` only after PNC + Stripe live keys are
configured.

## Not yet wired (deferred per the plan)

  - **Stripe Connect / Treasury** for instant employee payouts —
    requires bank account onboarding (user-flagged long pole).
  - **Full NACHA encoding** for bulk ACH — current export is a
    PNC-Bill-Pay-compatible CSV; full NACHA lands when the bank
    confirms its preferred upload format.
  - **AML / OFAC screening** on inbound payments — out of scope
    for a single-office surveying firm; if the user expands to
    multi-state / federal work this is the obvious next step.
