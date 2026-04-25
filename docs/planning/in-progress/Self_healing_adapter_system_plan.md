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

Every adapter is assigned a tier that determines its cost budget, repair urgency, and rollout caution. Tier is a function of (a) customer demand, (b) data uniqueness (can we get it elsewhere?), (c) revenue impact.

| Tier | Label | Examples | Repair budget per incident | SLA target | Auto-merge eligible? |
|---|---|---|---|---|---|
| T0 | **Critical** | Bell CAD, Bell County Clerk (Kofile), TxGIO parcel | $25 | 1h | Selector drift only, with 2 humans notified |
| T1 | **High** | TexasFile, TxDOT Roadways, RRC | $10 | 4h | Selector drift only, 1 human notified |
| T2 | **Medium** | Adjacent-county clerks, FEMA | $5 | 24h | Never — PR only |
| T3 | **Low** | Rarely-hit adapters, optional enrichment | $1 | Best-effort | Never — PR only |

Tiers are **stored in the adapter manifest** (`adapters/<name>/manifest.json`) so repair logic, cost meters, and dashboards all read from the same source of truth.

Tiers are **reviewed quarterly** based on telemetry: an adapter no customer has hit in 90 days drops a tier; an adapter that's blocking high-revenue jobs gets promoted.

### 4.2 Per-site cost budgets (your idea, formalized)

Three nested budgets enforce cost discipline:

1. **Per-incident cap** — single repair attempt cannot exceed Tier budget (table above). If exceeded, attempt halts and human is notified.
2. **Per-site monthly cap** — `tier_budget × 4` per adapter per calendar month. Prevents one perpetually-broken site from draining the budget.
3. **Global daily cap** — `$50/day` hard ceiling across all adapters. Circuit breaker if breached.

Every Claude API call is tagged with `adapter_id`, `incident_id`, `phase` (diagnose / repair / validate). Costs roll up in Supabase in real time. Budget enforcement happens *before* each call, not after.

### 4.3 Canary test properties (the ground-truth backbone)

For each adapter, we pin **2–3 real properties** in that jurisdiction whose extracted data we know to be correct. These are the "known answers" the system regression-tests against.

A canary property record contains:
- `parcel_id` / `account_number`
- `expected_owner_name` (regex-tolerant)
- `expected_legal_description` (substring match, since formatting varies)
- `expected_acreage` (±0.01 tolerance)
- `expected_address`
- `expected_deed_count` (range, e.g., 3–6)
- `expected_field_completeness_pct` (e.g., owner+legal+acreage must populate)
- `last_validated_at` and `last_validated_by` (so we know when a human last confirmed the truth)
- `validation_period_days` (default 90 — re-confirm with human eyes quarterly)

**Why 2–3 per adapter, not 1:** single canaries can give false negatives (e.g., a property that happens to have an unusual deed). With 3, we require ≥2 to pass for the adapter to be considered green.

**Canary execution:**
- Automatically re-run on every SiteHealth tick when an adapter is flagged unhealthy
- Re-run weekly even when healthy (catches silent regressions)
- Re-run on demand before any auto-merge

### 4.4 Confidence scoring

Every candidate fix gets a 0–100 confidence score, computed from:

| Signal | Weight |
|---|---|
| All canary properties pass | 40 |
| Diff scope (smaller = higher) | 15 |
| Change type (selector_drift > workflow_change > redesign) | 15 |
| Fixture regression suite passes | 10 |
| Live probe latency within historical p95 | 5 |
| No new dependencies introduced | 5 |
| AI self-reported confidence | 5 |
| Adapter has been stable historically | 5 |

Auto-merge thresholds (only for Tier 0/1, selector_drift only):
- ≥85: eligible for auto-merge
- 60–84: PR opens, human reviews with score and evidence attached
- <60: PR opens, marked "needs_investigation," tagged on-call

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

Adapter version pinning (one row per `(adapter_id, version)`) makes rollback a config change, not a code deploy.

---

## 5. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DETECTION LAYER                                │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐    │
│  │ SiteHealth     │  │ Customer       │  │ Scheduled canary     │    │
│  │ (6h, selector  │  │ telemetry      │  │ probes (weekly)      │    │
│  │ probe)         │  │ (5min agg)     │  │                      │    │
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

```sql
-- Adapter manifest (or augment existing)
CREATE TABLE adapter_manifests (
  adapter_id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,             -- 'kofile', 'tyler', etc.
  jurisdictions JSONB,               -- ['bell-county-clerk', 'mclennan-county-clerk']
  tier SMALLINT NOT NULL,            -- 0..3
  current_version INT NOT NULL,
  active_version INT NOT NULL,       -- could differ from current during canary
  budget_per_incident_usd NUMERIC(6,2),
  budget_monthly_usd NUMERIC(6,2),
  monthly_spent_usd NUMERIC(6,2) DEFAULT 0,
  monthly_spent_reset_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE adapter_versions (
  adapter_id TEXT REFERENCES adapter_manifests,
  version INT NOT NULL,
  code_hash TEXT NOT NULL,
  created_by TEXT,                   -- 'human:jacob' | 'ai:incident-1234'
  created_at TIMESTAMPTZ DEFAULT now(),
  rollout_pct SMALLINT DEFAULT 0,
  status TEXT,                       -- 'draft','canary','live','retired','rolled_back'
  PRIMARY KEY (adapter_id, version)
);

CREATE TABLE canary_properties (
  id UUID PRIMARY KEY,
  adapter_id TEXT REFERENCES adapter_manifests,
  jurisdiction TEXT NOT NULL,
  parcel_id TEXT NOT NULL,
  expected_data JSONB NOT NULL,      -- structured ground truth
  tolerance_rules JSONB,             -- per-field tolerance config
  last_validated_at TIMESTAMPTZ,
  last_validated_by TEXT,
  next_revalidation_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true
);

CREATE TABLE adapter_incidents (
  id UUID PRIMARY KEY,
  adapter_id TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  detected_by TEXT,                  -- 'sitehealth' | 'telemetry' | 'canary' | 'human'
  change_type TEXT,                  -- selector_drift | workflow_change | captcha | redesign | unknown
  status TEXT,                       -- open | diagnosing | repairing | validating | merged | rolled_back | closed_no_fix
  budget_cap_usd NUMERIC(6,2),
  spent_usd NUMERIC(6,2) DEFAULT 0,
  confidence_score SMALLINT,
  resolution TEXT,                   -- auto_merged | pr_opened | human_only | abandoned
  resolved_at TIMESTAMPTZ,
  artifacts JSONB                    -- {html_capture_url, screenshot_url, diff_url, ...}
);

CREATE TABLE adapter_telemetry (
  ts TIMESTAMPTZ DEFAULT now(),
  adapter_id TEXT,
  adapter_version INT,
  customer_id UUID,
  job_id UUID,
  status TEXT,                       -- success|partial|failure|timeout
  field_completeness_pct NUMERIC(5,2),
  duration_ms INT,
  error_class TEXT
);
-- Index aggressively; this is the highest-volume table.

CREATE TABLE ai_cost_ledger (
  id UUID PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT now(),
  incident_id UUID REFERENCES adapter_incidents,
  adapter_id TEXT,
  phase TEXT,                        -- diagnose|repair|validate
  model TEXT,                        -- claude-sonnet-4-7 etc.
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(8,4)
);
```

### 5.2 The repair strategy ladder (detail)

Always start at the cheapest rung that has a chance of working. Ladder pseudocode:

```python
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
    if validate(candidate) >= confidence_threshold(adapter.tier):
        return candidate
return abandon_with_human_handoff(incident)
```

Why a ladder and not "always use the best model": cost. Selector drift is 80% of breaks and the cheapest rung handles it. Reserving Opus for actual redesigns keeps monthly spend predictable.

### 5.3 Canary property catalog — bootstrapping

For each active adapter, we need a one-time human investment of ~30 min to:
1. Pick 2–3 real, stable properties in that jurisdiction (avoid recently-sold, avoid disputed boundaries)
2. Run the adapter manually, copy the result into `expected_data`
3. Hand-review for accuracy
4. Set `next_revalidation_at = now() + 90 days`

Across ~25 active adapters: ~12 hours of one-time work. **This is the single highest-leverage investment in the entire plan.** Without canaries, every AI fix is shipping into the dark.

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
