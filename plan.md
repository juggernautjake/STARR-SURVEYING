# STARR RECON — Multi-Worker Architecture Plan

## Current State

You have:
- **1 DigitalOcean droplet** (IP: 104.131.20.240, port 3100) running the worker via PM2
- **BullMQ + Redis** job queue already built (`job-queue.ts`) — concurrency set to 3
- **9-phase pipeline** (discovery → harvest → AI extract → subdivision → adjacent → TxDOT → reconcile → confidence → purchase)
- **Per-site rate limiters** already implemented (Bell CAD: 5 req/s, Clerk: 2 concurrent, etc.)
- **Batch processor** that enqueues multiple properties into BullMQ
- **Supabase** for shared state, **Anthropic API** for AI extraction

The bottleneck isn't compute — it's I/O wait. Each pipeline run spends 80%+ of its time waiting on:
- Playwright browser pages loading (2-10s per page)
- County clerk rate limits (4s delays between requests)
- AI extraction calls to Claude (3-15s per call)
- ArcGIS API responses

## Recommended Architecture: Single VPS + Process-Level Parallelism

### Why NOT multiple servers

With a $40/mo budget, splitting across multiple VPS instances adds complexity (Redis coordination, shared storage, network latency) without meaningful benefit. Your pipeline is I/O-bound, not CPU-bound. A single well-configured VPS can handle many concurrent pipelines because each one mostly just waits.

### Why NOT serverless

Serverless (Lambda, Cloudflare Workers, Vercel Functions) cannot run Playwright — package size limits (250MB), execution time limits (15 min max on Lambda, 30s on Workers), and no persistent browser binary. You already know this, which is why the worker runs on a droplet.

### VPS Price Comparison (same specs: 4 vCPU / 8 GB RAM)

| Provider | Monthly Cost |
|----------|-------------|
| DigitalOcean | $24 |
| Vultr | $36 |
| Linode | $36 |
| **Hetzner CX33** (US-East) | **~$10** |

### Option A: Budget Powerhouse — Hetzner CX53 ($18/mo)

For $18/mo you get **16 vCPU / 32 GB RAM / 320 GB SSD** (EU datacenter). That's 4x the hardware you have now for less money. The tradeoff is 100-150ms latency to US county websites, which is negligible for scraping (page loads dominate).

### Option B: US-Based — Hetzner CPX31 ($18/mo, US region)

**4 vCPU / 8 GB RAM** in Ashburn, VA. Same latency as your current DO droplet. Still saves $6/mo vs DO.

### Option C: Stay on DigitalOcean ($24/mo)

Keep what you have. The code changes below work regardless of hosting provider.

### The Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│              VPS (Hetzner or DigitalOcean)                        │
│                                                                  │
│  ┌──────────────┐                                                │
│  │ starr-api    │  Express on :3100 (1 PM2 instance)             │
│  │ (HTTP only)  │  Receives requests, enqueues to BullMQ         │
│  └──────┬───────┘                                                │
│         │ enqueue                                                │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │    Redis     │  BullMQ backing store (~50MB RAM)              │
│  │  (local)     │                                                │
│  └──────┬───────┘                                                │
│         │ dequeue                                                │
│         ▼                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Worker #1   │  │ Worker #2   │  │ Worker #3   │  PM2 cluster │
│  │ concur = 2  │  │ concur = 2  │  │ concur = 2  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│                ┌─────────┴─────────┐                             │
│                │  Browser Pool     │                             │
│                │  1-2 Chromium     │  Share browser contexts     │
│                │  instances,       │  across all workers         │
│                │  max 8 contexts   │  (~800MB total, not 4GB)    │
│                └───────────────────┘                             │
│                                                                  │
│  Total effective concurrency: 6 pipelines simultaneously         │
└──────────────────────────────────────────────────────────────────┘
         │
         ├── Supabase (free tier)
         ├── Anthropic API (pay-per-use)
         └── Vercel frontend (free tier)
```

### Key Insight: Browser Contexts vs. Browser Instances

Do NOT launch a separate Chromium per worker. Instead, launch 1-2 Chromium instances and create multiple **browser contexts** within each:

| Approach | RAM Usage |
|----------|-----------|
| 8 separate Chromium instances | 1.5 - 4 GB |
| 1 Chromium + 8 contexts | ~800 MB |

Each context has isolated cookies/sessions while sharing the browser process. Block images/CSS/fonts during scraping to reduce per-context memory by 30-50%.

### Budget Breakdown

| Item | Option A (Hetzner EU) | Option B (Hetzner US) | Option C (DO) |
|------|----------------------|----------------------|---------------|
| VPS | $18 | $18 | $24 |
| Anthropic API | $10-20 | $10-20 | $10-15 |
| Supabase | $0 | $0 | $0 |
| Vercel | $0 | $0 | $0 |
| **Total** | **$28-38** | **$28-38** | **$34-39** |

All three fit within $40/mo. Option A gives 4x the hardware.

---

## Implementation Changes

### 1. PM2 Ecosystem File (NEW)

Create `worker/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    // API server — single instance, handles HTTP requests only
    {
      name: 'starr-api',
      script: 'dist/index.js',
      instances: 1,
      env: {
        WORKER_MODE: 'api',
        PORT: 3100,
      },
    },
    // Job workers — 3 instances, each pulls from BullMQ
    {
      name: 'starr-worker',
      script: 'dist/worker-process.js',
      instances: 3,
      env: {
        WORKER_MODE: 'worker',
        WORKER_CONCURRENCY: 2,
      },
    },
  ],
};
```

### 2. Split API from Worker (MODIFY)

Currently `index.ts` does both: runs Express AND processes jobs inline. Split into:

**`worker/src/index.ts`** — API-only mode (receives requests, enqueues jobs, returns status)
**`worker/src/worker-process.ts`** — Worker-only mode (pulls from BullMQ, runs pipelines)

This lets PM2 run 1 API + 3 workers as separate Node.js processes.

### 3. Shared Browser Pool (NEW)

Create `worker/src/infra/browser-pool.ts`:
- Pool of 1-2 Chromium instances with max 8 browser contexts
- Workers request a context from the pool, return it when done
- Blocks images/CSS/fonts by default (data scraping doesn't need them)
- Prevents OOM from too many simultaneous Chromium instances
- Auto-restarts leaked contexts after configurable timeout

### 4. Smarter Job Concurrency (MODIFY `job-queue.ts`)

```
Current:  concurrency: 3 (one worker process)
Proposed: concurrency: 2 (per worker × 3 processes = 6 total)
```

Make concurrency configurable via `WORKER_CONCURRENCY` env var.

### 5. Phase-Level Parallelism (MODIFY `master-orchestrator.ts`)

Currently phases run sequentially (1 → 2 → 3 → ... → 9). Phases 4-6 are independent:

```
Phase 1: Discovery          (must be first)
Phase 2: Document Harvest   (needs Phase 1)
Phase 3: AI Extraction      (needs Phase 2)
     ┌── Phase 4: Subdivision    ──┐
     ├── Phase 5: Adjacent Props  ──┤  Run with Promise.allSettled
     └── Phase 6: TxDOT ROW      ──┘
Phase 7: Reconciliation     (needs 3-6)
Phase 8: Confidence          (needs 7)
Phase 9: Purchase            (needs 8)
```

Running phases 4-6 in parallel saves 30-60s per pipeline run.

### 6. AI Cost Optimization (MODIFY)

Route AI calls by complexity:
- **Claude Haiku** ($0.25/MTok in, $1.25/MTok out): Owner name formatting, simple field extraction, document classification
- **Claude Sonnet** ($3/MTok in, $15/MTok out): Complex legal description parsing, boundary reconciliation, confidence scoring

This cuts AI costs 60-70% without quality loss on simple tasks.

---

## What Changes in Code

| File | Change | Effort |
|------|--------|--------|
| `worker/ecosystem.config.cjs` | **New** — PM2 multi-process config | Small |
| `worker/src/worker-process.ts` | **New** — Standalone BullMQ worker entry point | Medium |
| `worker/src/index.ts` | **Modify** — Add `WORKER_MODE=api` guard, inline job processing becomes enqueue-only | Medium |
| `worker/src/infra/job-queue.ts` | **Modify** — Make concurrency configurable via env var | Small |
| `worker/src/infra/browser-pool.ts` | **New** — Shared Playwright browser pool with semaphore | Medium |
| `worker/src/orchestrator/master-orchestrator.ts` | **Modify** — Run phases 4-6 in parallel with `Promise.allSettled` | Small |
| `worker/src/services/ai-extraction.ts` | **Modify** — Route simple tasks to Haiku, complex to Sonnet | Small |
| `worker/.env.example` | **Modify** — Add `WORKER_MODE`, `WORKER_CONCURRENCY`, `BROWSER_POOL_SIZE` | Small |

---

## Performance Expectations

| Metric | Current (1 worker) | After (3 workers x 2 concurrent) |
|--------|-------------------|----------------------------------|
| Concurrent pipeline runs | 1-3 | 6 |
| Time per pipeline (single property) | ~3-5 min | ~2-3 min (phase parallelism) |
| Properties per hour | ~12-20 | ~40-60 |
| Monthly property capacity | ~8,600 | ~28,800 |

### Scraping All 99 Sources for One Property

Not all sources need Playwright. Breakdown:
- ~15 sources need Playwright (SPA sites: county clerk, CAD viewers)
- ~50 sources are REST APIs (ArcGIS, FEMA, TxDOT) — simple `fetch` calls
- ~34 sources are static HTML or reference pages

With 8 parallel browser contexts + 20-30 parallel HTTP workers:
- 99 sources / ~30 parallel workers = ~4 batches
- 4 batches x 60s average = **~4 minutes** to query all sources for one property

---

## Migration Steps

1. Choose hosting option (A/B/C above)
2. If migrating: set up new VPS, install Redis, Node 22, Playwright deps, PM2
3. Deploy the code changes above
4. Run `pm2 start ecosystem.config.cjs`
5. Update `WORKER_URL` in Vercel env to point to new IP
6. Verify with a test batch of 5 properties
7. If migrating: tear down old DO droplet

---

## What This Does NOT Require

- No Kubernetes
- No Docker (PM2 is simpler and sufficient at this scale)
- No multiple servers
- No message broker besides Redis (already using it)
- No architectural rewrite — builds directly on existing BullMQ + rate limiter + orchestrator
