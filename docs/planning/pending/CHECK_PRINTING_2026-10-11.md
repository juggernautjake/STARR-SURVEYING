# Printing paychecks — plan

**Status:** pending (planned 2026-10-11, nothing built).
**Requested by:** owner, 2026-10-11:
> *"What would it look like to print checks? If we had our full payment system built out, could we do an option to actually just print checks for employees if that is their preferred payment method?"*

**Short answer:** yes. The payout system already treats "check" as a way of paying somebody, but today it only **records** a check written by hand. This plan adds **printing**:
- a real check with a pay stub, on blank check paper, from an office laser printer;
- a check register so every number is accounted for;
- PNC Positive Pay so a forged or altered check bounces.

ACH (direct deposit) stays the default and costs nothing per payment. Printing checks is for employees who choose it.

---

## 1. What already exists (verified 2026-10-11)

| Piece | Where | What it means for checks |
|---|---|---|
| One vocabulary of payment methods, `check` included | `lib/payouts/methods.ts` | `check` is recorded only ("handed over… the check number is what makes it findable later"). `sendsItself = false`. |
| Employee's preferred method | `employee_profiles.payout_method` (seed 578/586) | Already allows `check`. Live: no one has picked a method yet. |
| Ad-hoc payouts | `employee_payouts.method` + free-text `reference` (seed 281) | Allows `check`; the check number goes in `reference`, which is free text with no numbering rules. |
| Weekly payout batches | `payout_batches` / `payout_batch_items` (seed 325), `lib/payouts/batch.ts`, `dispatch.ts` | **Bug: `payout_batch_items.method` CHECK allows only venmo/cashapp/zelle/ach/cash, not `check`** (confirmed against the live database). A check-preferring employee cannot be put in a batch today. |
| Bank file for ACH | `app/api/admin/payouts/runs/[id]/ach-csv` | The pattern to copy: an approved batch → an artefact the office takes to PNC. |
| Pay-stub math | `lib/payroll/pay-stub.ts` | Hours, regular/overtime (FLSA regular-rate method), gross, deductions, net. **Withholding is a flat estimate (12% federal, FICA, 0% Texas), labelled as an estimate.** It is not real W-2 withholding (see §5). |
| W-2 / 1099 flag per worker | `registered_users.worker_classification`, `lib/payouts/worker-classification.ts` | Decides whether a check has withholding (W-2) or is gross pay (1099). |
| Money permission | `canHandleMoney()` in `lib/auth-roles.ts`, `finance` role | Who may print, void and sign. |
| Secrets at rest | `lib/payments/secrets.ts` | Where the bank account number belongs (encrypted, never sent to the browser in full). |
| PDF tooling | `pdfkit`, `jspdf` in package.json | Enough to draw a check to exact positions. No new PDF dependency needed. |

---

## 2. What a printed check is

A US business check that banks accept in their sorting machines has the following.

**Top section: the check itself (about 3.5 in. tall).**
- Payer block: Starr Surveying, address. Bank name: PNC Bank, N.A.
- Check number (top right), date, "Pay to the order of" plus payee name, amount in numbers, and amount in words ("Eight hundred forty-two and 50/100").
- Memo ("Pay period Oct 5 – Oct 11, 2026"), signature line(s), and "Void after 90 days".
- **The MICR line** along the bottom edge: routing number, account number and check number, printed in **E-13B magnetic ink** in a fixed position (the ANSI X9 standard). Without magnetic toner a check may still be accepted, but it falls out of automated processing and can be delayed or rejected.

**Middle and bottom: two pay stubs**, one for the employee and one for the office file. Each has:
- pay period and pay date;
- hours (regular / overtime / by rate), rate(s), gross;
- bonuses, reimbursements, advance repayment, adjustments;
- each deduction, and net pay;
- year-to-date totals;
- check number and payee.

The standard sheet is **"check on top, two stubs"** voucher stock: letter size, perforated, compatible with QuickBooks layouts.

---

## 3. Two ways to print. Recommendation: A.

| | **A. Blank check stock + MICR toner (recommended)** | **B. Pre-printed PNC checks** |
|---|---|---|
| What the system prints | Everything, including bank details, numbers and the MICR line | Only payee, amount, date, memo and stubs, into boxes already printed |
| Paper | Blank security check stock (watermark, microprint, chemical-reactive), "top check" voucher | Ordered from PNC or a check printer with the account already on it |
| Printer | Any office **laser** printer with a **MICR toner cartridge** fitted for check runs | Any printer |
| Check numbers | Assigned by the system, never repeated | Pre-printed; the system must stay in sync with the paper |
| Risk | Blank stock must be locked up | A misfeed burns a numbered check; numbers drift out of sync |
| Rough cost | Stock ≈ $0.10–0.25 per check; MICR toner ≈ $100–250 per cartridge (thousands of checks) | ≈ $0.15–0.40 per check; reorder lead time |

Prices are rough market ranges and need confirming before purchase.

**Why A:** the system owns the numbering, any printer works, and a spoiled sheet is just a void entry rather than a gap in pre-printed numbers. Option B is a fine stopgap: the layout code is the same, without the bank block and MICR line.

**Later, option C:** a print-and-mail service (an API that prints and mails the check, roughly $1.50–2 per check). Only worth it if checks have to be mailed. Listed so the data model doesn't rule it out.

---

## 4. How it works, start to finish

```
Week's hours approved ─► payout batch built ─► batch approved
        │                       │ (items with method = check)
        │                       ▼
        │              "Print checks" (finance role)
        │                       │ 1. numbers assigned, in one transaction, no gaps
        │                       │ 2. alignment test page (optional, plain paper)
        │                       │ 3. PDF generated: one sheet per check
        │                       ▼
        │              Office prints on check stock
        │                       │
        │          ┌────────────┴─────────────┐
        │     "All printed OK"          "Sheet 3 jammed"
        │          │                          │ → check #1043 VOIDED (spoiled),
        │          │                          │   reissued as #1047
        │          ▼                          ▼
        │      Signed (by hand, or a signature image if approved — §6)
        │          ▼
        │      Handed out / mailed → status ISSUED → payout item marked paid,
        │                            check number recorded as its reference
        │          ▼
        │      Positive Pay file exported to PNC (§6)
        │          ▼
        └────► Cleared (PNC statement / CSV import) — or STALE after 90 days
```

**Check statuses:** `draft → printed → issued → cleared`, plus `void` (with a reason: spoiled, wrong amount, lost, stop payment) and `stale` (uncashed past 90 days).
- A voided number is never reused.
- A reprint always gets a **new** number. The PDF of an already-printed check can only be opened as a copy watermarked "COPY — NOT NEGOTIABLE".

**What the employee sees:**
- choose "Paper check" as their preferred method in their profile;
- a notification "Your check #1047 is ready" when it's printed;
- the stub in their portal (same numbers as the paper stub);
- whether their check has cleared.

---

## 5. The big decision: taxes on W-2 paychecks

This decides how much of payroll the platform does. **It must be answered before slice C4.**

Today `pay-stub.ts` uses **flat estimated withholding**. That is fine for a preview, but **not legally sufficient for real W-2 paychecks.** Real withholding depends on:
- each employee's W-4;
- IRS Publication 15-T tables, which change every year;
- year-to-date wages (the Social Security wage cap);
- employer taxes (FICA match, FUTA, Texas TWC unemployment tax);
- quarterly and annual filings (941, 940, W-2/W-3, TWC reports).

| Option | What the platform does | What someone else does | Verdict |
|---|---|---|---|
| **D1-a. Payroll provider calculates; platform prints** | Hours, approvals, batches, check printing, register, Positive Pay | The provider (e.g. Gusto, QuickBooks Payroll, ADP) calculates withholding and files taxes; its net-pay numbers are entered or imported per employee | **Recommended** for W-2 staff. Lowest risk; check printing still works exactly as planned. |
| **D1-b. 1099 contractors only** | Everything; the check is gross pay, no withholding | Contractor handles own taxes; platform already flags 1099-NEC at $600 | Simple, but only right if workers really are contractors (an owner/CPA call, not a software one). |
| **D1-c. Build full payroll tax in-house** | Pub 15-T tables, W-4 storage, YTD caps, employer taxes, filing reports, yearly updates | Nobody, so every mistake is the company's penalty | **Not recommended.** Large, ongoing, and high-penalty. |

Until D1 is answered, the stub keeps saying "Estimated — not tax withholding". W-2 checks stay disabled behind a setting, and 1099 checks can be printed.

---

## 6. Safety and controls

- **Who:** only `canHandleMoney()` (finance role, admins) can print, void or export. A second person must approve batches over a set amount (setting, e.g. $2,500). Every action is written to the audit log: who printed, voided or reprinted which number, and when.
- **Bank details:** routing and account number are stored encrypted via `lib/payments/secrets.ts`. They are decrypted only server-side to draw the PDF, and the browser only ever sees `…1401`.
- **Positive Pay (PNC):** after each print run, export the issued-checks file (check number, date, amount, payee name) in PNC's format and upload it to PNC Pinnacle / Positive Pay. PNC then flags any presented check that isn't on the list, or whose amount or payee doesn't match. **This is the single most important fraud control for printed checks.** Confirm with PNC that the business account has Positive Pay, whether it costs extra, and which file layout they want; payee-name matching is preferred.
- **Signatures:** default is signed by hand with a pen. A printed signature image is optional (D3). If it's used, it's stored encrypted, printed only on checks under a set amount, and only after the batch's second approval.
- **Paper:** blank stock and the MICR cartridge are kept locked. The register can reconcile the paper count against the numbers used (optional field).
- **Never two checks with the same number:** the database enforces a unique check number per bank account. Numbers are assigned with a row lock on the account's `next_check_number`.
- **Duplicate-pay guard:** a payout item that already has an issued check can't get a second one without voiding the first. This reuses the double-pay ideas in `lib/payroll/engine-overlap.ts`.
- **Uncashed checks:** after 90 days the check is flagged stale and the office contacts the employee. Wages that are never claimed may have to be reported to the Texas Comptroller as unclaimed property; **confirm the rule and timing with the CPA.**

---

## 7. Data model (new seed, number at build time)

```sql
-- The bank account checks are drawn on.
check_accounts (
  id uuid pk, org_id uuid,
  label text,                    -- "PNC Business Checking"
  bank_name text, bank_address text,
  routing_number text,           -- 9 digits, ABA checksum validated
  account_secret_ref text,       -- encrypted account number (lib/payments/secrets.ts)
  account_last4 text,
  next_check_number int not null, -- row-locked when numbers are assigned
  layout text default 'voucher_top',  -- 'voucher_top' | 'preprinted_top'
  print_offset_x_mm numeric default 0, print_offset_y_mm numeric default 0,  -- per-printer calibration
  signature_secret_ref text null, signature_max_cents int null,
  second_approval_over_cents int default 250000,
  positive_pay_format text,      -- PNC layout id once confirmed
  active bool default true, created_at, updated_at
)

-- Every check number ever used, including voids.
checks (
  id uuid pk, org_id uuid, check_account_id uuid fk,
  check_number int not null,     -- unique (check_account_id, check_number)
  payee_email text, payee_name text not null, payee_address text,
  amount_cents int not null check (amount_cents > 0),
  issue_date date not null, memo text,
  status text not null check (status in ('draft','printed','issued','cleared','void','stale')),
  void_reason text, voided_by text, voided_at timestamptz,
  reissue_of uuid null fk checks,      -- the spoiled check this one replaces
  payout_batch_item_id uuid null, employee_payout_id uuid null,  -- exactly one set
  stub jsonb not null,                 -- snapshot of every stub number at print time
  pdf_storage_path text,
  printed_by text, printed_at timestamptz,
  issued_at timestamptz, cleared_at timestamptz,
  positive_pay_exported_at timestamptz,
  created_at, updated_at
)
```

Also:
- **Fix:** add `'check'` to `payout_batch_items.method` (slice C0).
- RLS on both tables (service role only, like seed 667). An employee's own check is read through the API, never the table.
- `checks` joins the change log (`record_changes`, seed 676 pattern) so every status change is history.

---

## 8. Slices

| # | Slice | Done when |
|---|---|---|
| **C0** | Let batches carry `check`: widen `payout_batch_items.method`; `dispatch.ts` groups checks; the batch wizard shows them | An employee with `payout_method = check` lands in a batch under "Checks", not "unassigned". Test pins the enum against `PAYOUT_METHODS`. |
| **C1** | `check_accounts` + `checks` tables; the settings page for the bank account (routing validated by ABA checksum, account encrypted, starting check number) | The account saves; only last4 ever reaches the browser; finance role only (route-gate test). |
| **C2** | Pure layout module `lib/checks/layout.ts`: amount-to-words, field positions, MICR line string, stub rows from `pay-stub.ts` | Unit tests: words for $0.01 – $99,999.99; MICR line format; stub totals equal net. |
| **C3** | PDF renderer (pdfkit, E-13B MICR font) and an alignment test page with calibration offsets | Printed alignment page lines up on real stock; MICR line within spec on a ruler check. |
| **C4** | "Print checks" for an approved batch: number assignment in one transaction, PDF, "printed OK / spoiled" confirmation, void and reissue | Two people printing at once can't get the same number; a spoiled sheet becomes a void plus a new number; payout items are marked paid with the check number. |
| **C5** | Check register page: search, statuses, void (with reason), copy PDF (watermarked), stale flag at 90 days | Every number shows, including voids; totals by status. |
| **C6** | Positive Pay export (PNC format) plus "exported" stamp | File matches PNC's spec (needs PNC's layout, owner action); exporting twice is idempotent. |
| **C7** | Employee side: choose "Paper check", "check ready" notification, stub in portal, cleared status | An employee sees their own checks only. |
| **C8** | Clearing: match cleared checks from the PNC statement/CSV import (`lib/payments/bank-reconcile.ts`) | Cleared checks flip automatically; anything outstanding over 90 days is flagged. |
| **C9** | (Optional) signature image under a limit with second approval | Off by default; tests prove it never prints over the limit. |

C0–C5 are the useful core (print, number, void, register). C6 is the fraud control and should land before checks are used for real. C7–C9 are polish.

---

## 9. Costs

| | Paper check (plan A) | ACH / direct deposit (exists) |
|---|---|---|
| Per payment | ≈ $0.15–0.40 (stock, toner, envelope) + office time to print, sign, hand out | $0 (file uploaded to PNC; check PNC's ACH fees) |
| One-time | MICR toner cartridge ≈ $100–250, a box of stock ≈ $30–60 | — |
| Bank | Positive Pay (ask PNC; often included or a small monthly fee) | — |
| Risk | Lost/stolen checks, forgery (mitigated by Positive Pay) | Wrong account number (mitigated by prenote) |

For a handful of employees on weekly pay, paper checks cost a few dollars a month in supplies. The real costs are the office's time and the fraud exposure, both of which Positive Pay and the register keep small.

---

## 10. Decisions for the owner

| # | Question | Default if not answered |
|---|---|---|
| **D1** | W-2 withholding: payroll provider (recommended), 1099-only, or build in-house (§5) | W-2 checks disabled; 1099 checks allowed |
| **D2** | Printing path: blank stock + MICR (A, recommended) or pre-printed PNC checks (B) | A |
| **D3** | Signature: by hand (default), or printed signature image under a limit | By hand |
| **D4** | Second-approval threshold for a print run | $2,500 |
| **D5** | Which bank account checks are drawn on (Business Checking x1225 is the natural one, not Spend x1401) | Ask before C1 |

**Owner actions outside the software:**
- ask PNC about Positive Pay and its file format;
- order check stock and a MICR cartridge that fit the office printer;
- confirm W-2 vs 1099 status for each worker with the CPA.

---

## 11. Risks

- **Real withholding** is the biggest risk. It's handled by D1; don't print W-2 checks on estimated taxes.
- **MICR quality:** cheap non-MICR toner leads to rejected or delayed checks. Do a test run, and deposit the first check at a branch to confirm it reads.
- **Number drift on pre-printed stock** (plan B only). The register is the source of truth; the paper must match it.
- **The "recording is not sending" rule** (`methods.ts`) still holds: printing a check doesn't pay anyone. It's paid when issued, and confirmed when cleared.
