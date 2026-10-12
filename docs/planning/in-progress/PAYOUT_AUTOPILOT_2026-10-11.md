# Payout autopilot — commit once, everyone paid their way

**Status:** in progress, branch `claude/payout-autopilot-2026-10-11`.
**Owner, 2026-10-11:**
> *"I want it so that the system uses whatever preferred payment method is available to do the payout. … whenever the boss confirms the hours and is ready to payout for the confirmed hours, then he can commit the payout and it will automatically pay out everyone according to their preferred payment methods. Whether that is to their bank, through venmo or cashapp, or via printing checks, or cash payments which will have to be paid manually with real cash. We will make it so that digital payments can be incentivized. The org will have the option to attach a fee to cash and check payments that is automatically taken out."*

Builds on:
- `docs/planning/in-progress/payouts-and-holding-money-2026-09-19.md`, whose rules hold here: honest labels, idempotency on every send, encrypted account numbers, an append-only ledger;
- `docs/planning/pending/CHECK_PRINTING_2026-10-11.md`, slices C0–C5.

## What "automatic" can honestly mean for each method

| Method | How it goes out at "Commit payout" | Truly automatic? |
|---|---|---|
| **Venmo** | **PayPal Payouts API** (PayPal owns Venmo; payouts to Venmo by phone / email / handle). | **Yes**, once a PayPal Business account's API keys are set (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`). Until then it falls back to a tap-to-pay link. |
| **Bank (ACH)** | A real **NACHA** payment file (PPD credits) for every bank-paid employee. One upload to PNC; PNC moves the money. | One upload per payout, then automatic. A fully hands-off push needs a bank API partner (later). |
| **Account** | Credited to their balance immediately. | Yes. |
| **Check** | Check numbers assigned; one PDF with every check plus its pay stub, ready to print. | Printing is one click; handing out is manual. |
| **Cash App** | **No public send API exists.** A one-tap link per person (cash.app/$tag/amount), then confirm. | No. Labelled as such. |
| **Zelle** | **No public send API exists.** The person to pay, and the amount to send from the bank app. | No. Labelled as such. |
| **Cash** | A printable cash sheet (name, amount, signature line). | No — "paid manually with real cash". |

## Fees on cash and check payments

The org can set a fee per method (flat and/or percent, with a cap). It is taken out of what is sent, works the same way as advance recovery (`lib/payroll/disbursement.ts`), and shows on the line and on the stub.

**Guardrails (defaults):**
- **Contractors only by default.** Deducting a fee from a W-2 employee's wages is restricted: Texas Payday Law requires written authorization for a lawful purpose, and FLSA minimum-wage "free and clear" rules apply. The org can widen the fee to everyone, but only with each person's recorded written consent.
- **Consent required.** The fee applies only once the worker has agreed, in their own pay settings, to the exact fee text; the text and time are stored.
- A **maximum percent** cap (default 5%). A fee never exceeds what is being paid.
- The incentive is stated where the choice is made: "Choose Venmo or direct deposit — no fee."
- Owner action: confirm the fee policy with the CPA / an employment lawyer before switching it on for W-2 staff.

## Slices

| # | Slice |
|---|---|
| A1 | Seed: every method allowed on batch items; fee, rail and provider columns; `payout_settings`; `payout_fee_consents`; `payout_checks` + numbering function; `payout_dispatch_events` |
| A2 | Pure libraries + tests: fees, rails, NACHA, PayPal request/status mapping, check amount-in-words and layout |
| A3 | Batch build applies fees; disbursement subtracts them |
| A4 | Commit: approve + dispatch in one action, idempotent, every rail; sync of PayPal statuses; bank-file / check / cash-sheet artefacts |
| A5 | Admin UI: Commit panel and results on the batch page; dispatch shows every method with fee and amount to send; settings page; check register |
| A6 | Employee UI: "How I get paid" — method, handle, bank details (encrypted), fee notice + consent |
| A7 | Docs, owner set-up checklist |

## Owner set-up (outside the code)
1. **PayPal Business account** → developer app → set `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_ENV=live` (Doppler → Vercel). Payouts must be enabled on the account (PayPal approves it).
2. **PNC ACH origination** on Business Checking (ask PNC for the company ID and file specs) → fill in the ACH section of Payout settings.
3. **`PAYMENT_ENCRYPTION_KEY`** set (≥16 chars) so bank details can be saved.
4. **Checks:** order check stock (pre-printed, or blank + MICR toner) → fill in the Checks section.
5. **Fees:** decide amounts; confirm the W-2 question with the CPA before widening beyond contractors.
