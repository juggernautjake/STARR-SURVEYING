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

### Phase 0 — Foundation (Week 0–2, blocking everything else)
- [ ] Adapter manifest table + migrate existing adapters into it (assign tiers)
- [ ] Canary property catalog: build 2–3 per Tier 0/1 adapter (~6 hours work)
- [ ] AI cost ledger table + middleware that wraps every Anthropic API call
- [ ] Per-incident / per-month / global budget enforcement
- [ ] Customer telemetry aggregation (5-min rollups)
- [ ] Adapter health dashboard v1 (read-only, internal)

**Exit criteria:** dashboard shows live success rate per adapter, canaries run weekly, every Claude call is cost-tagged.

### Phase 1 — AI-assisted manual repair (Week 3–5)
- [ ] Page capture pipeline (Browserbase → S3-equivalent → Supabase artifact URL)
- [ ] DOM diff service (compare current capture vs. last-known-good)
- [ ] Change classifier (Claude prompt → structured change_type)
- [ ] Auto-PR generation: when SiteHealth flags a Tier 0/1 break, agent assembles incident packet, drafts a fix, opens PR with diff + screenshots + canary results, tags Jacob
- [ ] Slack/email notification with incident packet

**Exit criteria:** when a Tier 0/1 adapter breaks, a PR with proposed fix + evidence appears within 30 min of detection. Human still merges.

**Estimated value:** cuts repair time from ~30 min hunting to ~10 min reviewing. Saves 60–70% of manual time.

### Phase 2 — Validated AI fixes, human-merge (Week 6–10)
- [ ] Fixture regression suite (snapshot HTML, expected output) — 5–15 fixtures per Tier 0/1 adapter
- [ ] Validation layer: run fixture suite + canary live probe automatically on every PR
- [ ] Confidence scoring (computed and posted to PR)
- [ ] Strategy ladder implementation (start cheap, escalate)
- [ ] Cost-cap enforcement during repair

**Exit criteria:** PRs from the agent now include confidence score, fixture results, canary live results, and cost spent. Reviewer mostly rubber-stamps.

**Estimated value:** another 40–50% of repair time eliminated. Detection-to-deploy under 1h for selector drift.

### Phase 3 — Conditional auto-merge (Week 11–18)
- [ ] Auto-merge gate (Tier 0/1, selector_drift only, confidence ≥85)
- [ ] Adapter version pinning + progressive rollout (10% → 50% → 100%)
- [ ] Auto-rollback on telemetry regression
- [ ] 24h probation window with human-validate-or-revert
- [ ] Always-notify-human packet (rich Slack message + dashboard link)
- [ ] Blast-radius checker (shared utility changes block auto-merge)
- [ ] Cross-adapter regression suite in CI (changing kofile-base runs all kofile-county fixtures)

**Exit criteria:** selector drift on Tier 0/1 sites self-heals end-to-end. Human informed but not blocking. Incident closes only after human confirmation.

**Estimated value:** MTTR for selector drift drops from hours to <30 min, with no human in the critical path.

### Phase 4 — Predictive + cross-vendor learning (Research, no commitment)
- [ ] DOM similarity scoring over time (predict drift before it breaks)
- [ ] Vendor-pattern learning (Kofile change in County A pre-applied to County B)
- [ ] Multi-agent debate (diagnostic agent vs. critique agent)
- [ ] Synthetic fixture generation (AI generates new edge-case fixtures from real captures)
- [ ] Chaos engineering loop (intentionally break adapters in staging to validate the healing system itself)

**Reality check:** Phase 4 features are individually valuable but compound risk. Don't commit until Phase 3 has 6 months of clean operation.

---

## 7. Cost models — three scenarios

All numbers assume current Anthropic pricing (verify in `/mnt/skills/public/product-self-knowledge/` before final commitment).

### Scenario A — Quiet month (3 incidents, all selector drift)

| Item | Cost |
|---|---|
| 3 incidents × 1 page capture (Browserbase) | $0.60 |
| 3 incidents × diagnosis (Sonnet, ~5K tokens) | $0.30 |
| 3 incidents × vision selector inference | $0.30 |
| 3 incidents × validation (canary live runs) | $1.50 |
| Weekly canary runs across 25 adapters × 4 weeks | $20 |
| SiteHealth probes (existing baseline) | $0 |
| Telemetry aggregation (Supabase compute) | included |
| **Total** | **~$22/month** |

### Scenario B — Busy month (8 incidents: 5 drift, 2 workflow, 1 redesign)

| Item | Cost |
|---|---|
| 5 selector drift fixes (cheap rung) | ~$8 |
| 2 workflow changes (mid-rung, Sonnet code patch + extra validation) | ~$15 |
| 1 redesign attempt (climbs to Opus rewrite, hits $25 cap) | $25 |
| Canary suite operations | $25 |
| Validation re-runs | $10 |
| **Total** | **~$83/month** |

### Scenario C — Catastrophic month (Kofile platform-wide redesign hits 12 counties simultaneously)

| Item | Cost |
|---|---|
| 1 vendor-base diagnosis (deep, Opus) | $20 |
| 12 county-adapter validations against new base | $30 |
| 3 attempts to fix each (avg) | ~$200 |
| Extra canary runs and Browserbase sessions | $50 |
| **Subtotal pre-cap** | $300 |
| Global daily cap kicks in, throttles to 1-2 fixes per day over a week | enforced |
| **Total realized** | **~$300, spread over 5–7 days** |

### Annualized planning numbers

- Steady state: **$50–$150/month** in AI + Browserbase + canary cost
- Worst-case month: **$300–$500** (with caps holding)
- Annualized: **~$1,500–$3,000/year** for the entire self-healing system

**Compared to engineering time saved:** at ~$100/hour fully-loaded engineering cost and ~10 hours/month of manual adapter work eliminated, the system saves $12K/year while costing ~$2K/year. ROI is ~6x even before counting the SLA value (customer trust when their research jobs don't fail).

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Silent extraction bugs (selector right, field wrong) | M | H | Canary ground-truth comparison catches; field-level tolerance rules |
| Cost runaway on a hard-to-fix site | M | M | Three-layer budget caps; circuit breaker after 3 failed attempts |
| AI patches that break shared utilities | L | H | Blast-radius checker; full vendor-base regression suite in CI |
| Over-fitting to fixtures (passes offline, fails live) | M | M | Mandatory live canary probe before any merge |
| Auto-merge ships subtly wrong data; customer notices first | L | H | 24h probation + telemetry-driven rollback; always-notify-human within 60s |
| Vendor adds CAPTCHA / login wall mid-incident | L | M | Change classifier flags this, halts repair, escalates to human |
| Canary properties themselves drift (sale, subdivision) | M | L | 90-day human re-validation; multiple canaries per adapter (need ≥2 to pass) |
| Hostile site detects scraping pattern from probe traffic | L | M | Throttle canary cadence; rotate Browserbase sessions; add jitter |
| Repair PR ships ToS-violating logic | L | H | Prompt constraints; explicit allowlist of behaviors AI may add; legal review of auto-merge eligibility list |
| AI hallucinates a working fix that just returns hardcoded data | L | H | Validation requires data match against canary ground truth, not just "no error" |
| Anthropic API outage during incident | L | M | System degrades to "PR-only with empty body", human takes over |
| Browserbase pricing change blows up budget model | M | M | Quarterly cost review; switch to self-hosted Playwright if needed |

---

## 9. Open questions (need decisions before Phase 1)

1. **Notification channel matrix** — Slack only? Email + SMS for Tier 0? Page on-call?
2. **Who is "on-call"** — solo for now (Jacob) or grow to a rotation as team scales?
3. **Where do canary capture artifacts live** — Supabase Storage, S3, Hetzner volume?
4. **CI provider** — keep Vercel for frontend, set up GitHub Actions for adapter PRs? Or use the worker droplet directly?
5. **Auto-merge approval list** — start with zero adapters auto-mergeable in Phase 3 and promote individually? Or open to all Tier 0/1 at once?
6. **Tier boundaries** — quarterly review by what process? Telemetry-driven scoring vs. judgment call?
7. **Canary ground-truth ownership** — Jacob alone validates, or train a junior to maintain?
8. **Customer-facing transparency** — surface "this adapter is currently degraded" in the UI? Probably yes for trust.

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
