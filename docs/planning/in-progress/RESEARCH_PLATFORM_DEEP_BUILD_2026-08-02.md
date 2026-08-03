# Property Research Platform — Deep Build

**Date:** 2026-08-02
**Owner ask (verbatim intent):** a *super robust, self-healing, self-adjusting, AI-driven* research
system that can find everything findable online about a Texas property; navigate county clerk and
appraisal district sites; hook into paid property-data subscriptions; capture screenshots, full deed
and plat histories; have AI locate the property's important features from the documents and produce a
**survey gameplan**; integrate satellite / bird's-eye / street-level imagery; use Playwright, OCR and
a real browser; run 20–30 minutes per request on rented compute, **as cheap as possible per run**;
present the result in an intuitive UI; let a person **draw on the saved docs and images and save
those edits apart from the original**; and let whoever oversees research assemble a **final packet**
that attaches to the job so the field crew knows what to do.

**How to read this:** §1 is what actually exists, measured today — it is far more than a greenfield,
and several of the owner's asks are half-built rather than missing. §2 is what is wrong or absent.
§3 is the build, in slices sized for the stop-hook loop. Each slice is independently shippable and
carries its own acceptance test.

---

## 0. Status — 2026-08-02

**All 30 slices have been worked. 14 are fully done; 8 carry remaining work; the rest were already
complete or landed whole.** This document **stays in progress** because the remainders below are real
build work, not paperwork — moving it now would be marking things deferred to empty a folder.

### Done, nothing outstanding
R1–R3, R5–R7, R9, R11, R12, R20, R21, R22, R23, R24, R27, R30.

### Session of 2026-08-03

**Phase I added — the survey itself.** A new phase (§3, Phase I) for a set of owner requests that are
all about the *content* of a document rather than about finding it: corner markers read as objects,
corners positioned relative to each other, varas converted, and an old survey rotated onto the grid
being shot. S1–S7 and S9–S11 shipped; S8 (measured OCR tiling quality) is settled as arithmetic and
now waits only on a golden plat — which S9 partly routes around, by using each document's own
**closure** as evidence about whether we read it correctly.

**And S10 is the one that made the other nine real.** An audit at the end of the phase found that
*every* Phase I module had zero production callers — the whole stack was an island, imported only by
its siblings and its own tests, so a processed document got the same treatment it got before the
phase began. `survey-reading.ts` is the bridge, called from `pipeline.ts` Stage 4. Seventh instance
of the authored-but-not-wired defect in this document, and the largest.

**Document retrieval is real for 22 counties, not one.** An audit found `KofileClerkAdapter.
getDocumentImages` is a full implementation — Bell was never a bespoke exception, it is the same
path. It could still `return []` when the viewer changed its class names, which says *this document
has no pages* about a document the index just listed; it now falls through to the production capture
and then throws rather than answering with an empty array.

**County coverage: 22 → 41 routed counties.** S-7 turned out to be a county-list expansion rather
than an adapter — `texaslandrecords.com` is a directory of the Avenu portals already driven, so the
Avenu adapter went from 2 counties to 19 with no parser change, and two verified Kofile counties
(Cochran, Live Oak) came off the same page. Detail in
`RESEARCH_SOURCES_AND_PAID_ACCOUNTS_2026-08-02.md` §"S-7 is DONE".

**Twelve counties were filed under the wrong FIPS code.** Kimble under Kerr's, Menard under
Matagorda's, Rockwall under Rusk's, and nine more across the Henschen, iDocket and Fidlar tables.
This is the third appearance of a bug this codebase had already fixed by hand once (Lampasas filed
under La Salle), and it is wrong in two directions at once: the intended county silently has no
adapter, and an unrelated county is reported as covered by a portal that is not its own.
`paid-platform-registry` builds `coveredFIPS` straight from those sets, so it was answering "a
platform covers Kerr" and "nothing covers Kimble" — both wrong, neither visible. Fixed, and pinned
by `worker/src/__tests__/fips-labels-match-county-table.test.ts`, which checks every adapter's
FIPS→name claim against the authoritative 254-county table.

**The 14 stale recon tests are fixed** — they asserted the pre-R37 belief that Henschen/iDocket/
Fidlar were reachable. They now pin the `isVendorProven` gate instead, including a sweep asserting
that *no* county of an unproven vendor routes to it.

### Buildable work still outstanding
| Slice | What remains | Why it was not done in the slice |
|---|---|---|
| ~~R14~~ | **DONE 2026-08-03** — errands run by citation, five outcomes, and "could not be searched" never reported as "not found" | — |
| ~~R18~~ | **DONE 2026-08-02** — one assessor, enforced on both paths | — |
| R38 | Prove the remaining vendors the way Kofile was proven: locate each portal from the county's own site, drive it, read the DOM | Blocked per county on finding the portal; the Tyler/Henschen/iDocket/Fidlar URL patterns are all dead |
| R39 | Hunt each remaining county's portal individually — the only method left once no URL pattern generalises | 3 unknown vendors found + driven: eDocTec (Coryell, Lampasas), Tyler Eagle (9 incl. McLennan/Waco), Avenu 20/20 (Falls, Robertson). Verified counties 7 → 20 |
| ~~R25~~ | **DONE 2026-08-03** — the picker was already built (stale item); page images embedded, with every absence stated. Annotated drawings deferred: needs a server-side raster of R24's layers, a canvas job rather than a packet one | — |
| R13 | TitlePoint/DataTree-class vendors and Regrid behind the purchase interface | Larger than a slice; the library and cost policy they plug into are done |
| ~~R17~~ | **DONE 2026-08-03** — `source_bounding_box` holds a value. The producer was in the app all along: the tiling OCR already measured every tile and discarded the geometry. Also fixed a write that was wiping the document viewer's page URLs | — |
| ~~R28/R29~~ | **DONE 2026-08-03** — the poller runs at boot behind `RESEARCH_QUEUE_POLLER`, default off. The loop was code, not deployment; enabling it is now configuration | — |
| ~~R15~~ | **DONE 2026-08-03** — the packet says which plats it actually contains; the attachment path already existed, the join did not | — |
| R26 | The native mobile job view and true offline document caching | Device-runtime work this repo tests on hardware, not here |

### Owner requests added after the original 30 slices
| Added | What | Where |
|---|---|---|
| 2026-08-02 | Adjoiner info, ROW/easements, shallow-then-deepen on nearby properties, survey recency | **Phase G (R31–R34)** — all four shipped |
| 2026-08-02 | "Whatever counties are for those places we need to have fully built" (23 places → 13 counties) | **Phase H (R35–R38)** — in progress |
| 2026-08-02 | Permission to drive Playwright/OCR against county sites to work out how to retrieve documents | **R37**, which R38 depends on |

### Blocked on the owner, not on code
Every item in §4 below. In particular: **paid-platform credentials** (R13), **imagery licensing and
API keys** (R16), the **~10 golden-record properties** confirmed with a surveyor (R19, and R9's
canaries), **automation posture per county** (R12 — until a county's terms are read, every captcha
there is refused, which is the intended failure mode), and **ordering the box** (R29).

### What changed in the platform's character
Thirty slices found one defect over and over, in fifteen different places: **an unknown rendered as
an answer**. A chain that stopped without saying why; an easement drawn at an invented position with
the extraction's confidence attached; a plat that had been superseded; a page nobody could read
marked `extracted`; a fact the model asserted shown identically to one quoted from a deed; a $0.00
that meant "not measured"; an empty panel that meant "we could not read it". The fix was the same
every time — say which, and say what would settle it — and it is now enforced by guard tests rather
than by discipline.

---

## 1. What exists today — measured, not estimated

| Thing | Measured |
|---|---|
| `lib/research/*` (Next.js side) | **31,800 lines**, 54 modules |
| `worker/src/*` (separate service) | **102,429 lines** — the real engine |
| Admin research UI | **32,845 lines** across 40 components |
| Research API routes (Next) | **64** handlers |
| Worker HTTP routes | **~40** (`/research/property-lookup`, `/harvest`, `/adjacent`, `/row`, `/reconcile`, …) |
| County **clerk/CAD adapters** in the worker | 17 (Tyler, Kofile, Fidlar, Henschen, iDocket, CountyFusion, TrueAutomation, TexasFile, BIS, HCAD, TAD, generic CAD/clerk, Bexar) |
| Paid-document platforms with purchase adapters | 8 (`tyler_pay`, `henschen_pay`, `idocket_pay`, `landex`, `fidlar_pay`, `govos_direct`, `kofile_pay`, `texasfile`) — registry sorts **cost-ascending**, free sources first |
| Public data sources | FEMA NFHL, GLO, TCEQ, RRC, NRCS soils, USGS, TNRIS LiDAR, TxDOT roadways, Comptroller |
| Counties with a **dedicated** pipeline | **1 of 254** (Bell). Everything else falls to the generic pipeline |
| Live research projects | **56** (37 in `review`, 8 `configure`, 6 `upload`, 3 `analyzing`, 2 `drawing`) |
| Live research documents | **654** |
| Extracted data points | **208** |
| Rendered drawings | **14** |
| Registered adapters in `research_site_adapters` | **0** |
| Adapter health checks ever run | **0** |
| Research usage/cost events ever recorded | **0** |
| Research projects linked to a job | **0 of 56** |

**Infrastructure as built:** the worker is a Node 22 + Express + Playwright service, Dockerised
against `mcr.microsoft.com/playwright:v1.58.2-jammy`, PM2-managed, designed for a DigitalOcean
droplet. It has a browser factory that can target local Chromium, **Browserbase**, or a stub; a
captcha-solver interface with a **CapSolver** provider and a stub; a BullMQ + Redis job queue; a
billing tracker; a confidence-scoring engine; geometric reconciliation; chain-of-title building; ROW
integration; adjacent-parcel research; and a document-purchase orchestrator that tries free sources
before paid ones.

**This is not a prototype.** The gap between it and the owner's ask is narrower than the ask implies —
but the gaps that exist are load-bearing.

---

## 2. What is wrong, missing, or unproven

### 2.1 🔴 The engine is offline, and the container would kill itself if it weren't

`WORKER_URL=http://104.131.20.240:3100`. Probed 2026-08-02: **no response on any path, 100% packet
loss on ping.** Every deep-research feature in the app — the 20–30 minute pipeline the owner is
describing — currently returns a 502 or falls back to the "lite" in-Vercel path.

Worse, and separately: `worker/Dockerfile`'s `HEALTHCHECK` polls **`/healthz`**. The Express app
defines **`/health`**. `grep -rn healthz worker/src` returns nothing. A container built from that
Dockerfile marks itself unhealthy after three probes and gets restarted forever. The Dockerfile even
carries the comment *"TODO Phase A: confirm this endpoint exists; add if missing"* — it does not.

### 2.2 🔴 There are two research systems, and they do not know about each other

- The **worker** holds the real county knowledge: 17 adapters, hard-coded in TypeScript, one dedicated
  county module, a switch statement in `counties/router.ts`.
- The **app** holds the *registry* the self-healing system was built around — `research_site_adapters`,
  `research_data_vendors`, `research_counties` (all 254 seeded), canaries, health checks, change
  proposals, the §8.3 site probe, the §9.8 dashboard.

`grep -rln "research_site_adapters" worker/src` → **nothing**. The self-healing subsystem monitors a
registry that has **zero rows** while the scrapers that actually break are compiled into a service
that never reads it. Every "self-healing adapter" guarantee currently applies to an empty set.

### 2.3 🔴 Nothing measures what a run costs

`research_usage_events` has a cost column, a model column, token columns — and **0 rows**. The only
code touching it is the billing page, which *reads*. The worker's `billing-tracker.ts` contains no
pricing constants. So "as cheap as possible per run" cannot currently be evaluated, compared, or
regressed against. Every optimisation in this plan is unmeasurable until a writer exists.

### 2.4 🔴 A run does not survive a restart

`worker/src/index.ts` keeps `activePipelines`, `completedResults`, `completedLogs` in **in-process
`Map`s**. A 25-minute run on a droplet that restarts, OOMs, or deploys loses everything — including
paid documents already purchased. BullMQ and ioredis are dependencies and a `job-queue.ts` exists,
but only `batch-processor.ts` imports it; the primary path does not.

### 2.5 🟠 Model IDs are a generation behind and chosen per-call-site

The worker hard-codes `claude-sonnet-4-6` (22×), `claude-sonnet-4-20250514` (18×),
`claude-sonnet-4-5-*` (7×), `claude-haiku-4-5-*` (2×) across services. The app standardised on one
model config in `lib/ai/models.ts` (audit item 13); the worker never adopted it. There is no
cheap-first escalation policy: a page of clean typed text costs the same model call as a
19th-century handwritten deed scan.

### 2.6 🟠 Imagery is USGS-only

`map-image.service.ts` fetches USGS `USGSImageryOnly` + `USGSTopo` and geocodes with Nominatim. That
is free and license-clean, but it is **not** what the owner asked for: no Google/Esri high-resolution
satellite, no oblique/bird's-eye, no Street View, no historical imagery for comparing a boundary
against what was there when the deed was written, and no parcel-framed capture at a fixed scale.

### 2.7 🟠 You can draw on documents, but the drawing is not saved

`SourceDocumentViewer.tsx` has a real markup mode (`drawMode`, colours, widths, `drawPaths`) — held
in a `Map` in React state. Nothing persists it. Only the **generated CAD drawing** has the
save-separately model done properly (`rendered_drawings.user_annotations` beside AI-generated
`drawing_elements`). The owner's ask — annotate the saved docs and images, keep edits apart from the
original — is built for one artifact type and missing for the other 654.

### 2.8 🟠 The survey plan is generated on demand and then thrown away

`GET /api/admin/research/[projectId]/survey-plan` calls `generateSurveyPlan()` and returns it. It is
not persisted, not versioned, not reviewable, not approvable, and **not attached to anything**.
`research_projects.job_id` exists and is `NULL` on all 56 rows. There is no packet, and the field crew
cannot see research output at all.

### 2.9 🟠 Coverage is one county deep

`counties/router.ts` has exactly one `case`. For the other 253 counties the generic pipeline runs
with generic adapters — which is a reasonable fallback, but nothing measures *how well* it does, and
nothing tells a user before a run what coverage to expect for their county.

### 2.10 🟠 No run budget, no timebox, no step ceiling

The owner wants a bounded 20–30 minute run. `maxResearchTimeMinutes` is accepted as an input and
plumbed into the Bell module; there is no global enforcement, no per-run dollar ceiling, no policy for
what to drop when time runs short. A run can therefore be both too short (missing sources) and too
expensive (unbounded AI calls) at once.

### 2.11 🟡 Smaller, real
- **Paid purchases have no receipt trail a bookkeeper can audit** — the orchestrator can spend money;
  `receipts`/`research_usage_events` never see it.
- **OCR is per-adapter**, not a shared service with a quality floor; no confidence, no language of
  "this page was unreadable".
- **Rate-limit / ToS posture is per-adapter**, with no central politeness budget per county host.
- **The review UI is one 3,616-line component** whose four stage sections read ~95 pieces of state
  (measured in the platform audit) — every UI improvement below is more expensive because of it.
- **No before/after diff on re-runs**: `pipeline-diff-engine.ts` exists in the worker and nothing in
  the app surfaces it.

---

## 3. The build

Slices are ordered so each one is useful alone and unblocks the next. **Phase A is not optional
polish — nothing else in this plan can be trusted while the engine is down and nothing is measured.**

### Phase A — Make the engine real, durable, and measurable

- **R1. ✅ DONE 2026-08-02 — `/healthz`, and a deploy that proves itself.**
  `worker/src/infra/health.ts` + `GET /healthz`. NOT an alias of `/health`, which turned out to be the
  more important half of the finding: `/health` launches Chromium and calls Supabase on every request
  and returns 503 for config-only warnings, so wiring the container probe to it would have launched a
  browser twice a minute forever and restarted a working worker over a missing nice-to-have
  credential. The two endpoints answer two questions now — *is everything configured and reachable*
  (deep, for humans) and *should this container keep running* (cheap, cached, for Docker).

  The browser probe is part of liveness, because a worker that cannot launch Chromium is a process
  that will accept jobs and fail all of them — a probe that only proved Express was up would have
  called the current droplet healthy. It is cached (5 min TTL), deduplicated, refreshed in the
  background so a slow launch never turns the probe into a timeout, and warmed at boot. Config gaps
  are reported in `warnings` and are never fatal: restarting on a missing credential turns one wrong
  setting into a crash loop.

  *Verified by running it*, not by typechecking: `BROWSER_BACKEND=stub` → **200 ok** with the probe
  duration and queue depth; `BROWSER_BACKEND=local` with no Chromium installed → **503 degraded**
  carrying Playwright's actual "Executable doesn't exist" message. `--start-period` raised 20s → 90s
  to match `BOOT_GRACE_MS` so a cold container is never killed mid-boot, and `ARG BUILD_SHA` stamps
  the image so a running container can be matched to a commit.

  Guarded from the ROOT suite by `__tests__/research/worker-healthcheck-contract.test.ts` — every
  HEALTHCHECK path must be a route `index.ts` actually defines. Confirmed it fails on the original
  defect by reintroducing it. It lives in the root suite deliberately: the worker has its own test
  run needing its own `node_modules`, which makes it the suite most likely to be skipped, and this
  bug hid precisely in the gap between two suites and a Dockerfile.

  Drive-by, same class: `LocalDocumentStorage.getSignedUrl()` built `file://` + an absolute path by
  concatenation, so on Windows it emitted `file://C:…a.txt` — backslashes, which is not a URL and
  will not parse. Now `pathToFileURL().href`. The worker suite is green at 152 passing (it was 151/1).

- **R2. ✅ DONE 2026-08-02 — the app tells the truth about the worker.**
  `lib/research/worker-status.ts` (pure verdict) + `GET /api/admin/research/worker-status` (one
  bounded 4s probe of `/healthz`, cached 15s and deduplicated so a page left open is not a
  health-check flood) + a banner on the research list.

  Four situations get four sentences, because two of them are somebody else's job to fix and one is
  not a fault at all: **not_configured** (no WORKER_URL — a normal deployment state, shown in an
  informational tone rather than red), **unreachable** (configured and silent — points at the
  machine, not the app; a credentials mismatch says both sides are fine and disagree), **degraded**
  (answering, but its own /healthz says it cannot open a browser — the dangerous one, because it
  looks up and will accept a run and fail it), and **ok** (with the current job count).

  Two things the probe exposed that were worse than the missing banner:
  · A transport failure in the pipeline route escaped as a **500**, which the run panel reports as
    "research failed" — a different and wrong claim. It is now a **503 with the reason**, which is
    the shape the panel's existing lite fallback already knows how to handle.
  · That fallback was **silent**: it swapped in the much weaker lite pipeline and announced it in a
    status line that the next progress message overwrote about a second later. The notice is now
    held for the life of the run and says what the run will and will not do.

  *Verified in a browser against the real, dead droplet:* the banner reads "The research worker is
  not answering, so deep research cannot run right now / The server did not respond: The operation
  was aborted due to timeout / A run started now uses the built-in lite pipeline…" with no console
  errors.

- **R3. ✅ DONE 2026-08-02 (the acceptance's second branch) — runs survive a restart.**
  `seeds/530_research_runs.sql` + `worker/src/infra/run-store.ts`. One row per run: phase, message,
  heartbeat, spend, paid pages, the limits it was given, the work the budget made it skip, and which
  build was running.

  **`interrupted` is its own status, not a kind of `failed`.** The research did not fail — the
  process holding it stopped, and it is usually a deploy. Somebody scanning a list of failures should
  not have to work out which ones were releases. The recovery sweep runs at boot: any row still
  `running` whose heartbeat is older than ten minutes belonged to a process that no longer exists.
  Ten minutes is long enough that a county portal taking four minutes is never mistaken for a dead
  worker, short enough to answer "did my research survive the deploy?" in the same sitting.

  The spend travels with the heartbeat, which is the point: **an interrupted run that had already
  bought $12 of plats must not look identical to one that spent nothing** — that difference is what
  decides whether somebody re-runs it.

  *Verified against production:* a run was started, advanced two phases with $1.25 recorded, its
  heartbeat backdated eleven minutes, and a fresh boot reported `1 run(s) were interrupted by a
  restart — $1.2500 already spent, last phase(s): Deed chain. They are marked interrupted, not
  failed.` The synthetic row was then deleted.

  **What this deliberately does NOT do**, stated in both the module and the seed: it does not resume
  a half-finished pipeline. The pipeline has no checkpoints, and re-running phases whose side effects
  are *purchases* is not idempotent — a resume that re-bought documents would be worse than no
  resume at all. Moving the primary path onto the existing BullMQ queue remains the right end state
  and is a larger change; this is the urgent half, which is that an interrupted run is **visible as
  interrupted** rather than as silence.

- **R4. ⚠ PARTIALLY DONE 2026-08-02 — the writer exists; the last call sites are still being
  migrated.**
  `worker/src/infra/usage.ts` is the one place that prices a call and the one place that writes to
  `research_usage_events`. Per-model rates (Opus 5 / Sonnet 5 / Haiku 4.5, plus the dated ids still
  hard-coded across the worker), cache-read and cache-write rates tracked separately because
  re-sending a 40-page deed to five prompts is the largest saving available and is invisible without
  them, and dated-id resolution by longest prefix so `claude-sonnet-4-5-20250929` does not price as
  `claude-sonnet-4`.

  An unknown model prices at the Sonnet fallback and is flagged `unpriced_model` — **never zero**,
  which would make an unpriced model look like the cheapest thing in the system.

  The Bell analyzers had their own constants — `COST_PER_INPUT_TOKEN = 3/1e6`, "claude-sonnet-4
  pricing as of March 2026" — applied to **every** call regardless of model, so a Haiku
  classification and an Opus synthesis cost the same on paper. Deleted; they price through the one
  module now. Captcha solves, which are real charges on a real invoice, were written to a log line
  and nowhere else; they now record too.

  Telemetry never fails a run — a failed insert is logged loudly and dropped — and the in-process
  accumulator increments **before** the write, so a budget ceiling (R5) counts a call whose row was
  lost. `spendForRun(projectId)` is the enforcement surface R5 will read.

  **Still to migrate:** 21 files construct their own Anthropic client directly and do not report
  tokens through the helper. Those are the same call sites R6 rewrites for cheap-first routing, so
  the two passes are being done together rather than touching each file twice.

- **R5. ✅ DONE 2026-08-02 — run budget and timebox, enforced.**
  `worker/src/infra/run-budget.ts`. Three ceilings — wall clock (default **25 minutes**, the owner's
  number), spend, and paid pages. Paid pages are bounded separately from dollars because one $50
  plat set can pass a dollar limit in a single purchase, and that decision deserves its own bound
  rather than hiding inside a total.

  A caller's `maxResearchTimeMinutes` is honoured and **clamped to 60**: a request for four hours is
  either a mistake or somebody working around a problem that should be fixed properly, and a worker
  that accepts it holds a concurrency slot the whole time.

  **Stopping is not failing**, which is the behaviour that matters. At a ceiling the run finishes
  cleanly with what it has, keeps the documents it already paid for, and carries `budgetSummary` +
  `skippedWork` on the result: *"Finished early because the run reached its 25-minute time limit.
  Not attempted: adjoiner research, ROW integration. Re-run with a higher limit to continue."* A run
  that dies at its limit is worse than useless — the money is spent, the time is gone, and there is
  nothing to show. A partial result that does not name what is missing is indistinguishable from a
  complete one, and a surveyor cannot tell "no easements found" from "we stopped looking".

  Enforced at the **phase boundary** (the progress callback), never mid-phase: stopping between
  phases leaves a coherent partial result; stopping inside one leaves half a chain of title. The
  ceiling **latches**, so a run winding down does not resume and half-finish a phase twice. Skips are
  de-duplicated, because a list with "adjoiners" in it six times reads like six failures. An
  unbudgeted call reports `ok` — a path nobody set a limit on is not an over-budget one.

  Deployment defaults: `RUN_MAX_MINUTES`, `RUN_MAX_COST_USD`, `RUN_MAX_PAID_PAGES`, documented in
  `.env.example`.

- **R6. ✅ DONE 2026-08-02 — model routing, cheap-first.**
  `worker/src/infra/model-router.ts`. **25 hard-coded model ids** across the worker became a choice
  by TASK, hand-assigned per call site (a regex guessing from surrounding text would be exactly the
  per-call-site accident this removes):

  `classify` · `read_text` → **cheap** (Haiku 4.5) — the bulk of a run
  `read_scan` · `extract` → **mid** (Sonnet 5)
  `reconcile` · `synthesize` → **top** (Opus 5) — two sources disagreeing, and the gameplan a crew acts on

  Ids are **undated**. A dated pin (`claude-sonnet-4-20250514`) freezes a call site to a generation,
  which is exactly how this worker ended up two behind while the app had already standardised.

  **Escalation is what makes starting cheap safe**, not a fallback: a low-confidence answer is
  retried a tier up, one step at a time, and `escalate()` returns null at the ceiling rather than
  repeating the top tier — a caller looping "escalate until confident" against a model that cannot
  do better would spend the whole run budget on one unreadable page. A call site that reports **no**
  confidence does not escalate, because escalating everything that cannot self-assess would put the
  pipeline on the top tier and quietly undo the saving. Every attempt is reported so a task that
  escalates *every* time — i.e. one classified into the wrong tier — is visible rather than merely
  expensive.

  Three pins remain, in `ai/prompt-registry.ts`, and they are **deliberate**: a prompt version
  records "this wording, on this model, scored this accuracy", and routing it dynamically would
  compare v1 on Haiku against v2 on Opus and call the difference a prompt improvement. The file says
  so, and the ratchet test excludes it by name rather than by accident.

  *Acceptance deferred in part:* the ≥60%-on-cheap measurement needs a real run against the golden
  set (R9's remaining half), which needs the worker deployed and the canaries confirmed. The routing
  and the ratchet are in place; the number comes when there is a run to measure.

- **R7. ✅ DONE 2026-08-02 — compute plan, priced, and built out.**
  Owner constraint: **≤ $70/month**. Chosen: **netcup RS 4000 G12 — 12 dedicated AMD EPYC 9645
  (Zen 5) cores, 32 GB DDR5 ECC, 1 TB NVMe, in Manassas, Virginia — €33.55/mo net ≈ $38.50**, about
  55% of the cap, leaving ~$31/mo for the variable costs (Claude calls, paid pages, CapSolver,
  occasional Browserbase). Full comparison table, sizing maths and runbook:
  `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md`.

  Two facts eliminated most of the field. Hetzner's **June 2026 price increase** (+113–176% on
  CCX/CPX) took its dedicated-vCPU cloud line out of budget — CCX23 is now ~$98. And the **US IP
  requirement** took its excellent bare-metal line out with it: the worker scrapes *Texas county*
  portals, and a German IP invites geo-blocks and extra captchas. Netcup's G12 root servers sit
  exactly on the intersection — dedicated cores, ECC memory, US datacentre, EU pricing. Contabo is
  cheaper on paper and shared-CPU, which is the wrong risk for a 25-minute run.

  **No GPU.** Vision and extraction are Claude API calls — the inference is on Anthropic's hardware.
  A rented GPU would be the largest line on the bill and idle through every run.

  Shipped with it, so the recommendation is a deployment rather than a paragraph:
  · `worker/docker-compose.yml` — worker + Redis sized for that box: 26 GB limit, `shm_size: 1gb`
    (Chromium crashes on Docker's default 64 MB with the "Target closed" that looks like a flaky
    county site), log rotation, appendonly Redis with `noeviction` because silently dropping a
    queued run is worse than refusing a new one, and the port bound to **127.0.0.1** with Caddy as
    the TLS edge.
  · `worker/src/infra/capacity.ts` — concurrency computed from cores and RAM at boot, published on
    `/healthz`, and **enforced**: a run the box cannot hold gets a `503 … retryable: true` rather
    than being accepted and OOM-killing a neighbour at minute 22, after the documents have been
    bought. On the recommended box: `12 cores, 32 GB → max 6; limited by ceiling (cpu→8, memory→11,
    ceiling→6)`. The binding limit is politeness toward small county servers, not hardware, and it
    says so.
  · `worker/.env.example` — the worker read **70** environment variables and documented **23**.
    The 47 missing included *every* paid-document credential, whose absence is silent and expensive:
    the run completes, buys nothing, and reports the county as having no records. All documented,
    with a test that fails when the code starts reading an undocumented one.

  *Verified by running the built worker:* `/healthz` reports capacity and the reason, and the boot
  line reads `22 cores, 15.4 GB → max 4 concurrent research run(s); limited by memory (cpu→14,
  memory→4, ceiling→6)` on the dev machine — i.e. the calculation reacts to the real box.

### Phase B — One brain: the registry becomes the source of truth

- **R8. ⚠ HALF DONE 2026-08-02 — the registry is no longer empty, and the resolver exists.**
  *Owner emphasis 2026-08-02: "the system needs to be able to check and sense when a website has
  changed or been updated, then adjust and self heal to be able to use the new or updated website."
  This slice is the precondition for all of it — sensing needs a subject, and adjusting needs
  somewhere to put a fix that is not a deploy.*

  `worker/src/infra/adapter-registry.ts` does two things:

  **Publishes** the worker's compiled county knowledge into `research_site_adapters` on boot.
  Verified against production: **0 rows → 21**, and honest about what they are — 2 `active`
  (Bell, Bexar) and 19 `draft`, because a stub advertised as active is how a surveyor picks this
  firm for a county it cannot actually search. Idempotent and **non-destructive**
  (`ignoreDuplicates`): a restart must not undo a repair somebody accepted last week.

  **Resolves** registry-first, compiled-fallback, with a 60-second cache and an explicit
  `invalidateAdapterCache()` so an applied repair lands immediately. A stored `base_url` wins over
  the compiled one — a county moving its portal is the most common break there is, and fixing it in
  a row rather than in a release is the whole point. Every answer records whether it came from the
  registry or from code, because the two behave identically right up until one is wrong.

  Why publish-then-read rather than registry-only: a fresh or wiped database would otherwise leave
  the worker unable to research a county it has perfectly good code for. Compiled is the floor;
  corrections sit on top.

  **R8b ✅ STARTED 2026-08-02 — the Kofile adapter now reads the registry.** Kofile is the vendor
  behind ~80 Texas counties and the one implemented for Bell, so it is the adapter worth doing
  first. It resolves at `initSession()` (the constructor is synchronous; the registry is a network
  read) and overlays a small snake_cased contract a repair can target: the row's own `base_url`,
  plus `config.search_path`, `config.viewer_path`, `config.super_search_url`,
  `config.has_supersearch`. Every field is guarded by a presence check, so a **partial** repair is
  safe — fixing the search path cannot silently blank the viewer path. A registry that is
  unreachable leaves the compiled config exactly as it was, and a run using a URL that is not in the
  source tree logs that fact, or the next person to debug it will read the constant and believe it.

  *Proven against production*, which is the only way this claim means anything: the Bell row's
  `base_url` was edited to `https://bell.tx.example-newvendor.gov` with a `search_path` override,
  `resolveAdapter()` returned the new values immediately after `invalidateAdapterCache()`, and the
  row was restored. **A county moving its portal is now a row edit, not a release.**

  **Remaining:** the other 16 adapter families still read their module constants. Each is the same
  ten-line change; they are being done as each county's canary (R9) exists to prove it.

- **R9. ⚠ HALF DONE 2026-08-02 — sensing is now recorded; the golden set is still to come.**
  *Owner emphasis: sense a changed site, then adjust.* The sensing already existed and was being
  thrown away.

  `SiteHealthMonitor` has always opened every county portal in Chromium on a timer and checked that
  the selectors an adapter depends on are still present. Its results went to memory and a WebSocket
  and vanished on restart, while the app's self-heal pipeline — diagnose, propose, review, apply —
  reads `research_adapter_health_checks`, which had **0 rows because nothing wrote to it**. A county
  could change its site, the monitor would notice within the hour, and the repair machinery would
  never hear about it.

  `worker/src/infra/health-persistence.ts` is that write, and the translation is where the judgement
  sits:
  · a **required** selector gone → `broken` — the signal a repair agent can act on, because there is
    a page to diagnose;
  · an **unreachable** site → `error`, NOT broken. Nothing to diagnose from a timeout, and county
    portals go down for maintenance on weeknights;
  · an optional element gone → `degraded`, still usable;
  · the summary names the element ("required element(s) gone — results table"), because "structure
    changed" sends somebody to read a diff and the element name sends them to the page.

  The adapter's own status moves only after **two consecutive** failures — a dashboard that cries
  wolf on one maintenance window is one nobody reads — but recovers on the **first** good check,
  because being wrong in that direction only costs a needless "we can't search that county". A
  status change invalidates the resolve cache so a repair is not stale for a minute.

  *Verified against production:* a simulated "the results table is gone" result was sensed,
  translated and written — `{"written":1,"unmatched":[],"errors":[]}` — with the row reading
  *"Kofile — Bell County: required element(s) gone — results table. The site's structure changed."*
  The synthetic row was then deleted, because leaving it would tell the coverage dashboard that the
  one county that works is broken.

  Recording also runs after every scheduled sweep, not only the manual `POST
  /admin/health/sites/check`.

  **The semantic layer ✅ SHIPPED 2026-08-02** — `worker/src/infra/canary.ts`. The structural
  check catches a redesign; it cannot catch the failures that actually cost a survey, all of which
  leave every selector in place and the answers wrong:

  · a results grid switched to lazy-load, so the selector matches an empty table;
  · a portal that starts returning the FIRST result for every query, so every property looks the
    same;
  · a vendor migration that silently swaps acreage from acres to square feet;
  · a session expiry that renders a login page carrying the same container ids.

  Comparison is the whole design problem, because a canary that demands byte-equality fails every
  time a county reformats a date and an alarm that cries wolf is one nobody reads. Fields are
  compared **by kind**: identifiers normalised (`R-12345` = `R12345`), names by token set (a county
  reordering `SMITH, JOHN A` to `JOHN A SMITH` is not a break), measures with a relative tolerance
  — but **beyond ten times that tolerance it is a mismatch, not drift**, which is how the
  acres→square-feet swap is caught rather than averaged away — and long text by token similarity.

  Two verdicts kept deliberately apart: **`no_record`** ("the search returned nothing — the search
  itself is broken") and **`fail`** ("it returned the wrong property"). Different breaks, different
  repairs; collapsing them sends the repair agent to diagnose the wrong thing.

  The semantic layer can only make a health check **worse**. A page with every selector present that
  returns the wrong property is `broken`; a passing canary does **not** excuse a missing required
  element, because the canary exercises one property and that element may matter for every other.
  The failing sentence names both values — `expected "R-12345", got "R99999"` — because "parcel_id
  changed" sends somebody to guess.

  **Still to do:** register the actual golden records. The evaluator, the layer and the storage are
  in place; what remains is choosing ~10 properties across vendors and having a surveyor confirm
  their expected values. That confirmation is the point — a canary seeded from an unverified
  extraction would pin today's mistakes as tomorrow's truth — so it is an owner/RPLS task, not a
  coding one.

- **R10. Self-heal on real data, review-required.**
  With R8+R9 the existing proposal/apply pipeline finally has inputs. Keep auto-apply **off**; the
  review queue is the product. Add a "what changed on their site" diff view (DOM fingerprint before/
  after, screenshot pair).
  *Acceptance:* a broken adapter produces a proposal a human can accept in one click, and the canary
  re-passes.

- **R11. ✅ DONE 2026-08-02 — county coverage that reflects reality.**
  `lib/research/coverage-rollup.ts` + `GET /api/admin/research/coverage` + a panel above the
  existing table.

  The page rendered the worker's **compiled** clerk registry — a map of INTENT, which shows a county
  identically whether its adapter has ever successfully read a page or not. The measured claim now
  sits above it as a separate block, deliberately not as a colour change on the same rows: they
  answer different questions and a reader has to be able to tell which one they are looking at.

  The distinction the whole slice defends is **`verified` vs `unverified`**. An adapter marked
  `active` that has never passed a health check is a claim nobody has tested, and rendering it like
  a proven one converts an unknown into a promise — on the dashboard a firm reads before telling a
  customer it can search their county. `unverified` gets its own colour, its own word ("untested"),
  and cannot reach `full` however many adapters are registered.

  *Measured against production the moment it shipped:* **21 counties registered, 0 proven.**
  Headline — *"21 counties are registered and none has been proven to work yet — run a health check
  to find out where we actually stand"* — plus the sentence that matters most while it is true:
  *"No health check has ever run… That is a fact about us, not about the counties."* The compiled
  registry calls Bell and Bexar implemented; nothing has ever verified either. That gap is the
  entire reason this panel exists.

  Also distinguishes an unreachable portal from a changed page in the per-site note, because they
  need different repairs, and reports a failed registry read as a failure rather than as zero
  coverage.
- **R12. Politeness and legality budget.** ✅ DONE 2026-08-02
  Central per-host rate limiter, robots/ToS posture recorded per adapter, honest user agent (the
  probe already does this), and a hard rule that captcha solving is only used where the site's terms
  permit. Record every solve attempt with cost.
  *Acceptance:* two concurrent runs against one county cannot exceed the configured request rate.

  **Shipped.** `worker/src/infra/politeness.ts` — `withPoliteness(url, fn)` serialises every request
  to a host onto one chain and holds a minimum gap (`CLERK_RATE_LIMIT_MS`, default 1.5s) plus jitter,
  so concurrent runs against one county queue instead of colliding. Keyed on **host, not county or
  adapter**: five counties on `*.tx.publicsearch.us` are one Tyler, and pacing each separately would
  still deliver five times the traffic to the same servers. A throw inside `fn` still releases the
  host — otherwise one error wedges every later request to that county and looks exactly like the
  county having gone down. Wired into the health monitor, which is the thing that opens every
  registered portal on a timer.

  Legality is enforced at **one** point: `getCaptchaSolver()` now returns
  `withAutomationPolicy(solver)`, so no call site can forget it. `unknown` posture is a **refusal**,
  not a shrug — defaulting to "go ahead unless somebody said no" means the first time anyone reads a
  county's terms is after a complaint. A refusal is recorded as an attempt (`policy:` reason) because
  a silently skipped county is indistinguishable from one with no captcha, and `isPolicyRefusal`
  keeps "we could not" apart from "we would not".

  One design bug the tests caught: a never-contacted host was waiting a full interval before its
  first request, because the `lastStartedAt` zero sentinel read as "just used". Half a minute of
  delay across a 21-county sweep, protecting nobody. First contact is now `null` and goes straight
  through.

  Still owner input, not code: which counties are marked `automation_posture: 'permitted'` (§4.3).
  Until somebody reads those terms, every captcha is refused — which is the intended failure mode.
  Worker suite 302/302; both roots typecheck clean.

### Phase C — Find everything there is to find

- **R13. Paid subscription platforms, first-class.** ◑ PART DONE 2026-08-02 — ledger + policy shipped,
  new vendors and real credentials remain
  Wire the 8 purchase adapters to real credentials + a per-firm subscription record; add TexasFile,
  TitlePoint/DataTree-class vendors and Regrid parcel data behind the same interface. Every purchase
  writes a receipt row and a usage event (R4), and the cost-ascending order in
  `paid-platform-registry.ts` becomes an enforced policy, not a sort.
  *Acceptance:* a run that needs a $0.50 page records the spend, attaches the PDF, and never
  re-purchases a document already in the library.

  **Shipped — the two halves that needed no credentials.**

  *The library (seed 531 + `worker/src/services/purchase-ledger.ts`).* Purchases were tracked by
  `BillingTracker` in `/tmp/billing/<project>.json`: a directory the container wipes on restart,
  invisible to the app, scoped to one project. So nothing could answer the question that saves money
  — "do we already own this?" — and a second run on the same property re-bought the same deed at
  $1.00 a page. `research_document_purchases` is now the ledger and the library, and the orchestrator
  checks it *before* opening a vendor session.

  Identity is the whole problem, and it is keyed on the **county + instrument**, not the vendor (the
  same deed from Tyler and from TexasFile is one document) and not the project (the library is
  firm-wide; two jobs in one subdivision need the same governing plat). Instrument numbers are
  normalised — `2019-12345`, `201912345`, `2019/12345`, `Doc# 2019-12345` are one key — because
  comparing them literally is a duplicate charge on every run. Label prefixes are stripped from a
  known list only: a blanket "drop leading letters" would destroy `V123P456`, where the letters *are*
  the volume-and-page identity.

  The guard is a **partial unique index**, not a code check: two concurrent runs on one county would
  race past a code check, and this is exactly the workload that runs concurrently. Partial on
  `status = 'completed'` so a failed attempt is recorded without permanently poisoning an instrument
  we still need. Proven in production: a second completed insert was rejected by
  `idx_doc_purchases_owned` (23505), two failed attempts on one instrument both stored, and the
  instrument stayed buyable afterwards. Probe rows deleted.

  Every purchase now also emits a `document_purchase` usage event, so a $1.00 page appears in the
  same cost view R4 built for model spend instead of being money nothing could account for. Reuses
  are totalled onto the report as `librarySavings`, because an invisible saving is one nobody defends
  when somebody proposes turning the cache off.

  *The policy (`worker/src/services/platform-choice.ts`).* Cost-ascending was a **sort**, and a sorted
  list is a suggestion — the orchestrator chose a vendor by matching a recommendation's `source`
  string, so a Tyler county at $0.50/page was routinely billed $1.00 because the recommendation said
  TexasFile. `choosePlatform()` now makes the choice and states the reason, and `mayPurchaseFrom()`
  is the enforcement point: a dearer vendor is refused when a cheaper configured one covers the
  county, while a *cheaper* one is never refused (that would be the policy working against its own
  purpose). What it skipped and why comes back as `cheaperButUnavailable` — which doubles as the
  buy-list for whoever decides which subscriptions to pay for.

  Worker suite 323/323; both roots typecheck clean.

  **DONE 2026-08-03 — the policy is now asked.** The paragraph above describes `platform-choice.ts`
  as *"the enforcement point"*. It had **zero callers**. The module written to end the overpay never
  saw a purchase, and the orchestrator went on choosing a vendor by whether a recommendation's
  free-text `source` contained `"kofile"` — exactly the behaviour the module's own header describes
  as the defect.

  Eighth instance of this shape in this document, and it keeps landing on the same kind of module: a
  check nobody runs and a policy nobody enforces fail the same silent way, and both look shipped.

  `mayPurchaseFrom()` is now called before each purchase in `document-purchase-orchestrator.ts`.

  **It records the premium; it does not block the purchase** — a deliberate limit, stated in the code
  and pinned by a test so it does not get "fixed" later. The Kofile and TexasFile adapters wired into
  that file are the only ones that can actually complete a purchase, so refusing a dearer vendor
  would stall a run rather than save money. What changes is that the overpay becomes **visible and
  priced**, against a specific instrument, at the moment it happens: *"Tyler covers this county at
  $0.50 but has no credentials configured"* is at once an invoice line and a to-do item. A premium
  nobody records is a premium nobody ever decides to stop paying — and this is the number that turns
  "should we subscribe to Tyler?" from an opinion into arithmetic.

  Two details worth keeping. **"Configured" means what this run can actually buy from**, not what
  credentials exist in principle: otherwise the report names a cheaper alternative that was never
  initialised, which reads as a mistake and is not one. And `policyPremiums` is **undefined rather
  than `[]`** when nothing overpaid, so "the policy was checked and held" stays distinguishable from
  "the policy was never evaluated" — the same rule `librarySavings` and `identity` already follow.

  The typechecker caught the one bug available here: the platform id is `kofile_pay`, not `kofile`.
  A string comparison would have compiled, never matched, and left the policy permanently silent
  while looking wired.

  Worker suite 79 files / 1,322 tests; root typecheck and `npm run build` clean.

  **Remaining (owner-gated):** real credentials for the 8 adapters and a per-firm subscription
  record; TitlePoint/DataTree-class vendors and Regrid behind the same interface; PDF attachment into
  `research_documents`. The library and the policy are what those plug into, and both are now live.

- **R14. Full chain of title, to the earliest available instrument.** ✅ **DONE 2026-08-03** — gaps,
  the name walk, the citation errands, and (finally) the searches all four of them needed
  `chain-of-title/chain-builder.ts` exists; drive it to exhaustion — walk grantor/grantee backwards,
  record gaps explicitly, and stop with a stated reason ("clerk index begins 1902").
  *Acceptance:* the packet shows a chain with every link's instrument number, date, and source
  screenshot, plus an explicit list of gaps.

  **Shipped — the honesty half** (`worker/src/chain-of-title/chain-gaps.ts`).

  `traceChain()` ended on a bare `break`. Four completely different endings produced the identical
  result — a chain of N links and nothing else: we reached the sovereignty grant; we hit `maxDepth`,
  which defaults to **5** and silently truncates a 1900s chain; the grantor's deed exists at the
  courthouse but was never harvested; or no deed named the current owner at all. Only the first is a
  complete chain. A surveyor reading the packet could not tell which of the four they were holding —
  this repo's recurring defect (an unknown rendered as an answer) applied to the document that
  decides where a boundary is. The walk now returns a `TerminationReason`, and each one carries a
  sentence and a next step: the depth limit is named as **our** limit rather than the record's, and
  an empty chain is stated as *a retrieval failure, not a finding about the property*. Passing an
  `IndexHorizon` turns "we found nothing earlier" into the plan's own example, "the clerk's index
  begins in 1902".

  **Gaps are errands, not caveats.** Deeds cite their predecessors ("being the same land conveyed in
  Volume 412, Page 88"); every citation not in the chain is now a gap with a call number on it.
  `findGaps()` reports unfollowed citations, links that don't join (the newer deed's grantor is not
  the older deed's grantee — usually a probate, divorce decree or name change sitting between them),
  and undated links, whose position in the chain is *assumed rather than established*. Deliberately
  not a completeness score: "87% complete" is unusable, "pull Vol 412 Pg 88" is an afternoon's work.
  That list is also the worklist for the exhaustive walk, which is why it was worth extracting first.

  Two judgement calls worth keeping: instrument-number citations require a **label** (`Instrument
  No.`, `Doc#`) because a bare `2019-12345` in a legal description is as likely to be a lot number,
  and a wrong citation sends somebody to the courthouse for nothing. And party names match on token
  overlap, since "SMITH, JOHN A" / "John A. Smith" / "John Smith and wife Mary" are one grantee
  written three ways — a false break in every chain trains people to ignore the gap list. Entity
  boilerplate (`FAMILY`, `TRUST`, `HOLDINGS`, …) is stripped, or "Smith Family Trust" and "Jones
  Family Trust" would match and **hide** a real break, which is the worse error of the two.

  `summariseChain()` will not call a chain complete while it has gaps, even when the walk reached the
  earliest record — a deed we never pulled is still a hole. The builder's own log line said
  `Complete: N links traced` for a truncated chain; it now prints the honest headline.

  Worker suite 342/342; both roots typecheck clean.

  **DONE 2026-08-03 — the third half** (`worker/src/chain-of-title/chain-errands.ts`).

  R14 turned out to be three pieces, not two. `chain-gaps.ts` writes the errands; `chain-walker.ts`
  goes back to the clerk **by name**; this goes back **by citation**. The gap list said *"the 1974
  deed recites Volume 412, Page 88, which is not in this chain. Pull it."* and nothing pulled it. The
  name walk cannot: it searches for a *party*, and it only runs when the chain ended in
  `grantor_deed_not_found` — so a chain that reached the sovereignty grant could still recite a
  partition deed nobody fetched and call itself complete. Errands run **regardless of how the chain
  ended**, because being named is what makes an instrument fetchable.

  A citation search is not a guess — the deed supplied the volume and page — so there is no scoring
  in that file. When a citation returns two instruments, that is a fact about the county's index and
  both are reported rather than one being picked.

  **Five outcomes, not two.** Several adapters deliberately THROW on `searchByVolumePage` —
  USLandRecords says *"a missing capability, not an empty result"* — and the obvious implementation
  (`try { … } catch { return [] }`) would convert that sentence back into the defect it was written
  to prevent. The packet would say *"Volume 412, Page 88 — not found"* about a deed sitting in the
  courthouse, indexed, findable by anyone who walks in, and the surveyor stops looking. So:
  `resolved` / `not_found` / `capability_missing` / `search_failed` / `skipped_budget`. Only
  `not_found` is evidence about the record, and even it is evidence about the *online* index. The
  unresolved reasons are never totalled together.

  **A round trip that did not hold**, found by the wiring test rather than by the module's own tests:
  the deed recites `Volume 412, Page 88` → `VOL412PG88`, and the county returns that instrument
  numbered `V412P88`. Nothing derived one from the other, so the gap stayed **open with the deed in
  hand** — and the next run would fetch it again, paying again on a paid platform. Fixed twice:
  `linkInstrumentKeys` now reads the lettered form counties actually use, and
  `ChainLink.resolvedCitations` records the key we searched for. The second is the reliable one —
  instrument formats vary by county and century, and a derivation good enough for Bell will be wrong
  somewhere.

  One pass only: a fetched ancestor may cite instruments of its own, and those become the *next*
  run's errands rather than being chased here, so the cost stays bounded and stated.

  Worker suite 1,025/1,025; both roots typecheck clean.

  **DONE 2026-08-03 — the fourth piece, which is why none of the other three ever ran**
  (`worker/src/chain-of-title/chain-search-deps.ts`).

  All three modules above are real, tested, and reached from `worker/src/index.ts`. The backward
  re-query was nonetheless **completely inert**, and had been since it was written. `ChainOfTitleBuilder`
  takes its searches as *optional constructor options*, and its only caller passed no options object
  at all:

  ```ts
  new ChainOfTitleBuilder(maxDepth || 5, ANALYSIS_DIR)     // ← no third argument
  ```

  So `searchAsGrantee` was undefined and `errandDeps` was undefined. Every run walked only the
  documents already harvested — the exact behaviour R14 was written to replace — and **said so
  truthfully**, because each module degrades honestly when its dependency is missing. That is what
  made it invisible: nothing failed, no test caught it, and a feature that had never once queried a
  clerk index looked like a working one.

  This is a quieter variant of the authored-but-not-wired defect and **it does not show up in a
  caller grep**: the modules had callers. They had no arguments. Worth naming as its own shape —
  *wired but never fed*.

  `searchDepsFromAdapter()` builds the three searches from a county's clerk adapter, and the endpoint
  now takes `county` / `countyFIPS` / `indexBeginsYear`. The response states which of the two runs
  happened, because a chain built without a county cannot be told from one whose county had nothing
  earlier — the difference between *"no earlier deed exists"* and *"nobody went to look"*.

  **The throw is passed through on purpose.** Adapters that raise on `searchByVolumePage` are relied
  upon by `chain-errands`'s five outcomes, so a `try { … } catch { return [] }` in this file would
  quietly undo all of that work one layer below where it was done. Pinned by a test that asserts the
  rejection propagates.

  Grantors are joined rather than truncated to the first: a deed from three siblings names three
  grantors, and dropping two breaks the *next* link, producing a chain that reports a break which
  exists only because we discarded the evidence.

  Worker suite 77 files / 1,296 tests; both roots typecheck clean.

  **Still owner-gated, not code-gated:** per-county index horizons as data (the `IndexHorizon`
  parameter exists and is honoured; what is missing is a table of which year each county's index
  begins, which is research rather than engineering — 19 of them are now recorded in
  `uslandrecords-discovery.ts` as a by-product of S-7).

- **R15. Complete plat history.** ✅ **DONE** — supersession + governing plat 2026-08-02; the packet
  itself 2026-08-03
  Subdivision plats, replats, vacations, and their amendments; each with a page image and the
  recording data. Cross-link to the lots they create.
  *Acceptance:* for a platted lot the packet contains the governing plat and every later instrument
  that modified it.

  **Shipped** (`worker/src/services/plat-history.ts`, wired into `subdivision-intelligence.ts`).

  `searchForAmendments()` already found replats, amended plats and vacating plats. "STEP 6: Plat
  Amendment Chain" then split them into two buckets — replats and everything else — and called that
  the chain. **Nothing decided which plat controls a lot**, so the pipeline read dimensions off
  whichever plat was found first. `lot-correlator.ts:530` already carried the comment "WARNING: The
  CAD lot number may not always match the plat if the subdivision was replatted": the risk was known
  and unhandled. Reading lot dimensions off a superseded plat does not give a slightly stale answer —
  it puts a boundary in the wrong place, staked in the ground.

  **The governing plat is a property of the LOT, not the subdivision.** A replat almost never covers
  the whole subdivision: "Replat of Lots 4-7, Block 2, Sunset Acres" governs four lots and leaves the
  other ninety on the original. A module answering this per subdivision would be wrong in the common
  case rather than the rare one, so `governingPlatFor(history, lot, block)` is per lot. Original,
  replat and amended plats each become the controlling document for the lots they reach; a
  **correction** modifies rather than replaces; a **vacating** plat removes the lot, reported as
  "may no longer exist as a platted lot — confirm before surveying it as one". Superseded plats stay
  in the packet, because they describe the monumentation that is actually in the ground.

  **The fail-safe direction is the design.** When a title names no lots, or names them unparseably
  ("Lots SEVEN through TWELVE"), the scope is the **whole subdivision** — never "no lots". Assuming a
  replat covers nothing would silently hand back the superseded original as governing. Over-claiming
  costs a surveyor one extra document to read; under-claiming costs them the corner. Every such
  assumption is reported as a caveat, so "we could not tell" never looks like "it covers everything".

  Other honest-uncertainty cases: an undated plat sorts last and is flagged rather than allowed to
  quietly supersede a dated one; a replat with no original in the set says so ("the replat shows what
  changed, not what was set"); a lot no retrieved plat covers is *a retrieval gap, not evidence that
  the lot is unplatted*. `platGovernance` now rides on `SubdivisionModel`, optional because a model
  built before R15 has no honest value to put there.

  Worker suite 362/362; both roots typecheck clean.

  **DONE 2026-08-03 — the packet** (`worker/src/services/plat-packet.ts`, wired into
  `subdivision-intelligence.ts`).

  The remainder was recorded as "a page image stored per plat instrument", waiting on a shared
  document-attachment path. That path already existed — `artifact-uploader.ts` has stored page
  images, bundled PDFs and `research_documents` rows per instrument the whole time. What was missing
  was the join: nothing asked whether the plat that *governs a lot* is among the documents we hold.
  `platPacketFor()` was exported with **no callers at all**, and `PlatInstrument.imagePaths` was
  declared and never populated.

  **Knowing a plat's number is not containing the plat**, and in a rendered packet the two look
  identical — a lot governed by "Replat, Instrument 2004-11872" with no image reads exactly like a
  lot whose replat is there to be opened. The surveyor finds out in the field.

  The distribution is what makes it bite. The plat most likely to be **held** is the *superseded*
  one: it is the one the CAD and the deed reference, so it is the one the harvest found. The packet
  therefore tends to be missing an image for precisely the document that governs while showing one
  for the document that does not — so that case says both halves out loud: the governing plat is not
  here, *and* dimensions must not be read off the superseded plats that are.

  **`not_checked` is a distinct status from `not_held`.** `undefined` documents mean no list was
  available and nothing was established; `[]` means we looked and hold nothing. Only the second
  raises "pull plat X" errands. Collapsing them would manufacture a work list out of a database
  hiccup, and a work list that is sometimes fictional is one people stop reading.

  Matching runs through one function on both sides (`platMatchKey`), because `research_documents` has
  no instrument column — the instrument arrives inside `original_filename` as `plat_2004-11872`, and
  two places agreeing about that convention is one place too many.

  Worker suite 1,042/1,042; both roots typecheck clean; lint clean.

- **R16. Imagery pack, per parcel.** ◑ PART DONE — framing + provenance + the plan 2026-08-02;
  **the framing is now actually applied 2026-08-03**; the additional fetchers need provider keys and
  licensing decisions

  **Shipped** (`worker/src/services/imagery-plan.ts`).

  What existed was a single Google Static Maps call inside `lot-correlator.ts` at **zoom 19, fixed**,
  base64'd straight into an AI prompt. The first defect is arithmetic: zoom 19 is ~0.26 m/pixel at
  Texas latitudes, so a 1280 px frame covers about 330 m — fine for a quarter-acre town lot, and
  about a **third of the width** of a 200-acre tract (~900 m square). The model was being asked to
  identify a parcel from a picture of a ninth of it, on the rural work this firm mostly does.
  `frameParcel()` now computes the zoom from acreage and latitude. It reports the square-parcel
  assumption rather than hiding it — a 10-acre strip 100 ft wide and half a mile long needs a far
  wider frame than `sqrt(area)` suggests — and errs wide, because a parcel that is small in frame is
  still identifiable while one cropped in half is not.

  The second defect is provenance: the image carried no capture date, scale, source or licence, so it
  could illustrate a packet but never support a conclusion in one. "The aerial shows the fence inside
  the deed line" is worthless without knowing when it was flown, and **Google Static Maps does not
  return a capture date at all** — so an unknown date is recorded as null and the caption says
  "capture date not published by the provider" rather than letting the reader assume current. The
  current aerial is planned from Esri/NAIP first for exactly this reason: a known flight date beats
  slightly newer tiles. `SOURCE_LICENCE` marks Google as `check_licence` rather than guessing, the
  same refusal-to-assume as R12's captcha posture.

  `planImagery()` produces the acceptance criterion's own list — current aerial, historical aerial
  aimed at the **controlling deed year** (±10; a 2024 aerial says nothing about where a fence stood
  when a 1968 deed was written), and Street View at **each** public frontage, since a corner tract
  has two and the occupation evidence differs on each. Everything it cannot do comes back as a stated
  reason: a private drive is why Street View is missing, and no known frontage is *an unanswered
  question, not a finding that the parcel is landlocked*.

  Worker suite 383/383; both roots typecheck clean.

  **DONE 2026-08-03 — the framing is applied.** The paragraph above describes the zoom-19 defect and
  says `frameParcel()` "now computes the zoom from acreage and latitude". It computed it for
  **nobody**: `imagery-plan.ts` had zero callers, and `lot-correlator.ts` still read

  ```ts
  const zoom = maptype === 'satellite' ? 19 : 18;
  ```

  So the module written to fix the frame never framed anything, and every rural parcel this platform
  looked at was still photographed at a third of its width. Ninth instance of this shape in the
  document, and the most expensive kind: the arithmetic was right, published, and inert.

  `frameParcel()` is now called before the Static Maps request, using the acreage that was already
  sitting in `LotCorrelationInput` **one line above the call**. The framing reason is logged, so an
  image that looks wrong can be diagnosed rather than argued about.

  Two things the test pins that are easy to get backwards while "fixing" this. The frame is computed
  against the **requested** 1280 px width, not the `scale: 2` pixel count — `scale` doubles pixels
  without changing ground coverage, so passing 2560 would frame twice as much ground as intended,
  which is the same bug pointing the other way. And the roadmap stays **one zoom wider than the
  satellite**, as it always was: the street view exists to show the parcel in its road context, and
  losing that relationship would be an unrelated regression smuggled in with a fix.

  The arithmetic is checked rather than asserted, because it justifies changing a live setting: at
  zoom 19 a 200-acre tract is more than twice the frame width, and a quarter-acre town lot still
  frames at 19 or tighter — the fixed zoom was not wrong everywhere, it was wrong on the rural work,
  and a fix that pulled back on a town lot would trade one bad frame for another.

  Worker suite 79 files / 1,331 tests; both roots typecheck clean.

  **Remaining:** the additional fetchers (Esri/NAIP, Street View per frontage, historical aerials).
  Deliberately not built here — they need provider credentials and the redistribution decisions
  flagged `check_licence`, which are the owner's (§4.3), and those are easier to make against an
  explicit list of what the packet needs than against a code path that quietly produces nothing when
  a key is missing.

  Original item:
  Parcel-framed captures at fixed scales from: high-resolution current aerial (Esri World Imagery /
  NAIP), Google satellite + **Street View** at each road frontage, oblique/bird's-eye where available,
  and **historical aerials** (USGS EarthExplorer / TNRIS) chosen near the deed date. Every image
  stored as a document with its source, date, scale and licence recorded.
  *Acceptance:* a packet for a rural parcel contains ≥1 current aerial, ≥1 historical aerial within
  10 years of the controlling deed, and Street View at each public road frontage — or a stated reason
  why not.

- **R17. Evidence for everything.** ✅ **DONE** — evidence strength + the honest UI 2026-08-02;
  pixel regions 2026-08-03

  **Shipped** (`lib/research/fact-evidence.ts`, wired into `DataPointsPanel`).

  The fetch half already existed: `artifact-uploader.ts` stores screenshots and page images with a
  source URL and a timestamp. The **fact** half did not. Every extracted fact rendered identically,
  and the collapsed row showed one number — `extraction_confidence`, which is the model's opinion of
  its own output, not evidence. A fact the model asserted with nothing behind it at 95% outranked a
  fact quoted verbatim from a deed at 70%. Worse, "View in source document" was offered on **every**
  row, including rows with no excerpt to find and no region to scroll to, where it opens a document
  and lands nowhere — which teaches a reviewer that the whole affordance is unreliable.

  Five strengths, because each changes what a reviewer can do: `located` (page + region) → `quoted`
  (verbatim excerpt the viewer can highlight) → `page` → `document` → `asserted`. `asserted` is not a
  bug to hide — some facts legitimately come from cross-referencing rather than from a line on a page
  — the bug was showing them as though they came from one. Evidence is now a chip beside confidence,
  deliberately a different shape from it, since the two are different questions and a shared visual
  language would merge them back together.

  **The bounding box contract is fractions of the page, 0–1 — never pixels.** Page images are
  re-rendered at whatever width the viewer is and re-uploaded at different resolutions over a
  project's life, so a pixel box is correct exactly once and silently points at the wrong part of the
  page ever after. `isNormalisedBox()` rejects pixel values rather than scrolling a reviewer to the
  wrong line and letting them believe it.

  `locateExcerpt()` is the honest fallback for text-based extraction, which cannot produce pixel
  coordinates at all: it matches across the line breaks OCR puts in and returns offsets into the real
  text, so the viewer can highlight without a box. The panel headline leads with what is
  **unevidenced** — "412 extracted, 38 with no source" reads as a work list, where "412 data points
  extracted" reads as thoroughness.

  Root suite 21,438 passing; both roots typecheck clean.

  **2026-08-03 — the stated blocker was wrong, and half the remainder shipped.**

  This item was parked as *"text extraction has no coordinates to give — unlocked by R18's vision
  path"*. R18 shipped weeks ago. `adaptive-vision.ts` tiles a page, escalates dense quadrants into
  zoom sub-quadrants, and returns a pixel `boundingBox` for **every segment** — and
  `ai-extraction.ts` keeps `avResult.mergedText` and throws `avResult.segments` away. The
  coordinates were being measured and discarded two files before anything could store them.

  **Shipped**: `lib/research/fact-regions.ts` — matches a fact's quote to the segment it was read
  from and converts that segment's pixel box to the 0–1 page fraction the fact table requires. A
  segment is a *quadrant*, not a word, so `precision` travels with the box rather than letting a
  coarse region pass as a precise one. Every failure is a refusal with a reason: an **ambiguous**
  quote (in two regions) gets no box, because scrolling a reviewer to a plausible wrong place and
  letting them believe it is precisely what the 0–1 contract exists to prevent; a box that would
  need clamping gets none, because it was measured against a different rendering.

  **A column called `ocr_regions` that holds no regions.** The obvious home for the segments was
  `research_documents.ocr_regions` — present since seed 090, undocumented, perfectly named. It is
  not free: `artifact-uploader.ts` writes `{"pageUrls": […]}` there and `SourceDocumentViewer` and
  `ResearchRunPanel` read it back to render each document's pages (90 rows carry it today). Writing
  segments there would have blanked the page viewer for every document in the system, and the
  symptom — documents that stop displaying — points nowhere near the cause. The first draft of seed
  570 did exactly that and put a wrong comment on production before the collision was caught;
  corrected in place, with the segments in a new `ocr_segments` column and `ocr_regions` now
  carrying a comment saying what it actually holds. A test pins all three facts.

  **The producer, and it was never in the worker.** The first pass assumed the regions would have to
  be threaded from the worker's `adaptive-vision.ts` into the app. They did not: `document.service.ts`
  **already tiles** images and PDF pages for OCR, calling `sharp().extract()` with an exact
  `left/top/width/height` per tile. Both loops threw that geometry away — while collecting
  `data.regions`, coordinates the OCR *model* invented, typed `bbox: unknown`, never validated and
  never read by anything. Model-invented pixel coordinates are worse than none: they look
  authoritative and would scroll a reviewer confidently to the wrong part of a plat.

  The measured boxes are now recorded with the text read from each tile and the page size they were
  measured against, and `analysis.service.ts` matches each fact's quote back to its tile.
  **`source_bounding_box` holds a value** — whenever one can be established, and never otherwise.

  **And a write that was wiping the document viewer.** `ocr_regions: extraction.ocrRegions || null`
  overwrote the column holding `{"pageUrls": […]}`. Since `ocrRegions` is usually absent, that line
  mostly wrote **NULL** — so processing a document erased its page URLs, and the symptom (a document
  that stops displaying its pages) points nowhere near the line responsible. Removed.

  PDF pages of differing sizes are never mixed under one `pageSize`, because pixels divided by the
  wrong page's dimensions land confidently in the wrong place.

  A test in `fact-evidence.test.ts` asserted this column was *"STILL written as a literal null"*,
  noting that vision extraction would fill it in. R18 had already shipped — the blocker was never
  that coordinates could not be produced.

  Root suite 21,968 passing; typecheck clean; lint clean; `npm run build` compiles. Seed 570 applied
  and verified.

  **Remaining:** `extracted_data_points.source_bounding_box` has existed since seed 090 and is
  written as a literal `null` at the only site that builds data points — it has never held a value.
  That is not a wiring miss: text extraction has no pixel coordinates to give. `located` becomes
  reachable when R18's vision path returns per-block geometry, and a guard test records the null so
  it stays a known gap rather than a surprise.

  Original item:
  Every fetch produces a screenshot + the URL + a timestamp; every extracted fact carries a pointer to
  the page image and the pixel region it came from. This is the difference between "the AI said" and
  "here is the deed, at this line".
  *Acceptance:* clicking any fact in the review UI opens its source image scrolled to the region.

- **R18. Shared OCR service with a quality floor.** ✅ **DONE 2026-08-03** — quality floor, the
  `unreadable` state, and one tiling policy across both extraction paths

  **Shipped** (`lib/research/ocr-quality.ts` + seed 532, wired into `processDocument`).

  The escalation to vision already existed. The **floor** did not: `processDocument()` wrote
  `processing_status: 'extracted'` unconditionally, and the PDF path's own final return carries the
  comment *"could be empty for truly blank PDFs"*. That empty string was stored as the document's
  text, marked extracted, and passed to analysis, which extracted facts from nothing. `ocr_confidence`
  was written to the row and read by nothing.

  The failure was the quiet kind. A scanned 1940s deed that OCR'd to noise did not error — it became
  a document with a little garbage text, no facts and no explanation, and the packet then reported
  the property as having **no easements** rather than as having a deed nobody could read.

  `assessOcr()` measures **per page**, because a 40-page deed book with 200 total characters is
  unreadable even though 200 sounds like text, and assumes one page when the count is missing since
  assuming more would inflate the floor and let a bad extraction pass. Confidence is finally read,
  normalised across the 0–1 and 0–100 scales providers mix (guessing wrong by 100× would either fail
  every page or pass every one).

  **The digit test** is the one that catches the worst case. Length and confidence checks all pass
  when OCR returns plausible-looking prose from an illegible scan. Deeds and plats are dense with
  numbers — bearings, distances, curve data, instrument numbers, volumes, dates — so a land record
  with several hundred characters and **no digits at all** has lost them in extraction, and the
  next step says so: "the prose may read plausibly while every measurement on the page is missing."
  It applies only to OCR'd land records; a born-digital cover letter legitimately has no numbers.

  `unreadable` is a **distinct status, not `error`** (seed 532): `error` is the retry bucket, and an
  unreadable scan fails identically on every retry forever — it needs a better scan or a person's
  eyes, which is a different queue and a different action. The pipeline stops there rather than
  classifying and analysing noise, which produces confident nonsense. The reason and the signals that
  fired are stored so a wrong verdict can be diagnosed without re-running the OCR, and there is a
  partial index for finding the documents a person has to look at. `partial` is a real middle state:
  facts from a thin page are *incomplete rather than absent*, and it gets its own badge tone rather
  than borrowing the error one.

  Root suite 21,460 passing; typecheck clean. Seed 532 applied to production.

  **Follow-up shipped 2026-08-02 — the floor now guards BOTH paths, and it found a worse bug.**

  The worker path is the one that actually runs production pipelines, and it had no floor at all. Its
  document write was:

  ```ts
  processing_status: firstPage.extractedText ? 'analyzed' : 'analyzed'
  ```

  Both branches of that ternary read `analyzed`. So a scanned deed that OCR'd to **nothing** was
  marked fully analysed, exactly like one with text — a stronger claim than the app's path ever made
  about a document it could read.

  The assessor now has exactly **one definition** (`worker/src/infra/ocr-quality.ts`, re-exported by
  `lib/research/ocr-quality.ts`), because two copies is precisely how the neighbouring constant
  drifted to 500 chars in the app and 800 in the worker, with a comment at the call site explaining
  the difference rather than removing it. On the worker path `analyzed` is now reserved for text good
  enough to have been analysed, thin text is `extracted`, and unusable text is `unreadable` with its
  reason stored. Worker suite 411/411; both roots typecheck clean.

  **DONE 2026-08-03 — the two tiling paths now share one policy, and the consolidation found a
  capture bug underneath it** (`chooseTiles()` in `ocr-legibility.ts`, both loops in
  `document.service.ts`).

  This was the last piece of R18: two paths tiled documents and disagreed. `adaptive-vision.ts`
  *computed* its grid; `document.service.ts` — the path that processes `research_documents` and
  writes the facts — was fixed at 3×3 for PDFs and 2×2 for images, whether the page was an 8.5×11
  deed or a 36×48 plat.

  The sharp version of that: **`assessCapture()` computed `recommendedTiles` on every single document
  and nothing ever read it.** The verdict arrived *after* the page had already been cut into the
  constant grid. The one number that could have changed the outcome was produced, logged, stored
  beside the segments, and discarded — which is the S8 arithmetic doing everything except the part
  that mattered.

  `chooseTiles()` is the shared decision. It **only ever raises** the grid: the existing constants
  were chosen for plats and a page can be hard to read for reasons this arithmetic does not model —
  faint ink, skew, a stamp across the text — so cutting below them to save calls would trade a
  known-good default for a guess. And it declines to raise when raising cannot help: at 150 DPI a
  bearing is 10.5 px and no grid adds resolution the capture never had, so it says *"the page needs
  re-capturing at a higher resolution, not re-tiling"* rather than issuing advice that looks like a
  fix, changes nothing, and costs 36 vision calls to prove it. `MAX_TILES_PER_AXIS` caps the cost,
  and a capped grid **says it was capped** — silently capping would look like a considered choice.

  ### The bug under the bug: every plat was rendered too small to read

  The PDF path rendered at `72 * PDF_RENDER_SCALE` with `PDF_RENDER_SCALE = 2`, under a comment
  reading *"2x = ~150 DPI → ~300 DPI"*. Twice PDF's 72 DPI baseline is **144**, not 300.

  At 144 DPI a 0.07" bearing label is **10.1 px** — below the 13 px floor. So fine text on every plat
  processed through this path was unreadable **before any tiling happened**, and no grid could
  recover it, because tiling cannot add resolution the render never produced. OCR asked to read a
  bearing it cannot resolve does not fail; it returns a plausible one.

  This is not a tiling bug. It is a **capture** bug that tiling cannot fix, and it was invisible for
  exactly as long as the legibility check was reporting on captures instead of choosing them. Now
  `PDF_RENDER_DPI = 288`, which puts that label at **20.2 px** — comfortable, not merely above the
  floor. A letter page renders at 2448×3168, inside the API's 8000 px limit; a 36×48 plat at
  10368×13824, which the grid then handles.

  Two smaller corrections in the same pass, both of the wrong-units kind this project keeps hitting:
  the PDF page's physical size now comes from the **render density** (exact — sharp renders the
  MediaBox at a density we choose, so inches = pixels ÷ density), and *not* from reading
  `pdfPageSize` as points, which holds rendered **pixels** and would have declared every letter-size
  deed a 35-inch sheet. And the stored `method` string names the grid **actually used**, per page,
  rather than the constant — a mixed-size PDF (a deed with a plat exhibit stapled on) now tiles each
  page differently and says so.

  Worker suite 78 files / 1,310 tests; root 1,466 files; `npm run build` clean.

  Original item:
  One OCR entry point (not per-adapter), with confidence per block, automatic escalation to vision for
  low-confidence or handwritten pages, and an explicit "unreadable" state that reaches the UI.
  *Acceptance:* a deliberately blurred page is reported unreadable rather than silently mis-extracted.

### Phase D — The AI actually analyses the property

- **R19. Feature location from documents.** ◑ PART DONE 2026-08-02 — located-vs-invented is now a
  first-class distinction; the golden-set precision/recall measurement is owner-gated

  **Shipped** (`lib/research/feature-location.ts`, wired into `geometry.engine.ts`).

  This slice found something worse than a gap. `geometry.engine.ts` placed every easement as a
  horizontal line below the centroid, spaced for legibility, and said so in its own comment: *"Since
  easements rarely have explicit traversal coordinates, we render them as labeled horizontal lines
  spaced below the centroid, inside the property."* So a 20-foot utility easement running along the
  north line was drawn **through the middle of the tract**, carrying a `confidence_score` taken from
  the extraction — which is confidence in the *text*, not in the position — and nothing anywhere
  marked the position as invented. Same failure class as R15's superseded plat: not a stale answer,
  a wrong location on a drawing a surveyor takes to the field.

  Every placement now carries a **basis**: `traverse_vertex`, `derived_from_call`, `schematic`, or
  `unlocated`. Most instruments do recite a side ("along the North line"), and that is locatable
  against the computed boundary — `sideSegment()` picks the boundary that *is* that side, requiring
  it to run in the right direction, since a wrong side is a wrong easement. The ones that recite
  nothing are drawn diagrammatically and labelled **on the face of the drawing**, because whoever
  reads the plat in the field is not reading the attribute bag.

  The parser only matches forms that actually appear in Texas instruments, and deliberately will not
  read a bearing as a location: "THENCE North 45 degrees East" is a metes-and-bounds recital, not a
  side of the tract. A speculative parser is *worse* than none here — a null becomes `schematic` and
  is labelled diagrammatic, while a wrong guess becomes `derived_from_call` and is believed.
  Centreline widths are detected because getting that backwards doubles the encumbered strip.

  **Monuments had a quieter version of the same bug.** They were placed at
  `points[mon.sequence_order]` and **silently dropped** when that index did not exist — not drawn,
  not listed, gone. Finding called-for monuments is most of what a field crew is sent to do, so one
  that vanishes is one nobody goes looking for. They now land on an unlocated list with the call and
  the reason. The location report comes back through an out-parameter rather than module-level state,
  which this repo has been bitten by before.

  Root suite 21,482 passing; typecheck clean.

  **Remaining:** the acceptance clause itself — "matches the hand-built answer key with a stated
  precision/recall" — needs the ~10 golden-record properties confirmed with a surveyor (§4.3, owner).
  Fence/occupation lines, ROW takings and water boundaries also remain; they need imagery (R16's
  fetchers) rather than document text, so they sit behind that work.

  Original item:
  Extract and geolocate the property's important features — monuments called for, fence/occupation
  lines mentioned, easements and their widths, ROW takings, water boundaries, adjoiner calls — into a
  typed feature list with coordinates where derivable and confidence throughout.
  *Acceptance:* for a golden-set property the feature list matches the hand-built answer key with a
  stated precision/recall.

- **R20. Conflict finding, stated as questions.** ✅ DONE 2026-08-02

  **Shipped** (`lib/research/conflict-framing.ts`, wired into `DiscrepancyCard` + `DiscrepancyPanel`).

  The detection engines already existed. What did not was the part the acceptance asks for: *"the
  conflict, both citations, and a recommended field check"*. `DiscrepancyCard` rendered the AI's
  title, description and recommendation — prose — and the `document_ids` and `data_point_ids` that
  every discrepancy carries were **never rendered at all**. So "the deed calls 210.5 feet but the
  plat shows 210.0" arrived as something the model said, with no route to either document: R17's
  problem one level up, on the most consequential claim in the packet.

  Conflicts are now framed as a **question** — "Which controls — the 1968 deed at 210.5 ft, or the
  1998 replat at 210.0 ft?" — because a statement of a conflict invites belief and a question invites
  a reading, and the reading is the surveyor's job rather than ours. Both sides render with their
  document label and value, and a conflict carrying no source ids is labelled *a claim, not a
  finding* rather than being styled like the sourced ones.

  **"Surveyor's language" was taken to mean the order of dignity of calls** — natural monuments >
  artificial monuments > adjoiner calls > course > distance > quantity. The module does **not** apply
  the hierarchy to decide a conflict; it uses it to say what evidence would settle one. "If the
  called iron rod is recovered, it controls over the courses and distances on either document" is
  something a crew can act on; "the deed wins" is a decision nobody asked us to make. Natural
  monuments are detected from the description text since no data category names one, and they change
  the answer. The bearing case names the reason so many of these conflicts are not conflicts at all:
  bearings from different eras rarely share a meridian.

  `ai_recommendation` is free text and sometimes resolves the conflict instead of framing it. A
  recommendation that quietly picks a winner is worse than none, because the reviewer never learns
  there was a conflict — so those are now detected and marked *"the model's opinion, not a
  resolution — the conflict is still open."*

  Root suite 21,507 passing; typecheck clean.

  Original item:
  Where sources disagree (deed vs plat vs CAD vs occupation visible in imagery), the system states the
  conflict in surveyor's language, with both sources shown, rather than picking a winner silently.
  The existing `cross-validation-engine` + `discrepancy-analyzer` become user-facing.
  *Acceptance:* a known-conflicting property produces the conflict, both citations, and a recommended
  field check.

- **R21. The survey gameplan, persisted and versioned.** ✅ DONE 2026-08-02

  **Shipped** (seed 533 + `lib/research/survey-plan-versions.ts`, wired into the route and panel).

  `generateSurveyPlan()` said it in its own docstring: *"The plan is generated fresh each time (no DB
  caching) because the underlying data changes as analysis progresses."* So regenerating discarded
  the previous plan along with anything a person had added, nothing recorded what the plan **said**
  when the crew went to the field — the version that matters if the survey is ever questioned — and
  "what changed since last time" had no answer because there was nothing to compare against.

  Worse, the route called it on **every GET**. A page refresh burned AI tokens *and* produced a
  different plan, so the document a crew was working from changed underneath them. Regeneration is
  now an explicit `POST`, because rewriting the field plan is an action, not a read.

  **The AI original is immutable.** `ai_plan` is written once and never updated; human changes live
  in a separate `edits` overlay, merged only for display. This is the same contract the owner asked
  for on drawings — *edits saved apart from the original* — and it exists for the same reason: merge
  the two at write time and "what did the machine actually say" stops being answerable. A guard test
  asserts `saveEdits` never touches `ai_plan`.

  Previous versions are **demoted, not deleted** — a plan a crew has already worked from is evidence
  of what they were told, and tidying the table away destroys it. A partial unique index allows
  exactly one current plan per project, since two "current" plans is precisely the ambiguity the
  table exists to remove. Each version records **why** it exists, without which a version list is a
  list of timestamps.

  `diffPlans()` reports changes **by name** — "the plan no longer asks you to look for the 1/2 inch
  iron rod at the NE corner" — because "the plan changed" is useless to a crew that already read the
  old one. Items are identified by content rather than array position, or inserting one step at the
  top would report every later step as changed. And `editsAtRisk()` answers the question R21 exists
  for: a crew that annotated version 2 and finds version 3 current is told their notes are on the
  older version rather than being silently shown a clean plan.

  Root suite 21,524 passing; typecheck clean. Seed 533 applied to production.

  Original item:
  `generateSurveyPlan()` output becomes a stored, versioned artifact: what to look for, where, in what
  order; monuments to search with search radii; access notes; expected obstacles; equipment; estimated
  field hours; and the open questions from R20. Regenerating creates a new version; the old one stays.
  *Acceptance:* a plan can be regenerated, compared to its predecessor, and edited by a human without
  losing the AI original.

### Phase E — The people using it

- **R22. Run console.** ✅ DONE 2026-08-02

  **Shipped** (`lib/research/run-console.ts` + `run-console` route + `RunConsoleBar`, mounted on the
  project page).

  The cancel that actually cancels already worked end to end — worker `AbortController`, a DELETE
  route, and a button. What was missing was everything else, and the data for all of it already
  existed and reached nobody: R4 writes every model call and paid page to `research_usage_events`,
  R5 records each run's ceilings and what they made it skip, R3 keeps the phase, heartbeat and spend
  on `research_runs`. The panel showed a progress list. So an operator watching a 25-minute run could
  not answer either question that matters — how much has this cost, and is it going to finish.

  **`$0.00` is the dangerous number.** R4 exists because `research_usage_events` had zero rows while
  everyone assumed spend was tracked; a console rendering "$0.00" cannot tell a genuinely free run
  from a writer that has broken again. "No spend recorded" is therefore a distinct state with its own
  colour, and a failed usage read is reported rather than silently becoming a confident zero.

  Time is shown against the ceiling, and where no ceiling is configured it says so instead of drawing
  a bar at 0% — which reads as "plenty of time left", a claim nobody made. Staleness uses the
  worker's own `STALE_HEARTBEAT_MS`, because two definitions of "stalled" is how a run shows alive on
  one screen and dead on another.

  The headline leads with whatever is most wrong, since on a glanced-at screen it is the only part
  reliably read: a stall outranks everything; an interrupted run says *it did not fail — the process
  holding it stopped*; and a run that finished having skipped work says **"before treating this as
  complete"** rather than reporting success. That last one is the part a budget silently eats — a run
  that completed having dropped the deed chain is not a run that completed.

  Two smaller correctness points: cancel is offered only while `status === 'running'`, because the
  worker answers anything else with a 404 and a button that cannot work teaches an operator to
  distrust the console; and polling stops once the run is not running, since a finished run does not
  change.

  Root suite 21,543 passing; typecheck clean.

  Original item:
  One screen for a live run: phase, elapsed vs budget, what it is doing right now, live artifacts
  appearing, cost so far, and a cancel that actually cancels. Replaces guessing at a spinner.
  *Acceptance:* an operator can watch a 25-minute run and know at any moment what it is doing and
  what it has spent.

- **R23. Evidence-first review.** ✅ DONE 2026-08-02

  **Shipped** (seed 534 + `lib/research/fact-review.ts` + a PATCH on the data-point route, wired into
  `DataPointsPanel`).

  `extracted_data_points` has carried a confidence score since seed 090 and **no human verdict at
  all**. So a value read correctly off a deed and a value the model invented looked identical to the
  next reader and to every downstream stage — the boundary computation, the drawing, the packet. A
  reviewer who spotted a wrong bearing had nowhere to put that knowledge; the only options were to
  fix nothing, or fix it somewhere else and let the two disagree.

  R17 made it visible whether a fact has **evidence**. This is the other axis: whether a person has
  **looked**. They are independent — a quoted fact can still be misread, and an unevidenced one can
  be confirmed by a surveyor who knows the property — so they are two chips, not one scale, beside
  confidence which is the model's opinion of itself. Three questions, three indicators.

  **The original is never overwritten**, the third place this contract now holds (after
  `research_survey_plans.ai_plan` and the drawings' annotation layers). A correction lands in
  `corrected_value` while `raw_value` keeps what the extraction produced, because once a correction
  overwrites the original, "what did the extraction actually say" stops being answerable — and that
  is exactly the question worth asking when the same misread appears on the next property. It is also
  what makes the pair usable: `goldenCandidates()` returns (what we extracted, what it should have
  been), which is a test case for R9's self-healing checks. A correction is something the business
  paid a surveyor to produce; throwing it away after one project is the most expensive way to run an
  extraction pipeline.

  A **rejected fact is kept, not deleted** — deleting it would make the extraction look like it never
  produced the error — but its `effectiveValue` is null so it drops out of the computation rather
  than quietly continuing. An **unreviewed** fact stays usable, because refusing to compute anything
  until every fact is hand-checked would make the pipeline useless; it is simply visibly unchecked
  wherever it appears. A database CHECK refuses a `corrected` row with no corrected value, which
  would otherwise degrade silently to "unchanged" downstream.

  Two details from actually using it: reviews update the row in place rather than reloading, so a
  reviewer working down fifty facts does not lose their scroll position on every click; and clearing
  a review clears the reviewer too, or the row claims a reviewer for a verdict that no longer exists.

  Root suite 21,567 passing; typecheck clean. Seed 534 applied to production.

  Original item:
  Rebuild the review stage around the fact list: every fact with its source thumbnail, confidence, and
  accept/reject/correct. Corrections feed R9's golden set.
  *Acceptance:* a reviewer can accept or correct 50 facts without leaving the screen or losing place.

- **R24. Annotation layers on every document and image.** ✅ DONE 2026-08-02 — *the owner's explicit
  ask: "digital drawing on saved docs/images with edits saved apart from the original"*

  **Shipped** (seed 535 + `lib/research/document-annotations.ts` + the annotations route, wired into
  `SourceDocumentViewer`).

  `SourceDocumentViewer` has had a **full drawing canvas since it was written** — colours, widths,
  freehand strokes, per page. `drawPaths` was React state and nothing else. Close the viewer and
  every mark a surveyor made was gone. A feature that looks complete and keeps nothing is worse than
  one that is missing: somebody marks up a plat, closes the tab, and only then finds out.

  **The original file is never modified.** Annotations are rows in `document_annotations` keyed to
  the document; nothing re-encodes the image or writes `storage_path`, so the download stays
  byte-identical to what was fetched from the county — a recorded instrument that has been drawn on
  is no longer the recorded instrument. A guard test asserts `research_documents` is touched exactly
  once and only with `.select()`. This is the fourth place the contract now holds, after
  `research_survey_plans.ai_plan` (R21), `extracted_data_points.corrected_value` (R23) and
  `rendered_drawings.user_annotations`.

  **Coordinates are fractions of the page, never pixels.** The canvas is sized to
  `img.naturalWidth`, so storing those pixels would pin every stroke to one rendering of one scan —
  and a page re-uploaded at a different resolution (which the re-run path does) would move the markup
  silently. Same rule R17 set for fact bounding boxes. Stroke width is normalised too, so a 3px line
  on a 2000px scan does not become a hairline at 600px, with a 1px floor because a stroke that
  renders as zero looks exactly like markup being lost again. The API **rejects** out-of-range
  coordinates rather than clamping: silently squashing 1400 → 1 would put the markup in the corner of
  the page and read as a rendering bug for weeks.

  Layers are named, ordered and toggleable, saved as an upsert per (document, page, layer, author) so
  re-saving after two more strokes replaces the layer instead of accumulating rows. `flattenLayers()`
  drops hidden layers rather than drawing them faintly — `visible: false` is a decision the author
  made, and an export that quietly includes it hands somebody markup they turned off. Markup is
  attributable, because "who drew this" is the first question anybody asks about a mark on a survey
  document.

  Three failure modes closed while wiring it: closing with unsaved strokes now asks first; a failed
  *load* says "it has not been lost, this view failed to fetch it" rather than rendering an empty
  canvas; and a failed *save* is shown, because silence there reads as "it saved". `annotationError`
  was being set and never rendered — the repo's most common defect, caught in its own slice.

  Root suite 21,592 passing; typecheck clean. Seed 535 applied to production.

  **Note:** flattened export is available as a function (`flattenLayers`) but is not yet wired into a
  download — that belongs with R25's packet renderer, which is the thing that produces files.

  Original item:
  Persist `SourceDocumentViewer`'s markup: `document_annotations` (project, document, page, layer,
  strokes/shapes/text, author, created_at). **The original file is never modified** — the same
  contract `rendered_drawings.user_annotations` already honours. Layers can be toggled, named, and
  exported flattened.
  *Acceptance:* markup survives reload, is attributable to a person, and the original download is
  byte-identical to what was fetched.

- **R25. The packet.** ✅ **DONE** — packet, PDF, versioning and approval 2026-08-02; selection UI
  and embedded page images 2026-08-03

  **Shipped** (seed 536 + `lib/research/packet.ts` + `packet-pdf.ts` + the packets and packet-PDF
  routes).

  Everything the research produces was scattered — facts in `extracted_data_points`, conflicts in
  `discrepancies`, the gameplan in `research_survey_plans`, documents and markup elsewhere. Nothing
  said *"these, in this order, are what we are handing the crew"*, so what the crew received was
  whatever the screens happened to show that day, and nobody could reproduce it afterwards.

  **Every item carries its provenance line**, which is where the last eight slices land. A fact
  prints whether a person **checked** it (R23), whether there is a **source** to open (R17), and —
  when corrected — what the extraction originally said. A document nobody could read prints *"THIS
  DOCUMENT COULD NOT BE READ — its contents are not reflected anywhere in this packet"* (R18), and a
  partial one says absent means unconfirmed rather than absent. A conflict prints as a question with
  its field check, never a verdict (R20). Without those three separate statements a packet flattens a
  verified reading and an unreviewed guess into the same sentence — which is the one thing the
  document somebody stakes a boundary from must never do.

  **Contents are references, not copies.** A packet that duplicated its fact text would silently
  disagree with a corrected value the moment somebody fixed one. The exception is deliberate:
  approving snapshots the assembled packet into `rendered_json`, and the PDF for an approved packet
  renders from that snapshot, because what was approved must stay what was approved.

  **Approval is a signature, not a flag.** A database CHECK refuses `approved` without an approver, a
  time *and* a snapshot; editing an approved packet is rejected with "create a new version"; and the
  previous approved packet is **superseded, not deleted** — a packet a crew worked from is evidence
  of what they were given.

  The PDF's contents page is generated **from** the sections, so it cannot describe a packet
  different from the one printed. Warnings go on the **cover**, because a caveat at the back is a
  caveat nobody reads, and each unverified item is *also* marked on the item itself, since a reader
  scanning a packet does not carry a cover caveat down to item 34. Every page of an unapproved packet
  says DRAFT, so a draft and an approved packet cannot be confused in a truck. A missing reference
  becomes a warning rather than a silent omission — a packet quietly one item shorter than what was
  approved is the failure this table exists to prevent.

  Root suite 21,618 passing; typecheck clean. Seed 536 applied to production.

  **DONE 2026-08-03.**

  **The picker was already built.** `PacketBuilderPanel` exists, is wired into the research project
  page under the packet tab, opens with a sensible default selection — every conflict, every readable
  document, the plan; facts left OUT, because fifty unreviewed facts is how an unchecked value
  reaches a crew looking authoritative — and orders items. That line was stale. Checking the premise
  before building saved building it twice; it is the second stale item found this way this session.

  **Page images** (`lib/research/packet-images.ts` + `packet-pdf.ts`). Worth doing now because R15
  made it meaningful: the packet knows *which* plat governs a lot and whether we hold it, and a
  packet that names the governing plat but cannot show it hands a crew an instrument number.

  Text-first is preserved rather than abandoned — the plan, the open questions and the facts still
  come first and still read on a phone. Images follow the text.

  **An absent image is a statement, not a blank**, which is the same failure R15 found one layer up.
  A document entry with no image looks identical whether it was never fetched, could not be read, or
  was left out of a deliberately text-only print — and those are an errand, a trip to the courthouse,
  and neither, respectively. `PacketImage` carries a status, every document entry prints one, and no
  code path prints a document entry with silence where an image would be.

  **Bounded, and the bounds reported**: one page per document, at most 12 documents imaged, 8 MB
  total — embedding everything turns a 200 KB packet into something a phone cannot open on a rural
  connection, defeating the reason it is text-first. Every limit hit is stated on the **cover** *and*
  on the entry, since a reader at item 34 does not carry a cover caveat down the document. A single
  embedded page of a four-page deed says so, because the pages not shown are exactly where a
  reservation or an exception tends to be.

  Fetching is split from rendering so `renderPacketPdf` stays synchronous and pure and a malformed
  PNG cannot take the plan and the open questions down with it. Images are fetched at print time
  rather than frozen into `rendered_json`: approval is a signature on what the packet *says*, and the
  page images are the documents' own stored artifacts, immutable and addressed by id.

  Root suite 21,931 passing; typecheck clean; lint clean; `npm run build` compiles.

  **Deferred, with the reason:** annotated drawings from R24's `flattenLayers`. The embedding path is
  built and takes any image; what is missing is a server-side raster of the annotation layers, which
  is a canvas-rendering job of its own rather than a packet concern. The packet already prints
  drawings' provenance and states that no page image is held for them, so nothing is silently absent.

  Original item:
  A packet builder: choose facts, documents, images, annotations, the gameplan and the conflicts;
  order them; add cover notes; render a single PDF **and** keep the structured version. Versioned,
  with an approver recorded.
  *Acceptance:* a packet PDF opens with a table of contents, and every included document carries its
  provenance line.

- **R26. Packet → job → field crew.** ◑ PART DONE — job page and Work Mode 2026-08-02; **offline
  caching 2026-08-03**; the native mobile job view is deferred (see below)

  **Shipped** (`lib/research/job-packet.ts` + the job research-packet route + `JobResearchPacket`,
  mounted on the job page **and** in Work Mode).

  `research_projects.job_id` has been written on project creation since the table existed and **read
  by nothing**. So everything R13–R25 produced — the chain, the plats, the conflicts, the gameplan,
  the packet — lived behind `/admin/research/<uuid>`, a screen a field crew has no reason to open and
  often no permission to. The acceptance is exactly that: *"a field user opens the job and reads the
  plan without touching the research UI."*

  **Four states, and a naive version renders three of them as an empty panel:** `no_research`,
  `research_only` (research exists, nobody assembled a packet), `draft_only`, and `approved`. The
  middle two are the dangerous ones — a crew that sees nothing concludes there is nothing, drives out
  and repeats work somebody already did. And a draft is explicitly **not** handed over: *"Do not work
  from the draft"*, because working from one is how unchecked facts reach the ground. Superseded
  packets are never offered; they are evidence of what a crew was previously given, not something to
  work from now.

  The crew view reads the approved **snapshot** rather than the live tables — it is what was
  approved, and being a single object is what will make it cacheable for a truck with no signal. The
  cover warnings print first because they change what the crew does, and `fieldHighlights()` lifts
  the field plan and the open questions out of a packet that may run to fifty facts, since nobody
  scrolls for them on a phone. In Work Mode the panel sits **above** the captured points: it is what
  you read before you start, not after.

  Root suite 21,634 passing; typecheck clean.

  **Offline caching DONE 2026-08-03** (`lib/research/packet-offline.ts`, wired into
  `JobResearchPacket.tsx`).

  The snapshot shape was chosen for this — *"being a single object is what will make it cacheable for
  a truck with no signal"* — and until now a crew out of signal got the failure panel, which is honest
  and useless.

  **The hazard is not storage, it is R26's own rule.** Superseded packets are *never offered*,
  because a packet a crew previously worked from is evidence of what they were given rather than
  something to work from now. A cache breaks that rule **by construction**: the moment a copy lives on
  a device, that device can show a version the office has replaced, and a cached packet looks exactly
  like a live one. So the cache is not "the packet" — it is the packet **plus when we last confirmed
  it**, and `packet-offline.ts` is the rule about what that pair may claim.

  Four answers, because collapsing any two puts somebody on the wrong side of a boundary: `live`
  (say nothing extra), `offline` (shown, with *"may have been superseded since"*), `stale` (past 12
  hours — *"do not work from this without re-checking"*, naming what actually supersedes a packet: a
  new plat, a conflict, a corrected bearing), and `refused` (past 30 days — withheld, but the copy's
  **existence** is still stated, or an empty panel reads as *"there is no research"*, the exact
  confusion the four states were built to prevent).

  **Nothing is deleted for being old.** The obvious design drops the copy past its expiry, and that
  is worse: a crew in a canyon with a three-week-old packet is better served by a three-week-old
  packet *labelled as such* than by a blank panel. The module only ever downgrades what a copy is
  allowed to claim.

  Three smaller decisions in the same spirit: **only an approved packet is cached** (caching a draft
  would put *"do not work from this"* on a device precisely where nobody can re-check it); the cache
  is keyed and verified per job, so a component remounted on a different job cannot show one job's
  research on another's screen; and a **failed write is reported**, because a full quota otherwise
  leaves the UI implying offline access the device does not have.

  One existing test moved rather than being deleted: `job-packet.test.ts` pinned the *"not the same
  as there being none"* sentence inside the panel's JSX. That sentence now belongs to the offline
  rule, since "the read failed" and "the read failed and we hold a copy" became different answers.
  The claim it defends is unchanged and the assertion followed it.

  Root suite 1,468 files; `npm run build` clean.

  **Deferred — the native mobile job view.** Not for cost: the device-runtime items in this repo
  (camera, compass, background upload) are owner-tested on hardware rather than here, and this one
  belongs with them. The web job page and Work Mode both carry the packet today, and it now survives
  losing signal, which is the substance of the acceptance criterion.

  Original item:
  Attach the packet to a job (`research_projects.job_id` finally load-bearing), surface it on the job
  page, in Work Mode, and in the mobile app's job view. The crew sees the gameplan and can open any
  document offline.
  *Acceptance:* a field user opens the job and reads the plan without touching the research UI.

- **R27. Re-run diff.** ✅ DONE 2026-08-02

  **Shipped** (`lib/research/run-diff.ts` + the run-diff route + `RunDiffPanel`, mounted on the
  project page).

  Two gaps, not one. `PipelineDiffEngine` exists, diffs boundary calls between two stored versions,
  and an API route calls it — but **no screen ever rendered it**, so the engine has been running for
  nobody. And its scope is narrower than the plan asks: "new instruments, changed CAD values, new
  imagery" is document- and fact-level change, and a job that sat for three months and gained two new
  deeds needs to be told that.

  **The honest problem is *changes*.** Additions are exact — `created_at` proves them. But nothing
  snapshots a CAD value per run, so "this acreage used to read 2.45" is unanswerable in general —
  *except* where a row keeps both halves, which is precisely what R23's corrections do (`raw_value`
  alongside `corrected_value`). So this reports what it can prove and prints what it cannot: *"a CAD
  acreage revised in place is not detectable, because nothing snapshots those values per run."* A
  diff that silently omits changed values is worse than one that admits it detects additions and
  corrections only.

  The window opens at the **previous run's start**, not its finish: a document fetched during that
  run belongs to it, and windowing on the finish would report the whole of the last run's haul as new
  work on the next one.

  `materialChanges()` separates a new deed or a corrected bearing — which invalidate conclusions
  drawn without them — from a new aerial photo, which usually does not. That is the difference
  between a change list and a to-do. And `packetImpact()` tells an **approved packet** it is out of
  date: *"the approved packet does not reflect them — re-assemble it before the crew goes out"*,
  rendered prominently rather than as a footnote, because it is the most consequential thing on the
  panel. A first run says so explicitly, because "no previous run" is not "nothing changed".

  Root suite 21,652 passing; typecheck clean.

  Original item:
  Surface `pipeline-diff-engine`: what changed since the last run — new instruments, changed CAD
  values, new imagery. Research is not a one-shot; a job that sits for three months needs this.
  *Acceptance:* a second run on the same property shows an explicit change list, not a new blob.

### Phase F — Intake and scale

- **R28. Request → run, unattended.** ✅ **DONE** — queue, dedupe, atomic claim, retries and
  notifications 2026-08-02; the worker-side poller 2026-08-03

  **Shipped** (seed 537 + `lib/research/intake.ts` + the requests and claim routes).

  Starting research required a person: create a project in the admin UI, then press a button. The
  owner's ask is the opposite — *"a request comes in → the server works 20–30 minutes → done"* — and
  there was **no object representing a request at all**, so nothing could queue, retry, deduplicate
  or notify.

  **Three things cost money if got wrong, and each is guarded in the database rather than in code.**

  *Duplicates.* A run is 20–30 minutes of a machine plus real money in paid pages, so two requests
  for one property must not both run. Addresses arrive punctuated a dozen ways ("123 FM 436", "123
  F.M. 436", "123 Fm-436"), so the key is normalised — same reasoning as R13's instrument numbers.
  The unique index is **partial on the active states**: once a request finishes, the same address may
  legitimately be requested again months later (that is R27's re-run), and a total index would block
  the second job on a property forever.

  *Claiming.* Two workers polling one queue **will** race, and a read-then-write hands one property
  to two machines with a window exactly as wide as the round trip between them. The claim is a
  conditional `UPDATE … WHERE status = 'queued'` checked by row count, and a lost race walks to the
  next candidate rather than returning empty — an idle machine beside a full queue is what that loop
  prevents.

  *Retries.* A permanent failure retried three times is three full runs to reach the same answer, so
  "no adapter for this county", an unresolvable address, a ToS refusal and a spend ceiling all stop
  immediately with the reason stated.

  Proven against production: the duplicate was refused by `idx_research_requests_active` (23505), two
  simultaneous claims produced **exactly one** winner, and the property became re-requestable once
  the first request completed. Probe rows deleted.

  **Notification goes out either way**, and the failure one is the point: a request that quietly
  failed looks identical to one still running, and somebody finds out when the crew is already on
  site — so it says *"Nothing has been researched for this property — do not assume it was covered."*
  When the notification itself fails, `notified_at` stays null on purpose, because the partial index
  on unnotified finished requests is how somebody finds the run nobody was told about.

  Root suite 21,677 passing; typecheck clean. Seed 537 applied to production.

  **DONE 2026-08-03** — `worker/src/infra/queue-client.ts`, driven by the poller in R29 below. The
  client is the only piece that talks to these endpoints, kept apart from both the admission logic
  and the timer so neither has to be tested against a network.

  **A failed claim throws rather than returning null.** `pollOnce` reads null as "nothing to do" and
  backs off quietly, so a 401 or a dead app returning null would leave a misconfigured worker sitting
  silent while the queue filled up behind it — a broken deployment that looks exactly like a quiet
  week. Reporting, by contrast, never throws: a nested failure while trying to report a failure is
  where poller crashes come from, and the app's partial index on unnotified finished requests is what
  finds those.

  Original item:
  An intake endpoint that accepts a research request (from the AI intake flow in the platform audit's
  D4, from a job, or manually), queues it, runs it to completion within the budget, and notifies on
  finish or failure. This is the owner's "request comes in → server works 20–30 minutes → done".
  *Acceptance:* posting a request with an address and county produces a finished packet with no human
  in the loop, and a notification either way.

- **R29. Concurrency, prioritisation, and back-pressure.** ✅ **DONE** — admission, serialisation,
  priority and back-pressure 2026-08-02; `pollOnce` wired into boot 2026-08-03

  **Shipped** (`worker/src/infra/queue-worker.ts`, with the backlog surfaced on the requests API).

  R2 computed how many pipelines this box can hold. R12 stopped concurrent requests hammering one
  county's servers. R28 built the queue, the deduplicated request and the atomic claim. **Nothing
  pulled from that queue**, so the whole unattended path ended at a table nobody read.

  **Three limits, and they are not the same limit.** The MACHINE limit is about *us* falling over —
  exceeding it does not degrade gracefully, Chromium is OOM-killed and every run in flight dies with
  it. The COUNTY limit is about *somebody else* falling over: R12 paces requests to a host, but three
  concurrent runs on Bell County still means three browser sessions logging into one small clerk
  portal, and pacing only spaces out the collision. That is the limit that loses access permanently,
  so it is a hard serialisation at one run per county rather than a delay.

  Two subtleties the obvious implementation misses. A pass must claim the county **within the tick**,
  or two queued requests for one county are both admitted because neither is running yet. And the
  county check has to happen **after** the claim in the live loop, since the claim is the only atomic
  operation available — a request claimed for a busy county is released back rather than run, because
  losing the race to ourselves is not a reason to open a second session on one clerk.

  Ordering is priority then age: a crew scheduled tomorrow outranks a speculative lookup, and equal
  priorities are served oldest-first so a busy queue cannot leave one request waiting indefinitely
  while newer ones overtake it. Every held request carries its reason, because a request that never
  starts and never explains itself is indistinguishable from a broken queue.

  `backlogStatus()` turns queue depth into a wait a person can act on, and says when the queue has
  **stopped being a queue** — *"either stop accepting requests or add a machine"*. Without it a
  backlog stretches to days unnoticed and the first symptom is a customer asking where their survey
  is.

  The loop deliberately does not await each run — filling the free slots is the point — and a throw
  inside one reports a failure rather than killing the poller, since a crashed poller means a queue
  that stops draining with no error anywhere.

  Worker suite 401/401, root suite 21,677 passing; both roots typecheck clean.

  **DONE 2026-08-03** (`worker/src/infra/queue-poller.ts`, started from the worker's boot).

  The remainder was recorded as *"the ten lines that start it, and those belong with deploying the
  box (owner)"*. Only half true: the loop is code. This repo already has the pattern for
  outward-facing scheduled work — write it, gate it behind an env flag, default off — so deploying
  the box became **configuration** rather than a code change.

  `RESEARCH_QUEUE_POLLER=1` is required, and the poller **refuses to start** when the flag is on but
  `WORKER_API_KEY` or `APP_BASE_URL` is missing: polling every tick into a 401 is worse than not
  polling, because it is noise that hides the misconfiguration causing it.

  **Three ways a naive timer breaks, all with one symptom.** `setInterval(poll, 5000)` gives
  overlapping ticks (two ticks claiming at once is the race the atomic claim makes *survivable*, not
  one to invite), a throw that ends the timer silently, and no backoff — a dry queue becomes a request
  per second per worker forever. Each presents as a queue that stops draining with nothing in the
  logs, so each has its own test. Errors back off **harder** than an empty queue: asking an erroring
  app more often is how a struggling one is pushed over.

  **`stop()` cancels no in-flight run.** A run has already claimed its request and may have spent
  money; killing it mid-flight leaves the request claimed, unreported and indistinguishable from one
  still working — the exact state R28's notify-either-way rule exists to prevent. Draining is the
  correct shutdown.

  The run binding registers in `activePipelines` **before** awaiting, because that map is what both
  the capacity limit and the one-run-per-county rule read. Registering after the run began would let
  the next tick see a slot that is not free and open a second session on one clerk portal — the
  failure that loses access permanently. Queued and manually-started runs share one map, so they
  compete for the same slots rather than each assuming it has the box.

  Worker suite 1,056/1,056; typecheck clean. The `.env.example` ratchet caught both new variables,
  which is what it is for.

  Original item:
  Multiple runs without trampling each other or a county's servers: queue priority, per-county
  serialisation, and a visible backlog.
  *Acceptance:* ten simultaneous requests complete without a rate-limit ban or a memory blow-up.

- **R30. Per-run report card.** ✅ DONE 2026-08-02

  **Shipped** (`lib/research/report-card.ts` + the report-card route + `ReportCardPanel`, mounted on
  the project page).

  "As cheap but as effective as possible" had never been a number. R4 made spend measurable, R5 made
  the budget enforceable, R22 put both on a screen — but nothing said whether a run costing $4.20 did
  more than one costing $1.10, so a cheap run and a thin run were indistinguishable.

  **The card refuses to score one thing the plan asked for.** "Facts extracted vs expected for that
  property type" has **no baseline**: nobody has established what a 40-acre rural tract in Bell
  County should yield, and inventing a number would produce a score that looks objective and means
  nothing — the exact failure this document has spent thirty slices closing. So the card states it
  outright: *"a low fact count here is not evidence of a poor run — nor of a good one."* It also
  admits that the counts are per project rather than per run, because nothing tags a document or fact
  with the run that produced it, and silently attributing every fact ever extracted to the latest run
  would be the same fabrication in a different place.

  What it does measure: cost, wall clock, **cost per fact** (null rather than $0.00 when nothing was
  extracted — a divide-by-zero would make the emptiest run look the most efficient), sources reached
  against those registered, and the evidence and review rates R17 and R23 made available. An
  unreadable document is **not** counted as a source reached, because counting it is how a thin run
  scores well.

  A **truncated run must never read as a good one**: skipped work, a budget summary or an interrupted
  status all flag it, and `compareCards()` refuses a verdict outright when either run was truncated —
  a truncated run always looks cheaper per fact, and rewarding that would train the system to do less
  work for a better score. Where a run genuinely cost less and found less, the verdict says the
  counts alone cannot tell a saving from a gap.

  Root suite 21,697 passing; typecheck clean.

  Original item:
  Every finished run scores itself: sources reached vs available, facts extracted vs expected for that
  property type, conflicts found, cost, wall-clock, and what was skipped and why. This is how "as
  cheap but as effective as possible" becomes a number that can be improved.
  *Acceptance:* two runs on the same property with different budgets can be compared on one screen.

---

### Phase G — The neighbours (added 2026-08-02, owner request)

**Owner ask, verbatim intent:** quickly find adjoiner property information, and any ROW or easement
information pertaining to the property. The initial run should already fetch the documents and pages
for the adjoiners. Then, once a reviewer has looked at everything, there must be a **clear, easy,
surfaced path** to giving the go-ahead to fully research any or all of the nearby properties —
optional, not automatic. So: a list of nearby properties, brief descriptions, and **how recently each
was surveyed** where that is known, because a neighbour with a recent survey on file is likely to
yield better and more current information.

**What already exists:** `AdjacentResearchOrchestrator` runs inside the pipeline (worker
`index.ts:2588`) and writes a cross-validation report to `/tmp`. `gis-adjacency.ts` finds neighbours
by polygon adjacency; `adjoiner-extraction.ts` pulls adjoiner names out of deed calls. **What is
missing** is everything that makes it usable: nothing persists a per-neighbour record, nothing shows
the reviewer a list, nothing records survey recency, and the depth is all-or-nothing inside one run
rather than shallow-then-deepen-on-request.

- **R31. The adjoiner register.** DONE 2026-08-02
  Persist every neighbour the initial run identifies: parcel id, owner, situs, acreage, **how it was
  identified** (deed call / GIS adjacency / plat lot — they carry different confidence), what the
  shallow pass found for it, and the date of the most recent survey or plat on record for it.
  *Acceptance:* after a run, every neighbour is a row a reviewer can list, with its identification
  basis and its most recent survey date or an explicit "not known".

- **R32. The nearby-properties surface.** DONE 2026-08-02
  A list in the review UI: brief description per neighbour, how it was identified, what documents
  exist for it, and survey recency — sorted so the ones most likely to help come first.
  *Acceptance:* a reviewer can see at a glance which neighbours have recent surveys on file.

- **R33. Deepen on demand.** DONE 2026-08-02
  A per-neighbour "research this fully" action that queues an R28 request for that parcel, linked
  back to the subject property, with progress and results visible from the subject's page.
  *Acceptance:* a reviewer clicks one neighbour, a full run is queued for it, and the subject
  property's page shows that it was requested, by whom, and where it got to.

- **R34. ROW and easement rollup.** DONE 2026-08-02
  One place answering "what encumbers this property" — easements and rights-of-way from the subject's
  own documents *and* from the adjoiners', since an easement is usually recorded against one of the
  two tracts it crosses.
  *Acceptance:* an easement recorded only in a neighbour's deed but crossing the subject property
  appears in the subject's rollup, with the document it came from.

**Phase G shipped 2026-08-02 — seed 539, four modules, four surfaces, 68 new tests.**

The pieces that already existed did the hard part and reached nobody: the adjacent phase identified
neighbours and searched their deeds and plats, then wrote it all to a `/tmp` blob the container
wipes. Everything below is about making that usable and about not overstating what it means.

- **How a neighbour was identified is part of the fact.** A deed call names who adjoined *on the day
  that deed was written* — strong evidence of the line, weak evidence of the current owner. GIS
  adjacency is current, but county parcel polygons are drafting aids routinely off by feet. A plat
  lot is exact where the plat governs and silent elsewhere. Flattening the three into "adjoiner"
  loses the basis on which a reviewer decides where to spend a run.
- **A deed is not a survey.** Dating survey recency from deeds would make every neighbour look
  recently surveyed and destroy the signal the owner asked for. Only plats, replats and surveys
  count, and NULL means *we found none*, never *never surveyed* — it is not coloured like a recent
  one either.
- **Ranking is by what is on file, not geometry.** The question is where to spend 25 minutes, so a
  2-acre neighbour with a 2024 survey outranks a 400-acre one with nothing.
- **Deepening goes through R28's queue**, so it is deduplicated, retried and notified like any other
  run — two properties adjoining the same neighbour link to one request rather than paying twice. A
  neighbour with no address and no parcel id is refused up front, because a run with nothing to
  search on fails slowly and expensively. Declining is *recorded*, because "we looked and decided
  not to" is a judgement and hiding it makes the next reviewer redo the thinking.
- **The encumbrance rollup includes the neighbours' records** and refuses to decide whether a
  neighbour's easement burdens the subject — that depends on the grant's wording and on where the
  line really falls. Surfaced, attributed, left open, exactly as R20 treats a conflict. The gap it
  cannot close (neighbours not yet researched) is **sized**, not implied.
- **The register is written by the pipeline**, and the upsert deliberately does not touch `depth` or
  `deep_request_id`: a reviewer's decision must survive a re-run of the subject property, or a queued
  run somebody paid for is silently discarded.

One regex trap worth recording: the encumbrance width parser required its noun immediately after the
unit, which missed `20 foot utility easement` — the commonest form there is. Allowing intervening
words meant tightening `right` to `right of way`, or `210.5 feet to the right` in a metes-and-bounds
recital would parse as a 210-foot easement: a fabricated encumbrance on a drawing.

---

### Phase H — The counties this firm actually works (added 2026-08-02, owner request)

**Owner ask, verbatim list:** "Bell, Travis, Williamson, Milam, Harrison, Milano, Cameron, Waco,
Copperas Cove, Killeen, Temple, Austin, Hutto, Huntsville, Centerville, Conroe, Trinity,
Madisonville, Round Rock, Pflugerville, Georgetown, Crawford, Bremond, etc. Whatever counties are for
those places we need to have fully built."

**Owner also granted:** permission to drive Playwright and OCR against county clerk and appraisal
district sites to work out how to reach and retrieve the documents, if that helps build the adapters.

#### The list resolved to counties

| Place named | County | Adapter today |
|---|---|---|
| Bell, Killeen, Temple, Belton | **Bell** | active |
| Travis, Austin *(city)*, Pflugerville | **Travis** | draft |
| Williamson, Round Rock, Georgetown, Hutto | **Williamson** | draft |
| Milam, Milano, Cameron *(city)* | **Milam** | none |
| Harrison *(Marshall)* | **Harrison** | none |
| Waco, Crawford | **McLennan** | none |
| Copperas Cove | **Bell + Coryell** — the city straddles the line | Bell active, Coryell draft |
| Huntsville | **Walker** | none |
| Centerville | **Leon** | none |
| Conroe | **Montgomery** | none |
| Trinity *(city)* | **Trinity** | none |
| Madisonville | **Madison** | none |
| Bremond | **Robertson** | none |

All 254 Texas counties already exist as rows in `research_counties`; what is missing is an **adapter**
for each of these, which is what "fully built" means here.

#### Two names in the list are genuinely ambiguous — do not let code guess them

1. **"Cameron."** Cameron, Texas is the county seat of **Milam** County. **Cameron County** is a
   different place 300 miles south (Brownsville). Read alongside "Milam" and "Milano" in the same
   list, the Milam reading is almost certainly right — but a wrong reading sends a 25-minute run at a
   clerk 300 miles away, which fails slowly and expensively (R28 refuses to infer county for exactly
   this reason). **Owner to confirm.**
2. **"Austin."** The city is in **Travis** County; **Austin County** (Bellville) is a separate county.
   Read alongside "Pflugerville" and "Round Rock", the city reading is almost certainly right.
   **Owner to confirm.**

- **R35. Place → county resolution.** DONE 2026-08-02
  A resolver that turns a place name into a county, and **refuses** where the name is ambiguous
  rather than picking. Seeded with the towns this firm actually works, including the straddle cases.
  *Acceptance:* "Cameron" returns an ambiguity naming both candidates; "Killeen" returns Bell;
  "Copperas Cove" returns both Bell and Coryell with the reason.

- **R36. Register the target counties.** DONE 2026-08-02
  An adapter row per county above, so the coverage dashboard (R11) shows them as *registered and
  unproven* rather than as absent — which is the honest state until each is exercised.
  *Acceptance:* `/admin/research/coverage` lists all thirteen counties, none claiming to be proven.

- **R37. Survey the live sites (Playwright, owner-permitted).** MOSTLY DONE 2026-08-02 — 13 of 25 portals confirmed by HTTP; the browser-driven form probe still to run
  For each county, visit the clerk and appraisal portals and record what is actually there: the
  search form, its fields, the results shape, whether images are free or paid, whether a login or a
  captcha stands in the way, and the DOM fingerprint R7's health checks will watch.
  *Acceptance:* every county above has a recorded site survey, and each adapter's `config` carries a
  real base URL and search path rather than a guess.

#### R37/R38 findings — the coverage was largely fictional

Driving the live sites turned up more than adapter bugs. **The platform's claimed county coverage was
mostly untested assertion**, and measuring it changed the picture completely.

**1. The Kofile registry was 60% wrong.** Its list of 53 counties came from a vendor marketing page
in 2024, with a header saying unlisted counties "follow the default subdomain pattern
automatically". Probing every entry found **32 have no reachable portal** — including Coryell (31
miles), McLennan, Falls, Lampasas, Burnet and Bosque. Trimmed to the 21 that answered.

**2. Four of the six clerk adapters cannot reach any site.** Every base URL in Tyler, Henschen,
iDocket and Fidlar is dead — all 54. Henschen uses `<county>.co.texas.us`, a domain pattern that
does not exist; iDocket 404s on every county; Fidlar's hosts do not resolve. Routing is now gated on
`isVendorProven`, so their counties fall through to TexasFile instead of a dead host. The county
lists are kept — knowing Hays is a Henschen county is real knowledge; the claim we can reach it is
not.

**3. TexasFile — now the fallback for 233 counties — is a paywall.** Its search runs and states the
count ("5,000 records matching your search in Bell County"), then redirects to `/register/`. Its URL
shape and form fields in our adapter were both wrong. A paywall now reports as a paywall **with the
count**, because "5,000 records exist and we cannot open them" is a purchasing decision while "no
records found" is a wrong answer.

**4. The Kofile adapter had two independent bugs** that each returned an empty index as an answer:
the search parameters were ignored by the site (zero rows, no error — worse than a 404, which a
health check would catch), and the parser required `\d{10,13}` instrument numbers when the real ones
are `2019-3389` and `DEPU-000021`, so it dropped every row it was given.

**5. Nothing about one county is safe to assume about another.** Department codes differ (Milam
`RP`="Property Records", Travis `RP`="Land Records", Williamson has no land-records department at
all). Column sets differ (7 named columns on Milam, 17 in a different order on Montgomery). Date
ranges differ (Bell indexed from **1600**, Burleson from 1939) and a range outside a county's own is
an error, not a wider search. Even the Tyler Host URL that works for Williamson does not resolve for
Hays, Bastrop or Coryell.

**6. Fixed waits produced wrong facts.** A `waitForTimeout(3000)` read Bell and Milam as having no
departments — an answer that looked like a finding. Every wait is now a condition with a deadline,
and a timeout is reported as *unread*, never as *empty*.

The through-line is the one this document has been closing since R1: **an unknown rendered as an
answer.** At county-coverage scale it meant the platform would have told a surveyor "no records
found" for most of Texas.

- **R38. Build and prove each adapter.** PARTLY DONE 2026-08-02 — 7 counties proven end-to-end, 4 adapters found unreachable and gated, TexasFile paywall surfaced
  Turn each survey into a working adapter, exercised against a real search, and let R9's health
  checks and R11's coverage report it as *proven* rather than merely registered.
  *Acceptance:* the coverage headline stops saying "none has been proven to work yet".

**Sequencing note:** R37 must precede R38 — every adapter this repo has shipped against a guessed DOM
has needed rewriting, and R7/R8/R9 exist because of it.

- **R39. Hunt each remaining county's portal from its own site.** IN PROGRESS 2026-08-02 — eDocTec found, Coryell + Lampasas off the paywall (seed 548, commit `59a0b463f`)
  R38 established that no vendor URL pattern generalises. The only method left is per-county: read
  the clerk's own page, find the portal, drive it, read the DOM, then list it.
  *Acceptance:* every county within 80 miles of Bell either has a driven adapter or a recorded,
  specific reason it does not.

#### R39 findings — a vendor nobody knew about

Hunting Coryell one county at a time turned up **eDocTec**, for which this platform had no adapter,
no registry entry and no name. Two counties inside the 80-mile ring are on it, both **fully open** —
no login, no paywall, current to within two days of the search:

| County | FIPS | Was | Now | Proof |
|---|---|---|---|---|
| Coryell | 48099 | TexasFile (paywalled) | eDocTec | 12,705 docs / 20,267 party records; 20 rows → 12 documents through the compiled adapter |
| Lampasas | 48281 | TexasFile (paywalled) | eDocTec | same schema; 20 rows → 13 documents |

Coryell is worth two entries on the owner's list by itself: **Gatesville and Copperas Cove**.

Neither county was listed because a URL returned 200. Both were driven end to end through
`EdocTecClerkAdapter` itself — the R37 rule, applied to the vendor that R37's sweep never saw.

**1. One row per PARTY, not per document.** eDocTec's table is
`Instrument No | Filed Date | Party Type | Full Name | Document Type | Book/Volume | Page/Line`, and
the same instrument repeats once per party. That is why the site reports 12,705 documents *and*
20,267 records for one search. Rows group back by instrument number **and filed date** — number
alone merges a 1994 and a 2011 deed into one instrument with four grantors.

**2. The trap that matters more.** A *party* search returns only the parties that **matched**. A deed
whose grantee is not a Smith comes back, from a Smith search, with no grantee. That is not a deed
without a grantee — it is a question we never asked. Recording it as an empty grantee would both
publish a wrong fact and stop the chain walker dead, since a deed with no grantee has nothing to
walk to. Everything assembled from a party search carries `partiesComplete: false`.

**3. The hostname is a trap.** Everything is served from `mclennan.edoctec.com`, but McLennan's own
records are **not** there — `/McLennan` is a Justice of the Peace ticket-payment portal. Taking the
hostname as coverage would have pointed Waco deed searches at a page that sells traffic fines.
McLennan's portal is still not found, and the dead ends are recorded in seed 548 so the search is
not re-walked.

**4. A FIPS code was wrong for as long as the table has existed.** Henschen had Lampasas under
`48283`, which is **La Salle County**, 250 miles south. Corrected to `48281`.

Same through-line as R37/R38: **an unknown rendered as an answer.** Here it was two counties'
worth of "no records found" that actually meant "we were pointed at a paywall".

#### R39, second finding — R38's Tyler conclusion was wrong, and the guess was why

R38 probed `<county>tx-web.tylerhost.net`, found only Williamson, and concluded the Tyler Host
pattern *"does not generalise"*. It does. The guess omitted one word:

```
WRONG   mclennantx-web.tylerhost.net          no such host
RIGHT   mclennancountytx-web.tylerhost.net    live
```

Re-sweeping 40 counties with the corrected pattern found **nine** live deployments — including
**McLennan (Waco)**, which R38 had recorded as a dead end. The lesson generalises past Tyler: *a
negative result from a guessed URL is evidence about the guess, not about the county.* R38's own
"the pattern does not generalise" note has been superseded rather than deleted, because the wrong
conclusion is the instructive part.

| County | Miles from Bell | App path |
|---|---|---|
| Williamson | 28 | `/williamsonweb/` |
| McLennan | 35 | `/web/` |
| Hamilton | 50 | `/web/` |
| Hill | 55 | `/web/` |
| Burnet | 60 | `/web/` |
| Mills | 70 | `/web/` |
| Erath | 80 | `/web/` |
| Somervell | 80 | `/web/` |
| Navarro | 85 | `/web/` |

**Proven:** the disclaimer gate; the menu, which loads *asynchronously* (a fixed wait reads a working
portal as having no search); per-deployment search IDs (McLennan's OPR search is `DOCSEARCH402S1`) —
the same discovery problem as Kofile's department codes; the complete form field map; the submit
control is exactly `a#searchButton`, and a looser id match opens a help dialog that is
indistinguishable from an empty result; McLennan's stated coverage of **Jan 1 1857 → Jul 30 2026**;
and that the index answers, since typing SMITH returned real indexed parties from the county's own
autocomplete.

**Also proven, and the most useful thing for whoever writes the adapter: results are JSON, not
HTML.** `POST /web/searchPost/<SEARCH_ID>` answers
`{"validationMessages":{},"totalPages":N,"currentPage":1}`. Scraping the DOM for a results table
finds nothing because there is no table.

#### R39, third finding — `totalPages: 0` meant TOO MANY, and I read it backwards

Seed 549 recorded that zero as an unresolved contradiction: the search returned nothing for a name
the county's own autocomplete had just listed. Screenshotting the page settled it in one look:

> **"We found more documents than the maximum allowed. It may be necessary to refine your search."**

`totalPages: 0` is an **over-limit** signal. It means the search matched *more* than the portal will
return. Reading it as "no records" inverts the truth completely — it turns the largest result set
the portal can produce into *"this property has nothing recorded"*.

This is the sharpest instance of the defect this document exists to close, because **the wrong
reading is the one a careful person arrives at**: the field is called `totalPages`, and it says
zero. The JSON alone cannot distinguish "too many" from "none"; only the rendered page can. So
`readSearchOutcome()` now *requires* the page text and refuses to decide from the JSON.

Proven by narrowing the same search:

| Search | `totalPages` | Meaning |
|---|---|---|
| SMITH, no date range | 0 | over limit |
| SMITH, one month | 1 | real results |
| SMITH JAMES, 2025 | 1 | 14 documents |

Seed 549 was wrong on a second count too: results are `li.ss-search-row` **cards**, not table rows.
Every probe reporting "0 rows" was querying `<tr>` on a page showing fourteen documents. Seed 550
supersedes 549 and says so.

**Driven end to end.** McLennan, grantor `SMITH JAMES`, 2025, through the compiled
`TylerEagleAdapter`: 8 documents, 8 of 8 parsed, banner agreeing. The legal descriptions are why
this matters to a surveyor:

```
Subdivision: INDIAN TRAILS ADDITION Lot: 10 Block: 2 Acres: .241  408 NAVAJO TRAIL, MCGREGOR
Survey Name: T J CHAMBERS  Acres: 0.995
```

Subdivision, lot, block, survey name and acreage, straight off the index.

**Over-limit is handled, not reported as failure.** `narrowByYear()` slices the range into
contiguous windows and re-searches each. The windows tile with no gaps — a gap is a deed nobody
sees, which is the same wrong answer as an empty result, only harder to notice. A window that is
*still* over-limit is logged as incomplete rather than silently returned as the answer.

**Williamson moved off Kofile.** It sat in the Kofile set because its portal answered 200 — but that
portal serves *only* Commissioners Court, with no land records. Kofile is checked first, so it won
the routing and every Williamson deed search returned an empty page. A guard test caught this the
moment Tyler was wired up. **A reachable portal for the wrong index is worse than no portal.**

The nine counties are now routed and proven, taking the verified total from 7 to **18**.

#### R39, fourth finding — a third unknown vendor, and a 170-year gap inside it

Falls and Robertson were found the same way, from their own clerk pages: **Avenu/Neumo's "20/20
Perfect Vision Land Records"**, on per-county subdomains of `uslandrecords.com`. Falls is `i2i`,
Robertson is `i2j`, and every other county tried on those subdomains 404s — the letters are not a
sequence to extrapolate. That is now the **third vendor this platform had no name for**.

Searching is free, quoted from the portal: *"Searching and watermarked document viewing is provided
as a free service."* Only printing and downloading are charged. The index is what research needs, so
the free tier is sufficient.

**The finding that matters is the coverage gap.** Each county publishes a certification banner, and
the two disagree by 170 years:

| County | Index certified from | Through | Last document |
|---|---|---|---|
| Robertson | **01/01/1800** | 07/30/2026 | 20263237 @ 07/31/2026 |
| Falls | **09/23/1970** | 07/30/2026 | 23447 @ 07/31/2026 |

Same vendor, same software. A 1940 Falls deed **is not in this index**. A search returns nothing,
and that nothing is a fact about Falls County's website, not about the land — those years exist on
paper at the courthouse in Marlin. The correct answer is *"drive to Marlin"*, not *"no deed"*, and
`coverageWarning()` refuses to let a search run past the start of a county's index without saying
so. This is the same defect as every other in this document, wearing a new costume: **an unknown
rendered as an answer**.

#### R39, fifth finding — the popup was innocent, and three more empty-answer traps

Seed 551 blamed a popup window. That popup was the site **testing whether pop-ups are allowed**; it
had nothing to do with results. The real cause is smaller and more embarrassing: the form submits
via `<input type="submit">`, and a **synthetic** click — `page.evaluate(() => el.click())` — does
not submit it. No POST was ever sent: no error, no change, nothing in the network log. That symptom
reads as *"the site is broken"* when it means *"our click was not real"*. A trusted `page.click()`
submits immediately.

**Driven end to end** through the compiled adapter:

| County | Result | Earliest |
|---|---|---|
| Robertson | 20 documents on page 1 of **239 rows** | 09/13/1871 (`OR/0000U/271`) |
| Falls | 20 documents on page 1 of **40 rows** | 06/03/1971 |

Falls's earliest result landing in 1971 confirms its 09/23/1970 coverage claim with *data* rather
than a banner.

Getting there surfaced **three more ways to manufacture an empty answer**, all the same defect:

1. **A timeout is not an empty index.** A bare surname across 1800–2026 returns *"Your search has
   reached the configured timeout period"* and no rows — indistinguishable, unhandled, from "this
   name owns nothing here". Third variant in one day, after Kofile's empty department and Tyler's
   `totalPages: 0`.
2. **A readiness condition met by page furniture manufactures empty answers.** The wait was "a table
   row containing a date" — but the certification banner *is* that, and exists before any search
   runs. The grid was read while still empty, and a 239-row result set was reported as *"genuinely
   nothing recorded"*.
3. **The grid is not one row per record.** It renders as a **single `<tr>`** whose cells run the
   header labels then every record in sequence, so per-row parsing returns exactly one record no
   matter how many came back — 239 rows read as one document. Records are now cut at each date cell,
   the only reliable boundary.

**Still open, and reported rather than hidden:** the grid pages at 20 and only page one is read.
Every result carries *"this is ONE PAGE of a larger result set — page through before concluding"*.
Paging is the next slice; silently returning 20 of 239 would be this defect again.

Also worth keeping: this vendor publishes **no instrument numbers**. A document's identity is its
`SERIES/VOLUME/PAGE` citation, and 19th-century volumes are **lettered** (`OR/0000U/271`) — so the
volume stays a string. Parsing it as a number yields `NaN` and merges every lettered volume into one.

Both counties are now routed and proven. Seed 552 supersedes 551. **Verified counties: 18 → 20.**

#### R39, sixth finding — page one was never the answer

The Tyler adapter read the first page of results and returned it. Tyler serves **100 cards per
page** and states the rest in its own banner:

> *"Showing page 1 of 5 for 436 Total Results"*

So a search matching 436 documents returned 100, with nothing marking it short. **That is worse than
an empty result, not better.** An empty result at least looks like a question; 100 documents look
like an answer. A surveyor would have built a chain of title on a quarter of the county's records
with no reason to doubt it.

The walker now advances through the pager's `Next` control — results live in session state, so
there is no page-2 URL to request — and waits for the **banner's page number to change** before
reading. Clicking Next and reading immediately re-reads the page just left, returning the same 100
documents twice and stopping early. Records are deduplicated by instrument number across pages,
because a record shifting page mid-walk would otherwise read as two conveyances of the same land.

**Driven:** McLennan, grantee `SMITH`, 2025 → **196 documents across 2 pages, 0 duplicates**, 160
carrying legal descriptions, spanning 01/02/2025 to 12/30/2025. The same search previously returned
100.

`describeCompleteness()` states *"INCOMPLETE — the portal reported N page(s) but only M were read"*
whenever the walk stops early, and reports any shortfall against the portal's own total. Bounded at
200 pages, because a pager that never disables Next would hang a research run. Seed 553.

#### R39, seventh finding — page furniture broke the pager too

Falls and Robertson read 20 rows and stopped; Robertson's own counter said 239. Two things fixed
it, and the second matters more.

**Ask for more rows before paging.** The grid defaults to 20 and offers 20/50/100 as page-size
buttons. Raising it first is strictly better than walking a pager — fewer round trips, no postback
sequencing, no chance of a record shifting page mid-walk. Robertson drops from 12 pages to 3, and
from 53 seconds to 6.

**Then: the wait was watching a row that never changes.** Paging still stopped after one page even
though the `Next` control fired correctly. The readiness condition waited for *"the first row
containing a date"* to change — and that row is the **search-criteria summary** (`Date From:
1/1/1800 Date Thru: 7/30/2026`), identical on every page. The condition could never be satisfied,
the wait timed out, and the walk concluded there were no more pages.

That is the **third time in this build** a readiness condition satisfiable by page furniture
produced a wrong answer, after the Tyler menu and this vendor's own certification banner. The fix is
the same every time: *wait for the thing you actually need, not for something that resembles it.*
Here that means a cell which is **exactly** a date — a record's file date — never summary text that
merely contains one. (The pager control also had to be `#DocList1_LinkButtonNext`; matching the word
"Next" picks up a plain `<td>` that renders it and is not clickable.)

**Driven:**

| County | Before | After |
|---|---|---|
| Falls | 20 of 40 rows | **39 documents from all 40 rows**, 2 pages |
| Robertson | 20 of 239 rows | **220 documents from all 239 rows**, 3 pages, spanning **1839–2025** |

Zero duplicates in either. Robertson now reaches 1839 — thirty years deeper than page one showed.

The useful proof is that **the INCOMPLETE warning disappeared on its own** once everything was read.
The completeness reporting is accurate in both directions, not merely pessimistic. Seed 554.

**Every proven vendor now returns complete result sets.** Kofile, eDocTec, Tyler Eagle and Avenu
20/20 — 20 counties, no page-one-only reads remaining.

#### R39, eighth finding — CountyFusion was never dead; our TLD was wrong

Hunting the last six counties turned up something bigger than any of them. R37 probed every
CountyFusion base URL and concluded the vendor was unreachable. It is not:

```
WRONG   countyfusion7.kofiletech.com    ERR_NAME_NOT_RESOLVED — the domain does not exist
RIGHT   countyfusion7.kofiletech.us     200, "Neumo Records County Access Portal"
```

**All twelve numbered hosts answer on `.us`.** So *"all 54 vendor URLs are dead"* was, for this
vendor, a fact about a typo in our own registry.

The lesson underneath is the more dangerous one: **that sweep used `fetch`, and `fetch` fails
against these hosts with `ERR_HTTP2_STREAM_ERROR` even though a browser loads them fine.** A
negative result from the wrong *client* is not evidence a site is down — the same shape of mistake
as a negative result from a guessed URL, and it cost a whole vendor. Every "dead" verdict in this
document that rests on a `fetch` probe should be re-tested in a browser before it is trusted.

CountyFusion is still **not routed**: every per-county entry point is a username/password login and
no credentials exist. *"The host is alive"* and *"we can read records"* are different claims, and
collapsing them is how the platform came to claim 53 Kofile counties it could not reach.

**The six counties:**

| County | Status | Detail |
|---|---|---|
| Bosque | **OPEN (partial)** | `kofilequicklinks.com/Bosque/` — free, no login, **1847–1905**. 1984→current on iDocMarket at $5/day + $1/page |
| Limestone | **Login required** | `countyfusion10.kofiletech.us` — records 1861→present, credentials unknown |
| Bastrop | Not found | not yet hunted |
| Hays | Not found | Henschen claims it; no Henschen URL resolves; no replacement located |
| Lee | Not found | not yet hunted |
| San Saba | Not found | not yet hunted |

Bosque is a genuine win despite the partial window — for boundary work the early deeds are
frequently the operative ones, so a free 1847–1905 index is worth more than the year count suggests.
`freePathWarning()` refuses to let a search run outside that window without saying so: searching it
for a 1995 deed returns nothing, and calling that "no deed" would be wrong twice over, because the
deed exists and we know exactly where it is. Saying so turns a wrong answer into a purchasing
decision.

**"Not found" here means an unfinished search. It does not mean a county without records** — and
`describeCounty()` says exactly that, so no run can quietly report it the other way. Seed 555.

#### R39, ninth finding — the other three vendors really are dead, and Bosque has a century-wide hole

Because CountyFusion was alive on a corrected TLD, and because `fetch` fails against those hosts
while a browser does not, **every** fetch-based "dead" verdict became suspect. All 40 remaining URLs
were re-probed in a real browser:

| Vendor | Result |
|---|---|
| Henschen | **16/16** `ERR_NAME_NOT_RESOLVED` — `<county>.co.texas.us` is not a real pattern |
| iDocket | **18/18** HTTP 404 — the host resolves, the paths do not |
| Fidlar | **6/6** `ERR_NAME_NOT_RESOLVED` |

R37 was right about these three and wrong only about CountyFusion. **A confirmed negative is worth
writing down** — it is the difference between a closed question and a suspicion that costs an
afternoon every time somebody rediscovers it.

**iDocket was never a deeds vendor.** `online.idocket.com` is alive and is **Judicial Case Search** —
court cases, not land records. Its counties sat in a clerk-deeds registry by mistake, and searching a
court docket for a warranty deed returns nothing, which would have been recorded as "this property
has no deeds".

That led to **iDocMarket**, the actual land-records product. Its Basic Search opens with **no login**
and it serves seven Texas counties — Bosque, Glasscock, Hartley, Hemphill, Lamb, Reagan, Sutton.
Bosque's index states **2012–2026** and the form is fully exposed (date range, document number,
book/volume/page, party name and type). The search was *not* driven to results, so it is recorded as
located, not working.

**The finding worth the most here: Bosque's two free indexes do not meet.**

```
Kofile QuickLink   1847 – 1905     free, no login
iDocMarket         2012 – 2026     free to search, no login
─────────────────────────────────────────────────────────
NEITHER            1906 – 2011     a hole a century wide
```

A deed recorded in 1950 is in neither index. Both searches return nothing — and **two empty results
look like a thorough search that found nothing**, which is the most convincing possible way to be
wrong about whether a deed exists. `bosqueGapWarning()` names the gap and sends the researcher to the
clerk in Meridian or a paid subscription. Seed 556.

#### R39, tenth finding — the last three counties, and three different kinds of answer

Bastrop, Lee and San Saba were the last counties in the ring with no answer. All three have one now,
and the answers differ in a way that matters.

**Bastrop — a fourth vendor, open to visitors.**
`http://www.cc.co.bastrop.tx.us/RealEstate/SearchEntry.aspx` runs **Harris Recording Solutions /
Aumentum Recorder**, the fourth vendor this platform had no name for. Entry is as *Visitor* with
**no login** once the disclaimer is acknowledged, and the Real Estate index exposes party, party
type, grantor, grantee, instrument-number range, book, page and document-type filters. It states its
own coverage: **permanent index 01/01/1973 – 07/30/2026**, images from 1973. Pre-1973 is not online
at all.

Not driven to results — the visible Search control refuses both synthetic and trusted clicks
(Playwright never sees it as stable). **Located, not working**, the same line Tyler and Avenu were
held to.

**Lee and San Saba — no online portal at all.** NETR lists both clerks as *"Website Only"* and
neither county site carries a records search. These counties appear not to publish land records
online, and the survey schema now distinguishes that from an unfinished hunt:

| status | meaning |
|---|---|
| `no_online_portal` | we looked, and the county publishes nothing online |
| `not_found` | we have not finished looking |

**Collapsing those two would turn "we stopped looking" into "there is nothing there"** — this
document's defect in its purest form. Neither says anything about whether a deed exists: the records
are on paper at the courthouse (Giddings, San Saba) and TexasFile indexes them, and `describeCounty()`
states outright that a search there must never be reported as "no records".

**Hays is now the only genuine `not_found`** — Henschen names it, no Henschen URL resolves (confirmed
in a browser), and no replacement portal has been located. Seed 557.

**Every county in the 80-mile ring now has a definite answer.**

#### R39, eleventh finding — Bastrop's search runs; two invisible traps were hiding it

Seed 557 recorded Bastrop as "located, not working" because the Search control refused every click.
It works. Two separate traps were in the way, neither visible from outside, and **both produce
exactly the symptom of a county with no records: a form that submits and returns nothing.**

**1. The button has no box.** `#cphNoMargin_SearchButtons1_btnSearch` is an `<input>` with width 0,
height 0 and `z-index: -1`. Playwright refuses it — correctly, it is not a visible target. Aumentum
renders buttons as table composites, and the real clickable surface is a `<td>` whose id is the
input's id plus `__5`.

**2. The textbox is a watermark field.** Its value is literally `"Lastname Firstname"` until a focus
handler clears it. `page.fill()` sets `.value` without triggering that handler, so the watermark
survives, the form posts *"Lastname Firstname"* as the search term, and the server answers **"Please
enter search criteria."** — a validation message that never reaches a scraper reading only the
results area. The fix is to click the field, clear it, and **type with real key events**.

Both belong to the same family as the trusted-click trap on Avenu: *a programmatic shortcut that
appears to work, on a page that then behaves as though nothing was entered.*

**Driven** — party search `SMITH` → 100 records:

```
202607417    05/04/2026  DEED        [E] SMITH AARON THOMAS → SMITH BARBARA AMBE
                                     JOSE ORTIZ SURVEY
8577 347-249 10/25/1984  DEED        [R] SMITH A BYRON → MEYERS MCDADE H
7553 116-487 12/18/1980  ASSIGNMENT  [E] SMITH A C → POOL LLOYD
```

Instrument number, book/page, filing date, document type, party names with `[R]`/`[E]` role markers
(R = grantoR, E = grantEe) and survey names.

#### R39, twelfth finding — the Aumentum adapter, and where the names actually live

`AumentumClerkAdapter` now exists with `aumentum-results-parser` behind it, and Bastrop routes to
it. **Twenty-one counties are now served by a proven adapter.**

Two decisions shaped the parser:

**The grid is a flat cell sequence.** `#Table1` is not one `<tr>` per record — like Avenu's, it runs
the records together, so per-row parsing returns exactly one record however many came back. Records
are cut at each cell that is **exactly** a date.

**The party summary is the source of truth.** Each record carries a cell listing every party inline
with its role marker — `[E] SMITH JAMES (+) [R] JENSEN DONALD (+)`, where `[R]` is grantoR and `[E]`
is grantEe. The individual name cells sit at **unstable offsets**: they shift with how many parties a
document has, and blank cells pad unpredictably, so counting positions would attribute the wrong name
to the wrong side of a conveyance. The marker mapping is confirmed against the search form's own
party-type radio values rather than guessed, and the `(+)` "and others" marker is kept — dropping it
would silently turn a conveyance by several people into one by a single person.

**Multi-party records are merged, not duplicated.** The first run returned 66 rows with 11
duplicates; merging by instrument + filing date and unioning the party lists gives **55 documents
with none**. Completeness is measured against grid *rows*, not merged documents — merging
legitimately yields fewer documents than rows, and comparing merged totals would cry INCOMPLETE on a
complete read.

**Driven through the compiled adapter:** grantor `SMITH JAMES` → **55 documents from 100 grid rows,
0 duplicates**, every one carrying both parties, oldest 10/24/1974, with the coverage warning firing
correctly for years before 1973.

```
2325  10/24/1974  DEED OF TRUST   JENSEN DONALD (+) → SMITH JAMES (+)
5554  08/23/1979  MECHANICS LIEN  SMITH JAMES (+)   → JONES EARL (+)
4164  07/01/1982  (other)         SMITH JAMES (+)   → ENSERCH EXPLORATION INC
```

**Not built:** instrument-number search, book/page search, image retrieval, and pagination past the
first 100 rows. Each throws rather than returning `[]`, because an empty array would read as "no such
document recorded". Seed 559 supersedes 558.

#### R39, thirteenth finding — the truncation that announces nothing

The intended slice was Aumentum pagination. **There is none to build.** The portal caps results at
100 rows and offers no pager:

| Search | Result |
|---|---|
| `SMITH` | 100 records |
| `SMITH JAMES` | 100 records |
| `ENSERCH` | 100 records |
| `ZZYZX` | 0 records |

Three unrelated searches landing on exactly 100 is a cap, not a coincidence. The
first/prev/next/last controls named in the toolbar script are **not present on the results list** —
they belong to the document detail view, for stepping between selected documents.

**This is the worst of the three truncations found in this build.** Tyler announces its over-limit
with a banner. Avenu announces its timeout with a modal. Aumentum announces *nothing*: it returns
100 rows and a counter reading "100 records", exactly as it would if the property had 100 documents
and no more.

So a search matching 3,000 instruments comes back looking like a complete answer of 100, and a
surveyor would build a chain of title on it with nothing to suggest anything was missing. **That is
the defect this document opened with, in its most convincing disguise yet.**

Landing exactly on the cap is the only available signal, and it cannot distinguish "exactly 100
exist" from "thousands exist". So it is *reported* rather than resolved — every capped result carries
**"TRUNCATED — the true total is UNKNOWN and probably larger"**, and the adapter exposes
`lastResultTruncated` for a caller to act on. Narrowing dimensions the form does offer: 160
document-type checkboxes, legal-description fields, and a fuller party name.

**A correction in the same pass:** the adapter claimed this vendor offers no legal-description
search. It does — `txtLDBook`, `txtLDLot`, `txtLDSection`, `txtLDMapId`, `txtLDFreeForm`. They have
not been *driven*, which is a smaller and different claim than "not offered"; saying the wrong one
would send a researcher to a courthouse for something the portal can answer. Seed 560.

#### R39, fourteenth finding — Bosque's modern window, and four kinds of truncation

Bosque's iDocMarket portal is now driven: party `SMITH` → **"Showing: 1000 of 3639 results"**, no
login. The submit control is the **last** element in `#SearchForm` — `input.btn-primary[value="Search"]`,
below every date-picker button. Grabbing the first control matching "search" lands on the date
picker's own buttons, which is what made the earlier attempt look like a broken form.

Records render as `div.row`, not table rows:

```
DEED #2026-02531  7/28/2026  5 Pages  MAIN KELLY  GUILD MORTGAGE COMPANY LLC  View »
```

**Four vendors in this build truncate, and all four say so differently:**

| Vendor | How it announces truncation |
|---|---|
| Tyler | a **banner** — "more documents than the maximum allowed" |
| Avenu | a **modal** — "reached the configured timeout period" |
| iDocMarket | a **count** — "Showing: 1000 of 3639 results" |
| Aumentum | **nothing** — 100 rows and a counter that reads like an answer |

iDocMarket's is the only one stating *both* numbers, so a caller knows exactly how much is missing
rather than merely that something is. `describeShowing()` reports the shortfall precisely — *"returned
1000 of 3639, so 2639 are missing"* — instead of the generic warning Aumentum's silent cap forces.
**Preserving that difference is the point: flattening every cap into "here are the results" is how a
partial answer becomes a wrong one.**

Bosque's two free windows are now both driven — QuickLink 1847–1905 and iDocMarket 2012–2026,
validated through 7/30/2026 — with the century-wide hole between them still recorded and warned
about.

#### R39, fifteenth finding — the iDocMarket adapter, and an empty field that answered 182,715

`IDocMarketAdapter` exists and Bosque routes to it. **Twenty-two counties are now served by a proven
adapter, across six vendors.**

**This is the one vendor that marks up its data properly.** Every other one in this build hid its
data behind something, and each cost a wrong answer before it cost a fix — Kofile's department
codes, Tyler's per-deployment search IDs and card layout, Avenu's flat cell sequence and
trusted-click requirement, Aumentum's zero-size button and watermark field. iDocMarket puts the
party **roles in the class names** (`.grantor-line` / `.grantee-line`), so nothing is inferred from
position, marker letters or a summary string. That is why this adapter carries no trap comments and
the others are full of them.

**The bug that mattered was ours.** The first driven run returned 1,000 records reporting *"1000 of
182,715 results"* — and none of them matched the search name. The page re-initialises its form
*after* `DOMContentLoaded` and clears the inputs, so filling too early left the party field empty.
**An empty party field does not fail on this vendor — it searches the entire county index.**

So a name search answered with 182,715 unrelated records: a wrong answer wearing a very large
number, and *more* convincing than an empty one because it looks like thorough work. Fixed by
waiting for the form to settle and **verifying the field holds the term before submitting** — the
same guard Aumentum's watermark needed. With it: **99 records, "all 99 result(s) returned"**, every
party actually matching.

Bosque still has its hole: this adapter covers the modern index only (2012→), the historical
QuickLink portal has no adapter, and 1906–2011 is in neither. `bosqueGapWarning()` fires on any
search reaching into that century.

**Not built:** instrument-number and book/page search (fields exist, undriven); image retrieval
(`viewDoc` token, charged); pagination past the 1,000-row page, with any shortfall reported exactly.
Seed 562 supersedes 561.

#### R39, sixteenth finding — search by land, not by name

Every adapter in this build searches by **party**. That is how a title company works; it is not how
a surveyor works. A surveyor starts with a piece of ground and wants every instrument that touched
it. `searchByLegalDescription` is that search, and Bosque is the first county where it exists.

**The county publishes a controlled vocabulary.** iDocMarket's Subdivision field is a `<select>`,
not a text box — Bosque enumerates **396 subdivisions**. That makes *"does this county have a
subdivision called X"* answerable **exactly**, instead of inferred from a search that returned
nothing. `listSubdivisions()` exposes the list; an exact match is searched through the dropdown.

**The near miss is the whole point.** A term that *looks* like a subdivision but is absent from the
county's list would, searched free-form, return nothing — and that nothing reads as *"no documents
touch this land"* when it actually means *"this county has no subdivision by that name"*. Different
answers; only one is true. So an unmatched term is **refused, with the near misses named**:

> `"LAKE PLACE" is not an exact subdivision in this county's index, but 2 similar name(s) exist:`
> `#1 LAKE PLACE PHASE 1, LAKE PLACE PHASE 1.`

Text resembling no subdivision at all goes to the free-form `Legal` field, because there the caller
genuinely meant free-form. `matchSubdivision()` is pure, so this decision is tested rather than
merely observed.

**Driven:** `listSubdivisions()` → 396 names; `legal="#1 LAKE PLACE PHASE 1"` → **5 of 5 results, all
returned**; `legal="LAKE PLACE"` → refused with both real names offered.

```
2025-03091  9/23/2025  RELEASE OF LIEN  PEOPLES BANK          → STRAUGHAN TRACY
2016-01976  6/9/2016   RELEASE OF LIEN  CENTRAL NATIONAL BANK → FAUNCE GARY
```

Tyler's form has none, and Kofile/eDocTec/Avenu are party-and-instrument indexes only — and the
adapters that cannot search by land **throw rather than returning an empty list**, so it never reads
as "no documents touch this land". Seed 563.

#### R39, seventeenth finding — a second county by land, and a begins-with trap

Bastrop's legal-description search is implemented, so searching by **land** now works in two
counties. But this portal behaves nothing like Bosque's, and the difference is a trap.

**The free-form legal field matches BEGINS WITH, not contains.** The portal states its own rule in
the results header — `Freeform Legal begins with ORTIZ` — and the numbers are the whole argument:

| Term | Records |
|---|---|
| `ORTIZ` | **0** |
| `JOSE` | 100 |
| `JOSE ORTIZ` | 100 |

Bastrop's records reference the **JOSE ORTIZ SURVEY** constantly. "ORTIZ" — the obvious thing for a
surveyor to type, because the distinctive part of a survey name is rarely the first word — returns
nothing. That zero reads as *"no documents touch this land"* when it means *"your term is not at the
start of the legal description"*.

**This instance is the cruellest one found:** it fails precisely on the search a surveyor is most
likely to run. The portal offers no contains-mode, so it cannot be fixed from our side. Instead the
empty result carries its own reason and remedy:

> `0 records for legal description "ORTIZ". NOTE: this field matches BEGINS WITH, not contains — a`
> `term from the middle of a legal description (e.g. "ORTIZ" for "JOSE ORTIZ SURVEY") returns`
> `nothing. Try the LEADING words. This is not evidence that no documents touch this land.`

`looksLikeMidStringLegal()` flags terms likely to hit this — anything naming a SURVEY or ABSTRACT, or
starting with LOT/BLOCK/TRACT — as a pure, tested function.

**The two counties behave differently, and both say so:**

| County | Mechanism | On a miss |
|---|---|---|
| Bosque (iDocMarket) | Subdivision `<select>`, 396 exact names | refuses, offering the real names |
| Bastrop (Aumentum) | free-form text, **begins with** | returns 0 **with the reason attached** |

Neither silently answers "no documents". That is the only thing they have to have in common.
Seed 564.

#### R39, eighteenth finding — twenty counties could not search by land, silently

`KofileClerkAdapter.searchByLegalDescription` logged *"Legal description search not supported"* and
returned an **empty array**. Two things were wrong, and the second is far worse.

It was **factually wrong**: standard PublicSearch does support full-text search, through the
`searchOcrText` parameter this adapter was already sending as `false` on every other query.

And it **returned `[]` for an unsupported operation**. A caller cannot distinguish that from *"this
land has no documents"*. So the platform's answer to every legal-description search across **twenty
Kofile counties — including Bell, the home county — was a silent, confident nothing.**

That is this document's defect at its largest blast radius: not one county, not one vendor, but the
single search a surveyor most wants, answered wrongly everywhere it was offered.

**The two modes are different searches, not broader and narrower.** Driven on Bell with `HAMMIL`:

| Mode | Results | Matched on |
|---|---|---|
| `searchOcrText=false` | 23 | **party names** (HAMMILL ERICA, HAMMILL ANDREW P JR) |
| `searchOcrText=true` | 7 | the term appears **nowhere in the row** — it matched the scanned document text |

Turning OCR on does not widen the index search; it runs a different one. Anybody assuming it is a
superset would conclude that 16 documents had vanished.

**An unverified route was being preferred over a proven one.** Bell is flagged `hasSUPERSEARCH` and
the method tried that first; driving it times out waiting for a search input that does not exist —
the same class of unverified URL R37 found across four vendors. SUPERSEARCH is now disabled here and
the driven path wins. (A smaller bug fell out with it: `superSearch()` ran *before* `initSession()`,
so it failed with "Session not initialized" from inside a method that looked unrelated.)

**Driven:** Bell, full-text `HAMMIL` → **7 documents, reaching back to 1929**.

```
2005038056  8/25/2005  AFFIDAVIT  MCDANNEL LINDA   → MORRIS WENDELL DWAYNE DECD
1929001426  7/6/1929   (other)    HAMILL F P MRS   → SLOON J A
1945003495  5/22/1945  (other)    ENNIS STATE BANK → SHANNON J K
```

Full-text searches the scanned page *text*, so a document indexed under a legal description it never
spells out will not match. An empty result now says exactly that, and suggests a party search or a
different phrasing — rather than implying the land is unencumbered. Seed 565.

**Search-by-land now works in 22 of 22 routed counties.**

#### R39, nineteenth finding — the defect, audited and ratcheted

The previous finding came from re-reading code that was already "working". Applying that lens to
every routed adapter found **eleven instances** of the same shape:

| Adapter | Method | Returned `[]` for |
|---|---|---|
| Kofile | `searchByLegalDescription` | "not supported" (seed 565) |
| Kofile | `parseSearchResults` | a dead session |
| Kofile | DOM + vision parse | both parsers failing |
| Kofile | AI parse | an unparseable reply |
| TexasFile | instrument / vol-page / grantee / grantor | a swallowed error, ×4 |
| TexasFile | `searchByLegalDescription` | "not on the free tier" |
| TexasFile | `getDocumentImages` | "requires purchase" |
| TexasFile | `parseResults` | a dead session |

**TexasFile is the fallback for 232 counties**, so its instances reached further than any other bug
in this build: a slow site, a blocked request or a changed page reported *"this property has no
records"* for most of Texas.

**Why it keeps happening.** Every one of these is locally reasonable. Returning `[]` from a catch
block looks defensive; returning `[]` for an unsupported operation looks tidy; returning `[]` when
the page is gone looks like a guard clause. The damage is invisible at the site of the decision and
only appears at the call site, where *"the search crashed"*, *"we do not offer that search"* and
*"this land is unencumbered"* all arrive as the same value.

**The ratchet.** `no-silent-empty-results.test.ts` now fails the build if any routed adapter returns
`[]` from a catch block or from a missing session. **It immediately caught two instances I had
missed while fixing the other nine** — which is the argument for having it: this defect is not
something a careful reading reliably catches.

Every failure path now throws with what actually happened — *"session failure, NOT an empty index"*,
*"UNREAD, NOT no records"*, *"the absence of ACCESS, not the absence of images"*.

**Verified after the change:** Bell grantor `SMITH` → 50 documents; full-text `HAMMIL` → 7. The
rewrite did not break the paths that worked. Seed 566.

#### R39, twentieth finding — the same defect in the appraisal-district adapters

Seed 566 audited the *clerk* adapters. The **CAD adapters — routed live by `property-discovery.ts`**
— carry the identical pattern, and one instance is the quietest bug in this entire build.

| Adapter | Returned `[]` for |
|---|---|
| HCAD | failed owner search; dead session; both parsers failing; **subdivision lot lookup** |
| TAD | the same four |
| BIS | **subdivision lot lookup** |

On a CAD adapter an empty result does not read as "no deeds" — it reads as **"no property exists at
this address"**, which is a stronger and more damaging claim.

**The adjoiner one is the worst.** `findSubdivisionLotIds` / `findSubdivisionLots` enumerate the
*other* lots in a subdivision. They feed the **adjoiner list** — the neighbouring-property feature
this platform was explicitly asked to build. Swallowing a failure there produced a **short neighbour
list with nothing marking it short**: a surveyor would see three adjoining parcels where there are
nine, with no reason to doubt it. Unlike a missing deed, nothing downstream would ever contradict it.

Each now throws with what happened, and says the adjoiner list would be **INCOMPLETE** rather than
letting a partial list pass as a whole one.

**The ratchet now covers both families** — five routed CAD adapters alongside seven routed clerk
adapters. It immediately earned itself again: it caught a scripted edit of `tad-adapter.ts` that had
**silently failed to apply**. The script reported success and changed nothing. Without the test that
would have shipped as a fix that fixed nothing — a fair summary of why this pattern keeps surviving
review. Seed 567.

*(Also caught in passing: the seed used `cad_property` for the site-type enum; the real value is
`appraisal_cad`. The seed runner rejected it rather than silently updating zero rows.)*

#### R39, twenty-first finding — a dead field swallowed every adjoiner step failure

Seeds 566 and 567 audited the adapters. Auditing the layer **above** them found the same defect, and
this one is structural rather than a single bad catch.

**`AdjacentResearchWorker` declared `private errors: string[]`, reset it at the end of every run,
and never merged it into the returned result.** It was a dead field. Every step that recorded a
failure into it was writing to nothing:

| Step | On failure |
|---|---|
| AI deed selection | logged, recorded nowhere, returned `null` |
| Image download | logged, recorded nowhere, returned `[]` |
| Boundary extraction | logged, recorded nowhere, returned `null` |

A log line is not a result. The caller received a null deed, an empty image list and a null
boundary — **indistinguishable from an adjoiner that genuinely has no deed, no images and no metes
and bounds.** All three of those are real, common situations, which is exactly what made the
failures invisible.

**And the run called itself complete.** `researchStatus` was `'complete'` whenever any boundary
calls were extracted, regardless of what had failed on the way — so a run that lost its images and
could not pick a deed still reported complete, and a reviewer would stop looking at precisely the
adjoiner that needed a second look. Now `'complete'` requires a boundary **and** a clean run.

**One earlier fix made this worse before it made it better.** Seeds 566/567 made the adapters throw
informative errors — *"the absence of ACCESS, not the absence of images"*. The image-download catch
here caught those and returned `[]`, discarding exactly the information the change had created.
**Fixing a leaf without following it upward produces better errors that nobody ever sees.**

`adjoiner-failures-surface.test.ts` pins the drain, its ordering before the reset, the three
recorded failures, and the complete-requires-clean rule. Seed 568.

#### Survey results, 2026-08-02 (seed 541)

Vendor URL patterns were probed directly rather than inferred from each county's page layout: *"does
`<county>.tx.publicsearch.us` answer 200"* is a fact, while *"this page links to something labelled
Search"* is a guess. Paced at R12's gap, with an identifying user agent.

| Confirmed live | Counties |
|---|---|
| **Kofile / GovOS PublicSearch** (clerk) — adapter already exists | Bell, Travis, Williamson, Milam, Walker, **Leon**, Montgomery, **Madison** |
| **True Automation `esearch`** (appraisal) | Bell, Williamson, Coryell, Walker, Madison |
| **Looked for, not found** — recorded, not guessed | Harrison, McLennan, Robertson, Trinity clerks; Travis, Milam, Harrison, McLennan, Leon, Montgomery, Trinity, Robertson CADs |

**The finding that mattered:** Leon and Madison were in **no registry**, so research for Centerville
or Madisonville fell through to the paid TexasFile fallback and would have bought pages the Kofile
adapter could read free. Both are now registered.

**A duplicated list, drifted.** `paid-platform-registry.ts` kept its own copy of `KOFILE_FIPS_SET`
behind a *"keep in sync"* comment, and the two had drifted **six counties apart** (Tarrant, Collin,
Denton, Montgomery, Nueces in one; Brazoria in the other). A county missing from the copy is one the
purchase planner will not offer a Kofile route for, so the drift quietly narrowed what the platform
would buy. It now imports the single list — R18's lesson about the OCR floor, in a second place.

**Every surveyed adapter stays a DRAFT.** Knowing a portal exists is not the same as having driven
it, and R11's coverage must keep reporting them unproven until a probe reads a results page.

**Still to do for R37:** the browser-driven form probe (R7's `site-probe` against each confirmed
portal) that fills `field_map` from the real DOM. Blocked while another session holds the Playwright
browser; the HTTP survey above is what could be done without it.

---

### Phase I — The survey itself (added 2026-08-03, owner request)

**Owner asks, verbatim in intent:**

> *"Work especially hard on reviewing and analyzing and extracting information from the surveys such
> as where corner markers are like iron stakes and iron rods and stuff, and chord lengths and radius
> and bearings/azimuths and distances and all of that. We need to extract everything of significance
> from every file we pull."*
>
> *"Extract the information that tells us where boundary markers are in relation to each other
> exactly if possible for every survey research run."*
>
> *"If we have an older survey where the bearings are 1–3 degrees off of our GPS recordings from the
> actual field, we can input our recordings and correctly rotate the original so that the bearings
> and distances most closely align with the Texas State Plane version we are shooting. Or we might
> even have robotic and need to adjust the bearing and distances based on what we put in for our
> initial bearing."*
>
> *"Get to a place where the AI could programmatically recreate the boundary survey drawing and
> clearly show the bearings/azimuths and distances. We would need it where it could convert varas to
> US survey ft too for older surveys."*
>
> *"Use OCR or something to screenshot the images we find if we cannot find a way to download the
> files. Maybe we just need to wait a bit longer for file images to render in the viewer."*

This phase is about the **content** of the documents, where Phases A–H were about finding them. The
distinction matters: everything before this made a document arrive; nothing before this read one as a
*survey*.

---

- **S1. Corner markers, read as objects rather than sentences.** ✅ **DONE 2026-08-03**
  (`worker/src/services/monuments.ts`)

  The extraction already captured monument text into `BoundaryCall.toPoint`, and nothing parsed it —
  `"a 5/8 inch iron rod with yellow cap stamped RPLS 5310, found"` travelled the entire platform as a
  string. Now: kind, size, cap, RPLS number, condition, and status.

  **FOUND vs SET is what the whole of boundary retracement rests on**, and it is the field this slice
  exists for. A *found* monument, if original, **controls** the corner over the record distance — it
  is where the parties actually put the line. A *set* one is the previous surveyor's **opinion** made
  permanent. Treating a set rod as found evidence is how a boundary drifts: surveyor A sets it a foot
  off, surveyor B "finds" and holds it, and the error is now permanent with a paper trail behind it.

  So status is **never inferred**. Text that does not say gets `unknown` and is reported as a question
  for the field — defaulting to found would manufacture controlling evidence, defaulting to set would
  discard it. `"not found"` is tested **before** `"found"`, because `found` is a substring of it and
  getting that one backwards inverts the most consequential field in the file.

- **S2. Where the corners are in relation to each other.** ✅ **DONE 2026-08-03**
  (`worker/src/services/survey-geometry.ts`)

  A metes-and-bounds description only ever relates **consecutive** corners. Traversing it into
  coordinates answers what the prose cannot: *from the rod I am standing on, which way and how far is
  any other corner* — including the diagonal, which no deed states.

  **A bearing that will not parse is not due north.** `TraverseComputation.bearingToAzimuth` returns
  `0` when its regex fails. Zero is a legitimate azimuth, so an unreadable call silently becomes a
  real line pointing north, every corner after it is displaced, the closure error absorbs it, and the
  traverse still "computes". `parseBearing` returns null, and a traverse containing an unplaced call
  **refuses to report a closure at all** — it is not a traverse with one fewer side, it is two
  disconnected runs of corners.

- **S3. Varas, chains, and the two different feet.** ✅ **DONE 2026-08-03**
  (`worker/src/services/survey-units.ts`)

  The Texas vara is a **legal definition** — 33⅓ inches, exactly 25/9 US survey feet — not the
  Californian or Mexican vara, which differ by about a foot per 1,900 varas. A vara call read as feet
  is 36% of its true length **and the traverse still closes to something**, so units are normalised
  before any geometry runs and `detectUnit` returns null rather than defaulting to feet.

  The two feet are kept apart: US survey (1200/3937 m) versus international (0.3048 m), 2 ppm — about
  0.01 ft per mile. Negligible for a fence corner, not negligible for a published State Plane
  coordinate, and the Texas zones are defined in US survey feet.

- **S4. Rotating a record survey onto the grid being shot.** ✅ **DONE 2026-08-03**
  (`worker/src/services/bearing-rotation.ts`)

  **1–3 degrees is not error — it is a different north.** Magnetic (declination in Central Texas has
  swung several degrees over a century, so the survey's *date* changes the answer), true, grid
  (convergence, which grows toward the zone edge), or an assumed basis. So the operation is a
  **rotation, not a correction**: the internal angles are the old surveyor's actual observations and
  are usually better than the basis they were reported against.

  Closed-form 2-D Helmert, which for rotation and uniform scale *is* the least-squares answer. Scale
  is held at 1 unless asked, because a systematic distance difference is usually grid-versus-ground
  (~1 part in 10,000, about half a foot in a mile) or a unit mistake, and both should be seen rather
  than absorbed into a scale term.

  **One common point produces no rotation at all** — it fixes position, not direction, and returning
  0° would read as "the bases already agree". **Two produce an exact and therefore unchecked fit**,
  which is said out loud. The robotic case (`rotationFromBackthesight`) carries the same warning:
  whatever bearing you enter for the backsight *is* the basis, so if it is on the wrong monument the
  whole survey rotates with it and nothing in the arithmetic can tell.

  **An outlier rule that could never fire.** Least squares *spreads* a blunder: of size `d`, the bad
  point keeps `d(n−1)/n` and the others absorb `d/n` each, capping the ratio at **n−1**. A "3 sigma"
  test on four corners can therefore never trigger — an 8-foot bust came out at exactly 3.0 and
  passed. Now compared against the **median** of the remaining residuals, which one bad value cannot
  move.

---

- **S5. Curves, as first-class geometry.** ✅ **DONE 2026-08-03**
  (`worker/src/services/curve-check.ts`)

  Radius, delta and arc are over-determined — any two give the third — so a curve is one of very few
  things in a land record that can be checked with **no field work and no second document**.

  **Which value is wrong decides what kind of problem it is.** The traverse walks the chord, so a
  mis-read chord moves a **corner**, while a mis-read radius or delta changes only how the arc bends
  between corners that are still in the right place — a field problem versus a records correction. A
  single "curve data inconsistent" flag would lose exactly that.

  OCR has a favourite mistake (3↔8, 5↔6, 1↔7, 0↔8), so where the residual matches a single-digit
  substitution the check says so: *"the radius is 0.9% off"* is a statistic, *"a 3/8 swap in one
  digit"* is a correction somebody can make. Fewer than two values is `unverifiable`, never
  `consistent` — "nothing disagreed" and "nothing was compared" must not read alike — and the
  arc-and-chord-only case is refused outright because the solution is ill-conditioned for a shallow
  arc and any radius returned would be invented precision. Tangency is offered as an independent
  second check on delta, but reported as a **question**, since a non-tangent curve is legal and
  common.

- **S6. The drawing.** ✅ **DONE 2026-08-03** (`worker/src/services/survey-drawing.ts`)

  Deliberately **not** `reports/svg-renderer.ts`: that draws `model.reconciledPerimeter`, the Phase 7
  output after every source has been cross-validated. This draws **one document's calls at the moment
  it is read**, which is how a person looks at what a single deed says — and it therefore has to be
  able to draw a boundary that does not close, because a single deed frequently does not.

  **What it refuses to draw is the design.** The tempting implementation joins the last point to the
  first and fills the polygon, and then every drawing looks like a closed, surveyed parcel — including
  the ones built from calls nobody could read. Somebody will scale off this drawing. So a closure gap
  is dashed, red and labelled as a gap; unplaced calls leave the outline visibly **broken** rather
  than bridged by a line nobody measured; nothing is filled; and one scale is used for both axes,
  because stretching to fit changes every angle in the figure.

  Labels are in the **deed's own units** — `1900 vrs` with `(5277.78')` beneath — since a surveyor
  comparing the drawing against the deed in hand needs the document's own number first. Monuments
  follow the plat-legend convention: found filled, set hollow, searched-for-and-missing an X.

  This also caught a bug in S3: `VARAS_TO_US_SURVEY_FEET` was exported as 25/9 while the conversion
  factor was derived from 33⅓ *international* inches — 2.7777772… against 2.7777778…, about 0.01 ft
  over 1,900 varas. Small, but a module whose published constant disagrees with its own arithmetic
  cannot be checked by anyone. Now derived from the US survey foot, with three tests pinning it.

#### Still to build in this phase

- **S7. Document retrieval for the vendors that still lack it.** ✅ **DONE 2026-08-03 — all five
  vendors investigated, four wired, 53 of 54 county-slots retrieving.** Avenu (19), Tyler Eagle (9),
  eDocTec (2), Aumentum (1). The fifth — iDocMarket / **Bosque** — is **account-gated and needs an
  owner decision**, not more code.

  **Four of the five "not wired up" notes were wrong about the reason.** Three claimed a paywall where
  the file is free; the fourth claimed a charge where the barrier is a login. Each took under ten
  minutes to disprove in a browser. Those notes recorded what somebody assumed, and assumptions about
  a portal age badly.

  **Bosque is a free registration, not a charge.** `viewDoc(token)` GETs `/Document/Status`, which
  returns `{"allow":true,"currentBalance":"$0.00","owned":true,"validCC":false}` — no charge anywhere
  — but `/Document/Detail` redirects to *"Must be signed in to continue."* The index is free and
  searchable without an account (searches work today); only the document view is gated. The
  distinction decides the next step: *charged* would mean a wallet and a spending decision, *signed
  in* means somebody creates a free account. **That is the owner ask** — see §4.

  **Bastrop is the one where screenshotting was actually right** (`aumentum-viewer.ts`). The owner's
  suggestion — *screenshot the images if we cannot find a way to download the files* — turned out to
  be unnecessary on the other three, each of which hands over an image or a PDF once the right URL is
  found. Aumentum genuinely exposes **neither**: `SearchImage.aspx` opens a tab holding a LEADTOOLS
  Web Image Viewer that paints into `#divWIV1`, with no `<img src>` and no PDF handler. The
  alternatives were *checked* and are absent, which is what makes the screenshot correct here and
  wrong everywhere else.

  **What a screenshot costs is stated rather than glossed.** It captures what the viewer rendered —
  its zoom, its scaling — not the scan's own resolution: a picture of a picture. Fine for a deed's
  text; possibly not for a plat's curve table, where a radius sits to the hundredth in 6pt type. So
  pages carry `capturedByScreenshot`, quality is never rated `good` (a downstream gate must not treat
  it as equal to a fetched scan), and the caveat travels even on a failed capture because it
  describes the **method**, not the result. Whether it survives fine plat detail is exactly what S8
  is waiting to measure.

  Two portal facts that would **hang** a scraper rather than fail it: submitting the search form
  empty raises `alert("Please enter search criteria.")`, and an unhandled dialog blocks the page and
  every action after it — which reads as a slow county rather than a bug in us. Filling the party
  field by assignment is also not enough; the control validates on its own events, so it must be
  typed.

  **Every one of the three "not wired up" notes was wrong about the reason**, and each took under ten
  minutes to disprove in a browser. That is the pattern worth carrying into the last two: the note
  said what somebody assumed, not what the portal does.

  **eDocTec's preview is free** (`worker/src/adapters/edoctec-viewer.ts`). Its note said retrieval
  *"goes through the site's paid cart"*. Both things are true at once and the note kept only the
  pessimistic half: the detail page's **Document Preview** iframe serves `application/pdf` — 153 KB,
  no login, free — while the *"Purchase Pages"* cart beside it sells **certified** copies at $1.00.
  A certified copy is what a court wants; for reading a boundary the free preview is the same scan.

  This one mattered most of the three: Coryell is **Gatesville and Copperas Cove**, and Lampasas is
  the other county on the adapter — all named by the owner as places this firm works. The wrong note
  said the firm's own back yard was paywalled when it is not. The image reference is printed in the
  results grid itself (`395664.DI Vol: 255`), so a run that has already searched needs no second
  round trip.

  **Tyler Eagle hands over the PDF** (`worker/src/adapters/tyler-eagle-viewer.ts`). Its
  `getDocumentImages` said retrieval *"goes through the portal's cart, which is not wired up"* — wrong,
  and wrong in the direction that costs money. Driving McLennan showed the document page embeds
  **PDF.js**, and the iframe's `file=` parameter is a plain same-host URL serving a real
  `application/pdf`: 210 KB for a two-page deed, `%PDF-1.4`, fetched with the session cookie and **no
  purchase**. Better than any screenshot could be — Avenu needed page-by-page capture because it
  paints an `<img>`; this vendor gives you the file.

  **"DEGRADED" is in the filename and it means something.** The free copy is `DEGRADED-<docId>`, and
  that matters more than a watermark: a watermark is an overlay a reader sees past, a degraded scan is
  *lower resolution* — precisely what OCR needs to read a bearing to the second. The flag travels with
  the document. Whether the degradation is bad enough to matter is a **measurement nobody has taken**
  and needs a known-good plat (see S8).

  It also refuses HTML masquerading as a document: an expired session returns a login page with a
  perfectly good 200, and storing that as a deed is worse than failing. And Tyler's *"we found more
  documents than the maximum allowed"* — returned with an **empty result area** — is now matched,
  making it the third vendor whose too-broad response is indistinguishable from an empty county, after
  Kofile's empty department and Avenu's timeout modal.

  Avenu's `getDocumentImages` threw *"the viewer is not wired up"* while the portal's own page said
  *"searching and watermarked document viewing is provided as a free service"* — the pages were there
  the whole time. Driven on the live Val Verde viewer; three facts made it look harder than it is,
  and each would be silently re-broken by a tidy-up:

  1. **The viewer opens in a NEW TAB** (`ImageViewerEx.aspx`). Clicking and then waiting on the
     current page waits forever and reports no images — indistinguishable from a document that has
     none, and almost certainly why this was left unwired. The tab wait is armed *before* the click.
  2. **The render signal is the image token changing, not elapsed time.** The owner's instinct —
     *wait a bit longer for the images to render* — was right about the cause; a fixed sleep is the
     wrong cure, too short on a slow county server and too long twenty times over. Each page comes
     from `ACSResource.axd` with a different encrypted key, so "rendered" is exactly: `src` differs
     from the previous one **and** the image reports `complete` with non-zero `naturalWidth`.
     `complete` alone is true for a *broken* image.
  3. **The pager renames its button** (`BtnNext` → `BtnNext_Disabled`) instead of disabling it, so
     the end condition is the element's absence — exact, where the page text lays "2 of 2" out with
     tabs through the middle of it.

  Capture is at **natural** size: the viewer scales to fit its frame, and the displayed size throws
  away the resolution OCR needs to read a bearing. Every stop reason is about us rather than the
  document — a render timeout says the rest *"was NOT retrieved and is not known to be absent"*.

  The remaining four are the same shape of work: drive each viewer **once** to find its render
  signal. That is a browser session per vendor, not a guess.

- **S8. OCR tiling quality.** ◑ **The arithmetic is settled 2026-08-03**
  (`worker/src/services/ocr-legibility.ts`); what remains needs a golden plat, and is now a much
  smaller question.

  This was parked as "needs a measured comparison against a known-good plat". Most of it is not a
  measurement — a bearing is ~0.07" tall, and whether a model can read it is arithmetic over how many
  pixels of the **original** survive into the image it is finally shown.

  **Two paths tile, and they do not agree.** `worker/adaptive-vision.ts` *computes* its grid from
  estimated DPI against a legibility threshold; `lib/document.service.ts` is **fixed** at 3×3 for PDFs
  and a constant for images — whether the page is an 8.5×11 deed or a 36×48 plat. The second is the
  path that processes `research_documents` and writes the facts, so the document a surveyor's numbers
  come from is tiled by a constant, and nothing reported whether the constant sufficed.

  The arithmetic says 3×3 is fine for a 300 DPI plat, and that **1×1 on the same image wrecks it** —
  the API downscales anything over 8000 px, taking 21 px of bearing text under 12. The resolution
  existed; the tiling threw it away. It also says when **more tiles cannot help**: at 150 DPI a
  bearing is 10.5 px and no grid adds resolution the scan never had, so `recommendTiles` returns null
  rather than advice that looks like a fix and changes nothing.

  **And it found a capture that could not contain a bearing at all — now fixed.** Avenu's viewer
  painted a letter page at **304×561**: about 36 DPI, putting a 0.07" bearing at **~2.5 px**. Not
  marginal — the digits were not in the image, and OCR asked to read them returns something
  *plausible*. Nineteen counties route there, so shipping it would have meant nineteen counties of
  confident nonsense that looked fine in a gallery.

  The **token signs the render dimensions**: editing `CNTWIDTH`/`CNTHEIGHT` fails, including
  re-sending the *identical* width, while the byte-identical original URL succeeds. So a bigger render
  cannot be asked for after the fact. What works is asking the **viewer** — those parameters track the
  browser viewport, and the size is fixed before the URL exists:

  | viewport | render | limiting DPI | bearing |
  |---|---|---|---|
  | 1280×720 | 304×561 | ~36 | ~2.5 px — **unreadable** |
  | 2400×3200 | 1712×3162 | ~201 | ~14 px — **marginal** |

  Both measured live. The capture tab is now sized *before* the image renders and reloaded after
  (resizing alone does not re-request it). `CAPTURE_VIEWPORT` is a **correctness** setting, and the
  comment says so where someone would be tempted to shrink it.

  **The limiting axis is the width, not the height** — a correction to this document's first version
  of these numbers, which read ~287 DPI and "comfortable". The render is fitted to *height*, so the
  height axis does read ~287; but the width is 1712 px across 8.5" = 201 DPI, and legibility is set by
  the worse axis. Reaching a comfortable 20 px needs ~286 DPI, i.e. ~2430 px of width and a taller
  viewport again — **untested**, because a headed browser cannot be sized past the screen (the attempt
  clamped and the render fell to 498×920, which is itself a confirmation of the mechanism). A headless
  worker has no such limit.

  **Tyler's `DEGRADED` copy measures 200 DPI too** — 1699×2220 against a 611×799 pt MediaBox, read
  out of the PDF's own image XObjects. So both vendors we can retrieve at scale sit at ~200 DPI and
  ~14 px per bearing: over the floor, under comfortable, in the band where OCR does not fail but
  **guesses**. Whether a 14 px bearing is read correctly or confidently wrong is the one question
  arithmetic cannot answer, and it is the sharpest argument for the golden plat in §4 item 0a.

  **Kofile measures 300 DPI — the best of the lot, across 22 counties.** Bell instrument 2020032310
  serves `files/documents/99280747/images/94926355_1.png` at **2550×3300**: exactly 300 DPI, a 21 px
  bearing, free and anonymous. That completes the table.

  | vendor | counties | limiting DPI | bearing | verdict |
  |---|---|---|---|---|
  | **Kofile** | 22 | ~300 | 21 px | **good** |
  | Avenu | 19 | ~201 | 14 px | marginal |
  | Tyler `DEGRADED` | 9 | ~200 | 14 px | marginal |

  **A first pass at this measurement got it backwards**, and the mistake is worth keeping: it
  inspected the document page for `<img>`/`<canvas>`/`<iframe>`, found only UI icons, and concluded
  Kofile served no free image — nearly writing off free previews for the vendor carrying most of this
  platform's coverage. The image is a **signed network request** (`?exp=&sig=`), not a DOM element,
  and it only fires when the viewer is reached by searching and CLICKING the row, which is what
  `bell-clerk.ts` has always done. Navigating straight to `/doc/<id>` never requests it. The failure
  was in the instrument, not the portal; the right one was the network log.

  This is what the arithmetic was for: the legibility check said the Avenu capture could not possibly
  work, which sent me back to the portal to find out why. Every page still under the threshold carries
  a warning that travels **with the page**, not only in a log.

  **Wired 2026-08-03**, after being caught with zero callers — the same authored-but-not-wired defect
  this session found five times elsewhere and then produced once itself. A legibility check nobody
  calls prevents nothing, and its unit tests pass either way. It now runs at OCR time in
  `document.service.ts` (where the pixel size and tile grid are both known), is stored **with** the
  segments because the verdict describes the *capture* rather than the document, and is surfaced in
  `analysis.service.ts` at the point facts are written — the only place that knows both that a capture
  was marginal and that numbers are being extracted from it.

  The honest difficulty is the **physical** page size, which a scanned image does not carry. Three
  sources, ranked: a PDF `MediaBox` (exact), the image's embedded density (scanners often set it
  wrongly), or assuming US Letter. The last is marked as a guess, because it is wrong exactly where it
  matters: a 36×48 plat assumed to be letter reports **four times** its true DPI, turning an
  unreadable capture into a comfortable-looking one.

  **Still needs a golden plat**, for the part that genuinely is a measurement: whether Tyler's
  `DEGRADED` rendering and Bastrop's viewer screenshots clear the threshold in practice, and whether
  the model reads a *marginal* 14 px bearing correctly or confidently wrong. The arithmetic bounds the
  question; only a plat with known values answers it. See §4.

  **Update 2026-08-03 — the arithmetic now DECIDES rather than reports** (R18, above). `chooseTiles()`
  picks the grid on both extraction paths, and doing that exposed the thing the reporting version
  could never have caught: the PDF path was rendering at **144 DPI**, which puts a bearing at 10.1 px
  and under the floor *before any tiling*. Every plat this platform processed as a PDF was OCR'd at a
  resolution where a bearing cannot be resolved. Raised to 288 DPI.

  So the golden plat is now needed for a **narrower** question than when this section was written.
  Two of the three vendors sit at ~200 DPI and that is a retrieval limit no local setting changes;
  but the PDF path is no longer adding its own, larger loss on top, and the marginal band is now the
  vendors' band rather than ours.

- **S9. The deed checking our reading of it.** ✅ **DONE 2026-08-03**
  (`worker/src/services/closure-diagnosis.ts`, surfaced in `survey-drawing.ts`)

  S8 ends at "only a plat with known values answers it", and that is true of *correctness in general*.
  But one check needs no golden plat, no second document and no field visit, and it was already being
  computed and thrown away: **closure**.

  Closure is printed all over this codebase as a number — `closure=1:21670` in a log, `closureRatio`
  in a manifest. Nothing had ever asked what it MEANS. A boundary is a closed figure; walk the calls
  and you must arrive back where you started. If you do not, either the deed is wrong or **we read it
  wrong** — and the *direction* of the miss says which call to look at:

  - A misread **distance** displaces the figure ALONG that course ⇒ a misclosure nearly **parallel**
    to a course accuses that course's length.
  - A misread **bearing** swings everything after it ⇒ a misclosure nearly **perpendicular** to a
    course accuses that course's direction.

  That is ordinary traverse-adjustment practice, and it is unusually well-suited to OCR because the
  two failure modes look different in the source too: a distance is one number a model may transpose
  (`247.50` → `274.50`); a bearing is a quadrant letter plus three groups it reads separately. So the
  diagnosis names the field AND what to look for in it.

  **The limit is the point of the slice.** A bad closure is *not* proof we misread anything.
  Compass-and-chain work from the 1880s closing at 1:500 is a fact about that survey, not about our
  OCR; a 1990s deed closing at 1:500 is not. `diagnoseClosure` therefore takes the **recorded year**
  and changes its conclusion — old deed: *"quite possibly the ORIGINAL SURVEY's, not ours — do not
  assume a misreading"*; modern deed: *"a reading error is the more likely explanation"*; **unknown
  date: says the date is missing and that the two cases cannot be told apart**, rather than guessing.
  Sending a surveyor to re-read a document that is already correct is a real cost, not a stylistic one.

  It also refuses two conclusions. When any call could not be placed, closure is not used at all — the
  misclosure then *"measures our gap rather than our accuracy"*. And when no single course lines up,
  it says so: the direction argument holds for **one** blunder, and two errors interact.

  **Two bugs its own tests caught**, both of the kind that would have shipped silently:

  1. A figure that closes *exactly* has no misclosure to divide by, so `closurePrecision` is null —
     and null otherwise means "unknown". The strongest possible evidence that every call was read
     correctly was being reported as **no evidence at all**. Now an explicit near-zero branch.
  2. On a rectangle, a length error on either east-west course produces an *identical* misclosure.
     Ranking picked one arbitrarily, which sends a reviewer to one of two documents on a coin-flip.
     `indistinguishableSuspects()` now says *"calls X and Y explain it EQUALLY well — the geometry
     cannot tell them apart"*.

  **Wired, and tested for being wired.** The diagnosis is pushed into `drawBoundary`'s caveats, where
  a person looking at one document's calls actually is, and three tests drive `drawBoundary` itself
  rather than the module — deliberately, because this session produced the authored-but-not-wired
  defect once already (S8, above). Worker suite green: 75 files / 1258 tests.

- **S10. The bridge — and the reason none of Phase I had ever run.** ✅ **DONE 2026-08-03**
  (`worker/src/services/survey-reading.ts`, called from `pipeline.ts` Stage 4)

  S1–S9 all say **DONE** above. They were also, all nine of them, **dead code**. Every import of
  every one of those modules came from a sibling in the same folder or from its own test file:

  ```
  worker/src/services/*.ts        ← imports each other
  worker/src/__tests__/*.test.ts  ← imports them
  (nothing else, anywhere)
  ```

  `drawBoundary` had zero production callers. So did `parseMonument`, `checkCurve`, `traverse`,
  `fitRotation` and `diagnoseClosure`. A document processed by this platform got **exactly the
  treatment it got before Phase I was written** — the owner's ask, *"we need to extract everything of
  significance from every file we pull"*, was served by none of it. Nine slices of real, tested work,
  and no connection.

  This is the shape this document has now recorded **seven times** (S8's legibility check being the
  most recent, and mine). It is worth stating what makes it invisible: every unit test passes either
  way. A module's own tests cannot tell you whether anything calls it.

  **Stage 4 is where it belongs** — the boundary has just been read and has not yet been reported on.
  `readSurvey()` takes the `ExtractedBoundaryData` Stage 3 already produces and returns monuments as
  objects, corner-to-corner inverses, curve self-checks, units converted, closure diagnosed, and a
  drawing. It is non-fatal by construction: a description it cannot walk comes back saying **why**
  (`notTraversable`) rather than throwing, so a lot-and-block property does not cost the run its
  other stages. The reading is on `PipelineResult`, not only in the log — a finding that exists only
  as log lines cannot be shown to a surveyor.

  **A bridge between two type systems is where meaning quietly changes**, and there were exactly two
  places here where it could:

  1. **`'feet'` is not a unit.** The pipeline's `BoundaryCall` says `unit: 'feet'`; the survey stack
     distinguishes `us_survey_feet` from `international_feet`, which differ in the 7th figure. Bare
     "feet" in a Texas land description means the **US survey foot** — the foot the Texas State Plane
     zones are defined in — so that is the mapping, written down at the point of translation rather
     than left for the next reader to rediscover.

  2. **A curve with no chord stops the traverse.** The traverse walks chords, because the chord is
     the straight line between the two corners a crew occupies. A call reciting radius and delta but
     no chord is *unusable*, and one unusable call leaves every corner after it unplaced — discarding
     the entire figure over a value that is derivable. The chord is now derived (`2R·sin(Δ/2)`, and
     the bearing from the inbound tangent deflected by `Δ/2` **in the stated direction**, since the
     wrong sign puts the corner on the wrong side of the line by twice the offset). Every such corner
     is listed in `derivedChords` and warned about, because a corner positioned from a value **we**
     computed is not the same evidence as one the deed recites.

  **And one place it refuses to guess.** `diagnoseClosure` needs the recorded year, and the
  extraction does not record which document the calls came from — `ExtractedBoundaryData` carries no
  source attribution. Taking the bundle's oldest document would excuse a real OCR error whenever an
  1890 deed was retrieved alongside a 2015 replat; taking the newest would accuse the platform of
  misreading a description that never closed. `unambiguousRecordedYear()` therefore returns a year
  only when **every dated document in the run agrees on one**, and null otherwise — falling back to
  the honest branch S9 already had: *"the recording date is unknown, and the two cases cannot be told
  apart."* It also declines to read `Vol 412 Pg 88` as a year.

  Worker suite green: 76 files / 1281 tests. Five of the tests drive `pipeline.ts` itself rather than
  the module, for the obvious reason.

- **S11. The way in to the rotation.** ✅ **DONE 2026-08-03**
  (`lib/research/rotation.service.ts`, `app/api/admin/research/[projectId]/rotation/route.ts`,
  `RotationPanel.tsx`, opened from the boundary viewer)

  S10 wired everything Phase I does *to a document*. Rotation is the one operation that cannot be
  wired that way, because it needs measurements only a **person** can supply — and so it was the one
  left with no caller at all: no route, no page, no button. The feature the owner asked for by name
  could not be reached from anywhere in the product.

  Three decisions live in the service rather than the route, because they are about what the answer
  MEANS:

  **One tie is not a fit, and the UI says so above the number.** With a single common point the
  residual is zero *by construction* — not because the survey agrees with the ground but because
  there is nothing left over to disagree. A backsight is the same shape: exact, and unverifiable. The
  `unchecked` banner renders above the rotation value, not as a footnote, because an unchecked fit is
  precisely the shape of a confident wrong answer.

  **The scale is observed even when it is not fitted — a gap this slice found.**
  `fitRotation(points, false)` returns `scale: 1`, a **hardcoded constant, not an observation**. So
  on the default path a record recited in varas but walked as feet came back with enormous residuals
  and *nothing naming the cause*: the residuals say something is wrong, only the ratio says the
  **units** are wrong. `observedScale()` now computes it independently (rotation-invariant, from the
  spread of each point set about its own centroid) and `explainScale()` names which of the two
  candidates it is — a State Plane combined factor (~1 in 10,000, half a foot per mile, expected and
  not a disagreement about the boundary) or a vara (25/9, a boundary in the wrong place). `appliedScale`
  and `observedScale` are separate fields on purpose: one field holding whichever was available is
  how a diagnostic ends up applied as a correction.

  **A declined rotation is a 200 with its reason, not a 4xx.** The caller asked a well-formed
  question; the answer is "not from this input, and here is why". A reason delivered as an error
  lands in a toast, which is where reasons go to be dismissed.

  ### Two bugs found by building the entry point

  **1. Every due-north call was silently dropped from every rotation.**
  `rotateCalls` guarded with `if (!parsed)` where `parsed` is an azimuth — and **due north is
  azimuth 0, which is falsy**. So `N 0°00'00" E` was reported as a bearing that "could not be read".
  That is not an exotic call: a line called exactly due north is the **signature of an ASSUMED
  basis**, where the surveyor named one line N 0° E and worked from it. It is the survey this module
  exists to rotate, so the bug was aimed squarely at its main case. The module's own tests had never
  used a due-north bearing; driving it from a service found it in the first run.

  **2. The production build broke while the whole suite stayed green.**
  `worker/` is a real ES module package, so TypeScript requires its internal imports to be written
  `from './survey-geometry.js'` even though the file is `.ts`. Node resolves that; **webpack does
  not**. `tsc --noEmit` passed, 1,283 worker tests and 1,466 root test files passed, and
  `npm run build` failed with *"Can't resolve './survey-geometry.js'"* — because vitest resolves it
  fine and only the real bundler does not. Fixed with `resolve.extensionAlias` in `next.config.js`,
  which is webpack's supported answer and leaves genuine `.js` imports resolving unchanged.

  **Third time in this repo a green suite has sat on top of a broken build.** The existing rule —
  *run `npm run build` before merging* — is the only thing that catches this class, and it earned its
  keep again here.

  Suites: worker 76 files / 1,283 tests; root 1,466 files; `npm run build` clean.

---

### The defect this document found ten times, and the check that ends it

**DONE 2026-08-03** (`worker/src/__tests__/research-modules-are-reachable.test.ts`).

Ten separate times, work in this plan was designed correctly, tested, written up as DONE — and had
**no caller**. Three of those times the prose in this very document asserted the fix was live:

| | what had no caller |
|---|---|
| S8 | the legibility check — a verdict computed and never read |
| S10 | **all nine Phase I modules** — monuments, curves, varas, closure, the drawing: an island |
| S11 | `bearing-rotation` — the owner's named feature, with no route and no button |
| R13 | `platform-choice` — described here as *"the enforcement point"*, never asked |
| R14 | the chain walk — wired, but its searches were never passed as arguments |
| R16 | `frameParcel` — fixed the zoom-19 defect for nobody |
| R18 | `chooseTiles` — the recommended grid, computed on every document and discarded |
| S-11 | `research-modes` — a mode picker that governed nothing |

**The reason it kept happening is that nothing could see it.** A module's own unit tests pass exactly
the same whether or not anything calls it. `tsc` is happy. The production build is happy. It is
invisible to every check this repo runs — so the fix is a check, not more care.

The test walks `worker/src/services`, `worker/src/research`, `worker/src/chain-of-title` and
`lib/research`, and fails on any module nothing outside a test file names.

**It is an allowlist, not a ban**, because some modules genuinely should have no importer — entry
points, and work deliberately parked. A test that failed on all of them would be noise, and noisy
tests get skipped, which would leave this worse than before. So unreachable is *allowed*, but only as
a **recorded decision with a reason**: `KNOWN_UNREACHABLE` is now a standing inventory of eleven
modules that were built and never connected, each with why. Three further assertions keep the list
honest — a module that later gets wired must be removed, a deleted module must not linger, and an
entry with a token reason fails, since *"an exception without a reason is the defect wearing a
permission slip"*.

Two bugs in the check itself, both caught by running it. It re-read the whole source tree once per
module and took ten seconds before timing out — a guard slow enough to annoy is one somebody
eventually skips. And five of my own allowlist entries were wrong: the matcher counts a path string
in a registry as a caller, which is a real way this codebase reaches a module, so those five were
never unreachable at all.

#### Widening it found the eleventh instance, and it was the worst one

**2026-08-03, same day.** The first version of the check scanned four directories and skipped
`worker/src/lib` and `worker/src/infra`. A guard is only as good as its coverage, and the directories
it skips are exactly where the next orphan is. Widening it surfaced five more — and one of them is
the sharpest example this document has:

**`worker/src/lib/closure-tolerance.ts` opens by calling itself *"the single source of truth for 'is
this closure acceptable?'"*, and lists the four modules that import from it so that "changing a
threshold changes it everywhere". Nothing imported it.**

The consequence was three different answers to one question, in a platform whose entire subject is
boundaries:

| | excellent | acceptable | below |
|---|---|---|---|
| `closure-tolerance.ts` (the declared source, unused) | ≥10,000 | ≥5,000 | marginal ≥2,500, then poor |
| `closure-diagnosis.ts` (**written this session**) | ≥10,000 | ≥5,000 | poor ≥1,000, then unusable |
| `validation.ts` (the live Stage 4 path) | >25,000 | good >10,000 | fair >5,000, then poor |

A traverse closing at 1:3,000 was `marginal` on one path and `poor` on another; one at 1:15,000 was
`excellent` on two and merely `good` on the third. **A surveyor could be told two different things
about the same closure depending on which screen rendered it.**

And the drift was not hypothetical or historical — **I caused an instance of it earlier in this
session**, writing `POOR_CLOSURE = 1_000` in a new module while a shared constant of 2,500 sat
unimported a directory away. That is precisely what a source of truth nobody imports cannot prevent,
and it is the argument for the check rather than for more care.

All three now read from `closure-tolerance.ts`. `validation.ts`'s stricter top band is kept — it
answers a different question (*"is this the best grade on a scorecard?"* rather than *"is this
acceptable to report?"*, and nothing is blocked by it) — but it is now the named
`SCORECARD_EXCELLENT_RATIO` in the shared module instead of an inline `> 25000` beside two other
files' inline literals. Same numbers, so this is a consolidation and not a re-grading; what changes
is that moving a threshold now moves it everywhere, which is what that module always claimed.

The other four are recorded with reasons: the real-time progress channel is built **end to end and
connected at neither end** (the publisher has no callers, the hook has no consumer) and needs
`npm run ws` deployed as a long-lived process, which Vercel cannot host — a deployment decision, and
the UI polls successfully meanwhile. The rate limiter, the AI guardrails and the county-config
registry are each parked for a stated reason, two of them because a second implementation is already
wired and one of the pair should be retired rather than both connected.

Worker suite 81 files / 1,356 tests; root 1,468 files; typecheck clean.

#### And the same defect in the units — six vara constants, two of them lying

The closure case pointed at a defect class the reachability check **cannot** catch: both files were
wired, they simply disagreed. So the natural next question was where else one rule has two
implementations — and the answer was the Texas vara, defined **six times**:

| where | value | |
|---|---|---|
| `survey-units.ts` | `25 / 9` | exact |
| `reading-aggregator.ts` | `1000 / 360` | exact — the same number written differently |
| `ai-deed-analyzer.ts` | `2.7778` | rounded, and its comment said *"(exact survey feet)"* |
| `ai-plat-analyzer.ts` | `2.7778` | rounded, and its comment said *"(exact)"* |
| `validation.ts` | `2.7778` inline | rounded, in the **live Stage 4 closure-and-area path** |
| three prompt strings | `2.7778` | what we tell the model to use |

Two were **labelled exact and were not**, which is worse than being wrong quietly: it tells the next
reader the question has been settled.

The numerical error is small — about **0.04 ft over a 1,900-vara league line**, an inch or so, well
under what compass-and-chain work supports. It is fixed anyway, and the reason is the same one this
platform already committed to: `survey-units.ts` exists *because* the US survey foot and the
international foot differ in the **seventh** significant figure. A platform that insists on that
while rounding the vara in the sixth is not applying a standard — it is applying whichever number a
given file happened to contain.

**`validation.ts` also held the metre as `3.28084`, which is the INTERNATIONAL foot**, in the path
that computes closure and area and compares that area to the CAD acreage. That is the exact
distinction the unit module was written to preserve, undone inline in the file that does the
arithmetic. All conversions there now go through `convertLength`.

The prompts are deliberately **not** changed to `2.777777…`. A model reading a land description does
better with the figure a surveyor would recognise, and every distance it returns is re-converted
here anyway — so they now say `≈` and ask for the vara figure **as written**, which is strictly
better: a conversion done by the model is a conversion nobody can check.

One test of my own needed loosening rather than the code changing: it forbade the digits `3.28084`
anywhere in `validation.ts`, which also forbade the comment explaining what had been wrong with it.
A test like that is how a comment recording a past mistake gets deleted to make a suite pass, taking
the reason with it. It now asserts on the code form.

Worker suite 81 files / 1,361 tests; root 1,468 files; typecheck clean.

#### Third of the same kind: a bearing the drawing could not read was drawn due north

`worker/src/reports/svg-renderer.ts` kept its own bearing regex and `return 0`'d on failure — twice,
once for no match and once for an unrecognised quadrant. **Zero is due north.** So an unreadable call
was drawn as a real line heading north at its stated distance, and because a traverse is cumulative,
that single call rotated every corner after it. The figure looked like a boundary. This is the
report a surveyor takes to the field, and a corner invented by a failed parse is worse than a corner
missing from the drawing, because nothing about it looks wrong.

`bearing-rotation.ts` had already written down why this must not exist: *"One bearing grammar in the
codebase — survey-geometry's. A second parser here would drift from it, and the two would disagree
about exactly the malformed bearings that matter."* The renderer **was** that second parser, and it
had drifted — its regex *required* minutes, so `N 45° E`, an ordinary degrees-only call on an older
plat, never matched and became due north.

It now delegates to `parseBearing`, and both walks skip a call they cannot read rather than advancing
the pen. The drawing prints **INCOMPLETE — N call(s) could not be read and are NOT drawn** on its own
face, because whoever reads it in a truck is not reading a log.

**And the test found a real gap in the canonical parser, not just in the renderer.** I asserted that
`parseBearing` handled degrees-only; it did not. The degree mark was one of the *minutes separators*,
so the symbol could only appear if digits followed it, and `N 45° E` returned null. Safe direction —
but it made a perfectly legible bearing unreadable and dropped the call from every figure that used
it. The degree mark is now its own optional group. That gap existed because the claim had never been
tested, only stated.

`parseDelta` in the same file had a milder version of the identical defect: a failed parse returned 0,
and the only use is `delta > 180`, which chooses the major or minor arc — so a 200° curve was drawn
bulging the wrong way. The endpoints come from the traverse and stay correct, so this is a labelling
problem rather than a position one; the annotation now says **Δ UNREADABLE — arc direction assumed**
instead of the drawing silently claiming a shape it could not compute.

**Three slices, three instances of one defect class**, and it is worth naming beside the reachability
check because that check cannot catch it: every file involved was wired and running. What they
disagreed about was the *rule*.

| | duplicates | how they differed |
|---|---|---|
| closure thresholds | 3 | one called itself the single source of truth and had no importers |
| the Texas vara | 6 | two were labelled "exact" and were not |
| bearing parsing | this | one returned 0 — due north — where the canonical one returns null |

Worker suite 82 files / 1,375 tests; root 1,468 files; `npm run build` clean.

#### The check for it, and what the check immediately found

**DONE 2026-08-03** (`worker/src/__tests__/survey-primitives-are-not-duplicated.test.ts`).

Three slices of one defect class is a pattern, so it gets a standing check — the same treatment the
orphan modules got. It scans `worker/src` and `lib/research` for two things that are mechanically
detectable and did in fact drift: a vara conversion factor written as a literal, and a closure ratio
compared against a literal.

**It deliberately does NOT try to detect "a duplicate parser."** Thirty files here contain `[NS]`,
nearly all of them prompt text, schema examples and format documentation. A check that flagged those
would be noise, and noisy checks get skipped — which would leave this worse than not having one. The
bearing case is defended by its own test against the renderer instead.

**The check paid for itself on its first run**, finding what two rounds of careful grepping had
missed:

- **Two more vara conversions in live code paths** — `lib/research/boundary-fetch.service.ts`
  (`100 / 36`, correct but a *seventh* copy) and `worker/src/counties/bell/analyzers/deed-analyzer.ts`
  (`*= 2.7778`, rounded, an eighth). **Both also had `3.28084` for the metre** — the international
  foot — in traverse arithmetic, the same defect `validation.ts` had. The previous slice's commit
  message claimed the vara was consolidated. It was not, and only the check knew.
- **Five more files holding closure thresholds as literals**: `traverse-closure.ts`,
  `analysis.service.ts`, `comparison.service.ts`, `confidence.ts` and `geometry.engine.ts`. Nine
  files in total held the numbers.

**But they were not all the same question, and flattening them would have been the real mistake.**
Three genuinely distinct scales came out of it, and each is now named for what it measures:

| scale | numbers | what it answers |
|---|---|---|
| `DEFAULT_CLOSURE_THRESHOLDS` | 10,000 / 5,000 / 2,500 | is this closure acceptable to report? |
| `TSPS_TRAVERSE_TIERS` | 50,000 / 15,000 / 5,000 | does it meet the TSPS condition-of-survey category? |
| `TEXAS_MIN_RURAL_RATIO` / `_URBAN_` | 10,000 / 25,000 | does it meet the statutory minimum for this land use? |

A traverse at 1:12,000 is *excellent* on the first and *marginal* on the second, and both are right —
they are different questions. What was wrong is that nothing said which question any file was asking.

**A correction to this document's own previous entry.** Two slices ago I pulled `25_000` out of
`validation.ts` and named it `SCORECARD_EXCELLENT_RATIO`, guessing it was a stricter-compliment
threshold. It is the **urban statutory minimum** — `analysis.service.ts` says so in prose, in the
discrepancy it writes for a surveyor. The number was right and the name was my invention, which is
its own kind of drift: a well-named constant that means something else is *harder* to catch than a
literal, because it looks resolved. Renamed once the third and fourth users turned up and said what
it was for.

`confidence.ts` is left as a scoring **curve** with seven breakpoints rather than being forced onto
three tiers; the four that coincide with a named standard now reference it, and the rest are marked
as curve shape.

Two bugs of my own in this slice, both worth recording because they are the ordinary hazards of bulk
edits: a string replace turned `>= 50000` into `>= DEFAULT_CLOSURE_THRESHOLDS.acceptable0`, because
`5000` is a substring of `50000`; and an import inserted before the first `import` line landed
*inside* an `import type {` block, twice. The typechecker caught both immediately — which is the
argument for running it between edits rather than at the end.

Worker suite 83 files / 1,381 tests; root 1,468 files; `npm run build` clean.

#### Turning the same scrutiny on this session's own UI

**DONE 2026-08-03** (`__tests__/research/panels-render.test.tsx`).

Three UI surfaces shipped this session — `RotationPanel` (S11), `VendorAccountsPanel` (S-9), and the
offline banner in `JobResearchPacket` (R26) — and **every test written for them asserts that the file
CONTAINS a string**. That proves the code says the right thing. It proves nothing about which branch
produces it, or that anything reaches the screen. This repo's own recorded lesson is precisely that:
a green 15,000-test suite missed three rendering-condition bugs in one pass, because string
assertions cannot see a render.

Rendered with `react-dom/server`, matching `__tests__/admin/sidebar-render.test.tsx` and the rest of
this suite — node environment, no new dependency.

`VendorAccountsPanel`'s two display rules are now **exported** so they can be called directly. They
are the risky part of that file: they decide when a number may be shown and what must be said beside
it, and asserting the file contains the word "INFERRED" says nothing about the branch that emits it.
The cases that matter are the ones a grep cannot express — a `confirmed` source with a **null**
amount must not print *"$0.00 confirmed from the vendor"*, because a confirmed reading of nothing is
not a reading; a DECIMAL column arriving from PostgREST as the **string** `'42.50'` must still
format; and a limit of **0** must not count as unset, since zero and null are different instructions
and `filter(Boolean)` would have silently merged them.

**What this cannot see, stated rather than implied.** `renderToString` does not run effects, so the
fetch-driven states of two of these panels are unreachable this way, and the offline banner cannot be
rendered at all without injecting a verdict the component fetches for itself. What is covered is
every branch depending on props alone plus the pure rules. **Driving these three panels in a real
browser is still not done** — the pages are auth-gated and need a project with data, and the UX
harness cannot reach role-gated pages. That is the honest remaining gap on this session's UI work.

Root suite 1,469 files; typecheck and `npm run build` clean.

#### And the survey reading reaches the document a person opens

**DONE 2026-08-03** (`buildSurveyReading` in `worker/src/services/report-generator.ts`).

S10 wired `readSurvey()` into Stage 4 and put the result on `PipelineResult`. It went to the log and
into the JSON — and **nothing read it**. Everything Phase I built about the CONTENT of a survey
stopped one step short of the report a surveyor actually opens.

Wired into the pipeline is not the same as surfaced, and this is a variant the reachability check
**cannot** see: `surveyReading` had a producer and no consumer, but the field is on a *type* rather
than in a module, so nothing about it looks orphaned.

The new section sits **immediately after TRAVERSE QUALITY**, which is where the closure is printed as
a number. Separating them is how a precision ratio ends up reading as a verdict on the survey rather
than on our reading of it. Order inside the section is deliberate too: monuments first, because
finding called-for monuments is most of what a field crew is sent to do; then what the closure says
about our reading, because it governs whether anything below it can be trusted; then the
corner-to-corner inverses, which are a reference table rather than something read straight through.

Four things that would otherwise stay invisible now print: curves that disagree with their own stated
values, corners positioned from a chord **we** computed rather than one the deed recites, the vara
conversion when the deed recites varas, and monuments that could not be placed on the figure.

And the section distinguishes **"did not run"** from **"found nothing"** — a run predating it has not
looked, which is not a finding about the property.

Two of my own defects in the slice. The prose statements from `survey-reading` are written for a
person and run past 130 characters; I wrote a `wrapAt` helper and then applied it to only *some* of
the lines, so the monument list still emitted 133-character rows until the test caught it. And a
minimal `ValidationReport` stub crashed `buildPropertySummary` on `undefined.toFixed` — that one is
**not** a production defect: `acreage` is `number | null` and not optional, so the state is
unreachable through the type, and the right fix was to satisfy the type rather than loosen a guard
in shipping code on the strength of a bad stub.

Worker suite 85 files / 1,420 tests; root 1,469 files; typecheck clean.

#### The same question asked of every other result field — including my own

**DONE 2026-08-03** (`buildRetrievalAndSpending`, and a fix to the previous slice).

Having found `surveyReading` produced-and-unread, the obvious next move was to ask it of every other
field on those result objects. **Four more, and two of them were added earlier in this same
session:**

| field | on | added |
|---|---|---|
| `retrievalFailures` | `PipelineResult` | pre-existing |
| `librarySavings` | `PurchaseReport` | pre-existing |
| `policyPremiums` | `PurchaseReport` | **by me, R13** |
| `modeStatement` | `PurchaseReport` | **by me, S-11** |

That is the clearest evidence available that this is a shape the codebase *invites* rather than
carelessness: I wrote each field, wrote the comment explaining why the number must not be silent —
*"a premium nobody records is a premium nobody decides to stop paying"* — and then there was nowhere
obvious to put it, so it stopped on the object. The orchestrator loads `purchase_report.json` and
reads exactly one field from it (`billing.totalCharged`); everything else is loaded and dropped.

`retrievalFailures` is the one that matters most to a surveyor: **a report that never mentions the
documents it failed to fetch reads as complete.** They print as *errands, not absences* — the record
may exist and be perfectly findable at the courthouse — and "none failed" stays distinct from "not
recorded", which the pipeline is careful about and the report must not flatten.

### And the previous slice was broken in exactly the way this document keeps describing

`pipeline.ts` builds the object it hands the report generator **by hand**, and casts it
`as PipelineResult` — so a field omitted there is silently absent from the printed report rather than
a compile error. It carried three fields. `surveyReading` was added to the report in the slice above
and **never added to that object**, so every real run would have printed *"Not computed for this
run"* while the tests passed, because the tests construct their own result.

A section that degrades honestly still says nothing when it is starved. Fixed, and pinned by a test
that reads `pipeline.ts` rather than constructing a result — which is the only kind of test that
could have caught it.

Worker suite 85 files / 1,427 tests; root 1,469 files; typecheck clean.

#### The third standing check — a producer with no consumer, hidden behind a cast

**DONE 2026-08-03** (`worker/src/__tests__/report-gets-what-it-reads.test.ts`).

Having shipped that defect **twice in two slices**, it earns a check rather than more care. It
compares two files: every `pipeline.<field>` the report generator reads, against the object literal
`pipeline.ts` hands it. Anything read and not passed fails, with the field named.

That is the only kind of test that could catch it. The unit tests construct their own result object,
so they pass whatever the pipeline does — and `as PipelineResult` tells the compiler to stop
checking, so a missing field is `undefined` at runtime and every section degrades honestly into
"not computed", truthfully, forever.

**Verified by reintroducing the bug**: removing `surveyReading` from the literal makes the check fail
with `surveyReading` named. A check nobody has seen fail is a check nobody knows works — and this
session has now produced two that needed fixing before they defended anything.

The set now covers all three shapes this codebase produces:

| check | catches |
|---|---|
| `research-modules-are-reachable` | a module nothing imports |
| `survey-primitives-are-not-duplicated` | one rule, several implementations |
| `report-gets-what-it-reads` | a producer with no consumer, hidden behind a cast |

**Two bugs in the check itself, both of the quiet kind.** Blanking quoted strings to avoid matching
`pipeline.js` in an import path also blanked *template literals* — where most of this report is
built, including `${pipeline.propertyId}` — dropping the scan from five fields to two. And the
string regex allowed newlines, so a lone apostrophe in a prose comment ("the surveyor's opinion", of
which this file has many) opened a match that ran to the next apostrophe pages later, swallowing the
accesses between. Both left the check *finding something*, which is why the "finds both sides of the
comparison" guard exists at all.

Worker suite 86 files / 1,432 tests; root 1,469 files; typecheck clean.

#### The same absence, in the document that actually goes to the field (R25)

**DONE 2026-08-03** (`lib/research/packet.ts` + both routes that assemble a packet).

The master report now names the documents a run failed to fetch. **The packet did not, and the
packet is what a crew receives.** It lists what it has; nothing in it could say what was attempted
and missed — so a crew reads the source-documents section, sees eleven documents, and has no way to
know a twelfth arrived unreadable. The packet reads as complete.

R25 already established where this belongs: *"warnings go on the cover, because a caveat at the back
is a caveat nobody reads."* Two new cover lines, and neither is decoration:

- **Documents that could not be retrieved or read**, named, and called **errands rather than
  absences** — the record may exist and be perfectly findable at the courthouse, and "not in the
  packet" and "does not exist" are different facts a crew acts on differently.
- **What the closure says about our reading**, because it governs whether the numbers throughout the
  packet can be trusted at all and therefore does not belong beside any one fact.

**The worker's own `retrievalFailures` is not visible from the app** — it lives on the pipeline
result rather than in a table — so the packet is fed the half that IS visible and is the half a crew
cares about: documents whose `processing_status` is `unreadable` or `error`. That is R18's failure
made visible at last: an unreadable deed becomes a document with no facts, and the packet then
reports the property as having no easements rather than as having a deed nobody could read.

`undefined` and `[]` are kept apart, as everywhere else in this document: the routes pass `[]`
because the query genuinely ran, so "none" is *established* rather than unknown — and a packet handed
the wrong one would make a checked run look unchecked, or worse, the reverse. Both routes that
assemble a packet supply it, pinned by a test, because a draft PDF printing "not recorded" while the
same packet showed the real list elsewhere would leave a crew not knowing which document to believe.

Root suite 1,470 files; typecheck and `npm run build` clean.

**And one document further — the crew view (R26).** I claimed the packet was the last document in
that chain and then checked rather than trusting it, which was right: `fieldBrief()` reads the
approved snapshot with `r.warnings ?? []`, so a packet **approved before cover warnings existed**
renders in the crew view as *"no warnings"* — the identical claim a genuinely clean packet makes.
Opposite facts. One means nothing to worry about; the other means nobody looked. And this is the
screen on a phone, in a truck.

`warningsUnknown` now distinguishes them, using `'warnings' in r` rather than a truthiness check —
a snapshot that legitimately recorded **zero** warnings has the key with an empty array, and that is
an answer.

**The snapshot is deliberately NOT rewritten** to add the field to old packets. Approval is a
signature on what the packet said; back-filling it would forge that signature. The crew view says
the state is unknown instead, and tells them to check the full packet.

#### The mirror defect — a consumer with nothing feeding it

**DONE 2026-08-03.** Applying the same question one more time caught me out: `readingCaveat` shipped
two slices ago with a renderer, a test, and **no producer**. Nothing built it, so that cover line
could never appear. Not a producer with no consumer this time — the reverse — and it passes every
unit test, because the test supplies the field itself.

Wired rather than deleted, because the fact is genuinely available: the survey plan this route
already loads carries a `closure_check`. It fires **only when the closure is not acceptable** — cover
warnings that go off on healthy runs are how a crew learns to skip the cover.

A fourth check now compares `PacketSources`' declared fields against the routes that build it. Two
things had to be fixed before it defended anything, and both are worth recording:

- The pattern was `` `\b${f}\b` `` — in a template literal `\b` is a **backspace character**, so it
  matched nothing and reported every field as unsupplied. It failed loudly, which was luck; with the
  polarity reversed the identical mistake passes silently forever, which is how two of the other
  checks in this repo were broken when first written.
- It then matched the field NAME anywhere in the file, so deleting `readingCaveat,` from the returned
  object still passed — the local `const readingCaveat = …` kept the word present. **A check that a
  name is mentioned is not a check that a value is supplied.** Now matched as a property, and
  verified by deleting the producer and watching it fail.

Root suite 1,470 files; typecheck and `npm run build` clean.

#### All four checks have now been watched failing

**DONE 2026-08-03.** I had claimed that deleting the protected code and confirming the check goes red
was the habit that saved each of these. That was true of **two** of the four. The other two — the
reachability check and the duplicate-primitives check — had only ever been *run*, and "it passes" is
not evidence a check works: three of the four were broken on first write in ways that let them pass
while defending nothing.

So both were mutation-tested, and both fire:

- **Reachability**: dropped an unreferenced module into `worker/src/services/`; the assertion named
  it. Non-destructive by construction — a new file, not a broken import.
- **Duplicate primitives**: reintroduced `if (unit === 'varas') return value * 2.7778;` into
  `validation.ts` — the exact line consolidated away — and it named the file and the line number.
  Restored via `git checkout`; `git status` confirms no debris.

The verification is **recorded in each file rather than automated**. A self-mutating test that writes
into the source tree leaves debris when it dies mid-run, and here the debris would be a wrong
conversion factor in the live closure path, or an orphan module — the very things being guarded
against. Each file now also pins the property that makes it *capable* of firing: the directories it
scans, and, for reachability, that a test file does **not** count as a caller — if tests counted,
every module with a unit test would look wired and all eleven recorded orphans would pass.

Worker suite 86 files / 1,436 tests; root 1,470 files; typecheck clean.

#### Browser QA, finally attempted — and it found a bug on the first screenshot

**DONE 2026-08-03** (`app/ux-harness/ResearchPanelHarnessMount.tsx` + `panel-contrast.test.ts`).

I named browser QA as "the honest remaining gap" **twice** and never tried it, giving as the reason
that the pages are auth-gated and need a project with data. That was true of the PAGES and not of the
PANELS: the UX harness already mounts components with a mock session, and what was missing was
somewhere to mount ones that take props. The same shape as every other blocker here — the obstacle
was not the decision, it was the absence of a form for it.

**The first screenshot showed the rotation panel's heading and BOTH radio labels rendering
dark-on-dark, invisible against `bg-gray-900`.** Every unit test passed, including the render tests
written one slice earlier: the markup was right and the CSS cascade was not.

Two element rules in `app/styles/globals.css` are the cause:

```css
h1, h2, h3, h4, h5, h6 { color: var(--brand-dark); }
label                  { color: var(--brand-dark); }
```

**An element selector beats an inherited value, always.** `text-gray-100` on the panel container
never reaches an `<h2>` or a `<label>` inside it — Tailwind's class is on the wrong element to win.
Those globals are not wrong; they are right for the light admin pages that are most of this app. It
is a rule about writing a **dark panel inside a light-themed application**, and nothing but looking
could have found it.

`panel-contrast.test.ts` now fails on any heading or label in a dark panel without an explicit text
colour, and asserts the two globals still exist — so when they change, the check announces that its
reason has gone rather than quietly guarding nothing. Verified by removing the fix and watching it
name the heading.

The vendor-accounts panel rendered its **error** state ("Unauthorized"), which is correct: the
harness's mock session is not a real server session, so the route properly refuses. That is the panel
doing exactly what it should, legibly.

Two self-inflicted lessons: `git checkout --` to undo a mutation test **also reverted the
uncommitted fix** it was testing, silently — the reapply is the only reason it is not lost. And the
harness mount tripped the repo's existing inline-hex ratchet, which is a rule I should have known and
which was right to fire.

Root suite 1,471 files; typecheck and `npm run build` clean.

**Widened, and it was not just my two panels.** Sweeping the research area for `bg-gray-9xx` rather
than listing what I had touched found the same bug in **four pre-existing pages** — billing, library,
documents, and the **Boundary Viewer**, whose `<h1>` title has been invisible to every surveyor who
has ever opened it, along with both sets of layer/colour-mode toggle labels beside the drawing.

Nine elements in total. The check now covers all six files and is the thing that found the last four:
my own grep missed them because it only matched `className="…"` on a single line, and JSX wraps.

Three corrections to the check itself along the way, each a small lesson:

- It demanded a Tailwind class and flagged a billing heading that already sets
  `style={{ color: TIER_COLORS[...] }}` — a false accusation. **A check that forces redundant code is
  one people learn to work around**, so inline colour now counts.
- `text-sm` and `text-2xl` are not colours. An earlier pattern would have accepted them and passed on
  exactly the tags it exists to catch; there is now a test for the matcher itself.
- Four of the six files are called `page.tsx`, and a failure reading *"page.tsx: headings"* names
  nothing. The test title carries the path.

And a process note worth keeping: shell heredocs mangled `\b` into a literal **backspace character**
in this test file — the second time that has happened today. Files with regexes get written with the
editor, not echoed through a shell.

**An app-wide sweep found nothing more — a negative result worth recording.** The cause is a global
CSS rule, so the bug cannot be research-specific in principle. Sweeping every `.tsx` under `app/` and
`components/` that paints a dark surface reported **64 elements across 19 files, all in the CAD
editor**. Every single one was a false positive, and I found that out by checking one before editing
any:

- most were `<label className="block">` wrapping children that each set their own colour — the label
  holds no bare text, so the global rule colours nothing visible;
- the remaining sixteen used `className={labelCls}`, and that variable already carries
  `text-gray-400`.

So the defect really was confined to the research area, and the CAD editor avoided it by defining a
label-class constant **once per file** — a better pattern than the research pages had, and the one to
copy. The matcher now resolves `className={variable}` and ignores elements with no direct text, so a
future widening does not repeat the same two false alarms.

The value here is the thing that did *not* happen: a 19-file edit across a subsystem I have not
tested, to fix approximately nothing. Two narrowings of the sweep cost a few minutes; the edit would
have cost far more and been indistinguishable from progress.

---

## 4. Decisions that are the owner's, not mine

These block specific slices and must not be guessed:

0a. **One plat whose answers are already known (Phase I / S8, and R19's canaries).** The single
   highest-value thing on this list.

   > **There is now somewhere to put it — 2026-08-03** (`worker/src/services/golden-plat.ts`,
   > `worker/src/__tests__/golden-plats/`). Drop one JSON file in that directory and the measurement
   > starts running; no code changes, nothing else to ask for. The README there is the entry form.
   >
   > Built because this blocker had the S-9 shape: **no form behind it**. A plat could have arrived
   > tomorrow and the measurement still would not have existed — the decision would have unblocked
   > nothing.
   >
   > Nothing is compared as a string, for the reason `infra/canary.ts` already worked out: bearings
   > as **angles** within 30 seconds, so `N45°30'E` and `N 45-30-00 E` are one call and the harness
   > measures our reading rather than our formatting; distances **unit-normalised first**, so a call
   > read correctly in varas and reported in feet scores as correct instead of a 178% error;
   > monuments on **kind AND found/set**, with a status confusion counted separately and never folded
   > into the totals, because a found monument controls the corner and a set one is an opinion.
   >
   > Recall and precision are reported as **two numbers**: a pipeline that drops half the calls and
   > gets the rest perfect is 100% precise and 50% complete, and printing only the first would be
   > flattering nonsense.
   >
   > With no plats loaded it reports **NOT MEASURED** — never 100%, never a pass, and it says why:
   > *"every survey figure in this platform is validated against synthetic geometry only, which
   > proves the arithmetic and nothing about the reading."* An empty denominator producing a perfect
   > score is how a measurement becomes a reassurance.
   >
   > **And the loop is closed** (`extractedCallsFrom`). The harness compares against the pipeline's
   > OWN output shape — `ExtractedBoundaryData`, the same thing `readSurvey()` takes at Stage 4 — so
   > supplying the plat is the **only** manual step. Without that bridge this was half a form:
   > somebody would have had to hand-transcribe a run's results before any measurement could happen,
   > and transcription errors would have been **indistinguishable from extraction errors**, which is
   > the one confusion a measurement of extraction cannot afford.
   >
   > A curve crosses as its **chord**, matching `survey-reading.ts`. A golden record states the chord
   > for a curved call because the chord is the straight line between the two corners a crew
   > occupies; comparing a chord against an arc length would score every curve in the document wrong
   > and read as an extraction failure. Varas cross as **varas** rather than being pre-converted —
   > the harness normalises both sides itself, and converting early would discard the fact that the
   > deed recites varas, which is exactly what the golden record states.
 Every piece of survey geometry built in Phase I — traverse,
   monuments, curves, rotation, varas — is tested against *synthetic* figures, which proves the
   arithmetic and nothing about the **reading**. One plat where the bearings, curves and monuments are
   already known would, in one pass: measure whether Tyler's `DEGRADED` rendering and Bastrop's
   screenshots clear the legibility threshold in practice; show whether the model reads a marginal
   14 px bearing correctly or confidently wrong; and test retrieval → OCR → extraction → traverse →
   drawing end to end for the first time. Ideally Bell County, where retrieval is most proven.
0. **A free iDocMarket account, for Bosque (Phase I / S7).** The smallest and cheapest item on this
   list, and the only thing standing between 53 and 54 county-slots. iDocMarket's index is free and
   already searched; the *document view* requires a signed-in account, and its own Status endpoint
   confirms there is **no charge** (`owned:true`, `$0.00`, no card). It needs somebody to register —
   creating an account in the firm's name is not a decision to make on the firm's behalf. Once it
   exists, the credentials go in the environment (never the database, per S-1) and the adapter wires
   like the other four.
1. **Subscription accounts (R13).** Which paid platforms does the firm hold or want — TexasFile,
   TitlePoint, DataTree, CoreLogic, Regrid, county-specific? Credentials and per-page/per-month
   costs decide the cost-ascending policy.
2. **Imagery licensing (R16).** Google's Maps/Street View Static APIs are paid and their terms
   restrict storage and redistribution; Esri World Imagery and NAIP are cheaper or free with
   different restrictions. Which do we buy, and may captured tiles be stored in a customer packet?
3. **Captcha and ToS posture (R12).** Some county portals forbid automated access in their terms.
   Which counties are we willing to automate, and where do we stop and queue a manual step?
4. ~~**Compute host (R7).**~~ **DECIDED 2026-08-02** — netcup RS 4000 G12 in Manassas VA, ~$38.50/mo
   against a $70 cap. See `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md`. What remains owner-side is
   ordering it and pointing `WORKER_URL` at it; the current droplet is unreachable regardless.
5. **Spend ceilings (R5).** Dollars per run and per month, and what a run should do when it hits
   them: stop, or ask.

---

## 5. Sequencing note for the loop

Build in order **A → B → C → D → E → F**, one slice per pass. Phase A first is not negotiable: R1–R5
are what make every later claim in this document verifiable. A slice is done when its acceptance
criterion is demonstrated — for UI slices that means **driven in a browser**, not just typechecked,
per this repo's standing lesson that a green suite does not catch an unwired feature.

**Phases G, H and I were added later, from owner requests, and do not sit in that sequence.** G and H
are coverage — the neighbours and the counties this firm actually works. **Phase I is different in
kind**: A–H are all about making a document *arrive*, and I is the first phase about reading one as a
survey. Its remaining slices (S5–S8) are the highest-value work left in this document, because every
county added by G and H only pays off once the file that county holds can be read properly.
