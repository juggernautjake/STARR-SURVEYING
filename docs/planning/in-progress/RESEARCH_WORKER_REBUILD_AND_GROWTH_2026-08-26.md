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

### W3 — `WORKER_API_KEY` must match on both sides

Pull the existing value from Doppler `prd` rather than generating a new one. If the worker and the app
disagree, **the worker runs perfectly and the app reports it unreachable** — a failure that looks like
a network problem and is not.

### W4 — verify from OUTSIDE the box

`curl localhost:3100/healthz` on the droplet proves nothing about reachability. The real test is
`curl https://worker.starr-surveying.com/health` from elsewhere. A worker that answers on loopback and
not the internet is a firewall problem that looks like success from inside.

### W5 — `pm2 startup` / compose `restart: unless-stopped`

Compose already sets `restart: unless-stopped`. Whatever supervises it must survive a **host reboot** —
the previous droplet's silent disappearance is consistent with something that never came back after a
restart.

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

### R1 — Open-web research via Tavily ◐ **R1a SHIPPED 2026-08-26 · R1b open**

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

**R1b — feed the findings to the synthesis ☐ NEXT.** Today the findings land in the run log, where a
surveyor reads them. They are not yet passed to the AI that writes the report, so the model cannot
reason over a lien it can see in the log. That is the next slice and it is where most of the value
is — deliberately split so R1a could ship wired rather than sitting behind a bigger change.

### R2 — County coverage: deeper, not wider ☐

Measured 2026-08-26:

| Layer | Coverage |
|---|---|
| **BIS CAD portals** (`services/bis-cad.ts`) | **108 Texas counties** — Bell outward in rings |
| CAD adapters wired (`services/property-discovery.ts`) | 6 — BIS, Tyler, TrueAutomation, HCAD, TAD, **GenericCAD fallback** |
| Clerk/deed registry (`adapters/clerk-registry.ts`) | **21 counties** — iDocket, Kofile, Fidlar, Henschen, CountyFusion, eDoctec, Aumentum |
| Government data sources (`worker/src/sources/`) | 10 — FEMA, NRCS, RRC, TCEQ, TNRIS, TxDOT, USGS, Comptroller, GLO |
| Deep county modules (`counties/`) | **1** — Bell, 7 dedicated scrapers + analyzers |

**The gap is depth and deeds, not breadth.** Appraisal-district coverage is 108 counties; deed coverage
is 21. A property in a county with CAD but no clerk adapter gets valuation and geometry but no chain of
title — which for a surveyor is the half that matters.

Priority: extend the clerk registry toward the CAD footprint, starting with the counties the firm
actually works (Bell, McLennan, Williamson, Coryell, Falls, Milam, Burnet, Lampasas).

### R3 — Multi-tenancy does not exist ☐

The owner intends to eventually rent research capacity to other surveying firms. **There is no `org_id`
anywhere in the research pipeline, worker services or routes.** That is a real build — tenant scoping,
per-firm quotas, billing attribution — and it is *software*, not servers.

> **Do not size hardware for this yet.** And when it comes: county portals rate-limit by **IP**, so ten
> firms behind one address is how you get blocked. The scale-out unit is another cheap box with its own
> IP, not a bigger box. Four netcup servers = $184/mo, 48 dedicated cores, four IPs — half the price of
> one equivalent DigitalOcean General Purpose droplet.

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

## 8. Owner-gated — nothing proceeds without these

1. **netcup order review** clears → server IP + SCP credentials
2. **DigitalOcean** balance settled, account closed
3. **Browserbase / Mailgun** cancelled (S2)
4. **Business Profile** access confirmed (G)
5. **`sameAs` URLs** supplied (M3)
6. **Voyage old key** revoked (S5)
7. **Captcha policy** — which counties we are willing to automate (R4)
