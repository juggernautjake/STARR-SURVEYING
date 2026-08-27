# Research worker rebuild, open-web research, and the growth backlog — 2026-08-26

**Status:** IN PROGRESS · opened 2026-08-26 · **this is the live doc for the netcup migration and
everything parked behind it.**

This absorbs the loose ends of a long working session: the research worker being gone, the local-SEO
work that shipped, the Google Business Profile that is claimed but empty, and a cost audit of 110
configured secrets. Anything discussed that session and not finished is written down here, because the
alternative is rediscovering it in three weeks.

---

## 0. What actually happened, in one paragraph

The DigitalOcean droplet running the research worker was **destroyed** — the card paying for it was
cancelled, the account was suspended, and the droplet went with it. It had already been unreachable
since **2026-08-02** (recorded in `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md`), so deep research has
been down far longer than the billing incident suggests. A netcup RS 4000 G12 has been ordered to
replace it. Separately, the website's local-SEO work shipped and is verified live, and an audit of
every configured secret found two services being paid for that no code path can reach.

---

## 1. SHIPPED this session — do not re-litigate

Each verified against production, in a browser where that was the only way to see it.

| | Evidence |
|---|---|
| `LocalBusiness` JSON-LD on every page | Parsed out of the live homepage: 46 counties, 12 services, RPLS #6706 |
| **GA4 `G-V8715QJGBX`** live | `POST google-analytics.com/g/collect` → HTTP 204, real `page_view` |
| 8 of 8 public pages have unique titles | Five were serving the homepage's; a client component cannot export `metadata` |
| Self-referencing canonicals | Consolidates the `?gclid=` variants paid traffic arrives with |
| Header logo no longer lazy-loaded | Was `loading="lazy"` + a single 3840px candidate on the LCP element |
| Office hours corrected to **9:00 AM** | The site had said 8:00 since it existed — an hour before anyone was in |
| Service-area map fixed | Maps key allowed `starr-surveying.com` but not the `www` the site serves |
| **AI search live** — 841 chunks embedded | `document_embeddings`, 601 research documents, Voyage `voyage-3.5` |

Merges `1aaa98381` and `d461a1c7b`. See [[project_seo_schema_and_ga4]].

**Research data survived the droplet's destruction.** Files are in Supabase storage, not on the box —
verified by fetching deed page images (HTTP 200). The worker was genuinely stateless.

---

## 2. W — The worker on netcup

**Ordered 2026-08-26:** netcup RS 4000 G12, Manassas VA. 12 dedicated Zen 5 cores, 32 GB ECC, 1 TB
NVMe. **€39.77 + €0.50 IPv4 = €40.27/month ≈ $46**, minimum 1-month term, no setup fee, **VAT 0%**
(business details supplied). Awaiting netcup's manual order review.

The full build lives in `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md` — Docker Compose, Caddy with a
**45-minute** proxy timeout (a run streams for 20–30 min; Caddy's default 100s would sever it), ufw
locked to SSH + 443 with the worker bound to `127.0.0.1:3100`.

### W1 — `STORAGE_BACKEND=local` must become `r2` ✅ DONE 2026-08-26

Doppler `prd` currently reads `STORAGE_BACKEND=local`, meaning the worker wrote research artifacts to
**its own disk**. That disk was destroyed with the droplet.

The database rows survived and most files are in Supabase, but anything written through the local
storage path is gone — which is the likeliest explanation for a `research_documents.storage_url` that
returned **400** during verification while its siblings returned 200.

Rebuilding with `local` would set the same trap, knowingly.

**Done 2026-08-26: `STORAGE_BACKEND=r2` in Doppler `prd`** — but only after proving the credentials,
because switching to a backend that does not work is worse than the one that loses data on a rebuild.
A real round-trip against `starr-recon-artifacts`: PUT, GET with byte-for-byte content match, DELETE.
All three succeeded.

Safe to change now precisely because **no worker is running** — nothing reads this until netcup is
built, so the risky moment is a rebuild that has not happened yet rather than a live cutover.

This also settles the cost audit's open question about R2: it is not optional, it is required.

### W2 — DNS is the only cutover step

`WORKER_URL` and `WORKER_API_URL` in Doppler both read `https://worker.starr-surveying.com`, and **no
Doppler entry references the dead IP**. `worker.starr-surveying.com` currently resolves to
`104.131.20.240`. The switch is one A record; nothing in Doppler or Vercel needs editing.

### W3 — `WORKER_API_KEY` must match on both sides ◐ **guard SHIPPED 2026-08-26**

Pull the existing value from Doppler `prd` rather than generating a new one. If the worker and the app
disagree, **the worker runs perfectly and the app reports it unreachable** — a failure that looks like
a network problem and is not.

**Now warned about at boot.** `configWarnings()` in `infra/health.ts` was extended rather than
duplicated — it already covered Anthropic, Supabase, Redis and Browserbase, and a second env checker
beside it is how this repo has grown parallel helpers before. Three additions, each guarding a setting
that is **accepted at boot and only fails later**:

| Setting | Where it currently fails |
|---|---|
| `WORKER_API_KEY` absent | Every call from the app rejected — reads as an outage, sends you to DNS |
| `STORAGE_BACKEND=r2` without R2 keys | **The first upload, mid-run**, after paid documents are bought |
| `CAPTCHA_PROVIDER=capsolver` without key | The first time a county portal presents a captcha |

The middle one is the reason this slice exists. `resolveBackend()` honours `r2` whether or not the
credentials are present, and W1 made `r2` the configured default — so forgetting a key on the netcup
box is now a live risk that would surface twenty minutes into a run rather than at startup.

Surfaced on `/healthz`, so it is visible from the app rather than only in a boot log. 6 new tests; the
existing "complete environment" fixture gained `WORKER_API_KEY` — the contract widening, not a test
being loosened. Full worker suite: 1,606 tests green.

### W4 — verify from OUTSIDE the box ✅ TOOLING ALREADY EXISTS — verified 2026-08-26

`curl localhost:3100/healthz` on the server proves nothing about reachability. The real test is
`curl https://worker.starr-surveying.com/health` from elsewhere. A worker that answers on loopback and
not the internet is a firewall problem that looks like success from inside.

**I was about to build a verification script and found one already built, better.** `/admin/research`
renders `WorkerStatusBanner`, which probes the worker from the app — i.e. from outside the box, over
the real hostname, through the real TLS — and `interpretWorkerProbe` names which of four situations
you are in rather than "it failed":

| State | Meaning |
|---|---|
| `not_configured` | no `WORKER_URL` — a valid state, not a fault |
| `unreachable` | configured and not answering — start or redeploy it |
| `degraded` | answering, but its own `/healthz` says it cannot launch a browser. **Worse than down, because it looks up** — it will accept work and fail it |
| `ok` | answering and able to work |

So the cutover check is: load `/admin/research` and read the banner. A CLI script would have been a
second, worse copy of this — the failure mode this repo is most prone to.

**What I did instead: pinned the chain.** The config warnings added in W3 travel five hops across
three directories and two test suites — `configWarnings()` → `/healthz` body → the app's probe route
→ `interpretWorkerProbe` → the banner's render. Every hop was traced by hand and was intact, **which
is precisely when the test is worth writing**: nothing is red to tell you when a hop is dropped, and
the symptom would be the worker correctly announcing "STORAGE_BACKEND=r2 but R2_ACCESS_KEY_ID
missing" into a void while an operator watches a run die twenty minutes in.

Added to `worker-healthcheck-contract.test.ts`, which already exists for exactly this reason — it was
written after a Dockerfile polled `/healthz` while the worker only served `/health`, a defect that
hid in the gap between two test suites. 9 tests green.

### W5 — surviving a host reboot ✅ RUNBOOK FIXED 2026-08-26 (execution is server-gated)

Compose already sets `restart: unless-stopped` on both services. But that only helps if the **Docker
daemon** starts at boot, and the runbook had no step that confirmed it — it installed Docker, ran
`compose up -d`, and moved on.

**That is the exact shape of the failure that killed the last worker.** Not a crash: a silent absence.
Unreachable from 2026-08-02, noticed weeks later, entirely consistent with a stack that never came
back after a host restart. A runbook that cannot demonstrate the machine returns is a runbook that
reproduces it.

Added §3.4 to `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md`: `systemctl is-enabled docker` (Docker's
Ubuntu packages normally enable it — *normally* being the operative word, and cheap to confirm),
then an actual reboot, then `curl https://worker.starr-surveying.com/health` **from your own machine**.

That one command exercises the whole chain the app depends on — DNS, firewall, Caddy, certificate,
container, and the daemon that had to start it. `docker ps` over SSH proves only that the container
is up, which was never the part in doubt.

Also documented the sharp edge: `unless-stopped` means exactly that. A container stopped by hand
before a reboot stays stopped, by design.

**Execution is server-gated** — the reboot test can only be run once netcup provisions. The runbook
step is what was missing, and it is no longer missing.

### W6 — compose limits vs the new box ✅ DONE 2026-08-26 — but not the fix predicted

**The predicted problem did not exist.** `worker/docker-compose.yml` was already written for the netcup
box — `memory: 26g`, with a comment saying "Leaves ~6 GB for Redis, the OS and page cache on a 32 GB
box", plus `shm_size: 1gb` for Chromium. Nothing to resize. Premise checked, premise false.

**A real bug turned up underneath it.** `capacity.ts` called `os.totalmem()`, which inside a container
reports the HOST rather than the cgroup — 32 GB against a 26 GB container cap. Fixed in `7d37b3c3c`:
read cgroup v2 `memory.max`, then v1 `memory.limit_in_bytes`, falling back to the host; discard a
cgroup value larger than the host, because that means the file was misread.

**It is currently correct by luck, which is why it was worth fixing now.** Concurrency is
`min(byMemory, byCpu, ceiling)` — host reading `min(11, 8, 6)`, true reading `min(8, 8, 6)`. Both give
6, because the ceiling decides. But the compose file itself warns that "this limit and that calculation
must be moved together", and the ceiling is the number most likely to move: it is a policy about not
hammering small county servers, not a hardware fact. Raise it and the worker starts admitting runs
sized against memory the cgroup will refuse — an OOM kill at minute 22, after the paid documents have
been bought.

8 new tests cover a branch that only executes inside a container, including one pinning today's netcup
answer at 6 while asserting `byMemory` is 8 rather than 11 — so the fix is visible even though the
outcome does not change. **6 remains a politeness ceiling, not hardware.**

CPU deliberately still reads the host: compose sets no `cpus` limit, so all 12 really are available.

---

## 3. R — Research capability

### R1 — Open-web research via Tavily ✅ DONE 2026-08-26 (R1a + R1b)

`TAVILY_API_KEY` is configured and does exactly one job: guessing county CAD URLs, as "Method 9" in
`lib/research/boundary-fetch.service.ts`. Free tier, 1,000 requests/month.

That same API is a general web search. Per property it could be finding:

- Owner name → liens, judgments, probate, business filings
- Address → local news, permits, planning agendas, code enforcement
- Prior listings, plat history, subdivision records
- Environmental and utility filings that never appear in a CAD portal

**This is what "research everything findable" actually means**, and it is the difference between
scraping the county and searching the world. The API is already paid for; the work is prompt design,
result ranking, and feeding what comes back to Claude.

> **Browserbase is NOT this.** It is a *place to run a browser* — hosted Chromium on residential IPs.
> It finds nothing and reads nothing. It solves exactly one problem: a site that blocks datacentre IPs.
> Useful, narrow, and unrelated to giving the AI reach. See S2.

**R1a — the search itself. SHIPPED 2026-08-26.** `lib/research/open-web.ts`, wired into
`analyzeProject` at the first point where address, county, parcel id and owner are all resolved —
earlier would build queries from a half-empty subject, and an angle with nothing to ask gets skipped.

Five angles, each its own search: `owner-encumbrance`, `permits-planning`, `news-disputes`,
`plat-subdivision`, `environmental-utility`. One query with everything in it returns one topic's
results and silently answers none of the other questions.

Three rules that each stop a specific way of being plausibly wrong:

- **An angle with nothing to ask is skipped, not guessed.** Searching for liens with no owner name
  returns the county's general lien page — a well-formed finding answering a question nobody asked,
  which reads as "we checked".
- **Domain authority is weighted, not filtered.** Tavily scores topical match, not trustworthiness,
  so ranking on score alone puts real-estate lead-gen above the county. Government is 1.0, the
  records vendors we already pay for 0.8, open web 0.2 — but nothing is discarded, because a blog
  post may be the only public record of a boundary dispute.
- **Angles fail independently.** A rate-limit on the owner search must not lose the permit findings.

Every non-result carries a reason (`not-configured` / `insufficient-subject` / `search-failed`),
following `lib/search/semantic.ts`. Non-fatal by construction: a web search being down can never
fail a run that has already bought paid documents. 19 tests, `tsc` clean, 1,050 suite tests green.

**R1b — the findings reach the AI, not just the log. SHIPPED 2026-08-26.**

Written as a `research_documents` row, so the existing pipeline reads them like any other source:
data points extracted, cross-validated against the deed and the CAD record, embedded for AI search,
listed in the UI. One insert inherits all of that. A bespoke "web findings" field would need every
one of those rebuilt, and would be missed by whichever was written last.

`source_type: 'linked_reference'` + `document_type: 'property_report'` — the honest fits inside this
table's CHECK constraints, **read from the live database rather than guessed**. There is no
`web_search` source type; inventing one would have failed at insert time, in production only.

Three deliberate properties of the rendered document:

- It states outright that these are **not** county records — it sits in the same list as deeds.
- Every entry keeps its URL, angle and a **worded** provenance band ("government record" /
  "open web — unverified"). Strip that and the AI gets a flat list of equally-credible-looking
  claims, which is exactly how a confident wrong answer reaches a survey report.
- Angles that did **not** run are listed, so "could not ask" is never read as "found nothing".

Re-running refreshes the row rather than adding a second — two copies would be cross-validated
against each other as though they were independent sources. The row is deliberately not pushed into
the in-memory document arrays either: those are loaded from this same table moments later, filtered
to `extracted`, which is the status written here.

24 tests, `tsc` clean, production build exit 0.

### R2 — County coverage ◐ R2a SHIPPED 2026-08-26 · R2b open

Measured 2026-08-26:

| Layer | Coverage |
|---|---|
| **BIS CAD portals** (`services/bis-cad.ts`) | **108 Texas counties** — Bell outward in rings |
| CAD adapters wired (`services/property-discovery.ts`) | 6 — BIS, Tyler, TrueAutomation, HCAD, TAD, **GenericCAD fallback** |
| Clerk/deed routing (`services/clerk-registry.ts`) | **all 254** — 22 Kofile + specific vendors, TexasFile as the proven universal fallback |
| Government data sources (`worker/src/sources/`) | 10 — FEMA, NRCS, RRC, TCEQ, TNRIS, TxDOT, USGS, Comptroller, GLO |
| Deep county modules (`counties/`) | **1** — Bell, 7 dedicated scrapers + analyzers |

> ### ⚠ CORRECTED 2026-08-26 — "deed coverage is 21 counties" was WRONG
>
> That number came from `adapters/clerk-registry.ts`. **There are two clerk registries**, and the one
> that decides behaviour is `services/clerk-registry.ts`, which I had not found.
>
> `getClerkSystem()` routes by FIPS through Kofile → eDoctec → USLandRecords → Aumentum → iDocMarket
> → CountyFusion → Tyler → Henschen → iDocket → Fidlar, **and falls back to `texasfile`** — which is
> in `PROVEN_VENDORS`. So **every Texas county routes to a working clerk system.** Deed coverage is
> 254 counties, not 21.
>
> The third false premise this session, and mine. Recorded rather than edited away.

**So what is the real gap?** Two narrower things:

1. **Unproven vendors are skipped.** `countyfusion`, `henschen`, `idocket` and `fidlar` each have
   adapters and FIPS sets, but are absent from `PROVEN_VENDORS`, so their branches never fire and
   those counties fall through to TexasFile. That is the vendor-proving rule working as designed —
   but it means we pay TexasFile per document for counties whose native portal is already coded.
   Proving one vendor converts a whole set of counties at once. **Highest-value R2 work.**
2. **TexasFile is pay-per-document.** A universal fallback that always works and always costs is a
   different thing from native coverage, and the funnel does not currently distinguish them.

**R2a — the registry is now checked rather than trusted. SHIPPED 2026-08-26.**

Every `baseUrl` in `adapters/clerk-registry.ts` was fetched. Of 11 URLs: 6 fine, **4 wrong**.

- **Bell — the home county, marked `implemented`, annotated "Fully tested" — pointed at
  `www.bellcountyclerk.org`, which does not resolve.** Bell research has never been broken by it,
  because `counties/bell/scrapers/clerk-scraper.ts` hardcodes the real host and never reads this
  table; 215 rows in `research_documents` came from `bell.tx.publicsearch.us` while the registry
  named a dead host. Corrected, and now pinned by a test against the scraper.
- Coryell (404), Collin (404), Travis (unreachable) — annotated with the verification date rather
  than nulled, because "no URL" reads as "no online system", which is a different and wronger claim.
- Fort Bend was `http://` and the server redirects to https anyway — a county records search
  travelling in plaintext for no benefit. **Found by the new test, not by the sweep.**

`clerk-registry-truthfulness.test.ts` keeps it honest offline: the Bell entry must name a host the
Bell scraper actually uses, `implemented` requires a URL and a note, every URL must be https, and a
known-dead URL must carry its annotation. Deliberately no network calls — a test that fetches county
servers on every CI run is both flaky and exactly the load-test behaviour the worker's concurrency
ceiling exists to avoid.

> ### ⚠ R2b's premise was also wrong — corrected 2026-08-27
>
> I wrote it as "pick a vendor, drive it, promote it", as though those four were unproven merely
> because nobody had got round to it. `vendor-reachability.test.ts` records what actually happened:
> **all 54 base URLs across Tyler, Henschen, iDocket and Fidlar were probed on 2026-08-02 and every
> one was unreachable.** Not stale addresses — *fabricated patterns*. `<county>.co.texas.us`,
> `idocket.com/TX/<County>`, `<county>.fidlar.com`: URL shapes that never existed.
>
> Four of six clerk adapters were routing research at domains that are not there, and it surfaced as
> **"no records found"** — a statement about the property rather than about our routing, and
> indistinguishable from a real answer. Fourth false premise of mine this session.

**R2b — re-probed 2026-08-27, and it opened a real lead.** The 2026-08-02 finding holds three weeks
on (a stale "all dead" is as misleading as a stale "all fine", so it was checked rather than trusted):
`laredo.fidlar.com`, `idocket.com/TX/Collin` and `deed.traviscountyclerk.org` are all still gone.

**But one live Fidlar portal turned up, in a shape the adapter does not build:**

| URL | |
|---|---|
| `ava.fidlar.com/TXGalveston/AvaWeb/` | **200 — live** |
| `ava.fidlar.com/TXBrazoria/AvaWeb/` | 404 — so it is *not* a universal pattern |
| `ava.fidlar.com/` | 403 — host alive, no root page |
| `laredo.fidlar.com` (what the adapter builds) | **no A, AAAA or CNAME — the host does not exist** |

So Fidlar is not uniformly dead — **the adapter is pointed at the wrong URL shape.**

**The URL discovery is now done, and it kills the item. ⏸ R2b DEFERRED 2026-08-27.**

Every county Fidlar is configured for was probed against the live AVA pattern, one request per
second against one host:

```
TXWard TXTerrell TXJasper TXNewton TXSabine TXSanAugustine TXSanJacinto
TXDallas TXHidalgo TXMenard TXFoard TXFortBend TXFranklin TXBrazoria   → 404 (14 of 14)
TXGalveston                                                            → 200
```

**Galveston is the only live Fidlar portal in existence for these counties — and Galveston is not in
the firm's service area.** It is absent from the 46 counties in `lib/seo/business.ts`, roughly 200
miles from Belton, on the Gulf Coast.

So proving Fidlar — the whole exercise of driving an adapter, verifying real documents come back, and
promoting it to `PROVEN_VENDORS` — would convert **one county the firm does not work in** from
TexasFile to native. The cost is a full vendor-proving cycle against a live portal; the benefit is
zero for this business today.

**Deferred on measured value, not on difficulty.** Revisit only if the firm takes work in Galveston,
or if Fidlar stands up portals for counties inside the service area. The same probe re-run answers
that in about fifteen seconds.

> This closes the "proving one vendor converts a whole set of counties at once" idea for Fidlar
> specifically. It was a reasonable hypothesis and the data does not support it: there is no set.
> **TexasFile's universal fallback is not the consolation prize here — it is the answer**, and the
> only genuine cost is per-document pricing rather than missing coverage.

**Deliberately NOT promoted to `PROVEN_VENDORS`.** A 200 from a landing page is reachability, not
proof. The rule is that an adapter must be driven against a real county and return a real document;
pinging is the cheap half, and promoting on it would put an unproven adapter in front of real records
— which is the failure the proving rule exists to prevent. **Server-gated:** driving it needs the
worker, which needs netcup.

### R3 — Multi-tenancy does not exist ☐

The owner intends to eventually rent research capacity to other surveying firms. **There is no `org_id`
anywhere in the research pipeline, worker services or routes.** That is a real build — tenant scoping,
per-firm quotas, billing attribution — and it is *software*, not servers.

> **Do not size hardware for this yet.** And when it comes: county portals rate-limit by **IP**, so ten
> firms behind one address is how you get blocked. The scale-out unit is another cheap box with its own
> IP, not a bigger box. Four netcup servers = $184/mo, 48 dedicated cores, four IPs — half the price of
> one equivalent DigitalOcean General Purpose droplet.

### R4a — the CapSolver key is REJECTED ⚠ MEASURED 2026-08-27

`CAPSOLVER_API_KEY` is set (68 characters) and their API refuses it:

```
POST api.capsolver.com/getBalance → 401
ERROR_KEY_DENIED_ACCESS — account authorization is invalid: Code(41)
```

Expired, revoked, or from a closed account. Harmless today because
`CAPTCHA_PROVIDER=stub` means nothing calls it — but **the moment anyone enables captcha solving it
fails on the first portal that asks**, with an authorisation error rather than a solve failure, which
sends the operator to debug the wrong thing entirely.

**And it exposes a real gap in W3, which is my own work.** That check is
`CAPTCHA_PROVIDER=capsolver && !CAPSOLVER_API_KEY` — it asserts **presence**. A key that exists and
is rejected passes it silently. Same shape as the `vercel env pull` lesson: a value being there is
not a value being right.

**Deliberately not "fixed" by adding a validity probe at boot.** A worker whose startup depends on a
third-party API is a worker that cannot start when that API has an outage — strictly worse than the
problem. Validity is a thing to check when you turn a provider on, not on every boot, and that is now
written down here where the turning-on happens.

**Owner decision, one of two:** get a working key, or drop CapSolver from the stack. Three services
have now been measured and all three were in a different broken state — Browserbase valid-and-never-
used, Tavily never-configured, CapSolver present-and-rejected. **None of them would have been found
by reading the config.**

### R4 — `CAPTCHA_PROVIDER=stub` ☐

CapSolver is configured but the provider is set to `stub`, so captcha solving is not live. Decide
whether to enable it — and note the standing owner decision in the deep-build plan that **which
counties we are willing to automate is a policy question, not a config default.**

---

## 4. S — Secrets and spend

### S1 — Doppler is the source of truth ✅ established

`Doppler prd → Vercel Production (Sensitive)`, status **In Sync**. This was nearly a costly
misunderstanding: two variables were written straight to Vercel earlier that day, which is the mirror,
not the source.

**The sync is additive, not destructive** — it reports In Sync while 25 Vercel-only variables coexist.
An earlier warning in this session that `DATABASE_URL` was "one sync away from being wiped" was
**overstated** and is corrected here.

Vercel writes them as *Sensitive*, which is write-only — that is why `vercel env pull` returns `""` for
most values. **A blank from `vercel env pull` proves nothing.**

### S2 — Cancel these ☐

| Service | Finding |
|---|---|
| **Browserbase** | `BROWSER_BACKEND=local` in Doppler `prd`. The code refuses to route to Browserbase unless this says `browserbase` **and** the adapter is listed in `BROWSERBASE_ENABLED_ADAPTERS`. **Paid for, never ran.** Re-enable per adapter if a portal ever blocks the netcup IP. |
| **Mailgun** | Zero code references at any layer — comments only. Resend is the real provider (9 files). |
| **CapSolver** | Check billing; `CAPTCHA_PROVIDER=stub` means it is not being called (see R4). |
| **DigitalOcean** | Droplet destroyed. Settle the balance and close the account — check for orphaned snapshots, volumes and reserved IPs, which bill independently. |

**Doppler itself stays** — free Developer plan, and it is load-bearing infrastructure. An earlier
"cancel it, zero code references" call in this session was wrong: it checked the wrong layer.

### S3 — Worth checking ☐

**Mapbox** (one geocoding fallback, duplicating Google) · **ElevenLabs** (tutor read-aloud only;
degrades to the free browser voice) · **Twilio** (wired and reachable, but a rented number bills
monthly — check messages actually sent in 90 days) · **managed Redis** (falls back to
`redis://localhost:6379`; runs free on the netcup box) · **iDocket** (registry marks it a real
subscription, est. **$50–200/month**).

> Several of these — county vendors, ATTOM, Regrid, Tavily, CapSolver — serve deep research, which has
> been offline since at least 2 August. Usage-based ones cost nothing while idle; **subscriptions have
> been billing for a feature nobody could run.**

### S4 — Finish the Doppler consolidation ☐

**8 migrated 2026-08-26** (Doppler `prd`: 89 → 97): all four VAPID keys, `NEXT_PUBLIC_PUSH_VAPID_KEY`,
`GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `TWILIO_PHONE_NUMBER`, `NEXT_PUBLIC_ADMIN_PWA`.

**14 remain, Vercel-only and unreadable** (Sensitive). Copy from the Vercel dashboard into Doppler:

- **Worth doing:** `DATABASE_URL`, `AUTH_URL`, `CRON_SECRET`, `GOOGLE_MAPS_SERVER_KEY`
- **Only if keeping the feature:** `ELEVENLABS_*` (5), `TTS_PROVIDER`
- **Likely empty placeholders:** `GOOGLE_ADS_RESOURCE_INQUIRY` / `_QUOTED` / `_JOB_WON` / `_JOB_PAID`

`DOPPLER_CONFIG` / `_ENVIRONMENT` / `_PROJECT` **stay in Vercel** — they tell Vercel which config to
pull, and moving them would be circular.

### S5 — Rotate ☐

The Voyage key was **rotated** (Doppler holds a different value from the exposed one) — **revoke the
old one in the Voyage dashboard.** A Doppler CLI token now exists on the work laptop
(`doppler login revoke` when the migration work is done).

---

## 5. M — Website and marketing

### M1 — Google Ads offline conversions ☐ built, switched off

Four conversion actions, created via **Import → Manual import using API or uploads** (not "Website"):

| Name | Category | Primary? | Window |
|---|---|---|---|
| `Lead — Inquiry` | Submit lead form | Secondary | Maximum |
| `Lead — Quoted` | Qualified lead | Secondary | Maximum |
| **`Job — Won`** | Converted lead | **Primary** | Maximum |
| `Job — Paid` | Purchase | Secondary | Maximum |

Only `Job — Won` is Primary — a dozen equal-weight goals degrades Smart Bidding. **Wait 4–6 hours after
creating them before the first upload**; earlier uploads can take two days to appear, which reads as a
broken integration.

Then the **CSV path** at `/admin/marketing/exports` → upload at Goals → Conversions → Uploads. **This
needs no developer token**, so it does not wait on Basic access. Put the resource names in **Doppler**,
not Vercel. `/admin/marketing` renders a banner that probes the API and names the exact problem.

### M2 — Search Console ☐

Resubmit `/sitemap.xml` (until this week it listed a redirecting host) · Rich Results Test on the
homepage · **Request indexing** for the five retitled pages (contact, pricing, credentials, resources,
service-area) — Google has them filed under the homepage's title · read Performance → Queries, which
decides M4.

### M3 — `sameAs` is deliberately empty ☐

The structured data lists no social profiles. It is one of the most valuable properties in the block —
how Google ties this site to the entity it already knows — and inventing URLs would publish claims to
pages that may not exist. **Owner to supply:** Business Profile link, Facebook, LinkedIn, BBB, trade
directories. One edit to `lib/seo/business.ts`.

### M4 — County landing pages ☐ largest unbuilt organic opportunity

The sitemap is nine generic URLs. Someone searching *"boundary survey Williamson County"* has no page
written for them. **Deliberately last:** building 46 pages on a guess produces 46 thin pages Google
ignores. Choose from real Search Console query data (M2), then build genuine pages — local context, the
services that county needs, real project references — not one template with the name swapped.

### M5 — Smaller open items ☐

- **Homepage has no self-canonical.** It is a client component whose only layout is the root, and a
  canonical there applies site-wide — the exact bug that once made every page a duplicate of the
  homepage. Low value, real risk; left alone deliberately.
- **Admin address autocomplete may be broken.** `app/admin/components/AddressAutocomplete.tsx` uses
  `google.maps.places` with a key restricted to **Maps JavaScript API only**. Places requests are
  attributed to Places API. Symptom: no dropdown when typing an address. Do not widen the restriction
  unless the symptom is real.
- **One `research_documents.storage_url` returns 400** — see W1; probably a casualty, not a bug.
- **Saturday hours stay unpublished.** `/contact` says "by appointment", which schema.org cannot
  express; stating times would send someone to a closed office.

---

## 6. G — Google Business Profile

**The listing already exists and appears already claimed** — no "Claim this business" link when signed
out. At the exact office coordinates, **4.2 ★**, category *Land surveying office*, correct phone and
website. So this was never a claim-and-verify job with a postcard delay; it is **get access and fill it
in**. Check ownership at business.google.com; Google offers "Request access" with a masked owner hint
if it is not yours.

**Owner has paused this deliberately** (2026-08-26): *"We will get more photos and enter the
descriptions. We are working on getting reviews slowly."* Not neglect — real-world effort on their
schedule.

### G1 — Address ☐ submitted, pending

Listing reads `3779 FM436`; correct is **`3779 W FM 436`** — missing the W and the space. An edit was
submitted 2026-08-26. Google reviews address changes (minutes to days). **If unchanged after ~48h, the
edit was rejected or never saved.**

### G2 — Reviews ☐ the single largest local ranking factor

4.2 with very few. Ask at delivery, when the customer is happiest — handing over the plat, not a week
later by email. Send the direct link by text. Reply to every review, including unflattering ones. Never
incentivise; Google removes those and can penalise the listing. **Aim ten to fifteen, steadily** — a
burst in one day looks bought.

### G3 — Photos ☐

One good crew shot exists; it needs about ten. Total station and GPS rig in the field · crew in hi-vis
mid-job · trucks with signage · office exterior and sign · a finished plat with client details redacted
· head-and-shoulders of Hank (the owner photo lifts trust more than any other single image).

### G4 — Description and services ☐ paste-ready

The ~690-character description, the 12 services, and the ≤20-county service-area shortlist are in the
published checklist: <https://claude.ai/code/artifact/ed859cbb-ab0d-448e-b232-ed0262baa68c>

**Hours are already correct at 9:00 AM on Google** — it was the website that was wrong.

---

## 7. Instrument failures this session — read before trusting a negative result

Three separate times, a confident "this is not wired" was **the tool, not the code**.

**`rg --include=*.ts` IS NOT A VALID FLAG.** ripgrep uses `-g`/`--glob`. Combined with `2>/dev/null`,
every such search errored, printed nothing, and read exactly like "no matches". On that basis the CAD
adapters, the county router and `GenericCADAdapter` were all nearly reported as dead code. **All three
are wired** — `runCountyResearch` at `worker/src/index.ts:17`, `GenericCADAdapter` in
`services/property-discovery.ts:31`.

**`vercel env pull` returns `""` for Sensitive variables.** A blank is not an empty value.

**A domain can hide the host.** The worker was probed at the raw IP from `.env.local` while production
uses `https://worker.starr-surveying.com`. It resolved to the same box — but it need not have, and the
conclusion would have been wrong for the right-looking reason.

> The rule this session earns: **when a search returns nothing, run the same search for something you
> KNOW exists before believing it.** See [[feedback_your_probe_can_be_the_bug]].

---

## 8. I — Browserbase and Tavily: measured, then planned

Opened 2026-08-27 at the owner's request: *"make sure we can use BrowserBase and Tavily… explore all
of the ways these things could be integrated."* Measured first, because both turned out to be in
states nobody would have guessed.

### I0b — Every third-party key, actually called ✅ MEASURED 2026-08-27

Read-only account endpoints, no writes, nothing billable. Three of the first three were broken, so
the rest were worth checking too.

| Service | Result |
|---|---|
| **Anthropic** | ✅ valid — HTTP 200. The most-used key in the repo (67 files) and it works |
| **Resend** | ✅ valid, **restricted to send-only** — correct practice, see the note below |
| **Browserbase** | ⚠ valid, **zero sessions ever**, billing since 2026-04-23 |
| **CapSolver** | ❌ **rejected** — `ERROR_KEY_DENIED_ACCESS`, identity refused |
| **Tavily** | ❌ no key in `prd`, `dev` or `stg` |
| **ElevenLabs** | — no key in Doppler at all (one of the 14 Vercel-only vars in S4) |
| **Mapbox** | — no key in Doppler at all (same) |

> ### ⚠ I nearly reported that email was broken
>
> Resend returned **401** on `/domains`, and a status-code-only check called that a dead key. The
> body said otherwise:
>
> ```json
> {"statusCode":401,"message":"This API key is restricted to only send emails","name":"restricted_api_key"}
> ```
>
> **The key authenticated and was refused for SCOPE.** A send-only key is exactly what a production
> mailer should hold. Reporting "your email provider is dead" would have sent somebody chasing a
> non-existent outage — while the real broken key (CapSolver, `ERROR_KEY_DENIED_ACCESS`, an identity
> refusal) sat two rows below it.
>
> **Two 401s, opposite meanings, and only the body distinguishes them.** Fourth time this session
> that the probe rather than the system was the fault. See [[feedback_your_probe_can_be_the_bug]].

**ElevenLabs and Mapbox being absent from Doppler is a finding, not a gap in the check.** They are
among the 14 Vercel-only variables in S4 — which means they are also the two easiest to retire: if
nothing has put them in the source of truth in four months, the case for keeping them is weak.

### I0 — What is actually true today ✅ MEASURED 2026-08-27

| | Finding |
|---|---|
| **Browserbase key** | **Valid.** Their API returns the project — "Production project", created **2026-04-23** |
| **Browserbase sessions ever run** | **ZERO.** Queried from their own API |
| `BROWSER_BACKEND` | `local` — switch one, off |
| `BROWSERBASE_ENABLED_ADAPTERS` | empty — switch two, off |
| **`TAVILY_API_KEY`** | **EMPTY in `prd`, `dev` and `stg`.** Never configured anywhere |

**Four months of paying for Browserbase, zero sessions.** Nothing errored, because nothing was
wrong: valid credentials the config forbade the code from touching. The only symptom of that fault
class is an invoice.

**And Tavily has never had a key at all** — so "Method 9" in `boundary-fetch.service.ts` has always
fallen through to `tryCountyCadPatterns()`, and the open-web layer built tonight (R1) reports
`not-configured` and does nothing.

### I1 — Both states now announce themselves ✅ SHIPPED 2026-08-27

`configWarnings()` gained the inverse of everything else it checks. Every other warning is a missing
key; these two are the opposite — **present, valid, billing, unreachable**:

- Browserbase credentials set while `BROWSER_BACKEND` is not `browserbase` → *"set and billing, but
  no session can ever start"*
- `BROWSER_BACKEND=browserbase` with empty `BROWSERBASE_ENABLED_ADAPTERS` → routes nothing. **It
  takes two switches, and fixing only the obvious one looks fixed while changing nothing.**
- `TAVILY_API_KEY` absent → *"open-web research is inert; runs see county sources only"*

Silent when Browserbase credentials are absent entirely — not owning it is a valid state, and
warning about it would train people to ignore the list. 5 new tests; 24 in the file.

### I2 — Turn Tavily on ☐ OWNER — 5 minutes, the highest-value item here

Sign up at tavily.com, take the free tier (1,000 searches/month), set `TAVILY_API_KEY` in **Doppler
`prd`**. That single variable activates the whole open-web layer shipped in R1: five search angles
per property — owner encumbrances, permits and planning, news and disputes, plat history,
environmental and utility — deduped, authority-ranked, and written into the run as an analyzable
document the AI reasons over.

**Cost check before spending:** at five angles per run, 1,000 searches is ~200 property researches a
month. Free tier is very likely sufficient; measure before upgrading.

### I3 — Where else Tavily earns its keep ☐ scoped, not built

Explored per the owner's ask. Ordered by value, and honest about which are speculative:

1. **Lead enrichment** *(business — strong)*. A quote request arrives with a name and an address.
   The same five-angle search would tell the office whether it is a builder with twelve permits or a
   homeowner with a fence dispute — before anyone rings back. `lib/leads/` already has the intake
   surface; this is the open-web module pointed at a lead instead of a project.
2. **Competitor and market watch** *(business — moderate)*. Which surveyors are named in Central
   Texas planning agendas and news. Directly feeds the county-page work in M4.
3. **County portal change detection** *(research — strong, pairs with self-healing)*. The research
   platform already has `self-heal-*` modules for adapters that break when a portal changes. A
   scheduled search for *"<county> clerk records portal new system"* would catch a migration
   **announced** before it is **encountered** — the difference between a planned adapter update and
   a failed run.
4. **Learning content freshness** *(educational — moderate)*. The FS/SIT exam material cites the
   NCEES handbook and Texas statutes. A periodic search for revisions would flag content that has
   silently gone stale. Note the risk: exam content must not be auto-edited from search results —
   this flags for human review, it does not rewrite.
5. **Regulatory watch** *(business — moderate)*. TBPELS rule changes, county filing fee changes,
   FEMA map revisions affecting elevation certificates.

**Not recommended:** using it to answer customer-facing questions directly. Search results are
unverified by construction, and this firm's product is a licensed professional's assurance.

### I4 — Turn Browserbase on, deliberately ☐ needs the worker

You are paying for it, so the question is no longer whether to cancel but **which adapters should use
it**. The per-adapter gate exists precisely so this is a decision rather than a global switch.

The honest sequencing, once netcup is up:

1. Run research on the new box with `BROWSER_BACKEND=local`. **The netcup IP is brand new and has no
   reputation** — it may work everywhere, or be blocked immediately. Nobody can know before it runs.
2. When a specific portal blocks the datacentre IP, add **that adapter's id** to
   `BROWSERBASE_ENABLED_ADAPTERS` and set `BROWSER_BACKEND=browserbase`.
3. Never make it the global default. It bills per session, and most portals will not need it.

**Do not enable it speculatively before the worker exists.** With no worker there is nothing to route,
and turning both switches on now would only convert "paying for zero sessions" into "paying for zero
sessions with the warnings silenced".

### I5 — Browserbase beyond scraping ☐ scoped, not built

1. **Design-walk screenshots at real viewports** *(platform — moderate)*. The design tooling drives a
   local browser today; hosted browsers would give consistent rendering across machines.
2. **Customer-facing portal capture** *(business — weak)*. Rendering a county portal page as evidence
   in a report. Local Chromium does this fine — no reason to pay unless the portal blocks us.
3. **Explicitly rejected: using it as "internet access for the AI".** It is a place to run a browser.
   It finds nothing and reads nothing. That is Tavily's job, and conflating them is what made
   Browserbase look like the important one.

---

## 8b. The full suite, run properly at last — and what it caught

**I merged to `main` twice tonight without running the full root suite.** Scoped runs and
`npm run build` were green, so nothing looked wrong. The full suite says otherwise, and the lesson is
already written down in this repo: *"module-singleton pollution only fails in the whole-suite run"* —
and so do ratchets.

`26,378 tests, 2 failing.` Both **pre-existing on `main`**, verified by checking out `main` and
running them there. Neither was introduced by this branch.

### The `starr-assumptions` ratchet — 176, ceiling 160

Named `lib/seo/business.ts` (6×) and `lib/seo/page-metadata.ts` (8×) among the worst offenders. Those
are mine, from tonight.

**Investigated before touching the ceiling, per [[feedback_ratchet_tests_before_re_baselining]] — and
it was a misclassification, not debt.** The `tenant` bucket is a **fallthrough**: any path matching
nothing in `CORRECT_FOREVER` is counted as tenant debt, so *every new own-website file joins the
backlog by default*. That is now the **third** time this exact fault has produced a red ratchet — the
first two were `app/privacy` and `app/components/GoogleAdsScript` on 2026-08-12.

`lib/seo/business.ts` is the firm's own identity consolidated into one file, precisely because it was
being spelled differently in four places. **That is the opposite of tenant debt** — you cannot
parameterise a value that is hand-written in four files, so consolidating it is the prerequisite for
ever making it per-tenant. Added to `CORRECT_FOREVER` beside `app/about`, `app/contact` and
`app/privacy`, which won the same argument.

**Result: 176 → 162. The ceiling was not raised and no debt was paid down; a measurement was
corrected.**

### ⚠ CORRECTION — the remaining 162 WAS mine, and the ratchet is now green at 160

I wrote above that the two-over "predates this session entirely", on the grounds that `760bd418e`
already read 162. **`760bd418e` is my own commit** — *"fix(seo): three spellings of one domain, and a
robots.txt that was a 404 page"* — and `git log --diff-filter=A` confirms it is the commit that
**created `app/robots.ts`**. Those two references were mine from the start.

So the true story is simpler and entirely self-inflicted: **all 16 excess references were own-site
files falling into the `tenant` fallthrough**, in two stages.

| | Count | Cause |
|---|---|---|
| before any of this work | 160 | green |
| `760bd418e` | 162 | `app/robots.ts` created |
| tonight's SEO merge | 176 | `lib/seo/business.ts`, `page-metadata.ts`, `StructuredData.tsx` |
| after reclassification | **160** | **green** |

`app/robots.ts` is `app/sitemap.ts`'s twin — both emit crawler directives for starr-surveying.com and
both name the host, because a robots.txt that does not state its own domain is useless. `sitemap.ts`
has been in `CORRECT_FOREVER` since the list was written; `robots.ts` simply did not exist yet.

**Four misclassifications, one root cause, and the fourth occurrence of it.** The ceiling was never
raised and no debt was paid down. Full root suite: **26,348 passing, zero failures.**

> The lesson is not "I made a mistake in the audit". It is that **a fallthrough default silently
> converts every new own-website file into debt**, and the correction has now been made three separate
> times by three separate people-shaped efforts. The classifier should probably ask rather than
> assume — a file matching `app/*.ts` at the repo's own public root is far more likely to be own-site
> than tenant surface. Left as an observation; changing the default is a bigger decision than tonight.

### `composition-serving` — pre-existing, diagnosed, ✅ FIXED 2026-08-27

The assertion was `/\} catch \(err\) \{[\s\S]{0,240}return null;\s*\}/` — a **character distance**
standing in for a behaviour. Measured: the gap is **244 characters against a 240 budget**.

**The code is entirely correct.** The catch logs and returns null, and the `console.error` count is
exactly 2 as the same test asserts. Somebody added a line of explanation inside the catch block, and
a comment growing four characters turned the test red.

Raising 240 to 300 was the quick fix and would have left the same trap armed one comment further out.
The property worth protecting is not proximity — it is that the catch **swallows and returns rather
than rethrowing**. The test now extracts the catch body and asserts exactly that, so the prose inside
it can grow to any length. 17 tests green.

**Both of the suite's two failures are now understood**: this one was the instrument, and the
`starr-assumptions` breach is genuine pre-existing tenant debt, two references over, deliberately
left visible.

---

## 9. F — Future work, tracked so it is not rediscovered

Everything named this session that is real, not yet done, and not on the critical path.

### F1 — Google ☐

- **Four Ads conversion actions** and the CSV upload path — see §M1. Needs no developer token.
- **Search Console**: resubmit the sitemap, request indexing on the five retitled pages, read
  Performance → Queries — §M2.
- **Business Profile**: address correction pending Google's review, plus photos, description,
  services, reviews — §G. Owner-paused deliberately.
- **`sameAs` URLs** for the structured data — §M3.
- **Google Ads API Basic access**: developer token still Test. Only blocks the *automatic* upload
  path; the CSV route works today.
- **Places API on the Maps key**: admin address autocomplete may be silently failing — §M5. Do not
  widen the key's API restriction unless the symptom is real.

### F2 — Facebook / Meta ☐ NOTHING EXISTS TODAY

Named by the owner 2026-08-27. Stated plainly so nobody assumes otherwise: **there is no Meta
integration of any kind** — no pixel, no conversions API, no page, no catalogue. `platform` in
`ad_spend_daily` is deliberately not a CHECK constraint precisely so Facebook spend can land in that
table the day anyone runs an ad, without a migration.

If it is ever wanted, the order that avoids wasted work:

1. **A Facebook Page first.** It is also a `sameAs` entry (§M3) and a local-SEO signal, and it costs
   nothing. Do this regardless of whether ads follow.
2. **Meta Pixel** on the site — same shape as the existing `gtag` component, and it must go behind
   the same production-hostname gate, or preview deploys pollute the ad account exactly as they
   nearly did with Google.
3. **Conversions API** only if ads actually run. The lead-to-cash spine built for Google
   (`lead_lifecycle_events`) is platform-agnostic; a Meta sink would sit beside the Ads one.
4. **Do not build 2 or 3 before 1.** A pixel with no page and no campaign collects data nobody reads
   — the exact shape of the Browserbase finding above.

### F3 — netcup ☐

- **Order review** must clear → server IP + Server Control Panel credentials.
- **W2**: point `worker.starr-surveying.com` at the new IP. One A record.
- **W5**: the reboot test — `systemctl is-enabled docker`, reboot, then curl from your own machine.
- **Fill `worker/.env`** from Doppler `prd`, so `WORKER_API_KEY` matches by construction rather than
  by transcription.
- **Confirm the VAT 0% and business details** on the account (§2) — €7.50/month.
- **Cancel DigitalOcean** once the migration is proven; check for orphaned snapshots, volumes and
  reserved IPs, which bill independently of the destroyed droplet.
- **Watch the first month's invoice** against the €40.27 estimate; netcup bills in EUR and the card's
  FX fee is real.

### F4 — Bigger builds, deliberately not started ☐

- **R3 multi-tenancy.** Verified 2026-08-27: `org_id` appears nowhere in `lib/research`,
  `worker/src`, or the research API routes. Serving other firms is tenant scoping, per-firm quotas
  and billing attribution — software, not servers. **Do not size hardware for it yet.**
- **M4 county landing pages.** Largest unbuilt organic opportunity; choose the counties from real
  Search Console data rather than guessing across 46.
- **I3 items 1–5** above.

### F5 — 764 lines of orphaned pipeline ☐ found 2026-08-27, owner's call

`lib/research/prioritized-pipeline.ts` (378 lines) and `lib/research/prioritized-pipeline.service.ts`
(386 lines) — **two near-identical files, neither imported anywhere.** `runPrioritizedPipeline`,
`sortByPriority` and `recommendNextResources` all have zero callers outside their own definitions.

Verified with a control search first, because three "this is not wired" findings this session turned
out to be a broken ripgrep flag rather than broken code. `analyzeProject` returns callers from the
same query shape; these return only themselves.

The module describes something genuinely useful — analysing resources in order of expected
information richness, cross-validating each finding against the cumulative baseline, and detecting
conflicts early rather than after low-value sources have been paid for. The live path
(`analyzeProject`) does not work that way.

**Three possible resolutions, and it is not mine to pick:**

1. **Wire it up** — if the prioritisation is what the pipeline should do, this is most of the work
   already written.
2. **Delete it** — if `analyzeProject` superseded it, 764 lines of plausible, well-commented dead
   code is worse than none, because the next person to read it cannot tell it never ran.
3. **Merge the two files first regardless** — near-duplicates with no callers means nobody knows
   which one was the real one, and that question gets harder every month.

Not touched tonight. Deleting working-looking code at 4am on the strength of a grep is exactly how a
real feature gets removed, and wiring an untested 764-line path into the analysis run is worse.

---

## 10. Owner-gated — nothing proceeds without these

1. **netcup order review** clears → server IP + SCP credentials
2. **DigitalOcean** balance settled, account closed
3. **Browserbase / Mailgun** cancelled (S2)
4. **Business Profile** access confirmed (G)
5. **`sameAs` URLs** supplied (M3)
6. **Voyage old key** revoked (S5)
7. **Captcha policy** — which counties we are willing to automate (R4)
