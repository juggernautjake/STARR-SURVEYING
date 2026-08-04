# Finance, tax, invoicing and job intake

**Opened 2026-08-04** at the owner's request, in one long burst of asks during a CAD session. Written
down first because they span four subsystems and would otherwise be re-scoped from memory.

---

## 0. What already exists — read this before building anything

The owner's own framing was *"we should already have a good deal of finance and tax management
stuff"*, and that is correct. This repo's most expensive recurring mistake is rebuilding something
that already shipped, so each slice below states what it is **adding to**, not what it invents.

| area | state |
|---|---|
| Receipts | Substantial. `app/admin/receipts` — AI extraction with per-field confidence, categories + `category_source`, `tax_deductible_flag`, an approval workflow (`status`/`approved_by`/`rejected_reason`), soft-delete with retention and a "Show deleted" audit toggle, promotion of a receipt to a capital asset in `equipment_inventory`, links to maintenance events, and a "Batch QQ" tax summary that excludes promoted receipts so dollars do not land twice on Schedule C |
| Payment identity | `payment_method` and `payment_last4` on the receipt row — **and nothing else**. No card registry, no owner, no role |
| Customer invoicing | Shipped: `/pay` portal, composer, dashboard, on `customer_invoices` (NOT the Stripe `invoices` table), upfront rule, gated by `PAY_PORTAL_PASSWORD` + `PAYMENTS_LIVE` |
| Invoicing UI | `app/admin/invoicing` (525 lines) + categories; `app/admin/invoices/new` |
| Job intake | `app/admin/leads` + `app/api/admin/leads`, with a `lead.new` bell-icon notification that is dismissed when the lead leaves `new` |
| Finances | `app/admin/finances`, `app/admin/money`, `app/admin/billing`, `app/admin/mileage` |

**So most asks below are gaps in a working system, not new systems.** The two genuine modelling gaps
are the card registry and pass-through cost recovery.

---

## 1. Slices

### F1. The card registry — whose card was this, and is it ours?

*Ask:* "We need to be able to recognize if the cards used to pay for things are on file or not and
what the card role is. Some cards may be personal cards of clients or customers or employees, or they
might be cards that belong to the company or my dad's personal cards or mine."

Today a receipt carries `payment_last4` and no idea whose card that is. The tax treatment of a
charge depends entirely on that answer — a company card is a company expense, an employee's personal
card is a reimbursement, a client's card is not our transaction at all — and right now nothing
records it.

- A `payment_cards` table: last4, brand, a label, an **owner** (a person or the company), and a
  **role**: `COMPANY`, `OWNER_PERSONAL` (distinguishing the two owners by person, not by a flag),
  `EMPLOYEE_PERSONAL`, `CLIENT`, `UNKNOWN`.
- Matching a receipt to a card on `last4` is **a guess, and must be labelled one.** Several cards
  share a last4 eventually; a matched card is a suggestion until confirmed, and an unmatched one is
  reported as *"this card is not on file"* rather than silently left blank.
- The unmatched case is the useful one: a charge on a card nobody has registered is exactly what a
  bookkeeper needs surfaced.

### F2. Pass-through costs — the no-net-gain case

*Ask:* "Sometimes we pay sanitarians and other professionals to help us complete the survey, and then
we charge the customer for that. Those types of situations are a no net gain and need to be
determined and recorded."

This is the sharpest modelling gap. The money moves twice and nets to zero, and unless the two legs
are *linked*, the books show an expense and an unrelated revenue — which overstates both sides and
misstates the profit on the job.

- A link between the expense (receipt / bill) and the invoice line that recovers it.
- A computed **recovery state** per expense: `not-recovered`, `recovered-in-full`, `recovered-partly`
  (with the delta), `not-recoverable` (we ate it).
- **A partial recovery is not a no-net-gain event** and must not be reported as one. If we paid a
  sanitarian $450 and billed $400, that is a $50 loss on the job, and rounding it to "net zero" is
  the failure this slice exists to prevent.

### F3. Short tax summaries per financial interaction

*Ask:* "create very short summaries for all receipts and financial interactions that would affect how
we handle taxes… take care of our taxes very quickly and easily."

A one-line, plain-language statement of the tax consequence — *"Deductible business meal, 50%
limited"*, *"Reimbursement owed to Jacob — not a company expense"*, *"Pass-through, recovered in full
on INV-1042 — no net gain"*, *"Capital asset, depreciated, not a current-year deduction"*.

Derived from the fields already present (category, `tax_deductible_flag`, card role from F1,
recovery state from F2), **not** re-inferred by an AI call — the inputs are known, and a summary that
can disagree with the fields it summarises is worse than none.

### F4. Bulk receipt capture

*Ask:* "a setting to do bulk receipt additions, where we can just take a bunch of pictures of
receipts and invoices and upload them all at once, as well as just one receipt at a time."

The single-receipt path exists (`receipts/new`). Bulk adds: multi-select / multi-capture, a queue
with per-item extraction status, and per-item review before commit. The existing extraction pipeline
is per-receipt and reused as-is; the work is the queue, the progress reporting, and the failure
handling — one bad photo in twenty must not sink the batch or silently vanish from it.

### F5. The general invoice builder

*Ask:* "a full invoice builder so my dad can invoice anyone for anything."

`customer_invoices` and its composer are built around a customer and a job. This is the general case:
an arbitrary payee, free-form line items, no job required — while still feeding the same ledger and
the same `/pay` portal, so a general invoice is not a second parallel system with its own reporting.

### F6. Job intake — email, on-site notification, and a role gate

*Ask:* "all job requests/queries come through both email and also come to the website and show up as
a notification to me and my dad. There should be certain roles that can see new job queries. All of
the information about the job should be recorded."

`lead.new` notifications already exist. To verify then close the gaps: that every intake path
(website form, email, phone entry) lands in the same place; that email delivery is actually wired and
not just intended; that notification targeting is **role-based** rather than hard-coded; and that the
full submission is stored rather than a summary — a lead whose details were truncated at intake
cannot be recovered later.

### F7. Explanations and tutorials

*Ask:* "make it very intuitive and clear how to use the tools and create explanations and tutorials
if you can."

In-context explanation over a manual nobody opens: what each finance screen is for, what a field
means, and what happens next. Sequenced last deliberately — documenting F1–F6 before they settle
means writing the tutorial twice.

---

## 2. Standing rules

Carried from the CAD and research programs, each learned expensively:

1. **Check what exists before building.** Six times in the CAD program a "missing" feature was found
   already present. §0 exists for this reason.
2. **A guess must be labelled a guess.** F1's last4 match and F3's derived summary are both places
   where a confident-looking answer would be wrong some of the time.
3. **Never silently net to zero.** F2's partial-recovery case is the specific trap.
4. **Drive it in a browser.** Every browser pass in the CAD program found a bug the suite missed.
5. **`npm run build` before declaring done.** Three times a green suite has sat on a broken build.

## 3. State

**F1 DONE 2026-08-04 (model + schema; UI is F1b).** See the note under F1.

**Previously:** nothing built — this document was written first, on purpose. Start at **F1**, because F2 and
F3 both depend on the card role, and F3 depends on F2's recovery state.

---

## ✅ F1 — the card registry. **DONE 2026-08-04** (domain model + schema; the UI is F1b.)

`lib/finance/payment-cards.ts` + `seeds/572_payment_cards.sql`, 13 tests.

**The rule the whole slice is built on: a match on `last4` is a guess.** Four digits are not an
identifier. Two cards sharing a last4 is ordinary inside one wallet and effectively certain across a
company card, two owners' personal cards and a handful of employees'. So `matchCardByLast4` never
returns "this is the card" — it returns candidates with a stated confidence, and **every outcome sets
`needsReview: true`, including the single-match case.** Auto-applying a lone match is how a charge on
an unregistered card silently inherits someone else's tax treatment. There is deliberately no unique
index on `last4` either: it would encode the opposite claim and make the honest case impossible to
record.

**What the role actually decides.** Not "what was bought" but *whose money was it*:

| role | treatment | company expense now? |
|---|---|---|
| `COMPANY` | company expense | **yes** |
| `OWNER_PERSONAL` | reimbursement owed to that owner | no |
| `EMPLOYEE_PERSONAL` | reimbursement owed to that employee | no |
| `CLIENT` | **not our transaction** | no |
| `UNKNOWN` | undetermined — cannot be filed | no |

Exactly one role is a company expense at charge time, and that is asserted as a whole-set property so
a role added later cannot quietly become deductible. A reimbursement becomes an expense when it is
*paid* — a separate event with its own date. Treating it as one at charge time double-counts it and
hides a real debt to a person; and booking a client's charge as ours invents an expense that never
existed.

`UNKNOWN` has no treatment **on purpose**. Returning a plausible default is the single most damaging
thing that function could do, because the row would then look filed.

**Three schema decisions worth keeping:**

- `payment_card_id` is separate from `payment_last4` and never rewrites it. The two answer different
  questions — what the receipt *said* (evidence, immutable) versus who we *concluded* that was
  (a judgement, correctable).
- `payment_card_confirmed_by` / `_at` exist so a suggestion the software made and a decision a person
  made do not look identical after a page reload.
- `retired_at` rather than deletion, and retired cards still match: a receipt from March points at
  whatever card paid it, and deleting a closed card would silently turn last year's filed receipts
  into "not on file" — history changed by an action about the present.

A CHECK constraint refuses a personal card with no holder: a reimbursement with no payee is worse
than `UNKNOWN`, because it looks answered.

**Caught while writing the seed:** the receipts table is `receipts`. The file is named
`220_starr_field_receipts.sql` and the RLS policies inside it are named `starr_field_receipts_*`, so
the obvious inference from the filename is wrong and would have failed on apply. Noted inline.

**Not applied to the live database** — that is the owner's call, per the standing rule. Apply with
`node scripts/apply-seeds.mjs`.

**Next: F2** (pass-through recovery), which needs the card role this slice establishes.
