# Owner actions — research worker, secrets, and marketing

**Status:** PENDING · opened 2026-09-01 · **nothing here is engineering work.**

Every item on this page is blocked on something only the owner has: a dashboard login, a payment
decision, the firm's own words and photographs, or a physical act on the server. None of it is
waiting on code.

It was extracted from `docs/planning/completed/RESEARCH_WORKER_REBUILD_AND_GROWTH_2026-08-26.md`,
whose engineering half is finished. That doc is 2,600 lines and holds the full measurement trail for
every line below — **read it for the WHY**; this page exists so the *what to do* is not buried in it.

> **Why this is not `in-progress/`.** Nobody is working these, and pretending otherwise makes the
> folder meaningless. And why it is not "deferred": deferred implies the work is not wanted. It is
> wanted. It is *blocked*, which is a different fact, and the distinction matters when somebody
> later asks why the research platform still has no Bell CAD data.

---

## The three that change what a research run can DO

These are the ones with a functional consequence today. Everything below them is money, tidying or
marketing.

### 1. Bell CAD is geo-blocked from the netcup box — one env var decides it

`bell.tx.publicsearch.us` (the clerk) answers fine from the server. `esearch.bellcad.org` (the CAD)
does not: connection-level `fetch failed`, then a Playwright timeout. That is the per-portal
geo-block the deployment doc predicted.

**Bell CAD data is missing from every run because of this.** The host circuit shipped 2026-08-30 and
extended 2026-09-01 makes the symptom cheap — the run stops spending 213 seconds re-proving it — but
cheap is not present.

Browserbase credentials are present and **proven** (`GET /v1/projects` → 200, project id matches,
concurrency 3). What is missing is the decision and one variable:

```
BROWSER_BACKEND=browserbase
BROWSERBASE_ENABLED_ADAPTERS=cad        # ONE adapter, not a global default
```

**Owner decides:** is Bell CAD data worth Browserbase session cost, for the CAD adapter only?

### 2. TexasFile is funded and `research_document_purchases` still has 0 rows

No run has ever bought a document. The purchase path cannot be proven by a free Bell run.
**Owner action:** authorise one real paid run against a property that requires a purchase.

### 3. CapSolver key is rejected — and the solver has no callers anyway

`ERROR_KEY_DENIED_ACCESS`. `/health` reports this honestly now (`unconfigured`, "NOT WIRED — no
adapter invokes the solver") rather than showing a green light for a feature nothing runs.

Wiring it needs a working key **and** a per-county policy decision — which counties the firm is
willing to solve captchas for — in that order. **Owner decides both.**

---

## Money — cancel, check, or keep

| # | Service | State | Action |
|---|---|---|---|
| S2 | **Browserbase** | Paid four months, **zero sessions**. `BROWSER_BACKEND=local` | Cancel — *or* keep for item 1 above. These two decisions are the same decision |
| S3 | **iDocket** | Registry marks a real subscription, est. **$50–200/month** | Check whether it is still billing |
| S3 | **Mapbox** | One geocoding fallback, duplicating Google | Check; probably cancellable |
| S3 | **ElevenLabs** | Tutor read-aloud only; degrades to the free browser voice | Check |
| S3 | **managed Redis** | Falls back to `redis://localhost:6379`, runs free on the netcup box | Cancel if one is being paid for |

Seventeen of eighteen vendor credentials were empty when last measured, so most "check this invoice"
advice is probably moot — there are no accounts. The three that genuinely cost money are
**Anthropic, Google Maps and Browserbase**.

---

## Secrets — a dashboard login each

- **S4 — finish the Doppler consolidation.** 8 migrated 2026-08-26 (`prd`: 89 → 97). Doppler is the
  source of truth; Vercel is a mirror.
- **S5 — revoke the old Voyage key** in the Voyage dashboard. It was rotated, not revoked — Doppler
  holds a different value, and the exposed one still works until somebody clicks.
- **S5 — `doppler login revoke`** on the work laptop when the migration work is finished.

> ⚠ `vercel env pull` **blanks encrypted variables**. A blank there proves nothing about whether a
> secret is set. Check Doppler.

---

## The one physical act

- **E4 — install the worker auto-updater.** Built and exercised 2026-08-30 on branch
  `claude/worker-auto-update-2026-08-30`: pulls `main` when it moves, defers while a run is in
  flight, rolls back if the new build does not report its own `buildSha`. Install steps are in §3.7
  of the runbook. **One command on the box.**

---

## Marketing — dashboard logins and the firm's own content

The site work is **done and live** (2026-08-26): LocalBusiness JSON-LD, GA4 firing, five pages that
had been serving the homepage's title, the lazy LCP logo. `lib/seo/business.ts` is the single source
for NAP.

| # | Item | Blocked on |
|---|---|---|
| M1 | Google Ads offline conversions | Four conversion actions to create via **Import → Manual import using API or uploads** (not "Website"), then their resource names into env vars. The CSV upload at `/admin/marketing/exports` needs none of this |
| M2 | Search Console | Resubmit `/sitemap.xml`; Rich Results Test; **request indexing** for the five retitled pages |
| M3 | `sameAs` is deliberately empty | Owner to supply the real URLs — Business Profile, Facebook, LinkedIn, BBB, trade bodies. Inventing them would publish claims to pages that may not exist |
| M4 | County landing pages | **Correctly gated on M2.** Building 46 pages on a guess produces 46 thin pages Google ignores. Choose from real query data first |
| G1–G4 | Google Business Profile — address, reviews, photos, description | **Paused at the owner's request** (2026-08-26): *"We will get more photos and enter the descriptions. We are working on getting reviews slowly."* Real-world effort on their schedule, not neglect |

---

## Recorded decisions that need no action

- **Stripe is off by design, not broken.** Empty keys plus a missing `PAYMENTS_LIVE` is the correct
  state for "payments not switched on".
- **Saturday hours stay unpublished.** `/contact` says "by appointment", which schema.org cannot
  express; stating times would send someone to a closed office.
- **The homepage has no self-canonical, deliberately.** It is a client component whose only layout is
  the root, so a canonical there applies site-wide — the exact bug that once made every page a
  duplicate of the homepage.
- **Galveston (Fidlar) is not worth building.** It is the only live Fidlar portal and the firm does
  not work there.

---

## One optional data repair

22 `research_documents` rows carry a `storage_url` for a file that was never written — 11 aerial
photos and 11 topo maps across 10 projects.

**The app no longer believes them** (fixed 2026-09-01: `lib/research/stored-file.ts`), so this is
now tidying rather than a defect. It mutates production data, so it stays with the owner:

```sql
-- Verify first:
select count(*) from research_documents
 where storage_path is null and storage_url is not null;   -- expect 22

update research_documents set storage_url = null
 where storage_path is null and storage_url is not null;
```
