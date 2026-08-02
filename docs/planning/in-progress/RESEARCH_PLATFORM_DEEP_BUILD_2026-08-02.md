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

### Buildable work still outstanding
| Slice | What remains | Why it was not done in the slice |
|---|---|---|
| R14 | The exhaustive backward re-query — going back to the clerk for the deeds the gap list names | Needs the adapter call path; the gap list built in R14 is its input |
| ~~R18~~ | **DONE 2026-08-02** — one assessor, enforced on both paths | — |
| R38 | Prove the remaining vendors the way Kofile was proven: locate each portal from the county's own site, drive it, read the DOM | Blocked per county on finding the portal; the Tyler/Henschen/iDocket/Fidlar URL patterns are all dead |
| R39 | Hunt each remaining county's portal individually — the only method left once no URL pattern generalises | eDocTec found (Coryell, Lampasas); nine Tyler Eagle portals found and driven incl. McLennan/Waco; verified counties 7 → 18 |
| R25 | The packet picker UI, and embedded page images in the PDF | The API takes a selection today; images need R24's `flattenLayers` wired to a renderer |
| R13 | TitlePoint/DataTree-class vendors and Regrid behind the purchase interface | Larger than a slice; the library and cost policy they plug into are done |
| R17 | Pixel regions on facts (`source_bounding_box` has never held a value) | Text extraction has no coordinates to give — unlocked by R18's vision path |
| R28/R29 | The worker's poll loop calling `claim` → run → `report` on a timer | Logic and limits are proven from both ends; the wiring belongs with deploying the box |
| R15 | A page image stored per plat instrument | Same document-attachment path R13 and R17 need — build once, not three times |
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

  **Remaining (owner-gated or larger):** real credentials for the 8 adapters and a per-firm
  subscription record; TitlePoint/DataTree-class vendors and Regrid behind the same interface; PDF
  attachment into `research_documents`. The library and the policy are what those plug into.

- **R14. Full chain of title, to the earliest available instrument.** ◑ PART DONE 2026-08-02 —
  gaps + stated reason shipped; the exhaustive backward re-query remains
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

  **Remaining:** the exhaustive backward re-query — going back to the clerk for the deeds the gap
  list names, rather than only walking documents already harvested. That needs the adapter call path
  and per-county index horizons as data; the gap list is its input.

- **R15. Complete plat history.** ◑ PART DONE 2026-08-02 — supersession + governing plat shipped;
  page images per instrument remain
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

  **Remaining:** a page image stored per plat instrument with its recording data — that is the same
  document-attachment path R13's library and R17's evidence capture need, and is better built once
  there than three times here.

- **R16. Imagery pack, per parcel.** ◑ PART DONE 2026-08-02 — framing + provenance + the plan
  shipped; the fetchers need provider keys and licensing decisions

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

  **Remaining:** the fetchers themselves. Deliberately not built here — they need provider
  credentials and the redistribution decisions flagged `check_licence`, which are the owner's (§4.3),
  and those are easier to make against an explicit list of what the packet needs than against a code
  path that quietly produces nothing when a key is missing.

  Original item:
  Parcel-framed captures at fixed scales from: high-resolution current aerial (Esri World Imagery /
  NAIP), Google satellite + **Street View** at each road frontage, oblique/bird's-eye where available,
  and **historical aerials** (USGS EarthExplorer / TNRIS) chosen near the deed date. Every image
  stored as a document with its source, date, scale and licence recorded.
  *Acceptance:* a packet for a rural parcel contains ≥1 current aerial, ≥1 historical aerial within
  10 years of the controlling deed, and Street View at each public road frontage — or a stated reason
  why not.

- **R17. Evidence for everything.** ◑ PART DONE 2026-08-02 — evidence strength + the honest UI
  shipped; pixel regions await vision extraction (R18)

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

- **R18. Shared OCR service with a quality floor.** ◑ PART DONE 2026-08-02 — the quality floor and
  the `unreadable` state shipped; consolidating the two extraction paths remains

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

- **R25. The packet.** ◑ PART DONE 2026-08-02 — the packet, its PDF, versioning and approval
  shipped; the selection UI and embedded page images remain

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

  **Remaining:** the picker UI for choosing and ordering items (the API takes the selection today),
  and embedded page images and drawings in the PDF — it is text-first on purpose, because a packet's
  value is in what it *says* and that is what is readable on a phone in a truck. R24's
  `flattenLayers` is the input when annotated page images are added here.

  Original item:
  A packet builder: choose facts, documents, images, annotations, the gameplan and the conflicts;
  order them; add cover notes; render a single PDF **and** keep the structured version. Versioned,
  with an approver recorded.
  *Acceptance:* a packet PDF opens with a table of contents, and every included document carries its
  provenance line.

- **R26. Packet → job → field crew.** ◑ PART DONE 2026-08-02 — job page and Work Mode shipped; the
  native mobile job view and true offline caching remain

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

  **Remaining:** the native mobile app's job view, and genuine offline access to the documents. The
  snapshot shape was chosen with that in mind — one object per job, no joins — but service-worker
  caching and the mobile surface are their own work, and the device-runtime items in this repo are
  owner-tested on hardware rather than here.

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

- **R28. Request → run, unattended.** ◑ PART DONE 2026-08-02 — the queue, dedupe, atomic claim,
  retry policy and notifications shipped; the worker-side poller remains

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

  **Remaining:** the worker-side poller that calls `claim`, runs the pipeline and reports back via
  `PATCH`. The contract is complete and proven from both ends; what is missing is the loop in the
  worker process, which belongs with R29's concurrency limits rather than being written twice.

  Original item:
  An intake endpoint that accepts a research request (from the AI intake flow in the platform audit's
  D4, from a job, or manually), queues it, runs it to completion within the budget, and notifies on
  finish or failure. This is the owner's "request comes in → server works 20–30 minutes → done".
  *Acceptance:* posting a request with an address and county produces a finished packet with no human
  in the loop, and a notification either way.

- **R29. Concurrency, prioritisation, and back-pressure.** ◑ PART DONE 2026-08-02 — admission,
  per-county serialisation, priority and back-pressure shipped; wiring `pollOnce` into the worker's
  boot remains

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

  **Remaining:** calling `pollOnce` on a timer from the worker's boot, wired to the R28 claim/report
  endpoints. The logic and its limits are proven; what is left is the ten lines that start it, and
  those belong with deploying the box (§4.3, owner).

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

## 4. Decisions that are the owner's, not mine

These block specific slices and must not be guessed:

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
