# Getting paid, paying people, and knowing whose card it was

**Status:** IN PROGRESS · opened 2026-08-17

> **Owner, 2026-08-17:** *"The next thing I want to do is set up
> stripe/venmo/cashapp/personal banking, and I also want to start logging cards for business use.
> Please give me a step by step plan on how to do that according to our platform."*

---

## Read this first: most of it is already built

This was surveyed against the code and the live database before any of the plan below was written,
because the last four things that looked like "needs building" turned out to be "needs one setting"
— the maps key, the Ads login header, the reconnect button, the conversion API. Same again here.

| Thing | State | What is actually missing |
|---|---|---|
| **Card register** (`/admin/cards`) | **Built. 1 card in it.** 5 roles, receipt matching cross-references it | Nothing. Just add cards. |
| **Customer payments** (`/pay`) | **Built.** Stripe, Venmo, CashApp, Zelle, ACH, cash, cheque | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, then `PAYMENTS_LIVE=true` |
| **Employee payouts** | **Built.** 8 methods incl. Venmo, CashApp, Zelle, ACH | Nothing. |
| **Bank reconciliation** (`/admin/money`) | **Built.** PNC CSV import + auto-match | Nothing. Import a statement. |
| **Stripe server keys** | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` set 115 days ago | Confirm they are LIVE-mode, not test |

So the work is: **add cards, verify three handles, add one env var, import one CSV, then flip one
switch.** In roughly that order, and the order matters — see §5.

---

## 1. Cards — do this first, it needs no setup at all

`/admin/cards` is live and already holds one card. Every receipt the AI reads is checked against this
register (`lib/receipts/card-on-file.ts`), which is why an unknown card currently raises
*"Card ending 0054 … is NOT on file"* on the receipts page.

For **each** card the business or its people use, add: **last 4, brand, a label you would say out
loud** ("Hank's fuel card"), and the **role**:

| Role | Means | Consequence if wrong |
|---|---|---|
| `COMPANY` | Owned by the business | Charges book as company expenses |
| `OWNER_PERSONAL` | An owner's own card | Reimbursed to that owner — **not** an expense until repaid |
| `EMPLOYEE_PERSONAL` | An employee's own card | Reimbursed to that employee |
| `CLIENT` | A customer's card | Never booked as our expense **or** revenue |
| `UNKNOWN` | Not sure yet | Held for review; nothing is filed until answered |

**The role is the whole point of the register.** It is what decides whether a charge is an expense, a
reimbursement, or none of our business — and `UNKNOWN` exists so an honest "not sure" cannot silently
become a tax deduction.

**Why first:** every receipt already in the system gets re-matched against it, so the 17 receipts on
file stop asking about unknown cards the moment their cards are registered. It also costs nothing and
breaks nothing.

---

## 2. Venmo / CashApp / Zelle — VERIFY, do not assume

These are configured, and the values are **hard-coded** in `lib/payments/live.ts`:

```
STARR_VENMO_HANDLE   = '@StarrSurveying'
STARR_CASHAPP_HANDLE = '$StarrSurveying'
STARR_ZELLE_EMAIL    = 'info@starr-surveying.com'
```

**Check each one is real and belongs to the business**, by opening the app and searching for it.

This is the highest-risk item on the page and the cheapest to check. A customer paying a Venmo handle
that is not yours does not get an error — the money goes somewhere else, or nowhere, and the invoice
simply stays unpaid while the customer believes they have paid. Nothing in this system can detect
that.

If any is wrong, it is a one-line change in that file — tell me the correct values.

---

## 3. Stripe — two gaps

Server-side keys have been set for 115 days. Two things are missing.

**3a. Confirm the keys are LIVE, not test.** Stripe issues both, they look alike, and a test key
takes payments that never arrive. In the Stripe dashboard, toggle **View test data** OFF and compare
the key prefix:

- live secret starts `sk_live_` · test secret starts `sk_test_`
- live publishable starts `pk_live_` · test publishable starts `pk_test_`

**3b. Add the publishable key.** The card form in the browser needs it and it is not set.

1. Stripe → **Developers → API keys** → copy the **Publishable key** (`pk_live_…`)
2. Vercel → `starr-surveying` → **Settings → Environment Variables → Add**
   - Key: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Value: the `pk_live_…` key
   - Environments: **Production, Preview, Development**
3. Save

**3c. Confirm the webhook points here.** `STRIPE_WEBHOOK_SECRET` is set, but a secret from a webhook
endpoint that no longer exists verifies nothing. Stripe → **Developers → Webhooks** — there should be
an endpoint at `https://www.starr-surveying.com/api/...` that is **enabled**. If its signing secret
differs from what is in Vercel, update Vercel.

Publishable keys are meant to be public; the secret key and webhook secret are not, and neither
should ever be pasted into a chat, a screenshot, or a commit.

---

## 4. Personal / business banking — PNC CSV

`/admin/money` reconciles bank activity against payouts, expenses and customer payments. It works by
**importing a PNC CSV** — the code names PNC specifically, matching the note in `live.ts`:
*"We will have to set up our bank account with everything. We use PNC banking."*

1. PNC online banking → the business account → **Download / Export → CSV**, last 30–90 days
2. `/admin/money` → **Bank reconciliation** → paste or upload the CSV
3. Review the suggested matches and confirm them

Imports are fingerprinted and de-duplicated, so re-importing an overlapping range is safe.

There is **no Plaid or bank API connection**, by design — nobody has handed this platform banking
credentials, and a monthly CSV is the whole job for a firm this size.

---

## 5. The order, and the one switch to leave until last

Do 1 → 2 → 3 → 4 in that order, then:

**5. Set `PAYMENTS_LIVE=true` in Vercel and redeploy.**

Until this is set, every money-clearing route returns 503 with an explanation. That is deliberate:

> *"I don't want the payment page to go live yet. We will have to set up our bank account with
> everything."*

Flip it **only** once §2 and §3 are verified, because it is the difference between a customer seeing
a payment form and a customer's money moving. Everything before it is reversible; this is the first
step that is not.

Note the pay portal itself is already reachable — `PAY_PORTAL_PASSWORD` unset removes the password
wall by design — but payments short-circuit while `PAYMENTS_LIVE` is off. So today a customer can see
the portal and cannot pay through it, which is a coherent state to be in while setting this up.

---

## What is NOT here, and why

- **Payouts to employees** need nothing: 8 methods are wired, including Venmo, CashApp, Zelle and
  ACH. `stripe` as a payout rail is deliberately excluded — there is no Connect account and no
  Treasury, so offering it would let somebody record a payment no rail can make.
- **Plaid / open banking** — not built, not planned. See §4.
- **`bank_accounts` / `payout_methods` tables** do not exist; the register is `payment_cards` and the
  bank side is `bank_transactions`. Do not go looking for tables that were never created.

## Ledger

| # | Step | Who | Done |
|---|---|---|---|
| M1 | Add every business + personal card with its role | Owner | ⬜ |
| M2 | Verify the Venmo / CashApp / Zelle handles are real | Owner | ⬜ |
| M3 | Confirm Stripe keys are live-mode | Owner | ⬜ |
| M4 | Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Owner | ⬜ |
| M5 | Confirm the Stripe webhook endpoint is live and its secret matches | Owner | ⬜ |
| M6 | Import a PNC CSV and reconcile | Owner | ⬜ |
| M7 | Set `PAYMENTS_LIVE=true`, redeploy, take one real $1 test payment | Owner + me | ⬜ |
