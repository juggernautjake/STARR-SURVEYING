# Payouts, and holding employees' money — research and plan

Owner, 2026-09-19: "Eventually I want it so that we can do full payouts once we have hooked up
payment/financial accounts. We will try and link the site to the business bank account and
venmo/cashapp/zelle accounts so that we can pay people. people will be able to take payouts through
connecting their venmo, cashapp, zelle, or their bank account … I also want to build it so that
employees can keep their money in the account on the website … they will have claim to the money,
but the money will be saved in the account and invested in some capacity … We will have crypto
investment options and other packages. That is all way in the future but I want you to research it
and plan it out a bit and keep it in mind as you build out everything."

Status: **research and direction.** Nothing here is built. The last section is the part that
affects code being written today.

## What already exists

More than you might expect:

- `seeds/324_employee_payment_methods.sql` — per-employee methods: `venmo`, `cashapp`, `zelle`,
  `ach`, `checking`, `cash`. One primary, others as fallback. ACH account and routing numbers are
  `pgp_sym_encrypt` BYTEA keyed by `PAYMENT_ENCRYPTION_KEY`; the handles for the P2P apps are
  plaintext because they are public on those platforms by design.
- `seeds/325_payout_batches.sql` — `payout_batches` (draft → approved → dispatched → completed →
  voided) and `payout_batch_items`, unique per (batch, user_email), in integer cents, with `paid_at`.
- `seeds/298_employee_payouts.sql` — a second per-employee ledger with `gross_cents`, `net_cents`,
  `items` JSONB, `paid_at`.
- `seeds/327_payment_secret_audit.sql`, `seeds/383_bank_transactions.sql`.
- `lib/payments/` — Stripe already wired for money **in** (invoices, elements, readiness).
- `lib/payroll/owed.ts` — the running balance: everything approved, minus everything paid.
- **New on 2026-09-19:** `daily_time_logs.paid_at` / `paid_by` / `payout_batch_id` (seeds/651), which
  is the first time an individual hour can be traced to the run that paid it.

So "run payroll against approved hours" is close. The rest of this document is about the much
larger second half of the request.

## The dividing line that matters

There are two different products in that paragraph, and they are not the same size:

1. **Paying people.** Ordinary. The firm owes money, sends money, records that it sent it.
2. **Holding people's money and investing it.** Not ordinary. The moment an employee's wages sit in
   "their account on the website" instead of in their own bank account, the firm is holding funds
   that belong to somebody else.

(2) is a regulated activity in the United States, generally as **money transmission** — licensed
state by state, with bonding and capital requirements in most of them — and investing those balances
adds **securities** regulation on top. Crypto adds more again. Separately, state **wage payment**
laws govern how and when wages must be made available, and an arrangement that keeps someone's wages
on the employer's books can run into them even when everyone involved is willing.

**This needs a lawyer before it needs a schema.** Not as a disclaimer — as a sequencing point: the
legal structure decides the data model, so building the data model first means building it twice.

### The way this is actually done

Firms that offer this do not become licensed money transmitters. They partner with someone who
already is, and the partner holds the money:

- **Banking-as-a-service** (Unit, Treasury Prime, Column, Increase) — accounts are opened at a
  partner bank in the employee's name. The employee has a real account; the firm has a dashboard.
- **Embedded payroll** (Check, Gusto Embedded, Zeal) — handles wage payment, tax withholding and
  the filings, which is a large problem being skipped over in the paragraph above.
- **Brokerage-as-a-service** (DriveWealth, Alpaca, Apex) for investment, if that is ever pursued.

The site's job in every one of these is the same: **a ledger that mirrors the partner, and a UI.
Never custody.** That is both the compliant shape and, conveniently, the sane engineering shape.

## The rails, specifically

| Rail | Reality |
|---|---|
| **ACH** | The workhorse. 1–3 days, cents per transfer, fully automatable through Stripe/Increase/Column. This is what "full payouts" should mean. |
| **RTP / FedNow** | Instant, growing coverage, more expensive. Worth it for "I need to be paid today". |
| **Zelle** | Bank-to-bank, consumer product. Most banks' Zelle terms prohibit business use, and there is **no public API** for a business to send Zelle programmatically. Practically: a human sends it and records that they did. |
| **Venmo / CashApp** | Commercial use requires a business profile and carries fees; neither offers a general payout API for this. Same practical answer as Zelle — a human sends, the system records. |

The existing schema already treats these correctly: `employee_payment_methods` stores a *handle* for
the P2P apps, which is what you need to pay somebody by hand, and encrypted account details for ACH,
which is what you need to pay them automatically. Nothing needs to change to keep supporting them —
but the automation story is ACH, and the P2P ones should stay honestly labelled as "record that this
was sent" rather than growing a fake "Send" button that a person has to go and do by hand anyway.

## Phases, smallest first

1. **Payroll run against approved hours.** Select approved-and-unpaid entries, group by person,
   produce a batch, dispatch by ACH, stamp `payout_batch_id` on every time log in it. Everything
   needed for this exists except the run itself.
2. **Employee-initiated payout.** Their balance, a button, their primary method.
3. **Tax and withholding.** The unglamorous blocker on doing any of this as real payroll rather than
   as contractor payments. Almost certainly a partner, not a build.
4. **Holding balances.** Only behind a partner and a legal opinion. See above.
5. **Investment options.** Later still, and a different regulatory regime again.

## What this means for code being written NOW

This is the part the owner asked to be kept in mind, and it costs nothing today:

- **Money is integer cents. Never floats.** `payout_batch_items` already does this. `daily_time_logs`
  uses `numeric(10,2)` for pay, which is safe in Postgres but must never become a JS `number` that
  gets arithmetic done on it — round at the boundary, or better, convert to cents.
- **The money ledger is append-only.** A payment that was made and then reversed is TWO rows, never
  one row edited. This is why `seeds/651` records `paid_at`/`paid_by` and why un-marking clears them
  rather than deleting the row — and it is the habit that has to hold when real money is involved.
- **Every outbound money operation needs an idempotency key,** chosen by the caller, stored, and
  checked before sending. A retried payout is the single most expensive bug available in this domain.
- **Never store an account number in plaintext, and never log one.** `PAYMENT_ENCRYPTION_KEY` and the
  pattern in seed 324 already exist; anything new follows them.
- **Balances are derived, never stored.** `lib/payroll/owed.ts` already takes this position and is
  right: a stored balance is a number that can silently disagree with the entries behind it, and the
  disagreement is discovered when somebody is paid the wrong amount.
- **An employee's own record of what they were paid must be immutable to the employer.** Whatever is
  shown on their Hours page as "paid" should be reconstructible from the ledger, not from a column
  an admin can edit.

## Open questions for the owner, when this comes up again

- Are the crew **employees or contractors**? It changes the entire withholding story and therefore
  which partner is even applicable.
- Is "keep money on the site" meant as **savings** (interest, FDIC through a partner bank) or as
  **investment** (market risk, and someone has to be licensed to recommend it)? They are very
  different products and the second is much further away.
- Who bears the loss if an investment balance falls — the employee, or the firm? The answer decides
  whether this is a brokerage relationship or something the firm cannot offer at all.
