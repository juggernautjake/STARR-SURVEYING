# Self-Healing Adapter System — Planning Document

**Status:** Planning / RFC
**Owner:** Jacob (Starr Software)
**Component:** STARR RECON (Starr Compass) — adapter resilience subsystem; supplements `docs/platform/RECON_INVENTORY.md`, slots into the build phases defined there
**Created:** 2026-04-24
**Last updated:** 2026-04-25
**Target repo path:** `docs/planning/in-progress/Self_healing_adapter_system_plan.md`

---

## 1. Executive summary

STARR RECON depends on dozens of public-records and GIS websites whose DOM structure, workflows, and access controls drift continuously. Today, drift is detected (SiteHealth runs every 30 min by default) but remediation is fully manual. This document specifies an **AI-assisted, value-tiered, budget-bounded self-healing system** that detects adapter breakage, diagnoses the change, generates and tests a candidate fix, validates it against canary properties with known-good ground truth, and either auto-merges (within strict guardrails) or opens a PR with full evidence — always notifying a human regardless of outcome.

The system is built in four phases, each phase delivering standalone value so we can stop at any phase if economics or risk shift. Phase numbering aligns with the project-wide Phase 0/A/B/C/D/E/F/G taxonomy from `docs/platform/RECON_INVENTORY.md` §12 — see §6 below for the mapping.

**Scope.** Self-healing operates on the **worker** (`worker/src/`) only. The Next.js `lib/research/` "lite" pipeline is becoming a thin HTTP client per RECON_INVENTORY §2 and is excluded from auto-repair. The plan also explicitly excludes purchase adapters (`worker/src/services/purchase-adapters/`); money-flow stays human-gated through Phase E.

**Adapter surface area.** The worker exposes 17 read adapters (`worker/src/adapters/`), 8 purchase adapters (`worker/src/services/purchase-adapters/`), and 10 government-source clients (`worker/src/sources/`). Per `docs/planning/in-progress/STARR_RECON/CODE_REVIEW_2026_03_09.md`, only ~5 read adapters are verified end-to-end; the rest are scaffolded. **Self-healing applies to the read-adapter surface only**, and adapters that have never run cleanly are never auto-merge-eligible regardless of tier.

**Headline numbers (target steady state):**

- Routine drift breaks per month: 3–8 (across ~25 verified adapter+source combinations once Phase A's statewide expansion lands)
- AI cost per repair attempt (capped): $1–$25 depending on tier
- Monthly AI ceiling for adapter health (all tiers combined): ~$200–$500
- Engineer time saved vs. fully manual: 60–85% (Phase B), 85–95% (Phase D)
- MTTR (mean time to repair): from current ~4–24h → target <30 min for selector drift, <4h for workflow changes

---

## 2. Goals & non-goals

### Goals
1. Detect adapter breakage within 1 hour of occurrence (vs. discovering it during a customer run)
2. Classify the **kind** of change (selector drift, workflow change, captcha added, redesign) automatically
3. Generate candidate fixes within a per-site budget
4. Validate fixes against ground-truth canary properties before they touch customer traffic
5. Always inform a human; never silently change behavior the customer relies on
6. Track adapter performance continuously, not just at break-time
7. Keep total system cost predictable and capped at every layer

### Non-goals (for v1)
- Fully autonomous "no human ever needed" operation (Phase 4 is research, not a v1 commitment)
- Cross-site agent reasoning ("Bell broke, predict Williamson is next") — nice idea, defer
- Self-discovery of *new* adapters from scratch — out of scope
- Anything that bypasses ToS, CAPTCHA without explicit operator approval, or rate limits

---

## 3. Where we are today (honest assessment)

| Capability | Status | Notes |
|---|---|---|
| Vendor-level adapter architecture | ✅ Built | 17 read adapters in `worker/src/adapters/` (kofile, tyler, henschen, idocket, fidlar, countyfusion, texasfile, bexar, bis, trueautomation, hcad, tad, generic-cad, …). Vendor↔county mapping lives in `cad-registry.ts` and `clerk-registry.ts` (`KOFILE_FIPS_SET`, `HENSCHEN_FIPS_SET`, …). Canonical adapter ids in `KNOWN_ADAPTER_IDS` (`browser-factory.ts`). |
| SiteHealth monitor (30 min default) | ✅ Built | `worker/src/infra/site-health-monitor.ts`. Vendor probes for hcad/tad/bis/trueautomation/tyler/kofile/texasfile; captures screenshots on failure; emits alerts via WebSocket. Cadence is configurable via `startPeriodicChecks(intervalMs)`. **Detects, does not remediate.** |
| Browserbase integration | 🟡 Code complete, stub-default | `worker/src/lib/browser-factory.ts` ships full CDP path with proxy + per-adapter gating (`BROWSERBASE_ENABLED_ADAPTERS`); 36 production call-sites already routed through `acquireBrowser`. Activation is one env-var flip pending paid account (see `PHASE_A_INTEGRATION_PREP.md` §6.1). |
| CapSolver integration | 🟡 Code complete, stub-default | `worker/src/lib/captcha-solver.ts` + `captcha-solver-http.ts`; 3-strike retry + escalation, Redis cache, pluggable `SolveAttemptSink`, supports Turnstile / reCAPTCHA v2 / v3 / Enterprise / hCaptcha / DataDome. Activation requires applying `seeds/201_captcha_solves.sql` (currently held) and provisioning the paid account. |
| Anthropic API key + cost tracking | ✅ Wired | Worker uses Anthropic for vision/extraction. `worker/src/lib/ai-usage-tracker.ts` already implements an in-process circuit breaker (rate, cost-per-window, consecutive-failure caps) with a `getGlobalAiTracker()` singleton. **Self-healing extends this tracker — does not replace it** (see §5.1). |
| Regression fixture suite | 🟡 Scaffold built | `worker/src/__tests__/regression/regression-runner.ts` + 1 synthetic fixture under `fixtures/synthetic/` (Phase 0 deliverable). Per-field tolerance (exact / numeric± / fuzzy / list-set) implemented. Phase A grows to 5 real fixtures from Starr filing cabinet; Phase B → 15; Phase D → 50 (RECON_INVENTORY §11). |
| Canary test properties | ❌ Not built | Distinct from regression fixtures: canaries probe **live** sites with known-good ground-truth; fixtures replay captured HTML offline. Critical missing piece — see §5.3. |
| Per-job telemetry (success, completeness, duration) | 🟡 Partial | Job-level fields exist on `research_projects`; `pipeline-version-store.ts` snapshots whole pipelines; research-events bus (`worker/src/shared/research-events.ts`, zod-validated, 8 event types) pipes live progress to the UI via `useResearchProgress`. **No per-adapter aggregation, no 5-min rollups, no degradation alerting.** |
| Per-site cost budgets | ❌ Not built | Foundational for this entire plan. Will extend `AiUsageTracker` config rather than introducing a parallel budget enforcer. |
| Auto-PR generation | ❌ Not built | GitHub Actions already in use (`.github/`); auto-PR jobs land there in Phase A. |
| Canary deployment / progressive rollout | ❌ Not built | All deploys today are 100% cutover. |
| Adapter version pinning | ❌ Not built | `worker/src/services/pipeline-version-store.ts` versions whole-pipeline snapshots, not individual adapters — different granularity. New `adapter_versions` table required (§5.1); reuse `pipeline-diff-engine.ts` for delta computation rather than reimplementing. |
| Incident timeline / post-mortem generation | ❌ Not built | |
| Two parallel pipelines (lib/research lite + worker) | 🟡 Known | Self-healing operates on worker only. `lib/research/` becomes a thin HTTP client per RECON_INVENTORY §2; not in repair scope. |

**Critical insight:** we have detection but not response. The work below is mostly *response infrastructure*, with detection improvements layered on. We also have **substantial Phase A scaffolding** already shipped (browser/captcha/storage abstractions, AI cost tracking, regression-runner) — self-healing slots into those abstractions rather than competing with them.

---

## 4. Core concepts

### 4.1 Adapter value tiers

Every adapter is assigned a tier that determines its cost budget, repair urgency, and rollout caution. Tier is a function of (a) job demand (how often surveyors hit it), (b) data uniqueness (can we get it elsewhere?), (c) revenue impact, (d) closure-blast-radius (does failure leave a Bell-area surveyor stuck?).

| Tier | Label | Examples (real adapter ids) | Repair budget per incident | SLA target | Auto-merge eligible? |
|---|---|---|---|---|---|
| T0 | **Critical** | `bis` (Bell-CAD, FIPS 48027), `kofile-clerk` (Bell County Clerk, `bell.tx.publicsearch.us`), `bell-cad-arcgis` (parcel layer in `bell-cad-arcgis.service.ts`) | $25 | 1h | Selector drift only, with Jacob notified twice (Slack + email) |
| T1 | **High** | `texasfile` (statewide fallback), `txdot-roadways-client` (TxDOT RPAM), `rrc-client` (Railroad Commission), `bis` (Hays-CAD FIPS 48209, Williamson FIPS 48491) | $10 | 4h | Selector drift only, Slack only |
| T2 | **Medium** | Adjacent-county clerks (`countyfusion`, `henschen-clerk`, `idocket-clerk`, `fidlar-clerk` outside Bell-area FIPS), `fema-nfhl-client`, `glo-client` | $5 | 24h | Never — PR only |
| T3 | **Low** | Source clients hit <1×/month, optional enrichment (`tceq-client`, `nrcs-soil-client`, `usgs-client`, `tnris-lidar-client`) | $1 | Best-effort | Never — PR only |

Tiers are stored on the `adapter_manifests` Supabase table (§5.1), keyed by the adapter ids in `KNOWN_ADAPTER_IDS` (`worker/src/lib/browser-factory.ts`). Vendor↔county coverage is **not duplicated** in the DB — it is derived from `cad-registry.ts` and `clerk-registry.ts` (`KOFILE_FIPS_SET`, `HENSCHEN_FIPS_SET`, etc.). Those TS modules remain the canonical mapping; the DB row stores tier, budget, current/active version, and live counters only. This avoids a third source of truth that would drift instantly.

Tiers are **reviewed quarterly** based on telemetry: an adapter no surveyor has hit in 90 days drops a tier; an adapter blocking a high-revenue job gets promoted. Bell County adapters are pinned at T0 regardless of telemetry — this is Starr's home county and must never be unavailable during business hours.

#### 4.1.1 Vendor-fan-out tier (orthogonal to county tier)

Many adapters fan out across counties: **Kofile covers ~80 counties** (`KOFILE_FIPS_SET` in `clerk-registry.ts`), Henschen ~40, Tyler ~30, CountyFusion ~40, Fidlar ~15. A vendor-base regression breaks every county under it simultaneously — and Kofile in particular is a single-point-of-failure for the entire Texas Hill Country and DFW clerk surface.

**Vendor-tier rules:**

- **Vendor tier** = `max(county_tier for every FIPS in the vendor's set)`. So `kofile-clerk` is T0 (because Bell is in `KOFILE_FIPS_SET`); `henschen-clerk` is T1 if any T1 county uses Henschen, otherwise T2.
- **Per-incident budget for a vendor-base patch** = `min($50, sum(top-3 affected county budgets))`. Caps catastrophic spend while still funding multi-county fixes.
- **Vendor-base patches are never auto-merge-eligible**, regardless of confidence. The blast radius is too large; PR-only with explicit human ack.
- **Canary requirement** for vendor-base patches: must pass on **≥3 distinct counties** in the vendor's FIPS set, including at least one T0 county if the vendor covers any. Single-county canaries do not certify a vendor change.
- The **blast-radius checker** (§5.2) enumerates downstream FIPS via `KOFILE_FIPS_SET` etc. and posts the explicit list to the PR.

This is the most important risk-management concept in the plan — without it, the cost model in §7 Scenario C double-counts every Kofile fix 80 times, and a single bad vendor patch can break property research statewide.

### 4.2 Per-site cost budgets (your idea, formalized)

Three nested budgets enforce cost discipline:

1. **Per-incident cap** — single repair attempt cannot exceed Tier budget (table above). If exceeded, attempt halts and human is notified.
2. **Per-site monthly cap** — `tier_budget × 4` per adapter per calendar month. Prevents one perpetually-broken site from draining the budget.
3. **Global daily cap** — `$50/day` hard ceiling across all adapters. Circuit breaker if breached.

Every Claude API call is tagged with `adapter_id`, `incident_id`, `phase` (diagnose / repair / validate). Costs roll up in Supabase in real time. Budget enforcement happens *before* each call, not after.

### 4.3 Canary test properties (the ground-truth backbone)

For each adapter, we pin **2–3 real properties** in that jurisdiction whose extracted data we know to be correct. These are the "known answers" the system regression-tests against.

A canary property record contains:

**Identity**
- `parcel_id` / `account_number`
- `jurisdiction` (FIPS code from `clerk-registry.ts`)
- `expected_address`

**Generic extraction signals**
- `expected_owner_name` (regex-tolerant)
- `expected_legal_description` (substring match, since formatting varies)
- `expected_acreage` (±0.01 tolerance)
- `expected_deed_count` (range, e.g., 3–6)
- `expected_field_completeness_pct` (e.g., owner+legal+acreage must populate)

**Surveyor-specific signals (the ones that matter for the product contract)**
- `expected_closure_ratio` — must be ≥1:5,000 per `docs/platform/CLOSURE_TOLERANCE.md`. A patch that fixes the selector but corrupts bearing/distance parsing flunks this. Falls into the hard-fail bucket of `worker/src/lib/closure-tolerance.ts`.
- `expected_bearings` — list of expected bearings, validated by `worker/src/infra/ai-guardrails.ts` `validateBearing()`. Catches silent format-drift (e.g., `°` lost, seconds dropped).
- `expected_chain_of_title_count` (range) — protects deed-walking regressions.
- `expected_adjoiner_count` (range) — protects adjacent-property pipeline regressions (Phase 5).

**Provenance**
- `last_validated_at` and `last_validated_by` (so we know when a human last confirmed the truth)
- `next_revalidation_at` (default `last_validated_at + 90 days` — re-confirm with human eyes quarterly)
- `tolerance_rules` (JSONB) — uses the same `ToleranceField` shape (`exact | numeric± | fuzzy | list-set`) as `worker/src/__tests__/regression/regression-runner.ts`. **One comparator across canaries and fixtures** — no second tolerance engine.

**Why 2–3 per adapter, not 1:** single canaries can give false negatives (e.g., a property that happens to have an unusual deed). With 3, we require ≥2 to pass for the adapter to be considered green.

**Why surveyor-specific fields matter:** STARR RECON's product contract is "geometry that closes" not "JSON that parses." A regression that returns the right owner string but feeds garbage bearings into `traverse-closure.ts` triggers the 1:5,000 hard fail downstream and looks like a different bug entirely. Catching it at the canary boundary saves hours of triage.

**Canary execution:**
- Automatically re-run on every SiteHealth tick when an adapter is flagged unhealthy
- Re-run weekly even when healthy (catches silent regressions)
- Re-run on demand before any auto-merge
- Vendor-base canaries (§4.1.1) run on ≥3 distinct counties before any vendor patch promotes

### 4.4 Confidence scoring

Every candidate fix gets a 0–100 confidence score. Surveyor-specific signals are first-class — the product contract is geometry, not strings.

| Signal | Weight | Source |
|---|---|---|
| All canary properties pass (≥2 of 3 per §4.3) | 35 | live probe, §4.3 |
| **Closure-ratio regression check passes** (canaries with `expected_closure_ratio` produce ratios within tolerance after the fix) | 10 | `worker/src/lib/closure-tolerance.ts` |
| **Bearing-validator pass rate ≥ pre-fix baseline** (`validateBearing()` over canary outputs) | 5 | `worker/src/infra/ai-guardrails.ts` |
| Diff scope (smaller = higher) | 15 | git stat |
| Change type (selector_drift > workflow_change > redesign) | 10 | classifier (§5) |
| Fixture regression suite passes (`worker/src/__tests__/regression/`) | 10 | offline replay |
| Live probe latency within historical p95 | 5 | telemetry |
| **No new npm dependencies AND patch respects `acquireBrowser` / `getCaptchaSolver` / `storage` abstractions** | 5 | AST lint (§5.2 guardrail) |
| AI self-reported confidence | 3 | classifier |
| Adapter historical stability (rolling 90d incident count) | 2 | telemetry |

Auto-merge thresholds (only for T0/T1, `selector_drift` only, **never for vendor-base patches** per §4.1.1):
- ≥85: eligible for auto-merge
- 60–84: PR opens, human reviews with score and evidence attached
- <60: PR opens, marked `needs_investigation`, tagged for on-call

**Why these weights changed from the original draft:** AI self-reported confidence is the lowest-signal item in the published agentic-coding literature, so it's down-weighted from 5 to 3. The two new surveyor-specific signals (closure regression, bearing validator) are scored first-class because a patch that breaks them silently triggers downstream traverse-closure failures that look like unrelated bugs. The "abstractions respected" check is moved out of the prose and into the score so it can't be hand-waved past — and it's enforced at the AST-lint layer (§5.2) so the score reflects a real check, not the model's word.

### 4.5 Customer-traffic-aware monitoring

Every customer research request flows through an adapter. We log per-attempt:
- adapter_id + version
- result_status (success / partial / failure / timeout)
- field_completeness (what % of expected fields came back populated)
- time_to_complete
- customer_id (for blast-radius math)

Aggregations refreshed every 5 minutes feed:
- The adapter health dashboard
- Tier review (moves an adapter up/down by demand)
- Anomaly detection ("adapter X completeness dropped from 94% to 71% in the last hour" → page someone, even if SiteHealth is green)

This is more sensitive than SiteHealth: SiteHealth catches "adapter is broken." Telemetry catches "adapter is degrading." Both matter.

### 4.6 Always-notify-human principle

Even when AI auto-merges, a human is notified with full incident packet within 60 seconds. The notification includes:
- Incident ID + timestamp
- Adapter, tier, change type, confidence score
- Diff that was merged
- Canary results + screenshots (before/after)
- Cost spent
- Rollback command (one-click)
- "Validate" button that pulls the fix into a local sandbox for manual replay

Auto-merge ≠ auto-trust. Auto-merge means "the system is confident enough to keep customers unblocked while you double-check." A human still validates within the SLA window or the change auto-rolls-back.

### 4.7 Auto-rollback (the safety net for auto-merge)

Every auto-merged adapter version enters a 24h "probation" period:
- Routes 10% of traffic for the first hour (canary deploy)
- Promotes to 50% after 1h of clean telemetry
- Promotes to 100% after 4h
- During the entire 24h, if completeness drops below the pre-merge baseline by >5%, instant auto-rollback to previous version + page on-call

Adapter version pinning is a new `adapter_versions` table (one row per `(adapter_id, version)`, defined in §5.1) that makes rollback a config change, not a code deploy. Routing reads `adapter_manifests.active_version` at adapter-construct time; flipping that column reverts production traffic in <1s. **Reuse the diff/replay machinery in `worker/src/services/pipeline-diff-engine.ts`** to compute pre/post-rollback deltas — that engine already exists for whole-pipeline versioning (`pipeline-version-store.ts`); the only delta is granularity. Do not implement a second diff engine.

---

## 5. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DETECTION LAYER                                │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐    │
│  │ SiteHealth     │  │ Per-job        │  │ Scheduled canary     │    │
│  │ (30 min default│  │ telemetry      │  │ probes (weekly)      │    │
│  │  selector probe│  │ (5-min view)   │  │                      │    │
│  └────────┬───────┘  └────────┬───────┘  └──────────┬───────────┘    │
└───────────┼───────────────────┼─────────────────────┼────────────────┘
            ▼                   ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     INCIDENT ORCHESTRATOR                             │
│  • Dedupes signals                                                    │
│  • Creates incident record (Supabase: adapter_incidents)              │
│  • Looks up adapter tier + budget                                     │
│  • Routes to Diagnosis or directly to human (Tier 2/3 = PR-only)      │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       DIAGNOSIS LAYER                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐    │
│  │ Page capture │ →  │ DOM diff vs.     │ →  │ Change classifier│    │
│  │ (Browserbase │    │ last-known-good  │    │ (Claude)         │    │
│  │  HTML+PNG)   │    │ snapshot         │    │ → drift|workflow │    │
│  └──────────────┘    └──────────────────┘    │   |captcha|...   │    │
│                                              └────────┬─────────┘    │
└────────────────────────────────────────────────────────┼─────────────┘
                                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        REPAIR LAYER                                   │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Strategy ladder (cheapest → most expensive):                 │    │
│  │  1. Try multi-selector fallbacks already in code (free)      │    │
│  │  2. Generate new selector from screenshot (Sonnet, ~$0.10)   │    │
│  │  3. Diff-and-patch adapter code (Sonnet, ~$1)                │    │
│  │  4. Rewrite affected adapter section (Opus, ~$5)             │    │
│  │  5. Full adapter rewrite from spec + page (Opus, ~$15-25)    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  Each rung respects the per-incident budget; halts when exceeded.    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      VALIDATION LAYER                                 │
│  • Run candidate against fixture regression suite (offline)          │
│  • Run candidate against canary properties (live, in Browserbase)    │
│  • Compare extracted data to ground truth                            │
│  • Compute confidence score                                          │
│  • Run blast-radius check (does shared utility change touch others?) │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT LAYER                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐    │
│  │ Auto-merge gate      │    │ PR generation                    │    │
│  │ • Tier 0/1 + drift   │ OR │ • All other cases                │    │
│  │ • Confidence ≥85     │    │ • Title, body, screenshots, diff │    │
│  │ • Canary 100% pass   │    │ • Tagged for on-call             │    │
│  └──────────┬───────────┘    └────────────┬─────────────────────┘    │
└─────────────┼─────────────────────────────┼──────────────────────────┘
              ▼                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  PROGRESSIVE ROLLOUT + MONITORING                     │
│  10% → 50% → 100% over 4h, with auto-rollback on regression          │
│  Always-notify-human (Slack/email/SMS by tier)                       │
│  Incident closes only when human confirms                            │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.1 Data model (new Supabase tables)

**Migration file:** `seeds/202_adapter_self_healing.sql` — `200_recon_graph.sql` and `201_captcha_solves.sql` are already in place; 202 is the next free slot. Follows the project's seed conventions: `BEGIN; … COMMIT;` wrapper, `CREATE TABLE IF NOT EXISTS`, `ADD CONSTRAINT IF NOT EXISTS` via `DO $$ … END $$` blocks (see `seeds/201_captcha_solves.sql` for the exact pattern). Re-applying the migration in CI restore drills must be idempotent.

```sql
-- ============================================================================
-- 202_adapter_self_healing.sql
-- STARR RECON — self-healing adapter system (Phase 0 foundation)
--
-- Tables added:
--   adapter_manifests   — per-adapter tier, budgets, active version
--   adapter_versions    — one row per (adapter_id, version) for pinning/rollback
--   canary_properties   — live ground-truth probes (§4.3)
--   adapter_incidents   — detected drift, repair lifecycle, artifacts
--   adapter_telemetry   — per-attempt success/completeness signal (high volume)
--   ai_cost_ledger      — persistence sink for AiUsageTracker
--
-- Migration is held until §6 Phase 0 ships; do NOT apply against production
-- before the tier-assignment audit completes (see §13 bootstrapping).
-- ============================================================================

BEGIN;

-- ── Adapter manifest ────────────────────────────────────────────────────────
-- Keyed by KNOWN_ADAPTER_IDS (worker/src/lib/browser-factory.ts). Vendor↔county
-- mapping is NOT duplicated here — it lives in cad-registry.ts and
-- clerk-registry.ts (KOFILE_FIPS_SET, etc.). This row stores tier, budget,
-- and version pointers only. See §4.1.
CREATE TABLE IF NOT EXISTS adapter_manifests (
  adapter_id              TEXT PRIMARY KEY,
  vendor                  TEXT NOT NULL,         -- 'kofile' | 'tyler' | 'henschen' | …
  -- Coverage hint only; canonical mapping is the FIPS sets in clerk-registry.ts.
  -- Stored here so the dashboard can render "this adapter covers N counties"
  -- without importing TS modules.
  jurisdictions_hint      JSONB,                 -- ['48027','48309',…] FIPS list
  tier                    SMALLINT NOT NULL,     -- 0..3 (§4.1)
  -- Vendor-fan-out tier (§4.1.1). Stored separately because vendor tier may
  -- exceed any single county's tier when the vendor covers a T0 county.
  vendor_tier             SMALLINT NOT NULL,
  current_version         INT NOT NULL DEFAULT 1,
  active_version          INT NOT NULL DEFAULT 1,  -- routing reads this column
  budget_per_incident_usd NUMERIC(6,2) NOT NULL,
  budget_monthly_usd      NUMERIC(6,2) NOT NULL,
  monthly_spent_usd       NUMERIC(8,4) NOT NULL DEFAULT 0,
  monthly_spent_reset_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()),
  -- Auto-merge eligibility. Even when the score qualifies, this flag must be
  -- true. Defaults false; promotions are manual + audited (§4.1, §4.7).
  auto_merge_eligible     BOOLEAN NOT NULL DEFAULT false,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adapter_manifests_tier_chk') THEN
    ALTER TABLE adapter_manifests
      ADD CONSTRAINT adapter_manifests_tier_chk CHECK (tier BETWEEN 0 AND 3);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adapter_manifests_vendor_tier_chk') THEN
    ALTER TABLE adapter_manifests
      ADD CONSTRAINT adapter_manifests_vendor_tier_chk CHECK (vendor_tier BETWEEN 0 AND 3);
  END IF;
END $$;

-- ── Adapter versions ────────────────────────────────────────────────────────
-- One row per (adapter_id, version). Routing reads adapter_manifests.active_version
-- at adapter-construct time; rollback is a single UPDATE, not a code deploy.
CREATE TABLE IF NOT EXISTS adapter_versions (
  adapter_id   TEXT NOT NULL REFERENCES adapter_manifests(adapter_id),
  version      INT  NOT NULL,
  code_hash    TEXT NOT NULL,                    -- git blob hash of the adapter file
  -- 'human:<github_login>' or 'ai:<incident_id>'. Used by the dashboard and
  -- by §11 decision-log entries.
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  rollout_pct  SMALLINT NOT NULL DEFAULT 0,      -- 0,10,50,100 per §4.7
  status       TEXT NOT NULL,                    -- 'draft'|'canary'|'live'|'retired'|'rolled_back'
  -- Set when status becomes 'rolled_back'. Backfilled by the rollback worker.
  rollback_reason TEXT,
  PRIMARY KEY (adapter_id, version)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adapter_versions_status_chk') THEN
    ALTER TABLE adapter_versions
      ADD CONSTRAINT adapter_versions_status_chk
        CHECK (status IN ('draft','canary','live','retired','rolled_back'));
  END IF;
END $$;

-- ── Canary properties (live ground truth, §4.3) ─────────────────────────────
CREATE TABLE IF NOT EXISTS canary_properties (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id           TEXT NOT NULL REFERENCES adapter_manifests(adapter_id),
  jurisdiction_fips    TEXT NOT NULL,            -- '48027' for Bell, etc.
  parcel_id            TEXT NOT NULL,
  -- Full surveyor-aware shape per §4.3:
  --   { owner, legal_description, acreage, address, deed_count,
  --     closure_ratio, bearings, chain_of_title_count, adjoiner_count, … }
  expected_data        JSONB NOT NULL,
  -- ToleranceField shape from worker/src/__tests__/regression/regression-runner.ts.
  -- Same comparator across canaries and offline fixtures — no second engine.
  tolerance_rules      JSONB NOT NULL,
  last_validated_at    TIMESTAMPTZ,
  last_validated_by    TEXT,
  next_revalidation_at TIMESTAMPTZ NOT NULL,     -- default: last_validated_at + 90d
  active               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canary_properties_adapter
  ON canary_properties (adapter_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_canary_properties_revalidation
  ON canary_properties (next_revalidation_at) WHERE active;

-- ── Incidents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS adapter_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id      TEXT NOT NULL REFERENCES adapter_manifests(adapter_id),
  -- For vendor-base incidents (§4.1.1), this lists the downstream FIPS that
  -- the blast-radius checker enumerated. Empty for single-county incidents.
  affected_fips   JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by     TEXT NOT NULL,                 -- 'sitehealth'|'telemetry'|'canary'|'human'
  change_type     TEXT,                          -- selector_drift|workflow_change|captcha|redesign|unknown
  status          TEXT NOT NULL DEFAULT 'open',  -- open|diagnosing|repairing|validating|merged|rolled_back|closed_no_fix
  budget_cap_usd  NUMERIC(6,2) NOT NULL,
  spent_usd       NUMERIC(8,4) NOT NULL DEFAULT 0,
  confidence_score SMALLINT,                     -- 0..100, §4.4
  resolution      TEXT,                          -- auto_merged|pr_opened|human_only|abandoned
  resolved_at     TIMESTAMPTZ,
  -- { html_capture_key, screenshot_key, diff_key, … } — keys inside
  -- worker/src/lib/storage.ts namespace (R2 in prod, local in dev).
  artifacts       JSONB NOT NULL DEFAULT '{}'::jsonb
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adapter_incidents_status_chk') THEN
    ALTER TABLE adapter_incidents
      ADD CONSTRAINT adapter_incidents_status_chk
        CHECK (status IN ('open','diagnosing','repairing','validating','merged','rolled_back','closed_no_fix'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_adapter_incidents_open
  ON adapter_incidents (adapter_id, detected_at DESC) WHERE status NOT IN ('merged','closed_no_fix');

-- ── Telemetry (highest-volume table) ────────────────────────────────────────
-- Volume estimate: ~1k rows/day at current job volume; plan for 100k/day at
-- 50-customer scale (Phase F). Phase B writes raw rows; Phase D adds the
-- materialized 5-min view (adapter_telemetry_5m, defined out-of-band) and a
-- daily roll-up. Raw rows TTL at 14 days via a scheduled DELETE — surveys
-- never need raw per-attempt history past two weeks.
CREATE TABLE IF NOT EXISTS adapter_telemetry (
  id               BIGSERIAL PRIMARY KEY,
  ts               TIMESTAMPTZ NOT NULL DEFAULT now(),
  adapter_id       TEXT NOT NULL,
  adapter_version  INT NOT NULL,
  -- research_projects.created_by — the surveyor/researcher who owns the job.
  -- See lib/research/useResearchProgress.ts and /api/ws/ticket ownership check.
  job_owner        UUID,
  job_id           UUID,
  status           TEXT NOT NULL,                -- success|partial|failure|timeout
  field_completeness_pct NUMERIC(5,2),
  duration_ms      INT,
  error_class      TEXT
);

CREATE INDEX IF NOT EXISTS idx_adapter_telemetry_adapter_ts
  ON adapter_telemetry (adapter_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_adapter_telemetry_status
  ON adapter_telemetry (adapter_id, status, ts DESC);

-- ── AI cost ledger ──────────────────────────────────────────────────────────
-- This table is the **persistence sink** for worker/src/lib/ai-usage-tracker.ts.
-- The in-process AiUsageTracker keeps the circuit-breaker (rate, cost, failure
-- caps) hot in memory; this table is for attribution, dashboards, and monthly
-- budget rollups. Wiring follows the SolveAttemptSink pattern in
-- worker/src/lib/captcha-solver.ts: pluggable interface, no-op default in
-- stub mode, real Supabase writer when ENABLED.
--
-- The Phase 0 deliverable extends AiUsageEntry with (incident_id, adapter_id,
-- phase, model) so every Anthropic call rolls up here without a separate
-- tagging system.
CREATE TABLE IF NOT EXISTS ai_cost_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  incident_id   UUID REFERENCES adapter_incidents(id),
  adapter_id    TEXT,
  phase         TEXT NOT NULL,                   -- diagnose|repair|validate|extract|other
  model         TEXT NOT NULL,                   -- claude-sonnet-4-6, claude-opus-4-7, …
  input_tokens  INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_usd      NUMERIC(10,6) NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_cost_ledger_phase_chk') THEN
    ALTER TABLE ai_cost_ledger
      ADD CONSTRAINT ai_cost_ledger_phase_chk
        CHECK (phase IN ('diagnose','repair','validate','extract','other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_ts ON ai_cost_ledger (ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_incident ON ai_cost_ledger (incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_adapter ON ai_cost_ledger (adapter_id, ts DESC) WHERE adapter_id IS NOT NULL;

COMMIT;
```

**Key extension to `worker/src/lib/ai-usage-tracker.ts`:** add `incidentId`, `adapterId`, `phase`, and `model` fields to `AiUsageEntry`, plus a pluggable `CostLedgerSink` (mirroring `SolveAttemptSink` in `captcha-solver.ts`). Default sink is a no-op (Phase 0 ships sink + DB tagging behind a flag); the Supabase writer flips on when `seeds/202_*` is applied. **Circuit-breaker logic stays in-process** — the ledger is for attribution, never for budget enforcement decisions.

### 5.2 The repair strategy ladder (detail)

Always start at the cheapest rung that has a chance of working. Sonnet handles rungs 2–3; Opus is reserved for rungs 4–5.

```python
# Models follow the system-prompt's "default to latest and most capable":
#   Sonnet 4.6 = 'claude-sonnet-4-6'    (cost: ~$0.006/1K tokens averaged,
#                                        per SONNET_COST_PER_1K_TOKENS in
#                                        worker/src/lib/ai-usage-tracker.ts)
#   Opus 4.7  = 'claude-opus-4-7'       (verify current pricing via
#                                        /mnt/skills/public/product-self-knowledge/
#                                        before activating Phase A)
# Action item for Phase 0: bump RESEARCH_AI_MODEL in .env.example from the
# stale 'claude-sonnet-4-5-20250929' default to 'claude-sonnet-4-6'.

budget_remaining = incident.budget_cap_usd
strategies = [
    multi_selector_fallback,       # ~$0.00 — already in adapter code
    vision_selector_inference,     # ~$0.10 — Sonnet reads screenshot, returns selectors
    targeted_code_patch,           # ~$1.00 — Sonnet reads adapter + page, outputs diff
    section_rewrite,               # ~$5.00 — Opus rewrites affected function(s)
    full_adapter_rewrite,          # ~$15-25 — Opus rebuilds adapter from spec
]
for strategy in strategies:
    estimated_cost = strategy.estimate(incident)
    if estimated_cost > budget_remaining:
        break
    candidate = strategy.run(incident)
    budget_remaining -= candidate.actual_cost
    if not respects_abstractions(candidate):       # AST lint, see §5.2.1
        continue                                   # do not waste validation budget
    if validate(candidate) >= confidence_threshold(adapter.tier):
        return candidate
return abandon_with_human_handoff(incident)
```

Why a ladder and not "always use the best model": cost. Selector drift is 80% of breaks and the cheapest rung handles it. Reserving Opus for actual redesigns keeps monthly spend predictable.

#### 5.2.1 Hard preconditions on every candidate patch

The Phase A migration to Browserbase / CapSolver / R2 / structured progress events only works if every adapter routes through the four shared abstractions. An AI-generated patch that bypasses any of them silently de-features the entire stack — no proxy routing, no CDP, no telemetry, no progress UI. To prevent this, every candidate is rejected **before validation** if any of these checks fail:

1. **Browser acquisition** must use `acquireBrowser({ adapterId })` from `worker/src/lib/browser-factory.ts`. Direct `chromium.launch()` calls are rejected. (36 production call-sites already comply per `PHASE_A_INTEGRATION_PREP.md` §0.)
2. **CAPTCHA solving** must use `getCaptchaSolver()` from `worker/src/lib/captcha-solver.ts`. Direct HTTP to `api.capsolver.com` or other providers is rejected.
3. **Artifact writes** must use `worker/src/lib/storage.ts`. Bare `fs.writeFile`, `fs.mkdirSync`, or ad-hoc Supabase Storage calls are rejected.
4. **Progress events** must emit via `worker/src/lib/research-events-emit.ts`. Console-only logging is allowed but does not satisfy the requirement on its own.
5. **No new npm dependencies.** A `package.json` diff is an automatic rejection.
6. **No edits** to: `worker/src/lib/closure-tolerance.ts`, `worker/src/infra/ai-guardrails.ts`, anything under `worker/src/shared/`, or any file under `worker/src/services/purchase-adapters/` (money-flow stays human-gated through Phase E).
7. **Selector arrays may only be appended to**, never reduced. Old selectors stay in place as fallbacks unless the change-classifier explicitly identifies them as removed-by-vendor.

Enforcement is a small AST lint (`worker/src/__tests__/lint-adapter-patches.ts`, new in Phase B) that runs immediately after the model returns and before any cost is spent on validation. A rejection here is appended to the incident's `artifacts.lint_failures` and counts toward the per-incident budget at $0.00 — the patch is discarded and the next rung executes.

This guardrail is also reflected in the confidence scoring (§4.4 row "abstractions respected") and in the prompts themselves (Appendix A.2) so the model rarely emits a violating patch in the first place.

### 5.3 Canary property catalog — bootstrapping

For each active adapter, we need a one-time human investment of ~30 min to:

1. Pick 2–3 real, stable properties in that jurisdiction (avoid recently-sold, avoid disputed boundaries, prefer properties with clean closure that have been surveyed by Starr — those overlap directly with the regression-fixture growth path in `RECON_INVENTORY.md` §11).
2. Run the adapter manually against each property; copy structured output into `canary_properties.expected_data`. Capture the **surveyor-aware** fields per §4.3: closure ratio from `traverse-closure.ts`, parsed bearings (each one runs through `validateBearing()`), chain-of-title count, adjoiner count.
3. Hand-review for accuracy — ideally with Hank Maddux or another RPLS at Starr eyeballing the legal description and acreage.
4. Set `next_revalidation_at = last_validated_at + 90 days`.

**Artifact storage.** Canary capture artifacts (HTML snapshots, full-page screenshots, network HARs for hard cases) live in **Cloudflare R2** via `worker/src/lib/storage.ts`. Namespace: `canaries/<adapter_id>/<canary_id>/<iso8601_ts>/`. Bucket lifecycle and CORS rules are governed by `docs/platform/STORAGE_LIFECYCLE.md` — keep one capture per canary per week for 90 days, then thin to monthly. R2 backend is selected via `STORAGE_BACKEND=r2`; in dev (`STORAGE_BACKEND=local`) artifacts go to `./storage/canaries/...`. **Never write directly with `fs.writeFile`** — the §5.2.1 lint will reject it.

**Bootstrap math.** Phase 0 ships canaries for the **5 verified end-to-end adapters first** (~2.5 hours work — half a day). Phase A grows to all T0/T1 adapters (~12 hours total across ~25 adapter+source combinations). Phase D adds canaries for the remaining T2/T3 adapters as they harden.

**This is the single highest-leverage investment in the entire plan.** Without canaries, every AI fix is shipping into the dark — the confidence score (§4.4) collapses to noise, and the auto-merge gate (§4.7) never has a basis for trust.

---

## 6. Phased build plan

This plan maps onto the project-wide phase taxonomy in `docs/platform/RECON_INVENTORY.md` §12 — **one calendar, not two.** Each section below names its parent project phase, the activation gate (what external dependency unlocks it), and the self-healing deliverables that ship inside that phase. Time-windows are guidance only; the actual gates are the activation conditions, not weeks.

| Self-healing milestone | Project phase | Activation gate |
|---|---|---|
| Foundation (manifests, canaries, cost-ledger sink) | **Phase 0** | None — local work only |
| AI-assisted manual repair (PR generation) | **Phase A** | Hetzner + R2 + Browserbase + CapSolver provisioned |
| Validated AI fixes, human-merge | **Phase B** | Phase A smoke-tested; regression set grown 5 → 15 |
| Conditional auto-merge | **Phase D** | Phase B has run 30+ days clean; canary set 15 → 50 |
| Predictive + cross-vendor learning | **Phase E+** | Phase D has run 6 months clean |

---

### 6.1 Phase 0 — Foundation (this PR scope, no external accounts)

Lives alongside the rest of the Phase 0 deliverables in RECON_INVENTORY §12 (version pinning, Dockerfile, schema migrations, regression scaffold). All work is local — no Browserbase, CapSolver, or R2 activation.

**Already shipped (do not redo):**
- `worker/src/lib/ai-usage-tracker.ts` with circuit breaker (rate / cost / consecutive-failure caps)
- `worker/src/__tests__/regression/regression-runner.ts` + 1 synthetic fixture
- `worker/src/lib/storage.ts` with R2 + local backends
- `worker/src/infra/site-health-monitor.ts` (30-min cadence, screenshot-on-failure, WebSocket alerts)
- `worker/src/lib/browser-factory.ts` and `captcha-solver.ts` in stub-default mode

**Phase 0 self-healing deliverables:**
- [ ] `seeds/202_adapter_self_healing.sql` (held; do not apply yet)
- [ ] Tier assignment audit: assign T0/T1/T2/T3 + `vendor_tier` for every id in `KNOWN_ADAPTER_IDS`. Output: a one-page table reviewed by Jacob and committed under `docs/platform/`.
- [ ] Hand-built canary for **`bis` (Bell-CAD, FIPS 48027)** — one property, full surveyor-aware shape (closure ratio, bearings, chain of title, adjoiners). Serves as the template for the Phase A bulk-add.
- [ ] Extend `AiUsageEntry` in `ai-usage-tracker.ts` with `incidentId`, `adapterId`, `phase`, `model`. Add a `CostLedgerSink` interface mirroring `SolveAttemptSink` from `captcha-solver.ts`. Default sink is no-op; the Supabase writer flips on at Phase A activation.
- [ ] Alert dedup: route SiteHealth alerts (`SiteAlert` from `site-health-monitor.ts`) into a placeholder incident orchestrator that creates one `adapter_incidents` row per (adapter_id, change_type) inside a 30-min window. Holding pattern only — no AI calls yet.
- [ ] Bump `RESEARCH_AI_MODEL` default in root and worker `.env.example` from `claude-sonnet-4-5-20250929` to `claude-sonnet-4-6`.
- [ ] Read-only adapter health dashboard at `/admin/adapters` (Next.js page) — reads from `adapter_manifests` and `adapter_telemetry`. No write paths yet.

**Exit criteria:** dashboard renders tier + budget + last-incident per adapter; one Bell-CAD canary record exists; every Anthropic call in the worker carries `(adapterId, phase, model)` tags; `seeds/202_*` is reviewed and held.

**Estimated value:** zero functional change for users, but the foundation makes every Phase A deliverable a local edit instead of a refactor. Saves ~2 weeks once Phase A starts.

---

### 6.2 Phase A — AI-assisted manual repair

**Activation gate:** Phase A external accounts provisioned per `PHASE_A_INTEGRATION_PREP.md` §6 runbooks (Hetzner host, Browserbase, CapSolver, R2 buckets, WS server). Browserbase paid account is the long-pole.

**Self-healing deliverables:**
- [ ] Apply `seeds/202_adapter_self_healing.sql` and flip the `CostLedgerSink` to write through to `ai_cost_ledger`.
- [ ] Page capture pipeline: SiteHealth-triggered or on-demand. Captures HTML + full-page PNG via `acquireBrowser({ adapterId })`; writes to R2 under `incidents/<incident_id>/<iso8601>/`.
- [ ] DOM diff service: snapshot vs. last-known-good (also stored in R2). Diff is reduced to the smallest enclosing subtree to keep token costs bounded.
- [ ] Change classifier (Anthropic prompt → structured `change_type`, `confidence`, `evidence`, `suggested_strategy_rung`). See Appendix A.1.
- [ ] Auto-PR generation: when SiteHealth flags a T0/T1 break and the classifier returns `selector_drift`, the orchestrator runs the strategy ladder (rungs 1–3 only, no Opus yet), assembles an incident packet, and opens a PR via GitHub Actions tagging `@juggernautjake`. Body includes diff + screenshots + canary results + `ai_cost_ledger` rollup.
- [ ] Slack + email notification with the same packet (per §4.6).
- [ ] Grow canary catalog: 5 properties total — Bell-CAD + Bell County Clerk (Kofile) + Hays-CAD + Williamson-CAD + TexasFile. Matches the Phase A regression-set growth gate in RECON_INVENTORY §11.

**Exit criteria:** when a T0/T1 adapter breaks, a PR with proposed fix + evidence appears within 30 min of detection; reviewer is Jacob; 5 canaries are running weekly; `ai_cost_ledger` rolls up per adapter on the dashboard.

**Estimated value:** cuts repair time from ~30 min hunting to ~10 min reviewing. Saves 60–70% of manual time.

---

### 6.3 Phase B — Validated AI fixes, human-merge

**Activation gate:** Phase A live for 30+ days; ≥5 real PRs have shipped from the Phase A pipeline; regression set has grown 5 → 15 per RECON_INVENTORY §11.

**Self-healing deliverables:**
- [ ] Validation layer wired into the auto-PR pipeline: every candidate runs the offline fixture suite (`worker/src/__tests__/regression/`) plus the live canary probe set (≥3 adapters' canaries, parallel). Results posted as a PR comment.
- [ ] Confidence scoring (§4.4) computed and posted to PR — first-class surveyor signals (closure ratio, bearing-validator pass rate) gated against the pre-fix baseline.
- [ ] Strategy ladder rungs 4–5 (Opus): section rewrite and full adapter rewrite, each gated on per-incident budget and abstraction-respect lint (§5.2.1).
- [ ] **AST lint** at `worker/src/__tests__/lint-adapter-patches.ts` — the §5.2.1 hard preconditions, run before any validation budget is spent.
- [ ] Cost-cap enforcement: per-incident, per-site monthly, global daily caps wired to the `AiUsageTracker` config; circuit breaker triggers at any cap, escalates to human handoff.
- [ ] Coherence integration: tie self-healing into Phase B's mid-pipeline gates 5–8 (`docs/platform/RECON_INVENTORY.md` §12). A canary that fails the closure-ratio gate now blocks the canary-pass score, not just the field-completeness score.

**Exit criteria:** PRs from the agent include score, fixture results, live canary results, `ai_cost_ledger` cost spent, lint output. Reviewer mostly rubber-stamps. MTTR for selector drift <1h with human in the merge path.

**Estimated value:** another 40–50% of repair time eliminated.

---

### 6.4 Phase D — Conditional auto-merge

**Activation gate:** Phase B clean for 30+ days; ≥10 PRs reviewed and human-merge-rate-of-no-change >90%; canary set has grown 15 → 50 per RECON_INVENTORY §11. **No customer is on production traffic that depends on a Phase D adapter without first running through the 50-property regression suite.**

**Self-healing deliverables:**
- [ ] Auto-merge gate: T0/T1, `selector_drift` only, confidence ≥85, **never vendor-base** (§4.1.1). `adapter_manifests.auto_merge_eligible` must also be true (manual promotion list).
- [ ] Adapter version pinning: `adapter_versions` rows written on every merge; routing reads `active_version`; reuse `pipeline-diff-engine.ts` for delta computation rather than reimplementing.
- [ ] Progressive rollout: 10% → 50% → 100% over 4h, governed by `adapter_versions.rollout_pct`.
- [ ] Auto-rollback on telemetry regression: if `adapter_telemetry.field_completeness_pct` drops below pre-merge baseline by >5% inside the 24h probation window, flip `active_version` back to the previous row and page on-call.
- [ ] **Blast-radius checker**: enumerates downstream FIPS via `KOFILE_FIPS_SET` etc. and posts the explicit list to the PR. Vendor-base patches blocked from auto-merge regardless of score (§4.1.1).
- [ ] Cross-adapter regression run: changing a vendor base (`kofile-clerk-adapter.ts`, `henschen-clerk-adapter.ts`, etc.) runs the fixture suites for **every** county under that vendor before any PR can merge.
- [ ] Customer-facing transparency: surface `degraded` adapter status to surveyors via the existing research-events bus + `useResearchProgress` hook (no new transport).

**Exit criteria:** selector drift on T0/T1 sites self-heals end-to-end. Human informed but not blocking. MTTR <30 min.

**Estimated value:** human is out of the critical path. Saves an additional ~10–20 min per incident.

---

### 6.5 Phase E+ — Predictive + cross-vendor learning (research, no commitment)

**Activation gate:** Phase D has run 6 months clean. **No commitment to ship any of these — listed for shape only.**

- DOM similarity scoring over time (predict drift before it breaks)
- Vendor-pattern learning (Kofile change in County A pre-applied to County B)
- Multi-agent debate (diagnostic agent vs. critique agent; reuses Phase B confidence-scoring as the arbiter)
- Synthetic fixture generation (AI generates new edge-case fixtures from real captures)
- Chaos engineering loop (intentionally break adapters in staging to validate the healing system itself)

**Reality check:** Phase E features are individually valuable but compound risk. Don't commit until Phase D has 6 months of clean operation and the canary catalog has 50+ properties.

---

## 7. Cost models — three scenarios

All Anthropic numbers verify against `/mnt/skills/public/product-self-knowledge/` before Phase A activation. The Sonnet floor reuses `SONNET_COST_PER_1K_TOKENS = $0.006` from `worker/src/lib/ai-usage-tracker.ts`. Browserbase is **per-session-minute** (not per-capture); a typical SiteHealth-triggered capture is ~90s ≈ $0.05. CapSolver is per-solve, ~$0.001–$0.003 depending on challenge type — trivial at current break rates but worth tracking line-by-line because it persists into `captcha_solves` and rolls up on the dashboard.

### Scenario A — Quiet month (3 incidents, all selector drift)

| Item | Cost |
|---|---|
| 3 incidents × Browserbase capture (~90s/incident) | $0.15 |
| 3 incidents × diagnosis (Sonnet 4.6, ~5K tokens) | $0.30 |
| 3 incidents × vision selector inference (rung 2) | $0.30 |
| 3 incidents × validation (live canary runs through Browserbase, ~3 canaries × 60s each) | $1.50 |
| Weekly canary runs across 25 adapter+source combos × 4 weeks (Browserbase + Sonnet validation) | $20 |
| CapSolver solves (only when CAPTCHA-walled probes hit captcha; usually 0–5/month) | <$0.05 |
| SiteHealth probes (existing baseline, no AI cost) | $0 |
| Telemetry rollups (Supabase compute, materialized 5-min view) | included |
| **Total** | **~$22/month** |

### Scenario B — Busy month (8 incidents: 5 drift, 2 workflow, 1 redesign)

| Item | Cost |
|---|---|
| 5 selector drift fixes (cheap rung — vision + capture) | ~$8 |
| 2 workflow changes (mid-rung, Sonnet code patch + extra validation runs) | ~$15 |
| 1 redesign attempt (climbs to Opus rewrite, hits $25 per-incident cap) | $25 |
| Weekly canary suite (4 weeks × 25 combos) | $20 |
| Validation re-runs (3 attempts × 1 redesign) | $10 |
| Browserbase session minutes (incidents + validation + canary cycles) | ~$5 |
| CapSolver (0–10 solves) | <$0.05 |
| **Total** | **~$83/month** |

### Scenario C — Catastrophic month (Kofile vendor-base redesign hits 80 counties simultaneously)

This is the scenario the §4.1.1 vendor-fan-out tier was designed for. **Without the vendor rule, the cost model double-counts every Kofile fix 80 times — Scenario C blows past $1,000/month and the daily cap throttles every other adapter for a week.** With the rule:

| Item | Cost | Notes |
|---|---|---|
| 1 vendor-base incident (`kofile-clerk-adapter.ts`) — diagnosis + Opus section rewrite | $25 | Vendor-incident budget = `min($50, sum top-3 county budgets)` = `min($50, $25+$10+$10)` = $45; Opus rewrite hits $25 |
| Vendor-base canary across **3 distinct counties** before promote (Bell + Williamson + 1 DFW county) | $5 | Required by §4.1.1 |
| Bulk validation across 80 downstream county canaries (cheap per-county at ~$0.50 each — same fix, different jurisdiction) | $40 | Each county runs its own canary set against the new vendor code |
| Browserbase session minutes for ~85 capture-validate cycles | ~$5 | Sessions fan out, each is ~60s |
| 2 follow-on county-specific patches (counties whose post-fix canary failed → small per-county tweaks at $1 each) | $2 | Long-tail tail of vendor fan-out |
| Weekly canary suite (unaffected — runs in parallel) | $20 | |
| CapSolver (no impact) | <$0.05 | |
| **Subtotal** | **~$97** | |
| Global daily cap ($50) | not breached | Vendor incident is ONE incident, not 80 |
| **Total realized** | **~$97, single day** | — |

The original Scenario C math was **$300 spread over 5–7 days** because it treated the 80 counties as 80 separate Tier-0 incidents at $25 each. With vendor-tier accounting, the catastrophic month costs about the same as a busy month plus a single redesign — and resolves in hours, not a week.

### Annualized planning numbers

- Steady state: **$30–$120/month** in AI + Browserbase + CapSolver + canary cost
- Worst-case month (Scenario C with two vendor-base incidents in the same month): **~$200**
- Annualized: **~$700–$1,800/year** for the entire self-healing system

**Compared to engineering time saved:** at ~$100/hour fully-loaded engineering cost and ~10 hours/month of manual adapter work eliminated, the system saves ~$12K/year while costing ~$1.2K/year. ROI is ~10× even before counting the SLA value (surveyor trust when their research jobs don't fail).

**Cost-model sanity check (Phase A):** during Phase A's first month live, compare actual `ai_cost_ledger` rollups against this table. If actuals exceed Scenario B by >50%, halt auto-PR generation pending a budget review — the dashboard threshold lives in `adapter_manifests.budget_monthly_usd` and the existing `AiUsageTracker` circuit breaker will trip first.

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Silent extraction bugs (selector right, field wrong) | M | H | Canary ground-truth comparison catches; field-level tolerance rules |
| Cost runaway on a hard-to-fix site | M | M | Three-layer budget caps; `AiUsageTracker` circuit breaker after 3 failed attempts |
| AI patches that break shared utilities | L | H | Blast-radius checker; full vendor-base regression suite in CI; AST lint forbids edits to `worker/src/shared/` |
| Over-fitting to fixtures (passes offline, fails live) | M | M | Mandatory live canary probe before any merge |
| Auto-merge ships subtly wrong data; surveyor notices first | L | H | 24h probation + telemetry-driven rollback; always-notify-human within 60s |
| Vendor adds CAPTCHA / login wall mid-incident | L | M | Change classifier flags `captcha_added` / `auth_required`; halts repair, escalates to human |
| Canary properties themselves drift (sale, subdivision) | M | L | 90-day human re-validation; multiple canaries per adapter (need ≥2 to pass) |
| Hostile site detects scraping pattern from probe traffic | L | M | Throttle canary cadence; rotate Browserbase sessions (proxy rotation built in); add jitter |
| Repair PR ships ToS-violating logic | L | H | Prompt constraints (Appendix A); explicit allowlist of behaviors AI may add; legal review of auto-merge eligibility list |
| AI hallucinates a working fix that just returns hardcoded data | L | H | Validation requires data match against canary ground truth, not just "no error"; closure-ratio check (§4.4) catches "right strings, wrong geometry" |
| Anthropic API outage during incident | L | M | System degrades to "PR-only with empty body", human takes over; existing `AiUsageTracker` already half-opens on consecutive failures |
| Browserbase pricing change blows up budget model | M | M | Quarterly cost review against `ai_cost_ledger` rollups; `BROWSER_BACKEND=local` fallback to self-hosted Playwright is one env-var flip |
| **Patch fixes selector but breaks bearing/curve parsing → traverse-closure 1:5,000 hard fail** | M | H | Canary `expected_closure_ratio` field (§4.3); confidence score includes closure-regression check, weighted 10 (§4.4); `validateBearing()` in `worker/src/infra/ai-guardrails.ts` runs against canary outputs as a separate scored signal |
| **AI patch bypasses `acquireBrowser` / `getCaptchaSolver` / `storage` abstractions, silently disabling Browserbase routing or cost telemetry** | M | H | AST lint at `worker/src/__tests__/lint-adapter-patches.ts` (§5.2.1) rejects pre-validation; "abstractions respected" is a scored signal in §4.4; prompt-level constraints in Appendix A.2 reduce emit-rate; rejection costs $0 against the budget so the next ladder rung executes immediately |
| **Vendor-base patch (Kofile / Tyler / Henschen / CountyFusion) breaks 30–80 county adapters simultaneously** | L | Critical | Vendor tier (§4.1.1) caps per-incident budget at `min($50, sum top-3 county budgets)`; vendor-base patches **never auto-merge-eligible** regardless of confidence; canary requirement: must pass on ≥3 distinct counties before promote; blast-radius checker enumerates downstream FIPS via `KOFILE_FIPS_SET` etc. and posts the explicit list to the PR |

---

## 9. Open questions (decisions needed before Phase A)

### Decided

2. **Who is "on-call"** — **Jacob solo through Phase E.** Revisit at Phase F when first non-Starr customers go live. All notifications fan out to one Slack channel + email; no SMS until Phase D auto-merge ships and proves out a 30-day clean run.
3. **Where canary capture artifacts live** — **Cloudflare R2 via `worker/src/lib/storage.ts`**, namespace `canaries/<adapter_id>/<canary_id>/<iso8601_ts>/` (incident artifacts use the `incidents/<id>/` namespace, see §6.2). Bucket lifecycle, CORS, and IAM per `docs/platform/STORAGE_LIFECYCLE.md`. Toggle via `STORAGE_BACKEND=r2`; dev defaults to local under `./storage/`. Never use bare `fs.writeFile` (the §5.2.1 lint will reject it).
4. **CI provider** — **GitHub Actions** for adapter PR validation; `.github/` already exists. The Hetzner worker host runs production traffic and weekly canaries only — it is not a CI runner. Vercel stays for the Next.js frontend.

### Still open (need decisions before Phase A activation)

1. **Notification channel matrix** — recommendation: Slack-only for T2/T3, Slack+email for T1, Slack+email+SMS for T0 once auto-merge is live. Pending: Jacob's Twilio account decision.
5. **Auto-merge approval list** — recommendation: ship Phase D with `auto_merge_eligible = false` for every adapter; promote one-at-a-time (Bell-CAD first → 7-day soak → next adapter). Pending: confirm one-at-a-time vs. batch promotion.
6. **Tier boundaries — quarterly review process** — telemetry-driven scoring (90-day demand × revenue × closure-blast-radius) feeds a recommendation; Jacob makes the call. Bell County adapters are pinned at T0 regardless. Pending: format of the quarterly report (lightweight Markdown vs. dashboard panel).
7. **Canary ground-truth ownership** — recommendation: Jacob owns initial 5 canaries (Phase A); Hank Maddux RPLS reviews legal-description correctness; Phase D adds a junior or contractor to maintain the 50-property catalog. Pending: hiring decision.
8. **Customer-facing transparency** — recommendation: yes, surface "this adapter is currently degraded" in the surveyor UI via the existing research-events bus + `useResearchProgress` hook (§4.5, §6.4). Pending: copy and visual treatment — does "degraded" appear as a yellow banner or as a per-source row in the active-research view?

---

## 10. Alternatives considered

### Alt 1 — Buy, don't build (Skyvern, Browse AI, Apify)
Skyvern especially does "AI-driven scraping that adapts to changes." Realistic for generic e-commerce; less proven for niche government records sites with unusual workflows. Pricing tends to be per-action, hard to predict at our volumes. **Verdict:** evaluate as a fallback for Tier 2/3 adapters only; build for Tier 0/1.

### Alt 2 — Replace scraping with paid data APIs (ATTOM, REGRID, CoreLogic)
For ownership-only data, this is genuinely cheaper than maintaining adapters. But our value is the **deeper pull**: deeds, plats, surveys, county-clerk research that paid APIs don't expose at any price. **Verdict:** use paid APIs as sanity-check overlays and as fallback for Tier 2/3 ownership lookups; don't replace the deep adapters.

### Alt 3 — Pure human SRE rotation, no AI in the loop
Honest baseline. ~10 engineering hours/month, predictable. Fine until we have >50 customers and adapter breaks become customer-visible SLA hits. **Verdict:** this is what we're doing today; the plan is the migration off it.

### Alt 4 — Hybrid: AI generates fix, human merges always (stop at Phase 2)
Lowest risk path. Captures most of the value (60–80% of manual time saved) without auto-merge risk. **Verdict:** legitimate stopping point. Recommend reaching Phase 2 and re-evaluating before committing to Phase 3.

---

## 11. Decision log

(Append entries here as decisions are made.)

| Date | Decision | Rationale | Decider |
|---|---|---|---|
| 2026-04-24 | Plan drafted | Initial RFC | Jacob + Claude |

---

## 12. Appendix A — Sample Claude prompts

### A.1 Change classifier
```
You are analyzing why a web scraper adapter failed.

Adapter: {adapter_id}
Vendor: {vendor}
Last-known-good DOM snapshot: {snapshot_html}
Current DOM snapshot: {current_html}
Failed selector(s): {failed_selectors}
Error log: {error_log}

Classify the change as exactly one of:
- selector_drift: A field/button moved or was renamed; same workflow.
- workflow_change: Form steps, navigation, or required fields changed.
- captcha_added: A CAPTCHA or bot-detection challenge appeared.
- auth_required: Login/account is now required where it wasn't.
- rate_limit_tightened: Requests are being throttled or blocked.
- total_redesign: The page framework / structure is fundamentally different.
- unknown: Cannot determine.

Return JSON only:
{"change_type": "...", "confidence": 0-100, "evidence": "...", "suggested_strategy_rung": 1-5}
```

### A.2 Targeted code-patch repair
```
You are repairing a Playwright-based scraper adapter.

Adapter source code:
{adapter_code}

Last-known-good page DOM (relevant section):
{good_dom}

Current page DOM (relevant section):
{current_dom}

Failed operation: {operation_description}

Generate a minimal patch that fixes ONLY the broken operation. Do not refactor.
Use multi-selector fallback arrays where reasonable. Preserve all existing comments and types.

Return:
1. A unified diff
2. A 1-paragraph explanation
3. Self-confidence score 0-100
4. Estimated risk to other adapters that share base classes (low/medium/high)
```

### A.3 Validation reasoning
```
Compare these two extraction results for canary property {parcel_id}.

Expected (ground truth):
{expected_data}

Actual (from candidate adapter version):
{actual_data}

Tolerance rules:
{tolerance_rules}

Return JSON:
{
  "field_matches": {"owner": true, "legal": true, ...},
  "field_mismatches": [{"field": "...", "expected": "...", "actual": "...", "severity": "..."}],
  "overall_pass": true|false,
  "completeness_pct": 0-100,
  "explanation": "..."
}
```

---

## 13. Appendix B — Bootstrapping checklist (when we start Phase 0)

- [ ] Inventory current adapters; assign tier (gut-check, refine quarterly)
- [ ] Pick canary properties for every Tier 0 adapter (Jacob, ~30 min each)
- [ ] Pick canary properties for every Tier 1 adapter
- [ ] Migrate adapter list into `adapter_manifests` table
- [ ] Wrap Anthropic SDK calls with cost-ledger middleware
- [ ] Stand up internal-only health dashboard (Next.js page, read-only)
- [ ] Configure Slack incoming webhook for incident notifications
- [ ] Decide CI host (GitHub Actions vs. droplet-side runner)
- [ ] Document rollback procedure (one-liner) and run a dry-run rollback
- [ ] Set global daily cost cap in environment (`SELF_HEAL_DAILY_CAP_USD=50`)

---

## 14. Appendix C — Things explicitly *not* in this plan

- Any change to the public-facing customer UI (separate roadmap)
- Multi-tenancy work (separate Phase B)
- Migration to Hetzner (separate planning doc, prerequisite)
- New county adapters beyond what exists today
- Changes to deed-parsing AI logic (different subsystem)
- Anything in Starr Forge or Starr Orbit (different product)

---

*End of plan.*
