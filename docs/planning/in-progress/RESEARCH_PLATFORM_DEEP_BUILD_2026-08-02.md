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

- **R3. Runs survive a restart.**
  Move the primary pipeline onto the existing BullMQ queue with Redis-backed state; `activePipelines`
  becomes a projection of the queue, not the source of truth. Persist run state to Postgres
  (`research_runs`: phase, step, started_at, heartbeat_at, cost_so_far, artifacts_written).
  *Acceptance:* kill -9 the worker mid-run; on restart the run resumes or is explicitly marked
  `interrupted` with what it had already paid for and saved.

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

- **R6. Model routing, cheap-first.**
  Adopt `lib/ai/models.ts` in the worker. A router picks by task: OCR/classification → cheapest tier;
  extraction from clean text → mid; handwriting, conflicting calls, gameplan synthesis → top tier.
  Escalate only on low confidence, and record the escalation.
  *Acceptance:* a fixture run shows ≥60% of calls on the cheap tier with no drop in extraction
  accuracy against the golden set (R9).

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

- **R11. County coverage map that reflects reality.**
  `research_county_data_sources` driven by measured canary outcomes, not intent. The UI states, per
  county, what we can read and what we cannot, with a "request this county" action.
  *Acceptance:* a user sees "Bell: full · Coryell: CAD only · Milam: not yet" before starting a run.

- **R12. Politeness and legality budget.**
  Central per-host rate limiter, robots/ToS posture recorded per adapter, honest user agent (the
  probe already does this), and a hard rule that captcha solving is only used where the site's terms
  permit. Record every solve attempt with cost.
  *Acceptance:* two concurrent runs against one county cannot exceed the configured request rate.

### Phase C — Find everything there is to find

- **R13. Paid subscription platforms, first-class.**
  Wire the 8 purchase adapters to real credentials + a per-firm subscription record; add TexasFile,
  TitlePoint/DataTree-class vendors and Regrid parcel data behind the same interface. Every purchase
  writes a receipt row and a usage event (R4), and the cost-ascending order in
  `paid-platform-registry.ts` becomes an enforced policy, not a sort.
  *Acceptance:* a run that needs a $0.50 page records the spend, attaches the PDF, and never
  re-purchases a document already in the library.

- **R14. Full chain of title, to the earliest available instrument.**
  `chain-of-title/chain-builder.ts` exists; drive it to exhaustion — walk grantor/grantee backwards,
  record gaps explicitly, and stop with a stated reason ("clerk index begins 1902").
  *Acceptance:* the packet shows a chain with every link's instrument number, date, and source
  screenshot, plus an explicit list of gaps.

- **R15. Complete plat history.**
  Subdivision plats, replats, vacations, and their amendments; each with a page image and the
  recording data. Cross-link to the lots they create.
  *Acceptance:* for a platted lot the packet contains the governing plat and every later instrument
  that modified it.

- **R16. Imagery pack, per parcel.**
  Parcel-framed captures at fixed scales from: high-resolution current aerial (Esri World Imagery /
  NAIP), Google satellite + **Street View** at each road frontage, oblique/bird's-eye where available,
  and **historical aerials** (USGS EarthExplorer / TNRIS) chosen near the deed date. Every image
  stored as a document with its source, date, scale and licence recorded.
  *Acceptance:* a packet for a rural parcel contains ≥1 current aerial, ≥1 historical aerial within
  10 years of the controlling deed, and Street View at each public road frontage — or a stated reason
  why not.

- **R17. Evidence for everything.**
  Every fetch produces a screenshot + the URL + a timestamp; every extracted fact carries a pointer to
  the page image and the pixel region it came from. This is the difference between "the AI said" and
  "here is the deed, at this line".
  *Acceptance:* clicking any fact in the review UI opens its source image scrolled to the region.

- **R18. Shared OCR service with a quality floor.**
  One OCR entry point (not per-adapter), with confidence per block, automatic escalation to vision for
  low-confidence or handwritten pages, and an explicit "unreadable" state that reaches the UI.
  *Acceptance:* a deliberately blurred page is reported unreadable rather than silently mis-extracted.

### Phase D — The AI actually analyses the property

- **R19. Feature location from documents.**
  Extract and geolocate the property's important features — monuments called for, fence/occupation
  lines mentioned, easements and their widths, ROW takings, water boundaries, adjoiner calls — into a
  typed feature list with coordinates where derivable and confidence throughout.
  *Acceptance:* for a golden-set property the feature list matches the hand-built answer key with a
  stated precision/recall.

- **R20. Conflict finding, stated as questions.**
  Where sources disagree (deed vs plat vs CAD vs occupation visible in imagery), the system states the
  conflict in surveyor's language, with both sources shown, rather than picking a winner silently.
  The existing `cross-validation-engine` + `discrepancy-analyzer` become user-facing.
  *Acceptance:* a known-conflicting property produces the conflict, both citations, and a recommended
  field check.

- **R21. The survey gameplan, persisted and versioned.**
  `generateSurveyPlan()` output becomes a stored, versioned artifact: what to look for, where, in what
  order; monuments to search with search radii; access notes; expected obstacles; equipment; estimated
  field hours; and the open questions from R20. Regenerating creates a new version; the old one stays.
  *Acceptance:* a plan can be regenerated, compared to its predecessor, and edited by a human without
  losing the AI original.

### Phase E — The people using it

- **R22. Run console.**
  One screen for a live run: phase, elapsed vs budget, what it is doing right now, live artifacts
  appearing, cost so far, and a cancel that actually cancels. Replaces guessing at a spinner.
  *Acceptance:* an operator can watch a 25-minute run and know at any moment what it is doing and
  what it has spent.

- **R23. Evidence-first review.**
  Rebuild the review stage around the fact list: every fact with its source thumbnail, confidence, and
  accept/reject/correct. Corrections feed R9's golden set.
  *Acceptance:* a reviewer can accept or correct 50 facts without leaving the screen or losing place.

- **R24. Annotation layers on every document and image.**
  Persist `SourceDocumentViewer`'s markup: `document_annotations` (project, document, page, layer,
  strokes/shapes/text, author, created_at). **The original file is never modified** — the same
  contract `rendered_drawings.user_annotations` already honours. Layers can be toggled, named, and
  exported flattened.
  *Acceptance:* markup survives reload, is attributable to a person, and the original download is
  byte-identical to what was fetched.

- **R25. The packet.**
  A packet builder: choose facts, documents, images, annotations, the gameplan and the conflicts;
  order them; add cover notes; render a single PDF **and** keep the structured version. Versioned,
  with an approver recorded.
  *Acceptance:* a packet PDF opens with a table of contents, and every included document carries its
  provenance line.

- **R26. Packet → job → field crew.**
  Attach the packet to a job (`research_projects.job_id` finally load-bearing), surface it on the job
  page, in Work Mode, and in the mobile app's job view. The crew sees the gameplan and can open any
  document offline.
  *Acceptance:* a field user opens the job and reads the plan without touching the research UI.

- **R27. Re-run diff.**
  Surface `pipeline-diff-engine`: what changed since the last run — new instruments, changed CAD
  values, new imagery. Research is not a one-shot; a job that sits for three months needs this.
  *Acceptance:* a second run on the same property shows an explicit change list, not a new blob.

### Phase F — Intake and scale

- **R28. Request → run, unattended.**
  An intake endpoint that accepts a research request (from the AI intake flow in the platform audit's
  D4, from a job, or manually), queues it, runs it to completion within the budget, and notifies on
  finish or failure. This is the owner's "request comes in → server works 20–30 minutes → done".
  *Acceptance:* posting a request with an address and county produces a finished packet with no human
  in the loop, and a notification either way.

- **R29. Concurrency, prioritisation, and back-pressure.**
  Multiple runs without trampling each other or a county's servers: queue priority, per-county
  serialisation, and a visible backlog.
  *Acceptance:* ten simultaneous requests complete without a rate-limit ban or a memory blow-up.

- **R30. Per-run report card.**
  Every finished run scores itself: sources reached vs available, facts extracted vs expected for that
  property type, conflicts found, cost, wall-clock, and what was skipped and why. This is how "as
  cheap but as effective as possible" becomes a number that can be improved.
  *Acceptance:* two runs on the same property with different budgets can be compared on one screen.

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
