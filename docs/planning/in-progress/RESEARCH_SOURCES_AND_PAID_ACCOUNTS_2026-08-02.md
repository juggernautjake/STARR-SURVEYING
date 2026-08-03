# Research sources + paid accounts — 2026-08-02

Owner asked, mid-session, for three things:

1. Search **county sites, TexasFile, and several named sites**.
2. Analyse those sites and say **which would actually yield good results**, and find **more, especially free ones**.
3. Be ready to **hold account credentials and account balances**, so documents can be paid for — with a
   **card on file and automatic top-up** when a balance falls below a threshold.

This document answers (2) and specifies (3). Slices are marked `S-n`.

---

## 1. The sites, analysed

Every one below was opened in a real browser on 2026-08-02. "Free" means a search returned results
without a login or payment.

### ★ Texas GLO — General Land Office (FREE, authoritative)

`https://www.glo.texas.gov/archives-heritage/search-our-collections/land-grant-search`

**This is the most valuable source found, and the platform had nothing from it.**

No login, no payment, and the search fields are a surveyor's vocabulary:

```
county · abstractnumber · originalgrantee · patentee · classtype · filenumber
certificate · titledate · patentdate · patentnumber · patentvolume
partsection · surveyblocktownship
```

Every Texas metes-and-bounds description is written against an **original survey** — *"the JOSE ORTIZ
SURVEY, ABSTRACT 123"*. GLO holds the original land grant for that survey, back to **1720**, with
6 million documents digitised. County clerks hold the *conveyances*; GLO holds the *foundation the
conveyances describe*.

Nothing else on this list can answer "what is the original survey this deed sits in".

**Verdict: build an adapter. Highest value per hour of anything remaining.**

### ★ texaslandrecords.com — Avenu Insights (FREE index, paid documents)

`https://www.texaslandrecords.com/txlr/TxlrApp/index.jsp`

23 counties with **free index search**; documents require a subscription. The page says so plainly:
*"the chance to do a free index search on other participating counties"*.

> Angelina, Bandera, Castro, Cherokee, Cochran, Cooke, Duval, Edwards, **Falls**, Hutchinson,
> **Leon**, Live Oak, **Madison**, Marion, McMullen, **Robertson**, Rusk, San Jacinto,
> San Augustine, Upton, Val Verde, Wilbarger

**This is the same Avenu system already proven** for Falls and Robertson via `i2i`/`i2j`
`uslandrecords.com` — a different front door onto the same records. Leon and Madison are already
covered by Kofile. So it adds ~19 counties, all outside the 80-mile ring, but statewide it is real
coverage at no cost for the index.

**Verdict: worth an adapter after GLO. The existing Avenu parser should mostly transfer.**

### TexasFile (PAID, 254 counties)

Already surveyed (R38). Free to search and it reports counts — *"We found 5,000 records matching…"* —
then requires registration to view. Covers **all 254 counties**, which nothing else does.

**Verdict: the correct paid subscription, and the one that closes every remaining gap.** See §3.

### tsl.texas.gov — Texas State Library (FREE, reference)

`https://www.tsl.texas.gov/ref/propertyresearch`

Not a records system — a curated index of sources. Useful ones it points at:

| Source | Value |
|---|---|
| GLO Land Grant Database | the ★ above |
| TSLAC map collection, Sanborn fire-insurance maps | historical footprints, useful for improvements |
| Portal to Texas History (UNT) | digitised county maps showing landowners |
| UT Perry-Castañeda map collection | historical Texas maps |
| FamilySearch county tax rolls 1837–1910 | ownership evidence pre-dating many deed indexes |
| Comptroller county directory | authoritative list of all 254 CAD sites |

**Verdict: not an adapter target itself, but the map collections are a real secondary source for
historical boundary evidence, and the Comptroller directory is the authoritative CAD list.**

### ✖ publicrecordsdata.us — NOT SUITABLE

`https://www.publicrecordsdata.us/property?...`

The page states, in its own header: **"PUBLICRECORDSDATA.US IS NOT A GOVERNMENT-AFFILIATED OR
CONSUMER REPORTING AGENCY — Operated by an independent data provider."**

Observed pricing on the page: **`$1 … $30 … $720`**. That is a one-dollar trial that converts to a
recurring subscription, which is a billing pattern to stay away from on principle — and especially
so given §3 puts a card on file with automatic top-up.

Beyond the billing: it is a **data broker reselling aggregated records**, not a records custodian. It
is not authoritative, it cannot produce a certified copy, and a resold record is not evidence in a
boundary dispute. Its data ultimately comes from the county sources this platform already reads
directly.

**Verdict: do not integrate. It offers nothing the county sources do not, and it would put a
recurring charge on the card for data we can already get.**

---

## 2. Additional free sources worth having

Found while researching the above:

| Source | What it gives | Cost |
|---|---|---|
| **GLO Land Grant Database** | original surveys, abstracts, patents from 1720 | free |
| **GLO historic map store** (`historictexasmaps.com`) | early county maps showing landowners | free to view |
| **Portal to Texas History** (UNT) | digitised county maps, plat books | free |
| **Sanborn fire-insurance maps** (LoC + TSLAC) | building footprints 1877–1922 | free |
| **FamilySearch county tax rolls 1837–1910** | ownership chains before deed indexes | free w/ account |
| **Comptroller CAD directory** | authoritative list of all 254 appraisal districts | free |

The GLO map store and Portal to Texas History matter for the same reason GLO's grants do: when a
1920s deed calls for a monument that no longer exists, a period map is often the only way to place it.

---

## 3. Paid accounts, balances and automatic top-up

Owner's requirement, verbatim in intent: hold account info so we know we *have* an account, track the
**money in each account** so we can pay for documents, keep a **card on file**, and **auto-add funds
when the balance drops below a threshold**.

### S-1. Credential storage — never in this repo's database in plaintext

Vendor logins (TexasFile, Avenu subscriptions, CountyFusion county logins) are **secrets**, not
config. They go in the environment/secret store the worker already uses for `ANTHROPIC_API_KEY` and
the Supabase service key — never in `research_site_adapters.config`, which is queried, logged and
seeded into version control.

What the database *should* hold is the **non-secret** half: which vendor, which counties it unlocks,
whether an account exists, when it was last verified, and the balance. A row that says
"TexasFile: account exists, verified 2026-08-02, balance $41.20" is useful; a row containing the
password is a breach waiting to happen.

### S-2. Balance tracking

A `vendor_accounts` table: vendor, account identifier, current balance, currency, low-water
threshold, last-verified timestamp, and a `balance_source` recording **how** the balance was learnt
(scraped from the vendor page, or inferred from our own purchase ledger).

That last field matters and is this project's recurring lesson in a new place: **an inferred balance
and a confirmed balance are different facts.** If we have not read the vendor's own page since three
purchases ago, the number we hold is an estimate, and a top-up decision made on an estimate can
either overspend or fail a purchase mid-run. The column forces that distinction to be visible.

### S-3. Card on file — tokenised, never stored

**No card number ever touches this system.** The repo already has Stripe wired for customer
invoicing. The same mechanism applies here in reverse:

1. Owner adds a card once through a Stripe-hosted flow (SetupIntent).
2. Stripe returns a **payment-method token**. We store the token and the last four digits. Nothing else.
3. Top-up creates an off-session PaymentIntent against that token.

This is not a preference — storing raw card data would put this system in PCI scope, and there is no
version of that worth doing for a document-fee wallet.

### S-4. Auto top-up

When a vendor balance falls below its threshold, charge the card for a fixed top-up amount and record
the transaction.

Three guard rails, all of which exist because an automatic payment loop that goes wrong is expensive
and quiet:

- **A monthly ceiling.** Auto top-up stops at a cap the owner sets and asks rather than charging past it.
- **A minimum interval.** Two top-ups within a few minutes means something is wrong — a mis-read
  balance, a retry storm — and the second should be refused, not honoured.
- **Every charge recorded before it is attempted**, so a crash mid-charge leaves evidence rather than a
  silent double-spend.

### S-5. Purchase ledger reconciliation

Every document purchase already has a cost. The ledger and the vendor's own balance should be
reconciled on a schedule, and a divergence should be **reported, not silently corrected** — the same
rule as everywhere else in this build.

### Owner decisions still needed for §3

- **Top-up amount and threshold** per vendor (e.g. "top up to $100 when below $25").
- **Monthly ceiling** for automatic charges.
- **Which vendors** to open accounts with. TexasFile is the one that closes real gaps; Avenu
  subscriptions only matter for counties whose index we can already read for free.

---

---

## 4. Two research modes — free first, paid on demand

Owner's requirement: the researcher picks a mode when starting a run.

**FREE mode** — every free source and county site. Expected to take 20–30 minutes. If it does not
answer the question, the researcher escalates.

**PAID mode** — the paid sources as well. Available as an escalation *or* as the starting choice,
when the researcher wants the best result immediately without waiting for the free pass.

### S-11. Mode selection and the free-source set

FREE mode covers: GLO, every county portal in the 22 routed counties, texaslandrecords' free index,
the free CAD portals, and the free map/reference sources. PAID adds TexasFile and any subscription
portal.

The 20–30 minute expectation is a real constraint, not a note: it means free mode has to run sources
**concurrently** and report progress, or a researcher will assume it has hung.

### S-12. Document identity — the rule that stops us paying twice

Owner's requirement, and the hard part: **never pay for a document we already have**, whether we got
it free or already bought it from another paid site.

This needs a **document identity key** that is stable across vendors, and that is genuinely
difficult, because the same instrument is cited differently everywhere:

```
Kofile        2019-3389          Tyler Eagle   2025028512
Aumentum      8577 347-249       Avenu         OR/00062/223
eDocTec       395664             iDocMarket    2026-02531
```

The natural key is **county + instrument number + recording date**, but only after normalising the
instrument number — stripping punctuation, leading zeros and series prefixes, and keeping book/page
as a separate fallback key for records that have no instrument number at all (Avenu publishes none).

**Two documents match only if the county AND the normalised citation AND the recording date agree.**
Date is part of the key because instrument numbers restart in some counties — a rule already learnt
and encoded in the eDocTec and Aumentum parsers.

### S-13. Never guess a match

The dedup decision is a **spending** decision, and it fails badly in both directions:

- A **false match** skips buying a document we do not have. The research is silently short, and the
  reason is invisible — the worst outcome in this whole document.
- A **false miss** buys a duplicate. That costs a few dollars and is visible in the ledger.

So the rule is: **when identity is uncertain, buy it.** A wasted dollar is recoverable; a missing
deed presented as a complete record is not. Any near-match that is not an exact key match must be
recorded as `uncertain` with both citations, and the run should say how many purchases were made
under uncertainty rather than hiding it.

### S-14. Free-first ordering within paid mode

Even in PAID mode, the free sources run **first**, and every document they return is registered in
the identity index before a single paid source is queried. Paying for a document that a free source
was about to return is exactly the waste the owner is asking to avoid, and ordering is what prevents
it — not filtering afterwards.

### S-15. Purchase ledger as the source of truth

Every purchase records the identity key, the vendor, the price and the run. A repeat purchase of the
same key — in the same run or a later one — is reported. This is also what makes the balance
reconciliation in S-5 meaningful: the ledger says what we spent, the vendor says what it took, and a
divergence is a question rather than a rounding error.

---

## Slice order

| Slice | What | Blocked on |
|---|---|---|
| S-6 | **GLO adapter** — free, authoritative, original surveys | DONE 2026-08-02 |
| S-7 | **texaslandrecords (Avenu) adapter** — 23 counties, free index | nothing |
| S-8 | `vendor_accounts` schema + balance tracking (S-1, S-2) | nothing |
| S-9 | Stripe card-on-file + auto top-up (S-3, S-4) | owner: amounts, ceiling |
| S-10 | Ledger reconciliation (S-5) | S-8 |

**S-6 is DONE** (2026-08-02): `GloLandGrantAdapter`, driven live — Bell County returns 1,523 grants;
Bell + grantee DUNCAN returns 5, with GLO record ids and free PDFs. S-7 (Avenu aggregator) is the
next unblocked slice, then S-11/S-12 (two modes + document identity).
