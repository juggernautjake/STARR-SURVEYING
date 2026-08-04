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

---

## ✅ F2 — pass-through recovery. **DONE 2026-08-04** (model + schema; UI is F2b.)

`lib/finance/cost-recovery.ts` + `seeds/573_cost_recoveries.sql`, 14 tests.

**The design decision this slice is:** not a boolean.

`receipts.is_pass_through BOOLEAN` is the obvious model and it is wrong in exactly the case that
costs money. Pay a sanitarian **$450**, bill the customer **$400**, and the flag says *"pass-through,
nets to zero"* while the job quietly lost $50. Over a year of small shortfalls that is a real number
nobody ever sees, because every individual row looked like a wash.

So recovery is **arithmetic over real linked amounts**, and the delta is always reported with a sign:

| state | when | `isNoNetGain` |
|---|---|---|
| `NOT_RECOVERED` | paid, nothing billed yet | no — and it needs attention |
| `NO_NET_GAIN` | billed exactly what was paid | **yes** |
| `UNDER_RECOVERED` | billed less — the job absorbed the difference | no |
| `OVER_RECOVERED` | billed more — that is margin, not a wash | no |
| `NOT_RECOVERABLE` | deliberately absorbed | no |

`isNoNetGain` is true for exactly one state, asserted as a whole-set property so a state added later
cannot quietly start counting as a wash. **There is no tolerance band**: a penny of difference is a
difference, because a rule that quietly absorbs pennies is indistinguishable from one that absorbs
dollars. And over-recovery is named — billing $500 for a $450 cost is $50 of income, and filing it
as a wash understates income.

**Three modelling choices worth keeping:**

- **The link carries an amount and points at an INVOICE, not a line.** `customer_invoices.line_items`
  is a JSONB array with no stable per-line identity, so a foreign key to "the line that recovered
  this" would be an array index that reordering silently invalidates — a link that looks intact while
  pointing at the wrong line is worse than no link. `line_description` snapshots the wording, which
  is what a customer quotes back at you.
- **Voided invoices are excluded from the total but kept as links.** An invoice raised and voided is a
  fact about what happened; deleting it would silently re-open the cost with no trace of the attempt.
  Voided-ness is read from `customer_invoices.status`, not duplicated here — two places recording the
  same thing is how they come to disagree.
- **"We ate it" is distinct from "not billed yet."** That difference is the bookkeeper's working
  queue. And a cost marked absorbed that nevertheless has live recoveries is reported as a
  contradiction to resolve, rather than silently preferring either side.

`summarizeRecoveries` reports **shortfall separately from net**, because netting them is how a run of
small unbilled costs disappears behind margin earned elsewhere.

`receipt_id` is a nullable FK on purpose: a pass-through cost often arrives as an emailed bill rather
than a photographed receipt, and refusing to record the recovery until a receipt exists would lose
the link entirely.

**Not applied to the live database** — owner's call. **Next: F3**, the one-line tax summaries, which
compose the card role (F1) with the recovery state (F2).

---

## ✅ F3 — the one-line tax summary. **DONE 2026-08-04.**

`lib/finance/tax-summary.ts`, 13 tests (40 across F1–F3).

**Derived, not generated.** Every input is already known — the category and `tax_deductible_flag` on
the receipt, the card role (F1), the recovery state (F2), and whether the receipt was promoted to a
capital asset. So this is a function of fields, not a question for a model. An AI-written summary
could disagree with the fields it summarises and would do so unpredictably, which is worse than no
summary at all: **a plausible sentence is exactly what stops someone checking.**

**The order of precedence is the design.** Several facts are true of the same row and they do not
carry equal weight:

1. **Whose money was it.** A client's card and a "fully deductible" category are both true of the
   same receipt, and the card wins — the category of a purchase we did not pay for is irrelevant.
   A personal card is a debt to a person now and an expense when repaid; collapsing those into one
   line is what double-counts it.
2. **Is it an expense at all this year.** A capital asset is depreciated, not deducted now.
3. **Did we get it back.** F2's wording is reused verbatim rather than re-phrased — two descriptions
   of the same arithmetic is how they come to disagree.
4. **How much is deductible.** Only now does the category's flag matter, and the 50% limit is named
   explicitly, because "partial" without the number gets re-derived wrongly at filing time.

Getting that order wrong is how a receipt ends up filed under a rule that never applied to it, so
each level is pinned by a test that asserts the *lower* rule did **not** win.

**Two deliberate stopping points:**

- An **unconfirmed** card match returns "check whose card paid this" and goes no further. A last4
  match is a suggestion; filing on one is the exact mistake F1's matcher refuses to make, and it
  would be undone here without this branch.
- An **unbilled** pass-through deliberately falls *through* to the deductible flag. A cost we have not
  yet billed on is still a business expense today — it is flagged for billing elsewhere, not withheld
  from the books.

Every path returns a non-empty line and a `basis` naming the rule that decided it, so a surprising
summary can be traced without re-deriving it. An empty cell in a tax list is the one outcome that
teaches people to ignore the column.

**`npm run build` clean. Next: F4** (bulk receipt capture) or **F5** (the general invoice builder) —
both are UI-led and independent of each other.

---

## ✅ F5 — the general invoice builder. **DONE 2026-08-04.** Mostly it already worked.

*Ask: "a full invoice builder so my dad can invoice anyone for anything."*

Checked before building, per the standing rule, and **most of "anyone for anything" was already
true**: `/api/admin/invoices` requires only a line item, `job_id` is a nullable FK, the customer is
typed free-form (name, email, phone, billing address), and the composer already has a job typeahead,
a contact picker, arbitrary line items, tax, due date, notes and the upfront/deposit rule. Nothing
about it was job-bound. **Eighth feature this session called missing and found present.**

**The one thing it genuinely could not do** was invoice someone whose email you do not have — a
neighbour paying cash, a contractor you will text the pay link to, anyone handed a printed copy.
The composer created *and sent* in a single action and demanded an email to do either:

```ts
if (!customer.customer_email.trim()) {
  setError('Please enter a customer email so we can send the invoice.');
```

That restriction lived **entirely in the page**. The API never asked for an email, so the capability
was there and the form was the thing withholding it — this repo's "built but unreachable" pattern,
in miniature.

**"Create without sending"** now produces a real invoice with its own number and `public_slug`, so
the pay link can be copied, texted or printed. It is not a lesser record; it is the same record, not
emailed. The email check is now conditional on sending. An invoice addressed to *nobody* is still
refused — not as a formality, but because it cannot be chased, reconciled against a payment, or found
again in the dashboard.

**And the success screen no longer reports a chosen outcome as a fault.** Its copy said *"email send
did not complete"* for every unsent invoice, which on this path would call the intended result a
failure. `notSentByChoice` separates "we didn't try" from "we tried and it failed".

6 tests, including one asserting the early return precedes the send fetch — without that ordering,
"without sending" would still send. `npm run build` clean.

**Remaining in this document:** F4 (bulk receipt capture), F6 (job intake — verify email delivery,
role-based notification targeting, and that the full submission is stored), F7 (explanations and
tutorials), and the UI halves F1b/F2b that put the card registry and pass-through recovery on screen.

---

## ✅ F6 — job intake. **VERIFIED 2026-08-04.** All four legs already worked; one owner decision left.

*Ask: "all job requests/queries come through both email and also come to the website and show up as a
notification to me and my dad. There should be certain roles that can see new job queries. All of the
information about the job should be recorded."*

Traced end to end rather than assumed. **Every leg is built and wired:**

| leg | state |
|---|---|
| Email to the office | `app/api/contact/route.ts` → Resend, to `EMAIL_RECIPIENTS` (info@, starrsurveying@yahoo, hankmaddux@) |
| Recorded as a lead | `insertLeadFromForm` — the row carries name/email/phone/company, property address, county, service type, project details, `howHeard`, click attribution, a salted IP hash, and a `SS-…` reference number that correlates the inbox email with the DB row |
| On-site notification | `notifyIntakeRecipients` → `notifyMany` with `type: 'lead.new'`, deep-linked to `/admin/leads/<id>`, escalated to `high` for a rush |
| Role-based targeting | `INTAKE_ROUTING_ROLES` — a single named list, not hard-coded addresses |
| Attachments kept | `uploadLeadAttachments` stores the bytes in the lead-attachments bucket and `signLeadAttachmentUrls` serves them back through short-lived signed URLs |

**A stale comment nearly cost a rebuild.** `lib/leads/intake.ts` says of attachments: *"The contact
route still emails the bytes via Resend; persisting bytes to Supabase storage is a follow-up slice."*
That follow-up **already shipped** — the upload is called at two sites in the route. Believing the
comment would have meant rebuilding working storage. Tenth feature this session called missing and
found present.

### What this slice actually adds: a guard on the CHAIN

154 tests across ten files already cover the individual helpers. What nothing covered is that the
route still *calls* them — and the failure mode here is silent and asymmetric:

- drop the notification call and **both emails still send**, so nothing looks broken. The only
  symptom is a bell that stops ringing, and nobody notices a notification that never arrives;
- drop the upload and the email still carries the bytes, so it looks fine until someone needs the
  file a year later and the mailbox has rotated.

`intake-chain-is-wired.test.ts` pins all four legs, in the spirit of
`research-modules-are-reachable`.

**The guard was broken on first write, and watching it fail is what caught it.** It asserted
`code.toContain('notifyIntakeRecipients')` — which matches the *import statement*, so the check
passed with the call renamed out of existence. Requiring `notifyIntakeRecipients(` makes it detect
the removal. That is three of the last four structural checks in this repo broken on first write in
exactly this way; the rule earns its place every time.

### The one genuine open item — an owner decision, not a defect

`INTAKE_ROUTING_ROLES` is `admin`, `employee`, `equipment_manager`, `field_crew` — effectively
everyone. The ask says *"certain roles"*, which suggests narrowing (a new customer query is
commercially sensitive, and a field crew member does not act on one). **Deliberately not changed
here:** who sees inbound work is a business decision, not a refactor, and silently narrowing it could
stop someone's alerts without their knowing. It is one line in one place when the owner says which
roles.

---

## ✅ F4 — bulk receipt capture. **DONE 2026-08-04.**

`lib/finance/receipt-batch.ts` + the queue wired into `app/admin/receipts/new/page.tsx`, 23 tests.

The first thing in this document that was genuinely **not** already built. The single-receipt path
exists (camera viewfinder, file picker, preview, upload) and `/api/admin/receipts/upload` takes one
file, stores it, and inserts a `pending` row with `extraction_status = 'queued'`. So bulk needs **no
new API and no new pipeline** — a bulk upload produces exactly the rows a one-at-a-time upload does,
and the worker cannot tell them apart. What it needed was the queue, the progress, and the failure
handling.

**The rule: one bad photo in twenty must not sink the batch, or vanish from it.** Two failure modes,
and the second is worse than the first:

1. `Promise.all` over twenty uploads rejects on the first failure and the caller has no idea which of
   the other nineteen landed. The obvious mistake.
2. Swallowing the error so the batch "succeeds" — nineteen filed, one gone, a green tick over the
   lot. **Nobody re-photographs a receipt they were told was uploaded.**

So every item reaches its own terminal state, `allSucceeded` is deliberately a *different question*
from `finished`, and the failure reason travels **with the row** — "3 uploads failed" does not tell
you which three, and a person cannot re-photograph an unnamed receipt.

**Sequential on purpose.** These are 12 MB photos from a phone on site; firing twenty at once
competes for one uplink, makes every one slower, and turns a flaky connection into twenty
simultaneous failures instead of one. It also makes the progress honest — "4 of 20" means four are
*filed*, not four *started*.

**Rejected files stay in the list** rather than being dropped at validation. A file that vanishes
between the picker and the list is indistinguishable from one the person forgot to select, so they
never re-add it. Retry is offered for failures only — a rejected file fails validation again.

**The page stays put on a partial batch.** Navigating away would hide exactly the rows that need a
person, which is the failure the whole slice exists to prevent.

### Two mistakes made and caught here, both worth recording

- **The route's own header comment is stale.** It says *"Returns `{ id, photo_url }` on success"*; it
  actually returns `{ receipt: inserted }`. Checked against the code rather than trusted — a wrong id
  would have produced rows the batch could not link to, silently.
- **The wiring test's comment-stripper broke twice, in opposite directions.** Removing block comments
  first treated the `image/*` inside a `//` header comment as an opening delimiter and deleted every
  import; removing `*`-prefixed lines first orphaned a JSDoc opener, whose regex then swallowed the
  function beneath it. **Both times the checker accused working code** — the most misleading way a
  checker can fail. It now reads the raw source and asserts *call shapes* (`await runBatch(`, a full
  `router.push` statement) that prose in that file does not contain. Watched failing.

---

## ✅ F3b — the tax summary reaches a screen. **DONE 2026-08-04.**

F1, F2 and F3 shipped as pure, well-tested modules with **no callers** — this repo's single most
frequent defect, and one this session has now named ten times in other people's code. This is the
first of them pinned to a surface a bookkeeper actually opens: the receipt detail panel in
`/admin/receipts`, directly under the raw "Tax flag" field it explains.

**It uses only the fields that exist today.** The card role (F1) and the recovery state (F2) arrive
with seeds 572/573, which are not applied. Rather than block the whole thing on that, the summary
answers the questions it *can* — capital asset, deductibility, uncategorised — and **does not assume
the answers to the others**. A test pins that specifically: with no card passed, the summary must
never mention whose money it was. Reading "Deductible business expense" and silently meaning "assumed
to be on a company card" is exactly the confident-wrong-answer this file was written to avoid; when
the columns land, the same call gains the card and recovery inputs and the sentence gets stricter on
its own.

Wiring guard watched failing. `npm run build` clean, 75 finance tests green.

**F1b/F2b — the card-registry and pass-through screens — remain**, and are the natural next slice
once seeds 572/573 are applied. There is nothing useful to render until the tables exist.

---

## ✅ F7a — the screen explains its own verdict. **DONE 2026-08-04.**

*Ask: "make it very intuitive and clear how to use the tools and create explanations and tutorials if
you can."*

F7 was sequenced last so it would not be written twice. The first instalment is not a manual: it is
**which rule fired on this row, shown next to the row**.

`taxSummaryFor` already returned a `basis` naming the rule that decided each verdict — and every call
site threw it away. `explainBasis` turns it into a sentence, and the receipt panel now shows the
verdict *and* the reason.

**Why this is the explanation worth having.** The precedence is genuinely surprising the first time
you meet it: a receipt whose category is "fully deductible" can correctly read *"not our
transaction"*, because whose money it was outranks what was bought. Without the reason, a reader's
only options are to trust the sentence or go and read the source — and a manual would not be open at
the moment the surprising line appears. Naming the rule turns a verdict into something checkable.

Every basis is covered, asserted as a **whole set** so a basis added later cannot ship without an
explanation and quietly fall back to something generic. 78 finance tests, `npm run build` clean.

**Still open in F7:** walkthroughs for the card registry and pass-through screens — which cannot be
written until F1b/F2b exist, and those need seeds 572/573 applied. Documenting a screen before it
exists is how the tutorial gets written twice, which is the reason F7 was sequenced last.

---

## ⚠ Correction 2026-08-04 — F1 and F2 are *wired but never fed*

A reachability sweep over `lib/finance` (the same one S18 added for `lib/cad`) reported **zero**
unreachable modules, which contradicted this document. Both claims were partly wrong, and the truth
is more useful than either.

**`payment-cards.ts` and `cost-recovery.ts` ARE reachable** — `tax-summary.ts` imports both, and F3b
wired `taxSummaryFor` into the receipt panel. So the earlier note that F1–F3 "shipped as pure modules
with no callers" was wrong by the time F3b landed.

**But the call site supplies neither input:**

```ts
taxSummaryFor({
  promotedToAsset: !!row.promoted_to_equipment_id,
  deductibleFlag: (row.tax_deductible_flag as DeductibleFlag) ?? null,
  category: row.category,
});
```

No `card`. No `recovery`. So `taxTreatmentForCard` and `computeRecovery` are imported, bundled, and
**never execute against real data** — the card-role branch and the recovery branch of the precedence
chain are unreachable in practice, not because they are wrong but because nothing hands them
anything.

**This is exactly the failure the handoff names from R14**, and it is worth naming again because a
module-reachability guard cannot see it:

> *Authored but not wired* is findable with a caller grep. **Wired but never fed** is not — the caller
> exists, the modules degrade honestly when their optional dependency is missing, and the result is a
> feature that reports truthfully on work it never did.

F3b was correct to ship that way — the columns do not exist until seeds 572/573 are applied, and
passing a card the database cannot supply would have been worse. The point is that **"F3 is wired" and
"F1/F2 run" are different claims**, and only the first is true today.

**The test that would close it** belongs with F1b: once `receipts.payment_card_id` exists, assert
that the receipt panel resolves the card and passes it, and that a receipt on a client card shows
"not our transaction" *on screen* rather than only in a unit test.

---

## ✅ Browser verification 2026-08-04 — F4 and F5, against a production build

The CAD doc's S14c note recorded that the finance UI shipped today had **unit and wiring tests and
had never been opened in a browser**. Closing that, against `npm run build` + `npm start`:

### F4 — bulk receipt capture

Fed the bulk picker **two JSON files** — deliberately the wrong type — and every honesty rule fired:

| behaviour | observed |
|---|---|
| Per-file reason, on the row | *"Only photos and PDFs can be uploaded as receipts."* — **twice, once per file** |
| Rejected files stay in the list | **yes** — both rows rendered |
| Summary refuses to imply success | *"None uploaded — all 2 failed. **Nothing was filed.**"* |
| Finished batch is not re-runnable | button reads **"Batch finished"** |
| Page errors | none |

That is the rejection path, which is the one this slice was designed around: a file that vanishes
between the picker and the list is indistinguishable from one the person forgot to select, and a
summary that says "done" over two failures is how a receipt goes missing. Both held.

### F5 — invoice anyone, including people with no email

| behaviour | observed |
|---|---|
| Both actions present | **`Create without sending`** beside `Create + send invoice` |
| Tooltip explains when to use it | *"Creates the invoice and its pay link without emailing anyone. Use this when you don't have an email, or you'll…"* |
| Empty form refuses rather than crashing | *"Please add at least one line item."* |
| Page errors | none |

### What is still unverified in a browser

**F3b / F7a** — the tax summary and its `Decided by:` explanation on the receipt detail panel. Both
render only inside an expanded receipt row, and this environment has no receipt data to expand. It
needs a real receipt, so it is **recorded as unverified rather than assumed working** — the same
standard applied to the CAD slices.

---

## S19 — the money pages were reachable by anyone signed in (2026-08-04)

Found while chasing the "no receipt data" claim above. `/admin/receipts` reported **0 receipts**, and
the reason was not an empty table: the page's own fetch was answering **403**, and the count read 0
because the request failed. The console said so; the page did not.

Pulling that thread: `/admin/receipts` had **no `ROUTE_ROLES` entry in `middleware.ts`**, and
unmatched `/admin/*` paths fall through to `NextResponse.next()`. Any authenticated user could load
the bookkeeping approval queue. Thirty-six admin page routes were in that state; **seven were money
surfaces**.

### What was and was not at risk

Nothing leaked. All seven fetch through `/api/admin/*` routes that check `isAdmin`, and every one of
the fifteen pages examined makes **zero direct database calls** from the page body — so a field-crew
visitor got a shell full of 403s, not anyone's money. This is a **defence-in-depth and UX defect**,
not a breach, and it is worth stating at that size rather than a larger one.

### What was deliberately NOT gated

A blanket "add `admin` to all of them" would have caused two regressions worse than the bug:

| left open | why |
|---|---|
| `/admin/people` | The staff directory is open to staff **by design** — the code says *"a crew member looking up a colleague's number is the most common use of it."* Its API strips roles and account state for non-admins instead of refusing. A gate would delete a feature, not protect one. |
| `/admin/billing`, `/payouts`, `/audit`, `/org-settings`, `/orgs`, `/invites` | SaaS surfaces scoped by **org membership** via `resolveAdminOrg()`, not by Starr's internal roles. Gating on `admin` would lock out the org admins they exist for. |
| `/admin/money`, `/work`, `/office` | Link hubs; every destination is gated individually. |

### The regression this slice nearly shipped

The first version copied each API's stricter `isAdmin` into middleware. That would have bounced every
`developer` and `tech_support` user to `/admin/me` **the moment they clicked a link their own sidebar
still shows them**. Trading a broken page for a vanishing one is not a fix. The gates now match the
**nav registry's** role list — a coarse filter that keeps out roles the product never offers the page
to, with the API remaining the real boundary.

Worse, `/admin/receipts` as a prefix also matches **`/admin/receipts/new`** — *Capture Receipt*, the
one money route that belongs to the whole crew. Shipped as first written, it would have bounced a
field surveyor at the moment they photographed a fuel receipt. `/admin/receipts/new` now precedes it
with the wider list. This was caught by the consistency check below, not by review.

### Enforced by construction

`__tests__/middleware/admin-route-gates.test.ts` — four invariants, **each watched failing** before
being kept:

1. **Every `/admin` page route is gated or knowingly open** — an `INTENTIONALLY_OPEN` allowlist where
   each entry carries a reason. A new ungated page fails until someone decides about it. *(Caught
   `/admin/learn` on first run — intentional, now recorded.)*
2. **Specific prefixes precede general ones** — the table is first-match-wins with a `break`, so
   `/admin/jobs` above `/admin/jobs/new` would silently hand job creation the wider list. The file
   said this in a comment; a comment cannot fail. Checked across all 34 prefixes.
3. **No nav link is shown to a role its own gate would bounce** — checked over all 84 registry
   entries. *This is what caught the `/admin/receipts/new` regression above.*
4. Instrument guards on all three, because a scan that silently returns nothing makes every
   assertion pass vacuously — a failure mode this repo has hit before.

### Known mismatch, left for the owner

The nav offers `/admin/receipts`, `/admin/invoicing`, `/admin/reports`, `/admin/compliance` and
`/admin/finances` to `developer` and `tech_support`, while those APIs answer only to `admin` — so
those two roles get a 403 shell today. That predates this slice. Closing it means either **widening
the APIs** (a permissions decision) or **dropping the nav links** (a product one). Both are the
owner's call, not a side effect of a middleware slice, so both were left alone and written down here.

**Verification:** 12 middleware tests green, 3,689 across the adjacent suites, `tsc` and `eslint`
clean. Not browser-verified — middleware compiles into `.next` and the running server predates the
change; the behaviour is asserted statically against the real `middleware.ts` and
`route-registry.ts` sources instead.

## ✅ F7b — the screens' account of themselves had drifted from what they do. **DONE 2026-08-04.**

F7's remaining walkthroughs are for the card registry and pass-through screens, and those genuinely
wait on seeds 572/573 — documenting a screen before it exists is how the tutorial gets written twice.
But F7's brief is *"what each finance screen is for, what a field means, and what happens next"*, and
checking that against the two screens which **are** settled found both describing a narrower tool
than they had become.

| screen | said | actually does |
|---|---|---|
| `/admin/invoices/new` | **"Create + send invoice"** · *"The customer gets an email with a one-click payment link."* | Also creates an invoice **without sending**, for a customer with no email — which is the half F5 was built for |
| `/admin/receipts/new` | *"Snap a photo … pick a file or PDF"* — one at a time | Also takes a **whole batch** at once, each file queued separately |

**This is the same defect as a comment that has drifted from its code, and it is worse.** A stale
comment misleads the next developer, who can read the code. Stale copy misleads the person using the
tool, who cannot. Somebody who reads *"Create + send invoice — the customer gets an email"* and has
no email address for that customer concludes the screen cannot help them and goes looking for another
one, and there isn't another one. Somebody holding a fortnight of fuel receipts reads *"pick a file"*
and uploads them one at a time. **In both cases the capability shipped and the screen's description
of itself stayed where it was.**

The batch control did carry a tooltip. A tooltip is found by someone already reaching for the
control; it does not reach the person deciding whether this screen is the right one.

**The claim about charging was verified, not assumed** — the new lede says nothing is charged until
the customer uses the link, and `POST /api/admin/invoices` inserts a `draft` row with a pay link and
makes no Stripe call. Writing an explanation is exactly the moment to state something confidently
wrong.

### ▶ The test found its own instrument broken three times

`__tests__/finance/screens-describe-what-they-do.test.ts` pins the agreement, since nothing else does:
the behaviour has tests and a browser pass, and no check fails when a page describes a capability it
no longer has. Getting it to *look at the right text* took three corrections, each caught by running
the negative control and reading **which** assertion failed rather than that one did:

1. `indexOf('invoice-page__title')` found the post-submit success heading (*"Invoice #### ready"*).
2. `lastIndexOf` found the `.invoice-page__title { … }` rule in the styles block at the foot of the
   file — so neither version was ever looking at a heading, and both reported green.
3. Selecting the composer's lede by `/send/i` picked the success lede, whose JSX reads
   `success.sent`. It failed against copy that was already correct.

**A control that fires for the wrong reason is not a passing control.** The file is two screens
wearing one set of class names, and matching JSX rather than hunting string offsets is what finally
made it honest.

86 finance tests, `tsc` and `eslint` clean, `npm run build` compiles.

**Still open in F7:** the card-registry and pass-through walkthroughs, unchanged — blocked on seeds
572/573, not on effort.

## ✅ F7c — F3b/F7a are no longer unverified, and the reason they were is instructive

The verification note above records F3b and F7a as **shipped but unverified**: the tax summary renders
only inside an expanded receipt row, and no environment available to this program has receipt data.
That was honest, and it stood for two sessions.

**The blocker turned out to be self-inflicted.** The summary was an arrow function invoked inside JSX,
in the middle of a 700-line client page. Nothing could call it — not a test, not a script, only a
browser with a real row to expand. The data was never the whole problem; the *shape* was.

`receiptTaxLine(row)` is the same three lines, in `lib/finance/tax-summary.ts`, where a fixture can
reach them. **No data was invented to satisfy a check** — a fixture row is not a claim about
production, and every assertion is about the field mapping and the wording, both properties of the
code rather than of the database.

### ▶ What these tests protect that `taxSummaryFor`'s own tests cannot

Those prove the sentences. **Nothing proved the page handed over the right three fields.** Passing
`category_source` where `category` belongs, or dropping `promoted_to_equipment_id`, produces a wrong
verdict that still reads perfectly — the exact failure this summary exists to prevent, speaking in the
summary's own voice. Each field is now pinned to the sentence it changes:

- `promoted_to_equipment_id` present → *capital asset*; null → not. It is an id column, so the check
  is presence rather than a boolean, and getting it wrong double-counts real money: a capital asset is
  depreciated rather than deducted **and** excluded from the Schedule C total.
- `tax_deductible_flag` → a bookkeeper's inline override must change the sentence.
- `category` → two categories must not produce the same line.
- An **empty row** — the state every receipt is in between upload and extraction — still yields a
  labelled two-line answer. A blank panel would read as "no tax consequence", which is a claim.
- With no card known it must not say *company card*: card role arrives with seed 572, and assuming
  company money would be invisible and wrong about half the time at a firm that also spends from
  personal cards.

### ▶ An existing test broke, and its intent was kept rather than its assertion

`tax-summary-is-wired.test.ts` asserted the page contains `taxSummaryFor({` — true of the old inline
IIFE, false once the call moved. The fix was **not** to delete it. Its intent — *the page must not
carry its own copy of the rule* — is now checked by the **absence** of one (`not.toContain
('taxSummaryFor({')`) plus the presence of `receiptTaxLine(row)`. Weakening a test because a refactor
tripped it is how a suite stops meaning anything; this one is now stricter than it was.

The negative control re-derives the summary inside the page and fails by name.

8 new tests, 94 finance tests, `tsc` and `eslint` clean, production build compiles.

**Still genuinely blocked:** F1b/F2b and the card-registry/pass-through walkthroughs, on seeds
572/573. `lib/finance/payment-cards.ts` and `cost-recovery.ts` have zero callers *for that reason* —
recorded here so the next reachability sweep reads it as a known gate rather than a new defect.

## ✅ F7d — the owner's one blocking action, de-risked. **DONE 2026-08-04.**

Everything left in this document waits on one command: `node scripts/apply-seeds.mjs`, which applies
seeds 572 (`payment_cards`) and 573 (`cost_recoveries`) and unblocks F1b, F2b and the remaining F7
walkthroughs. **Nothing in this repo checked that those two seeds would actually apply.**

Seeds are not executed by the suite, `tsc` never sees them, and a bad `REFERENCES` is a hard Postgres
error. So the failure would surface **on the owner's machine, at the moment they ran the one command
that unblocks the feature** — and it would read as *"your seeds are broken"* rather than *"573 came
before 323"*.

**Both seeds check out**, verified rather than assumed:

| checked | result |
|---|---|
| Idempotency | `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` throughout; the RLS policy is guarded by an existence query |
| `registered_users(id)` | exists, `uuid`, and is the **primary key** — Postgres requires the referenced column to be unique, so a table keyed on `email` would have failed |
| `customer_invoices(id)` | created in seed **323**, comfortably before 573 |
| `receipts(id)` · `jobs(id)` | seeds 220 and 000 |

One of those was a genuine near-miss in reasoning: `registered_users` is queried by **email**
everywhere in this codebase, so "it is probably keyed by email" was the plausible read. It is not —
`id uuid` with `registered_users_pkey PRIMARY KEY (id)`. The FK is valid, but it was valid by luck
until checked.

### ▶ Generalised, because per-seed hand-checking is what gets skipped

`__tests__/seeds/fk-targets-exist-in-order.test.ts` sweeps **371 seeds / 335 created tables** and
fails when any `REFERENCES` names a table that no seed creates, or one created by a *later* seed.
It found nothing today — which is the point of running it before the owner does.

`auth.users` is the one external table, listed explicitly rather than pattern-matched so a genuine
`public.users` typo is still caught. Both instrument guards are present (the scan must find seeds,
and must find `REFERENCES` clauses at all), and **both failure modes were watched failing**: a probe
seed referencing a table nothing creates, and a low-numbered seed referencing `payment_cards` from
seed 572 — each named by file and by table in the failure message. Both probes deleted, and the seeds
directory verified clean afterwards.

It is not a SQL parser and does not replace applying them: column existence, type compatibility and
constraint validity still need a real database. It answers the one question this layout invites
someone to get wrong.

**Still blocked, unchanged:** seeds 572/573 are written, verified and unapplied. F1b, F2b and the
card-registry/pass-through walkthroughs wait on them, and `lib/finance/payment-cards.ts` and
`cost-recovery.ts` have zero callers for that reason rather than by neglect.

## ◑ F6b — "come through both email" has two readings, and only one is built

F6 above says *"every leg is built and wired"* and traces five of them. That is true for the reading
the slice took, and silent about the other — which is a materially different feature.

The ask: *"all job requests/queries **come through both email and also come to the website** and show
up as a notification to me and my dad."*

| reading | meaning | state |
|---|---|---|
| **(b) one channel, two destinations** | a request submitted on the website is emailed to the office **and** appears in the app | **BUILT.** F6's table is a correct trace of it. |
| **(a) two arrival channels** | a request may arrive *by email* — a customer writing to the office directly — or on the website, and either becomes a recorded job query | **NOT built.** |

Reading (a) is at least as natural — *"come through"* describes arrival — and it is the one that
matches how a customer who has your address behaves.

### ▶ What actually happens to an email today

`app/api/webhooks/email-inbound/route.ts` exists and is provider-agnostic, but it handles **replies,
not enquiries**. It looks for an `SS-…` reference number, threads the message onto that lead as a
`lead_replies` row, and **drops anything without one**:

    if (!parsed) return { success: true, stored: false, reason: 'no_reference_number' }

So a customer emailing the office cold is discarded. No lead, no notification, no record. And the
route is unconfigured anyway — without `EMAIL_INBOUND_WEBHOOK_SECRET` it answers **503**, so no email
reaches it at all today.

**One thing was fixed here rather than deferred.** That drop had **no log**, while the
unknown-reference branch immediately below it already warned — so the *more* consequential case was
the quieter one. It now warns with the sender and says plainly that if this was a new enquiry it has
not been recorded and nobody was notified. An enquiry that vanishes silently is indistinguishable
from one that never arrived, and that is the failure this whole program is written against.

**The rest is deliberately not built.** Turning free-text email into a job query means parsing a name,
a phone number and a service out of prose, deciding what is spam, and deciding whether a half-parsed
enquiry is better than none. That is a feature with real judgement in it, and inferring which reading
was meant would be guessing at the shape of the work rather than at a detail of it.

**Owner decision, and the only one this document adds:** should a cold email to the office become a
job query? If yes, F6b is the slice — inbound parsing, a lead from an unstructured message, and a
policy for what to do when the parse is thin. If no, the current behaviour is correct and the warning
above is the whole fix.

29 inbound tests still green; `tsc` and `eslint` clean.

## ✅ F8 — the five orphaned payments modules, triaged. **DONE 2026-08-04.**

`lib-orphan-ratchet` records 41 modules with no production importer and says of itself: *"MEASURED —
not triaged. Giving each of 44 modules a real reason means investigating 44 modules."* Five of them
are payment-domain, so they belong to this document. Investigated, one at a time:

| module | verdict |
|---|---|
| `payments/rls-allowlist.ts` | **Not a defect.** Documentation-as-code: the canonical list of every payment table and its expected RLS posture, consumed by `payment-rls-audit.test.ts`, which fails the build when a table's posture drifts. Same shape as `dnd/ai-scope.ts` and `glossary/coverage.ts`, which the D&D guard exempts by name. A runtime caller would not make the claim any more true. |
| `payouts/stripe-payout.ts` | **Owner-gated, as designed.** Its header calls it a *"gated foundation for paying EMPLOYEES via Stripe (Connect transfers)"*. Unreachable because the feature is switched off, not because it was forgotten. |
| `payments/secrets.ts` | **Unreached because nothing encrypts yet.** An app-layer wrapper over the pgcrypto helpers in seed 324; nothing anywhere calls `pgp_sym_decrypt` or touches a payment secret. The wrapper is not missing a caller — the *feature it wraps* has no data. |
| `payments/customer-snapshot.ts` | **Superseded in practice.** It merges customer details from several sources into one invoice snapshot. `POST /api/admin/invoices` persists `customer_name` / `customer_email` / `billing_address` **straight from the request body**, and the composer's job-picker auto-fill does the merging in the UI. The helper duplicates a job the screen already does. |
| `payments/allocation-reports.ts` | **A second revenue answer — the one worth acting on.** See below. |

### ▶ Two modules answer "what revenue did we make", and they read different tables

| | `payments/allocation-reports.ts` | `lib/reports/revenue-periods.ts` |
|---|---|---|
| exports | `revenueByPeriod`, `rollupAllocationsByCategory` | `periodWindows`, `sumRevenue` |
| reached by | **nothing** | `/api/admin/reports?metric=monthly-revenue` |
| reads | invoice **allocations**, by category | **`job_payments`** |
| from | `CUSTOMER_INVOICING_PHASE2` (completed) | `hub-widget-excellence-11` |

The wired one arrived **later** and the earlier one was left in place. They do not merely duplicate —
they sum **different tables**, so they can disagree about the same month, and only one of them is on
screen. That is the two-copies-drift defect applied to revenue, which is the number a business owner
is least able to check by eye.

**Not resolved here, deliberately.** S4b and S4c deleted a dead spatial index and a superseded bearing
helper because the supersession was documented and traceable. This one is not: nothing says
allocation-reports was replaced, the two read different sources, and choosing between them is a
question about *which figure the firm considers revenue* — invoiced-and-allocated, or payments
received. That is the owner's answer, not a refactor.

**Third parallel-implementation pair found today**, after the two spatial indexes (S4b) and the
worker's two AI-spend trackers (R4b). Recorded together because the pattern is now the finding: this
codebase grows a second implementation whenever a later slice needs something the earlier one already
did, and nothing notices until a reachability sweep asks.

## ✅ F9 — the finance surface verified, and the invariant its tests cannot see. **DONE 2026-08-04.**

Everything left in this document is seed-blocked, so this pass verified what is already built rather
than adding to it. **Three checks, and the first two found nothing** — which is the result, and worth
saying plainly.

| checked | result |
|---|---|
| **Finance API routes with no caller** | None. All consumed, including every `[id]` sub-route — `/send`, `/approve`, `/void`, `/ach-csv`, `/match`, `/mark`. |
| **`cost-recovery` arithmetic** | 14 tests covering every state the doc emphasises: partial ≠ no-net-gain, a single cent is a difference, over-billing is margin, voided invoices excluded but kept. |
| **Money units** | Integer **cents** throughout, with division confined to a display helper. Correct by construction. |

**The first two checks each produced false positives before producing a result**, and both were the
probe rather than the code:

- *"Nine finance routes have no caller."* Every one contained a dynamic segment (`[id]`, `[email]`),
  and callers build those with template literals — a literal path match cannot see
  `` `/api/admin/receipts/${id}` ``. All nine are called.
- The same shape as S1b's twelve dialogs and its two-line dispatch. **Third consecutive investigation
  where a naive path match was wrong**, which is now less a coincidence than a property of the tools.

### ▶ The invariant the 14 tests cannot see

`cost-recovery`'s tests are thorough **and every one of them uses round amounts** — $450 paid, $400
billed, $50 short. That is the natural way to write them, and it is exactly why a float bug would
survive: `450.10 - 400.10` is not `50` in IEEE 754, and no existing case uses a value where that
shows.

The code is right — integer cents everywhere. But **that correctness is invisible to the tests that
depend on it.** Someone adding `costUsd: number` beside `costCents` would break no assertion; the two
would simply be added together somewhere later, and the first wrong number would appear on a real
invoice with an odd cent in it.

`money-stays-in-cents.test.ts` locks it two ways: it rejects any dollars-denominated field declared in
`lib/finance`, and it exercises `computeRecovery` at **odd-cent resolution** — an exact recovery of
$450.10, a one-cent shortfall reported as `-1`, and three $100.01 links summing without drift. Those
are the cases the round-number suite cannot express.

It is honest about its limits: field names are a proxy, not a proof. A correctly named `_cents` field
could still be handed a float. It catches the realistic mistake, not a determined one.

**Its control was the sixth false green of the session** — a `node -e` replace reported success having
matched nothing, and only `grep` showed the field was never added. Redone with an editor; the guard
then failed by name.

99 finance tests green; `tsc` and `eslint` clean.

## ✅ F1b DONE 2026-08-04 — the card registry, built before the seed rather than after it

This document recorded F1b as *"cannot be built until seeds 572/573 exist — there is nothing to
render."* **Checked, after six stale reasons turned up elsewhere today, and it was not quite true.**

The seed is written and was verified to apply cleanly (F7d). What a missing table changes is exactly
one thing: the query fails. So the route handles that **one** failure honestly and the feature works
the moment `apply-seeds.mjs` runs — instead of waiting for a session that happens to come afterwards.

`lib/finance/payment-cards.ts` has answered the owner's question since F1 — *"recognize if the cards
used to pay for things are on file, and what the card role is"* — and had **no caller** for that
reason alone.

### ▶ "No cards" and "no registry" are different sentences

Postgres answers a query against a missing relation with **42P01**, distinguishable from every other
failure. So the route reports a not-yet-created table as exactly that, with the command that fixes
it — and the page renders it as a warning rather than an empty list.

An empty list would invite a bookkeeper to register a card that cannot be saved, and would read as
*"no cards are on file"*, which is a claim. It is the same distinction `describeBalance` makes about
an unknown balance, and the same one S-9c made about an unwired source: **a thing we cannot see is not
a thing that is not there.**

Two smaller decisions in the same spirit: the tax treatment is computed **server-side** by
`taxTreatmentForCard` and travels with each card, so the browser never holds a second opinion about
tax treatment; and **retired cards are shown, not filtered**, because a receipt from March still
points at whatever card paid it.

### ▶ Three checks caught three of my own mistakes

1. **The route's row shape was invented** — `holder_email`, `active`, `notes`. The real columns are
   `holder_user_id` and `retired_at`. `tsc` caught it against the real `PaymentCard`.
2. **The page declared its own `CardTaxTreatment`** with `statement` and `needsAnswer`. Neither
   exists; the fields are `summary` and `needsResolution`. **`tsc` was silent**, because a local
   interface is a perfectly valid type — the page would have rendered `undefined` for every card.
   Importing the real type is what let the compiler answer the question, and it is the same lesson as
   the `as never` casts removed elsewhere today: **declaring or casting a shape disables the only
   check that would have found it wrong.**
3. **S19's own guard caught the new page** — `/admin/cards` was neither gated nor recorded as open.
   It is now `admin`, matching its API exactly. Not wider, and not stricter: W6c's rule is that a gate
   stricter than the boundary it shadows locks people out, and this one is equal to it.

Route + page both compile into the production build. 112 tests across the finance and middleware
suites; `tsc` and `eslint` clean.

**Still blocked:** F2b (pass-through recovery on screen) needs the same treatment and `cost_recoveries`
from seed 573 — the pattern above makes it buildable now too, and it is the obvious next slice.
