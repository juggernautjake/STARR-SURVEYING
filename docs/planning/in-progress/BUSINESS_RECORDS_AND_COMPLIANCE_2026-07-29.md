# Business records & compliance tracking — 2026-07-29

**Owner ask, verbatim:**

> *"We need to create a check list/to do list that allows us to go through and gather all of the documents
> listed to keep on file so that we never lose them and they are all up to date and current. We need to
> build a system that keeps track of all time sensitive files and documents that require filing at certain
> times or renewals. Please make sure we have a planning doc to help us do all of this. Please find all of
> the forms and documents and paths to acquiring all of the information. We need the information that will
> get us to where we can make the website app work."*

Entity: **Starr Technical Services, Inc.** (DBA Starr Surveying) · Belton, Bell County, TX · corporation ·
RPLS-led · 1099 crews. SOS file # 0801236986 · EIN 27-2009146 · Comptroller taxpayer # 32041336093.

---

## Audit first — and one finding reframes the whole thing

Two things were checked against the issuing authorities before any code was written.

### ⚠ 1. Texas taxes surveying, and the owner's checklist had it backwards

The master checklist said *"professional surveying is generally not taxable in TX, but confirm with your
CPA."* It is the other way round. **34 TAC §3.276 (Surveying Services)**, effective 11 April 2022:

> "A person who performs a surveying service… for consideration **must obtain a sales and use tax permit
> and collect and remit sales or use taxes** on all charges for taxable surveying services."

| Taxable | Not taxable (performed independently) |
|---|---|
| Boundary, easement, land title, title, right-of-way surveys; subdivision plats; **staking or placement establishing a structure's location relative to property boundaries** | **Construction** surveys, design, geodetic, hydrographic, **topographic**, seismic, tree surveys |

Two statutory exclusions: a **contractor** purchasing the survey as part of constructing a **new improvement
to residential real property**, and a **landman** performing it to negotiate or secure land or mineral
rights. §3.276 superseded the surveying portions of the older Rule 3.356.

One trap worth knowing before anyone accepts a certificate: a surveyor may **not** accept a resale
certificate from an engineering firm for taxable surveying acquired in order to provide *nontaxable*
engineering services.

**Why this reframed the work.** The invoicing code took `tax_cents` as a number the office typed by hand,
with the comment *"we don't compute sales tax — the office knows the customer's jurisdiction better than the
app does."* The jurisdiction half is true and is preserved. The rest was the problem: no invoice recorded
**which lines were taxable, at what rate, or why** — so a mistyped rate was silent, and an audit could not
be answered from the invoices. Since taxable and non-taxable work land on the same invoice constantly (a
boundary survey and a topo, same site, same day), the split has to be itemised.

**Owner action, not ours:** confirm permit status, and ask the CPA about prior periods **before** filing.

### 2. The licences are already in hand

The checklist's own numbers, now recorded in the register: **RPLS #6706** (Hank, active through
2026-12-31, renewal window 1 Nov – 31 Dec) and **TBPELS firm registration #10193754**. An earlier read of
this had the firm registration as possibly missing — it is not. What *is* outstanding is that the Belton
address change needs to reach the Board.

### 3. Much of what the checklist asks for, the app already does

| Checklist item | Where it already lives |
|---|---|
| Document vault | `/admin/files` — `file_nodes` + `file_permissions` (seeds 384/385) |
| Invoices issued, A/R | `customer_invoices` + receipt PDFs |
| Expense receipts, mileage logs | field receipts + manual mileage → financials |
| Equipment inventory by serial | equipment + assignments |
| Job register | `jobs` |
| Bank reconciliation | `/admin/finances/reconcile` |
| Payments (card, ACH, cash, check) | `lib/payments/live.ts` — 7 methods, pledge flow, `/admin/payments/inbox` |

So this is **not** a build-from-scratch. The gap is a *register* that says what should be on file, and a
*calendar* that says when each thing comes back around.

---

## Ground rules

- **G1 — The register is data, not prose.** A checklist in a document answers "what should we have?" once
  and then rots. The second question — "what is due in the next 60 days?" — is the whole value of the ask,
  and it needs the cadence to be a field. Hence `lib/compliance/records-catalogue.ts`.
- **G2 — Verified and owner-stated are marked apart.** `verified` means checked against the issuing
  authority. `ownerStated` means the owner's own numbers, recorded as given. Conflating them is how a
  checklist ends up confidently wrong, which is exactly what happened with the sales-tax line.
- **G3 — `pending` is not `action`.** An I-9 requirement that starts at the first W-2 hire is not an
  overdue task. Showing it as one buries the real ones.
- **G4 — Never invent a due date.** `once`, `per_event` and `ongoing` records return no date at all. A
  fabricated deadline for "collect a W-9 before first payment" would flood the calendar with items that can
  never be done on time.
- **G5 — Fail toward compliance.** An uncategorised invoice line is presumed taxable. An exemption without
  its certificate does not exempt. A record whose retention cannot be computed may not be destroyed.
- **G6 — Professional questions go to professionals.** `professionalReview` routes an item to the CPA,
  the attorney or the insurance agent. Worker classification is the loudest case and is written out in
  `workerClassificationNote` rather than modelled around.
- **G7 — No invented tax rates.** Texas is 6.25% state plus local options up to 2%, and for a real
  property service the rate follows the **jobsite**. The rate is an input, validated against the floor and
  the cap. Guessing 8.25% would be wrong quietly and often, on the one number a customer checks.

---

## Slices

### S1 · Sales tax, computed and recorded — **SHIPPED 2026-07-29**
`lib/payments/sales-tax.ts` + 34 tests. §3.276's own two category lists (not paraphrased), both statutory
exclusions, per-line taxability with the basis recorded (`override` / `category` / `presumed`), rate
validation that **rejects rather than clamps**, one rounding step on the aggregate, and a plain-language
explanation of the arithmetic so a customer can check it. The `structure_staking` vs `construction`
distinction is pinned by its own test — same crew, same day, different tax answers.

### S2 · The records register — **SHIPPED 2026-07-29**
`lib/compliance/records-catalogue.ts` — all ten checklist categories, ~70 records, each with why it is
kept, who issues it, the form number and URL, the fee, the recurrence and the retention. Plus
`salesTaxNote` and `workerClassificationNote`.

### S3 · The deadline engine — **SHIPPED 2026-07-29**
`lib/compliance/deadlines.ts` + 42 tests. Pure UTC calendar math with `today` as a parameter. Handles the
annual date, the **renewal window** (an open window promotes out of `upcoming`, because its opening is the
actionable moment), quarterly, monthly, already-lapsed records reported against their own expiry, and
retention expiry that refuses to green-light destroying a permanent record.

### S4 · `/admin/records` — the surface — **NEXT**
The register and the calendar are reachable by nothing yet, which is this repo's signature defect. Needs:
a dashboard leading with overdue and window-open items, the register grouped by category with status, the
professional-review queue, and each row linking to its stored document in `file_nodes`.

### S5 · Persisting status
The register ships with the owner's stated status baked in. Marking something "on file" has to persist —
a `business_records` table keyed on the catalogue id, holding status, the vault node, the current expiry
and who confirmed it. The catalogue stays the source of truth for *what* is required; the table records
*where this business stands*. Seed 464.

### S6 · Invoice tax UI
Wire S1 into the composer: a category picker per line, the jobsite rate, the exemption claim and its
certificate, and the arithmetic shown. The API must compute the tax server-side rather than trusting a
client-supplied `tax_cents` — otherwise the recorded basis and the charged number can drift.

### S7 · Alerts
The app already has a notifications system. A weekly digest of what is due, and an escalation when a
window opens, is what turns the tracker from something you visit into something that tells you.

### S8 · Retention enforcement
Job files carry a 10-year retention keyed to Texas' statute of repose for design professionals
(owner-stated; **worth the attorney confirming**, since every span in the operations category derives from
it). Sealed deliverables are permanent. The vault should surface what is past retention rather than
delete anything automatically.

---

## Forms and where to get them

Downloaded to `~/Downloads/` — `Belton-Address-Change/` and `Starr-Launch-Paperwork/`, each with a README.

| Document | Form | Authority | Source |
|---|---|---|---|
| Assumed name (renew "Starr Surveying") | 503 | TX SOS | `sos.state.tx.us/corp/forms/503_boc.pdf` |
| Registered agent/office change | 401 (+401-A, keep on file) | TX SOS | `sos.state.tx.us/corp/forms/401_boc.pdf` |
| IRS business address change | 8822-B | IRS (mail only, Ogden UT) | `irs.gov/pub/irs-pdf/f8822b.pdf` |
| Public Information Report | 05-102 | TX Comptroller | `comptroller.texas.gov/forms/05-102-a-26.pdf` |
| Sales & use tax permit | AP-201 | TX Comptroller | `comptroller.texas.gov/forms/ap-201.pdf` |
| Surveying firm registration | — | TBPELS | `pels.texas.gov/surveying_firm.htm` |
| Contractor taxpayer ID | W-9 | IRS (you collect) | `irs.gov/pub/irs-pdf/fw9.pdf` |
| Employment eligibility | I-9 | USCIS (at first W-2 hire) | `uscis.gov/i-9` |
| Withholding | W-4 | IRS (at first W-2 hire) | `irs.gov/pub/irs-pdf/fw4.pdf` |

Online flows with no downloadable form: **SOSDirect** (SOS filings), **Comptroller Webfile/eSystems**
(franchise, PIR, sales tax), **D&B** (D-U-N-S update), **Apple Developer**, **Google Play Console**,
**Stripe** activation, **PNC** business banking.

### What specifically gates the website and the mobile app

**Website payments** — the code is built and gated. Set in Vercel: `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAY_PORTAL_PASSWORD`,
`PAYMENT_ENCRYPTION_KEY`, then `PAYMENTS_LIVE=true`. Stripe activation needs the PNC account first.

**Mobile app** — both stores require a **D-U-N-S number registered to the legal entity**. Apple rejects
DBAs, trade names and branches, so enroll as `Starr Technical Services, Inc.`, never as "Starr Surveying".
Google warns the D&B side can take up to 30 days. Apple is $99/yr and **lapsing pulls your apps from the
store** — it is in the register as an annual deadline for that reason. Google Play is $25 once. Beyond the
accounts, the remaining mobile work is the device-gated background-upload runtime (`BLOCKERS.md` §C).

---

## Why this stays good

The failure mode this is built against is the one the checklist itself was heading for: a thorough
document that is accurate on the day it is written, is trusted for years, and is wrong about one line —
which is precisely what happened with sales tax. Making the register data means a wrong entry can be
corrected in one place and every view of it updates; marking `verified` apart from `ownerStated` means a
reader can see which claims were actually checked; and keeping the deadline math pure with `today` as a
parameter means "what does this look like on 30 December?" is a test rather than a thing you find out in
December.
