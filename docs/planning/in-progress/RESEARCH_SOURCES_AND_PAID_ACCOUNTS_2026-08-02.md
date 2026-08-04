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

### S-16. The Comptroller CAD directory — a fact where there was a guess. ✅ DONE 2026-08-03

§2 listed the *Comptroller CAD directory* as "worth having". It turned out to close a live defect
rather than add a nice-to-have.

**What `generic-cad-adapter.ts` was doing:** to find a county's appraisal district it ran a **Google
search** and asked a **vision model to pick the right link off the results page** — once per county,
every run. Three problems in one:

- it spends a search plus an AI call every time, for a value that never changes;
- it depends on Google's result ordering, which is not ours to rely on;
- **the URL is unverified.** A model picking from a search page can return a data broker, a paid
  aggregator, or a lookalike domain as easily as the official district — and everything downstream
  would then present whatever it scraped as *county appraisal data*.

That last point is this platform's signature defect stated exactly: **an unknown rendered as an
answer**. The Comptroller publishes the fact, so the fact now wins.

**What shipped:** `worker/src/research/cad-directory.ts` — all **254** counties with the
Comptroller's county number, district name, website, phone and email, scraped from the official
directory (index + 254 pages at ~4 req/s) and committed as generated data.
`generic-cad-adapter.discoverPortalUrl()` consults it **before opening a browser**; the search-and-
guess path survives only as the fallback for the **13** counties with no published site, which is
the last resort it always should have been.

It returns the district's SITE, not a deep link to its property search. That is the honest trade —
the guessed URL was specific but unverified, this is general but verified, and the adapter navigates
from a home page perfectly well.

**The extraction's own bugs are the useful part of this note:**

- A first pass wrote **Motley's mailing address into the website field** ("P.O. Box 249 Floydada,
  TX 79235-0249"). It *looked* populated, which is what made it dangerous: nothing downstream can
  tell such a value is wrong, and a caller would navigate to it instead of falling back. Hostnames
  are now validated, and Motley is `null` — 13 counties are null on purpose, because **null is
  honest and a plausible-looking wrong value is not.**
- A first pass also lost **Wilson** to a transient fetch failure and would have shipped 253 counties
  quietly. Retries with backoff recovered it; the count is asserted at exactly 254.
- The block is bounded to the Appraisal District section, because the Tax Assessor-Collector's
  website sits directly below it on the same page and would have been captured as the district's —
  a wrong answer that looks completely right.

18 tests, including four spot checks anyone can verify independently (`hcad.org` is the state's
largest district) and three asserting the adapter consults the directory **before** `initBrowser`,
since consulting it afterwards would keep both the cost and the risk.

**Lookup refuses to be clever.** It tolerates "Bell County", "Bell CAD", case and whitespace, and
returns `null` for anything else — a fuzzy match would silently point a run at the wrong county's
appraisal roll.


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

**WIRED 2026-08-03.** The note below already recorded that S-11 and S-12 "shipped as modules with no
callers". S-12's wiring was fixed by S-13/S-14 — **S-11's was not, and stayed unwired for another
day.** No type carried a mode, no endpoint read one, and `/research/purchase` bought documents
regardless of what a researcher picked. The mode picker governed nothing.

`/research/purchase` now takes `mode`, builds the plan for the county, and in FREE mode **returns
before the purchase orchestrator is constructed**. That ordering is the whole point: filtering after
the fact refunds nothing, so free mode has to mean the paid phase does not *run*. A test asserts the
guard precedes the orchestrator, because a check placed after it would still spend.

Three decisions worth keeping:

- **The default is `paid`.** This endpoint *is* the paid phase, and silently turning it into a no-op
  for every caller that has not been updated would look exactly like a run that found nothing to buy
  — the failure this slice exists to prevent, reintroduced by the fix for it.
- **The count of unbought documents is stated**, and the report carries `mode` and `modeStatement`.
  A free run and a run that found nothing worth buying produce the identical empty `purchases` array,
  and those are opposite facts: one is a spending decision the researcher made, the other is a
  finding about the county.
- **The skip is not filed as an error.** Nothing failed. Putting it in `errors` would drop a
  successful run into a failure queue.

Worker suite 81 files / 1,352 tests; root typecheck and `npm run build` clean.

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

> **S-13 and S-14 are DONE (2026-08-03).** Both are wired into the real purchase path — see the note
> at the end of this document. S-11 and S-12 shipped as *modules with no callers*, which prevented
> no spending at all; the wiring is what makes them true.

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
| S-7 | **texaslandrecords (Avenu)** — 23 counties, free index | DONE 2026-08-03 |
| S-8 | `vendor_accounts` schema + balance tracking (S-1, S-2) | DONE 2026-08-03 |
| S-9 | Stripe card-on-file + auto top-up (S-3, S-4) | **owner: amounts, ceiling** — but there is now a form for them (2026-08-03); what remains is the SetupIntent + charge, which needs a live Stripe decision |
| S-10 | Ledger reconciliation (S-5) | DONE 2026-08-03 (`reconcile()`; the scheduled sweep waits on S-9) |
| S-16 | **Comptroller CAD directory** — all 254 appraisal districts, replacing a per-run Google+AI guess | DONE 2026-08-03 |

**S-6 is DONE** (2026-08-02): `GloLandGrantAdapter`, driven live — Bell County returns 1,523 grants;
Bell + grantee DUNCAN returns 5, with GLO record ids and free PDFs. S-7 (Avenu aggregator) is the
next unblocked slice.

**S-12 is DONE** (2026-08-02): `worker/src/research/document-identity.ts` — cross-vendor document
identity, the near-miss rule, and `DocumentIndex.decide()` which fails toward buying. S-11 (the two
run modes) now has the piece it depended on.

**S-7 is DONE** (2026-08-03), and it was not the slice it looked like.

`texaslandrecords.com` is **not a records system and needs no adapter**. Its county list is 22 plain
`<a href>`s pointing at the very `uslandrecords.com` portals this platform already drives, plus three
Kofile portals. There is nothing behind it to parse.

What it is instead is the lookup table R39 said did not exist. The rule until now was that an Avenu
county's subdomain "is NOT derivable from the county name … each has to be found from the county's
own site" — which is why that adapter served **two** counties. Avenu publishes the mapping. So the
slice became a county-list expansion, and the adapter's parser needed no change at all:

| | |
|---|---|
| Avenu counties routed | **2 → 19** (Angelina, Bandera, Castro, Cherokee, Cooke, Duval, Edwards, Falls, Hutchinson, Madison, Marion, McMullen, Robertson, Rusk, San Jacinto, San Augustine, Upton, Val Verde, Wilbarger) |
| New Kofile counties | **2** — Cochran, Live Oak (Leon was already routed) |
| Subdomains | i2i, i2j, **i2m**, **i2g** — two more than the pair we had, confirming the letters are not a sequence |
| Adapter code changed | none — both new subdomains were driven and return the identical grid |

Driven before being listed, not after: **Val Verde** (i2g) `SANCHEZ MARIA` → 313 rows; **San
Augustine** (i2m) `THOMAS JOHN` → 44 rows reaching back to **1838**. All 19 portals rendered the live
search form.

Three things worth carrying forward:

- **A probe can manufacture a dead site.** Marion failed `fetch()` twice and would have been written
  off as unreachable; in a real browser it loads fine — it bounces through
  `?AspxAutoDetectCookieSupport=1`, which Node's fetch does not survive. The standing rule here is
  that a county is listed only because its portal *answered*, but that rule is only as good as the
  instrument doing the asking. "We could not reach it" is itself a claim.
- **A county can contradict itself.** San Augustine's certification banner says its index starts
  01/01/1800; its welcome text says 01/02/1856; and a real Bill of Sale filed **2/26/1838** came back
  from it. Both claims are now recorded and neither is resolved — a search landing between them is
  told the county disagrees with itself, rather than being handed a confident answer in either
  direction. Three other counties (Cherokee, Marion, Val Verde) publish no certification banner at
  all, so their coverage is prose, and `coverageConfidence()` now says which kind of claim each one
  is instead of reporting all nineteen in the same voice.
- **Certified-through ≠ last-recorded.** Duval certifies through 07/31/2025 but its last recorded
  document is dated 07/31/2026. A year of documents is in the index and outside the certification,
  which is a real distinction in a title search.

---

**S-13 + S-14 are DONE** (2026-08-03) — the dedup rule now runs on the path that spends money.

S-11 and S-12 shipped as modules with **zero callers**. The purchase step was still deduping with
`findOwned(countyFIPS, instrument)`: an exact match on the raw instrument number against the purchase
ledger. That misses three ways at once — no cross-vendor normalisation (Kofile's `2019-3389` vs Tyler
Eagle's `20193389`), no book/page fallback (so Avenu's records, which carry no instrument number,
could never match), and it only knows what was *bought*, so a document the free pass already returned
did not stop the paid purchase of the same one. That last is exactly the owner's requirement.

Now the free pass is registered into a `DocumentIndex` **before any paid source is queried**, each
purchase consults `decide()`, and the report carries an identity block stating *both* sides —
skipped-as-already-held **and** bought-under-uncertainty.

**The rule that decides what may be registered.** A watermarked preview is *seen*, not *held*.
Kofile's free tier returns watermarked pages and removing the watermark is the whole reason to buy
the document; registering one as held would end the run with a watermarked image standing in for a
clean one, no purchase in the ledger, and nothing saying a document was missing. So registration
requires a usable copy — unwatermarked, with a page image on disk. Everything else is counted and
reported, never registered.

**And Phase 9 could never buy anything.** The budget guard read `estimatedCost` by stripping
non-digits and parsing the rest, which glued the ends of a range together:

```
"$6-12" → 612       "$4-8" → 48       "$12-24" → 1224
```

Against the default $25 budget every recommendation was unaffordable, so Phase 9 logged
`Budget exceeded — skipping <instrument>` and bought nothing. The failure wore the costume of a
deliberate spending limit — nothing looked broken, and the only symptom was a run that never bought
the document it had just called the highest-ROI purchase available. Fixed and pinned.

---

**S-8 + S-10 are DONE** (2026-08-03) — `seeds/569_vendor_accounts.sql` (applied to production;
`research_vendor_accounts` + `research_vendor_topups` are live and empty) and
`worker/src/services/vendor-accounts.ts`.

S-1 and S-3 are satisfied by what the schema *refuses* to hold: no password, no card number, no API
key. `credential_env_var` stores the NAME of the variable holding a secret so a missing credential is
diagnosable; `stripe_payment_method_id` is a token and `card_last4` is four digits, checked by a
regex constraint. A test asserts the absence — `expect(seed).not.toMatch(/card_number|cvv|.../)` —
because "we did not add a password column" is only durable if something fails when someone does.

**The column this table exists for is `balance_source`.** S-2 called an inferred balance and a
confirmed balance different facts; the schema now makes them impossible to conflate. `balance_usd` is
**nullable**, and a `CHECK` constraint enforces the pairing: `unknown` must carry no number,
`confirmed` must carry both a number and a `balance_checked_at`. A `DEFAULT 0` would have meant "this
account is empty" — a claim, indistinguishable from a genuinely drained account, and one that would
block purchases that should have gone through.

**Auto top-up refuses rather than improvises**, which is the inverse of the document-purchase rule
two files away. There, uncertainty means *spend*, because a false skip omits a document invisibly.
Here, uncertainty means *stop and say why*, because the failure mode is real money moved on a guess.
`decideTopup` declines — and marks itself `blocked` — on an inferred balance, a stale confirmation,
an unknown balance, missing limits, a suspended account, no card, a second top-up inside the minimum
interval, and an unsettled prior charge that may already have landed. It stops at the monthly ceiling
rather than charging a reduced amount, because a partial top-up leaves the balance below its own
threshold and triggers the same decision next run — a loop that bills every time round.

Two guard rails live in the database rather than only in code: auto top-up cannot be enabled without
all three numbers set, and a top-up target below its own trigger is rejected. Every constraint was
exercised against the live database inside a rolled-back transaction before the seed was committed —
nine cases, each accepted or rejected as intended.

`auto_topup_enabled` defaults to **FALSE** on every row. Nothing can charge a card until the owner
supplies the numbers, which is the remaining S-9 blocker.

**What is left in S-9**, and it is only the parts that need those numbers plus a Stripe SetupIntent
flow: creating the payment method, executing the charge, and the scheduled reconciliation sweep. The
decision logic, the ledger, the write-before-attempt ordering and `reconcile()` are all built and
tested.

**S-9's blocker was half self-inflicted — fixed 2026-08-03**
(`app/api/admin/research/vendor-accounts/route.ts` + `VendorAccountsPanel.tsx`, on the research
billing page).

"Blocked on the owner: amounts, ceiling" had been true since the slice list was written, and it would
have stayed true *after* the owner decided — because `research_vendor_accounts` shipped with its
schema, its CHECK constraints, its service and its tests, and **nowhere to enter the numbers**. There
was no route and no screen. A blocker with no form behind it is not waiting on a decision; it is
waiting on both.

The form does not charge anything and cannot. The card-on-file flow and the charge execution are
still the genuinely-blocked half. What this adds is the ability for the three numbers to exist, which
is exactly what `decideTopup()` refuses to act without.

**Nothing here can touch a card.** `card_last4`, the Stripe ids and every balance field are rejected
with an explanation rather than silently stripped — dropping a field the caller believed it set is
how a card ends up half-configured, where the UI says saved, the row says no card, and the next
top-up fails for a reason nobody can see. `credential_env_var` continues to hold only the NAME of an
environment variable; the route says so at the point where someone would be tempted to return more.

**The database is the authority; the route is the translation.** The CHECK constraints already refuse
`auto_topup_enabled = TRUE` without all three limits and refuse a target at or below its own trigger.
Those are not re-implemented as logic — but a CHECK violation reaches a person as an opaque Postgres
string, so the same two conditions are named in plain language first. The check runs against the row
**as it will be**, not against the patch alone, because setting the limits in one request and the
toggle in another is the ordinary way a person fills in a form.

Two display rules carried over from `describeBalance()`, both because the subject is money: a balance
never appears as a bare number without its provenance (confirmed / inferred / unknown, and *"no
account"* is not *"$0.00"*), and an empty limit field saves as NULL rather than 0 — an unset ceiling
and a ceiling of zero are different instructions, and zero would forbid every top-up while the row
looked fully configured.

Root suite 1,467 files; `npm run build` clean.

---

## S-14 verified 2026-08-04 — and its guard was passing vacuously

Checked rather than assumed, since "free sources run first" is a **spending** rule: if paid sources
ever ran first, the money is gone before anything downstream could notice.

**The rule is genuinely implemented.** `buildPlan` in `worker/src/research/research-modes.ts` emits
free steps at orders `0..n-1` and paid steps from `n`, the module is wired into `worker/src/index.ts`,
and `research-modes-wired.test.ts` already guards that reachability. No defect in the behaviour.

**The defect was in the check.** Its assertion read:

```ts
const lastFree  = Math.max(...steps.filter(s => s.phase === 'free').map(s => s.order));
const firstPaid = Math.min(...steps.filter(s => s.phase === 'paid').map(s => s.order));
expect(lastFree).toBeLessThan(firstPaid);
```

`Math.max(...[])` is `-Infinity` and `Math.min(...[])` is `Infinity`, so the comparison reads
`-Infinity < Infinity` — **true** — for a plan with no steps, no paid step, or no free step. **The
assertion passed hardest at the exact moment the thing it guards stopped existing.** Both phases are
now asserted non-empty before the comparison; verified by making `buildPlan` emit no paid steps and
watching it go red, where the old form stayed green.

That is the **third** instance of this one shape found on 2026-08-04 — after an `indexOf` ordering
guard where `-1` read as "earliest", and a `toContain` that matched an import rather than a call. All
three **failed by passing**, and none would have been caught by reading them.

**State of this document:** S-6, S-7, S-8, S-10, S-11, S-12, S-13, S-14, S-15 and S-16 are done.
**S-9 is the only slice left and it is owner-gated** — the limits form exists and the numbers can be
entered today.

> **Corrected 2026-08-04 (S-9e).** This line used to read *"S-9 (Stripe SetupIntent + the charge) …
> what remains needs a live-payments decision"*, which named **one** blocker where there are
> **three**, and the missing one is not a decision at all:
>
> 1. **The Stripe SetupIntent and off-session charge** — a live-payments decision. As stated.
> 2. **Vendor credentials** — `credential_env_var` names an environment variable nobody has set.
> 3. **A balance reader** — *nothing in this repo writes a vendor balance*, and there is no module
>    that could. Not a decision; a component that has not been written, and it cannot be written
>    without (2).
>
> The consequence is visible on screen today: every account reports *"Cannot decide — balance is
> unknown"*, correctly, and will keep doing so after any Stripe decision. See S-9e for the full chain
> and the order the three have to be taken in.

---

## S-9b DONE 2026-08-04 — what auto top-up would do, charging nothing

S-9 has stood as "blocked on the owner: amounts, ceiling". Part of that was self-inflicted and was
fixed on 2026-08-03 by building the form. This closes the second self-inflicted part.

`decideTopup()` shipped complete — the monthly ceiling, the minimum interval, refusal on an inferred
or stale balance, all of it — with **no production caller**. The only mention of it outside its own
module and tests was a comment at the top of the vendor-accounts route describing behaviour that
route did not have. Authored-but-not-wired, with a comment on top asserting otherwise.

The charge itself is genuinely blocked: the SetupIntent and the off-session PaymentIntent need a live
Stripe decision. **The decision is not blocked.** `GET /api/admin/research/vendor-accounts` now
returns a `topupDryRun` block — per account, whether it would top up, for how much, and if not, which
guard rail stopped it. Nothing is charged and nothing can be.

That turns "amounts, ceiling — owner decides" from an abstract question into a concrete one: the
owner sees what would be charged today against the numbers they entered. It is also the only honest
way to exercise a payment loop before it is able to spend money.

`chargedThisMonthUsd: 0` is a deliberate under-count, and the payload says so (`monthToDateKnown:
false`) rather than hiding it — there have been no charges because nothing can charge. When the
charge path lands it must supply the real figure; passing 0 then would disable the ceiling, the one
guard rail whose failure is unbounded.

### ▶ The bundling defect this uncovered, which no ordinary check could see

Importing `decideTopup` into the route **failed the production build**, while `tsc` passed, the
worker's 1,497 tests passed, and the research suite's 969 passed.

`vendor-accounts.ts` reaches `pipeline.js` for a database handle, and `pipeline.js` is the entire
worker — clerk scrapers, Playwright adapters, AI extractors. Webpack tried to bundle all of it into
the route and died with `Module parse failed: Unexpected character` naming a file nobody wrote.

**Making the import lazy did not fix it.** A dynamic `await import()` is still walked when webpack
builds the module graph — a correction worth recording, because it is the obvious first fix and it
costs a five-minute build to disprove.

The fix was to give the pure rules their own import-free home, `vendor-accounts-policy.ts`, exactly
the shape `ocr-legibility.ts` has always had — which is why the app has always been able to import
*that* one. `vendor-accounts.ts` re-exports every symbol, so no existing importer changed.

**Now enforced by construction**, because this cost three build cycles and the error names a
transitive file rather than the import that caused it: `__tests__/research/worker-imports-stay-
bundleable.test.ts` walks the import graph from every `@/worker/...` module the app or lib imports
(~18 of them) and fails if any reaches `services/pipeline.ts`. It reproduces the failure in **8 ms
instead of five minutes**, and prints the path that gets there.

Its first run flagged two false positives — `pipeline-version-store` and `pipeline-diff-engine`,
caught by substring — which the app imports today and which build fine. Matching whole path endings
instead: a guard that flags working code is a guard someone switches off.

**Still blocked on the owner, unchanged:** the Stripe SetupIntent and charge execution, the per-vendor
amounts and thresholds, the monthly ceiling, and which vendors to open accounts with.

**Verification:** production build compiles; 22,574 root tests, 1,497 worker tests, 972 research
tests green; `tsc` and `eslint` clean.

## S-9c DONE 2026-08-04 — two of the three guard rails were declared and never fed

S-9b wired `decideTopup()` into a dry run and passed `chargedThisMonthUsd: 0`, omitting
`hasUnsettledTopup` entirely, because nothing read the ledger. It labelled the under-count rather than
hiding it — but that meant **the monthly ceiling and the crash-mid-charge guard, two of the three
rails S-4 specifies, were being declared and never exercised**. A guard rail nothing feeds is
decoration.

`research_vendor_topups` has existed since seed 569, with `status`, `amount_usd` and `attempted_at`
and an index specifically for finding rows stuck at `attempted`. What was missing was the reader.
`summariseTopups()` is it — pure, in the policy module, so the route can import it without dragging
the worker into the bundle (see S-9b).

### ▶ Which statuses count, and why the rule is not symmetric

Each of these is defensible in isolation; only the asymmetry is correct, so each is pinned by its own
named test rather than by a comment.

| status | counts? | why |
|---|---|---|
| `succeeded` | **yes** | Money moved. |
| `attempted` | **yes** | We do not know whether it moved. For a *ceiling* the safe direction is to over-count: over-counting refuses a charge that might have been fine, under-counting permits a **second** charge on top of one that already landed. The first is an inconvenience; the second is the runaway loop the ceiling exists to stop. |
| `failed` | no | The vendor said no and nothing left the card. Counting declines would let one outage exhaust a budget that was never spent and turn it into a month of refusals. |
| `refunded` | no | The money came back, so net spend is zero — and a refund is a deliberate act by a person, not an ambiguous machine state. Counting it would let a correctly-reversed charge keep blocking the account it was reversed on. |

**An old `attempted` row still blocks, deliberately.** It is not aged out: the seed calls a long-stale
one *"the crash-mid-charge case, and it is meant to be visible"*, and an unresolved charge is exactly
when a person should look before the machine charges again. Ageing them out would quietly restore the
double-spend the rail was written to prevent.

**A failed ledger read is not a quiet month.** `chargedThisMonthUsd: 0` from an unreadable table is
indistinguishable from genuine inactivity and silently disables the ceiling — the one rail whose
failure is unbounded. When the query errors, every decision is reported `blocked` with that as the
reason and `monthToDateKnown: false`, which is the direction `decideTopup` itself already fails in.

The totals are per-vendor. A ceiling summed across vendors would let one account's spending block
another's, and `hasUnsettledTopup` has to mean "*this* vendor has a charge whose outcome we do not
know".

### ▶ The code caught the test, not the other way round

The first fixture left `cardLast4: null` and two assertions failed with *"no card on file"* — a
**fourth** guard rail beyond the three S-4 names, which the refusal had been about to be mistaken for
a ceiling result. The code was right and the test was wrong; the fixture now carries a card and says
why. The negative control (making `attempted` stop counting) fails the assertion that names it.

16 tests here, 1,513 in the worker suite, `tsc` and `eslint` clean, production build compiles.

**Still owner-blocked, unchanged:** the SetupIntent and the off-session PaymentIntent, the per-vendor
amounts and thresholds, the monthly ceiling figure, and which vendors to open accounts with.

## S-9d DONE 2026-08-04 — the dry run reaches the screen

S-9b wired `decideTopup()` into the route. S-9c fed it the real ledger. **Neither put it in front of
anyone**: `GET /api/admin/research/vendor-accounts` has returned `topupDryRun` for two slices and
`VendorAccountsPanel` never read the field.

That is the authored-but-not-wired defect **one layer up from where this program usually finds it** —
not a module without a caller, but an API answering into the void. Both previous slices were written
while describing that exact failure, which is worth recording: knowing the pattern is not the same as
checking for it.

Each account row now carries what auto top-up would do right now, in one of **three states**:

| state | shown as | when |
|---|---|---|
| would-charge | *"Would charge $90.00 now"* + the reason | the engine says yes |
| blocked | *"Cannot decide"* + which rail stopped it | balance unknown, stale, unsettled charge, ledger unreadable |
| idle | *"Nothing to do"* + why | above the threshold, or auto top-up off |

**Collapsing `blocked` into "no" is what would make this screen lie**, and it is the obvious
simplification. *"Nothing to do"* and *"I cannot tell whether there is anything to do"* look identical
on a quiet row and mean opposite things when money is involved. `dryRunTone()` is exported and tested
directly for that reason — a source-text check that the file contains the word "blocked" proves
nothing about which branch produces it. It also resolves `blocked` **first**: if a future change ever
returned both flags, the safe reading is the refusal, because a row saying *"would charge $90"* over a
decision the engine refused to make is worse than one saying nothing.

**The unreadable-ledger note is said once, at the top.** Otherwise every row reads "blocked" and the
screen looks like eleven separate configuration problems rather than one missing table.

And on any row that would spend money, the screen says **"Nothing is charged — the card flow is not
built yet"** in place. That sentence existed only in this document and in a route comment; the person
it protects is the one looking at a green box that says a charge would happen.

The negative control collapses `blocked` into `idle` and fails two assertions by name. 22 tests in
this file, 977 across the research suite, `tsc` and `eslint` clean, production build compiles.

**Still owner-blocked, unchanged:** the SetupIntent and the off-session PaymentIntent, the per-vendor
amounts and thresholds, the ceiling figure, and which vendors to open accounts with. The difference
after this slice is that the owner can now *see what those numbers would do* before choosing them.

## S-9e DONE 2026-08-04 — there is no balance reader, and three things were waiting on it

S-10 says reconciliation shipped and *"the scheduled sweep waits on S-9"*. Checking what `reconcile()`
would actually need found that reason is wrong, and the real one is bigger.

**`reconcile()` has no production caller** — same shape as `decideTopup` before S-9b. But wiring it is
not the fix, because it takes a `previousConfirmedUsd`, and **nothing stores one**: seed 569 creates
two tables, accounts and top-ups, and neither keeps a prior reading. Its parameter has no source.

Pulling that thread found the thing underneath:

> **Nothing in this repo writes a vendor balance at all.**

The route rejects hand-written figures (correctly — a balance is a reading or an inference, never a
typed-in number), the SetupIntent flow is unbuilt, and the only `balance_usd` writers anywhere are in
the Stripe webhook, against a **different table keyed by `user_email`**. There is no
`readBalance`, no `fetchBalance`, no vendor login. The route's own comment said *"balances by the
reader"* — **a comment describing a component that does not exist**, and the third instance of that
pattern this session.

### ▶ The chain, stated once so nobody re-derives it

1. No balance reader → `balance_usd` is never written
2. → `balance_source` stays `'unknown'` on every row
3. → `describeBalance` correctly reports *"UNKNOWN — never established. Not zero"*
4. → `decideTopup` correctly refuses, `blocked: true`, *"balance is unknown"*
5. → **S-9d's dry run shows every account as "Cannot decide", forever, until a reader exists**
6. → `reconcile()` has neither a current reading nor a previous one to compare it against

Every step is correct behaviour. The system is not broken; it is honest about a component that has not
been written. **But "every account is blocked" looks identical to a bug**, and the difference should
not depend on someone remembering this paragraph — so it is now four tests: the unknown balance is not
zero, the refusal is a refusal-to-decide rather than an all-clear, a **fully configured** account (auto
top-up on, all three limits set, card on file) *still* blocks, and the same account tops up the moment
a confirmed reading arrives. That last one is the important half: **the gate is the missing reading,
not the configuration.**

### ▶ What this changes about the next slice

A scheduled reconciliation sweep is **not** the next thing to build, and neither is a balance-history
column. The order is: **balance reader → history → reconcile sweep**, and the reader needs vendor
credentials (`credential_env_var` names a variable nobody has set) — so it is owner-gated, like the
rest of S-9.

Recorded because the previous note would have sent someone to build the sweep, which cannot run, on
top of a history store for readings that never happen.

20 tests in the ledger file, 977 across the research suite, `tsc` and `eslint` clean.

## S-9f DONE 2026-08-04 — the state line named one blocker where there are three, and a helper I wrote had no caller

Two corrections, both to work from earlier the same day.

**The state line was wrong in a way that mattered.** It said S-9 *"needs a live-payments decision"*, so
a reader would reasonably conclude that a Stripe decision unblocks the whole slice. It does not: after
that decision, every vendor account would still report *"Cannot decide — balance is unknown"*, because
there is no balance reader and no credentials for one to use. The three blockers, and their order, are
now stated where the summary is rather than only in S-9e's detail.

**And `hasRunContext()` was my own orphan.** R4b's run-context module exported it two slices ago with
a justification — *"so a call site can say this was not attributable out loud"* — and nothing ever
called it. Every consumer checks `currentProjectId() === null`, which answers the same question and
returns the id in the same breath.

Deleted rather than left. It is small, but it is **authored-but-not-wired inside the module written to
fix authored-but-not-wired**, and an exported helper with no caller is precisely what this program's
reachability guards exist to catch. Writing the guard does not exempt the author from it.

Worker suite 92 files / 1,525 tests green; `tsc` and `eslint` clean.

## ⚠ S-6b 2026-08-04 — S-6 is marked DONE, and nothing queries GLO

S-6 is recorded as *"DONE (2026-08-02): `GloLandGrantAdapter`, driven live — Bell County returns
1,523 grants; Bell + grantee DUNCAN returns 5, with GLO record ids and free PDFs."* All of that is
true. It was built, tested and driven against the live site.

**It has no caller.** `adapters/glo-land-grant-adapter.ts` is imported by nothing anywhere.
`sources/glo-client.ts` is imported once, by `index.ts`, and **never constructed** — an import and no
`new`. That dead import is the *only* production reference to GLO in the entire worker, and it is
what made the feature look wired.

### ▶ Worse than unreachable: the plan claims the capability

`SOURCE_CATALOGUE` lists `glo` with `capabilities: ['original_survey']`, and **GLO is the only source
with that capability**. `buildPlan()` derives `covered` from the catalogue and reports
`missingCapabilities` as whatever is left — so on **every run, in both modes**, the plan reports
`original_survey` as covered.

`missingCapabilities` exists to say what a run cannot answer. It is silent about the one thing only
GLO can answer, because GLO is on a list. **A run tells the researcher the original survey is
accounted for, and no code will ever look for it.**

That is this program's signature defect exactly — *an unknown rendered as an answer* — sitting on the
source this document calls **"the most valuable source found"** and **"Highest value per hour of
anything remaining"**. Every Texas metes-and-bounds description is written against an original survey;
this is the capability the document was most emphatic about.

### ▶ Two ways out, and they are not interchangeable

1. **Wire the adapter into the pipeline.** The right fix and a genuine slice: it needs a stage, a home
   for grants in the report, and a decision about what a *missing* grant means for confidence.
2. **Stop claiming the capability** until (1) lands, so `missingCapabilities` tells the truth.

Choosing (2) alone quietly downgrades what every run reports; choosing (1) is the work S-6 was
supposed to finish. **Neither was taken here** — both change what a researcher is told, which is the
owner's call, and this document has already been wrong once about GLO being done.

`glo-is-planned-but-never-run.test.ts` states the situation as four assertions and **fails the day it
changes in either direction**: if the adapter gains an importer, or `GLOClient` is finally
constructed, or another source takes on `original_survey`. Silence was the problem; this makes the
state loud.

93 worker test files / 1,529 tests green; `tsc` and `eslint` clean.

**This also corrects the state line above.** S-6 should read *built and verified live, not wired* —
and it means the free-source coverage this document claims is one source smaller than it appears.

## ✅ S-6c DONE 2026-08-04 — the plan stops claiming a capability nothing delivers

S-6b surfaced two ways out and called both the owner's decision. **On re-reading, one of them was
mis-framed as a decision.**

I described "stop claiming the capability" as *quietly downgrading what the run reports*. That was
wrong. The run was reporting `original_survey` as **covered** while nothing had ever queried GLO —
so the change does not downgrade a true statement, it **corrects a false one**. Fixing a false
statement is not a product decision; it is the rule this entire program is built on.

**Wiring the adapter (option 1) remains the real slice and is untouched.** That one is genuinely the
owner's, because it changes what a run *does*. This changes only what a run *says*.

### ▶ The fix, and why it is a flag rather than a deletion

`ResearchSource.notWiredYet` marks a source whose adapter exists but which no code path reaches.
`buildPlan` now separates two things the catalogue had conflated:

- what this platform **knows about** — GLO stays in the catalogue, because the adapter is real, tested
  and was driven live against 1,523 Bell grants;
- what a run **will actually do** — the steps, from which `covered` and therefore
  `missingCapabilities` are derived.

Deleting the entry would have lost the first. Leaving it in the steps kept the lie. The flag keeps
both facts and stops them being confused.

**And the researcher is told which kind of gap it is.** The statement now reads *"Built but not
connected, so NOT part of this run: Texas GLO land grants."* — because *"no source covers
original_survey"* alone would send someone hunting for a source we already have, and escalating to
paid mode will not close it. The gap is ours, not the state's.

### ▶ Three tests broke, and every one of them was pinning the old belief

| test | was | now |
|---|---|---|
| **S-6b's own guard** | asserted `original_survey` is reported COVERED | asserts it is reported MISSING |
| `covers everything desired for a routed county` | `missingCapabilities` is `[]` | `['original_survey']`, plus a second test keeping the half that still holds |
| `gives Bell its Kofile portal and the statewide sources` | expected `glo` among the steps | expects it **absent**, plus a new test that it is still in the catalogue and still named in the statement |

S-6b's guard was written to fail the day this changed, in either direction, so the fix could not land
silently. **It failed on the very next slice** — which is the guard working, not a regression, and the
reason it was worth writing.

None of the three was deleted. Each was inverted with its reason recorded inline, and each carries the
instruction for the day GLO is wired: clear the flag, and these assertions go back.

93 worker test files / 1,531 tests green; `tsc` and `eslint` clean.

**Still open and unchanged:** the adapter has no caller. S-6 is *built and verified live, not wired*.
