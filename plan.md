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

With a $40/mo budget, splitting across multiple VPS instances adds complexity (Redis coordination, shared storage, network latency) without meaningful benefit. Your pipeline is I/O-bound, not CPU-bound. A single well-configured VPS can handle 5-8 concurrent pipelines because each one mostly just waits.

### The Setup ($36-40/month)

```
┌─────────────────────────────────────────────────────────────┐
│                 Hetzner CX32 ($7.50/mo)                     │
│                 4 vCPU / 8 GB RAM / 80 GB SSD               │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Worker #1   │  │ Worker #2   │  │ Worker #3   │  PM2    │
│  │ (BullMQ)    │  │ (BullMQ)    │  │ (BullMQ)    │         │
│  │ concurrency │  │ concurrency │  │ concurrency │         │
│  │     = 2     │  │     = 2     │  │     = 2     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          │                                  │
│                   ┌──────┴──────┐                           │
│                   │   Redis     │  (local, no extra cost)   │
│                   │   BullMQ    │                           │
│                   └─────────────┘                           │
│                                                             │
│  Playwright browsers: max 4 concurrent (shared pool)        │
│  Express API: port 3100 (single instance, routes to queue)  │
└─────────────────────────────────────────────────────────────┘
         │
         ├── Supabase (free tier: 500MB DB, 1GB storage)
         ├── Anthropic API (pay-per-use, ~$5-15/mo depending on volume)
         └── Vercel frontend (free tier)
```

### Budget Breakdown

| Item | Monthly Cost |
|------|-------------|
| **Hetzner CX32** (4 vCPU, 8 GB RAM, 80 GB SSD, Ashburn DC) | $7.50 |
| **Anthropic API** (Claude Haiku for extraction, Sonnet for complex) | $10-25 |
| **Supabase** (free tier) | $0 |
| **Vercel** (free tier) | $0 |
| **Domain/DNS** (existing) | $0 |
| **Total** | **$17.50 - $32.50** |

> **Why Hetzner over DigitalOcean?** Same specs: DO = $24/mo, Hetzner = $7.50/mo. Both have US East datacenters. You save $16.50/mo instantly by switching.

### Alternative: Keep DigitalOcean

If you prefer staying on DO, their $24/mo droplet (4 vCPU, 8 GB) leaves $16 for API costs. Still workable.

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
        WORKER_MODE: 'api',     // Only start Express, don't process jobs
        PORT: 3100,
      },
    },
    // Job workers — 3 instances, each pulls from BullMQ
    {
      name: 'starr-worker',
      script: 'dist/worker-process.js',
      instances: 3,
      env: {
        WORKER_MODE: 'worker',  // Only process BullMQ jobs, no Express
        WORKER_CONCURRENCY: 2,  // Each instance handles 2 concurrent jobs
      },
    },
  ],
};
```

### 2. Split API from Worker (MODIFY)

Currently `index.ts` does both: runs Express AND processes jobs inline. Split into:

**`worker/src/index.ts`** — API-only mode (receives requests, enqueues jobs, returns status)
**`worker/src/worker-process.ts`** — Worker-only mode (pulls from BullMQ, runs pipelines)

This lets PM2 run 1 API + 3 workers as separate processes.

### 3. Shared Browser Pool (NEW)

Create `worker/src/infra/browser-pool.ts`:
- Pool of max 4 Playwright browser contexts (shared across all workers on the VPS)
- Workers request a browser from the pool, return it when done
- Prevents OOM from 6+ simultaneous Chromium instances
- Uses a simple semaphore + Unix domain socket for cross-process coordination

### 4. Smarter Job Concurrency (MODIFY `job-queue.ts`)

```
Current:  concurrency: 3 (one worker process)
Proposed: concurrency: 2 (per worker process × 3 processes = 6 total)
```

With per-site rate limits already enforced, 6 concurrent pipelines won't overwhelm any single county site — the rate limiter already throttles.

### 5. Phase-Level Parallelism (MODIFY `master-orchestrator.ts`)

Currently phases run sequentially (1→2→3→...→9). Some can run in parallel:

```
Phase 1: Discovery          (must be first)
Phase 2: Document Harvest   (needs Phase 1)
Phase 3: AI Extraction      (needs Phase 2)
     ┌── Phase 4: Subdivision    ──┐
     ├── Phase 5: Adjacent Props  ──┤  (all need Phase 3, independent of each other)
     └── Phase 6: TxDOT ROW      ──┘
Phase 7: Reconciliation     (needs 3-6)
Phase 8: Confidence          (needs 7)
Phase 9: Purchase            (needs 8)
```

Running phases 4-6 in parallel saves 30-60s per pipeline run.

### 6. AI Cost Optimization (MODIFY)

Switch default model by task complexity:
- **Claude Haiku** ($0.25/MTok in, $1.25/MTok out): Owner name formatting, simple field extraction, document classification
- **Claude Sonnet** ($3/MTok in, $15/MTok out): Complex legal description parsing, boundary reconciliation, confidence scoring

This alone cuts AI costs 60-70% without quality loss on simple tasks.

## What Changes in Code

| File | Change | Effort |
|------|--------|--------|
| `worker/ecosystem.config.cjs` | **New** — PM2 multi-process config | Small |
| `worker/src/worker-process.ts` | **New** — Standalone BullMQ worker entry point | Medium |
| `worker/src/index.ts` | **Modify** — Add `WORKER_MODE=api` guard, move job processing to worker-process.ts | Medium |
| `worker/src/infra/job-queue.ts` | **Modify** — Make concurrency configurable via env var | Small |
| `worker/src/infra/browser-pool.ts` | **New** — Shared Playwright browser pool with semaphore | Medium |
| `worker/src/orchestrator/master-orchestrator.ts` | **Modify** — Run phases 4-6 in parallel with `Promise.allSettled` | Small |
| `worker/src/services/ai-extraction.ts` | **Modify** — Route simple tasks to Haiku, complex to Sonnet | Small |
| `worker/.env.example` | **Modify** — Add `WORKER_MODE`, `WORKER_CONCURRENCY`, `BROWSER_POOL_SIZE` | Small |

## Performance Expectations

| Metric | Current (1 worker) | After (3 workers × 2 concurrent) |
|--------|-------------------|----------------------------------|
| Concurrent pipeline runs | 1-3 | 6 |
| Time per pipeline (single property) | ~3-5 min | ~2-3 min (phase parallelism) |
| Properties per hour | ~12-20 | ~40-60 |
| Monthly property capacity | ~8,600 | ~28,800 |

## Migration Steps

1. Set up Hetzner CX32 (or keep DO droplet)
2. Install Redis, Node 22, Playwright deps, PM2
3. Deploy the code changes above
4. Run `pm2 start ecosystem.config.cjs`
5. Update `WORKER_URL` in Vercel env to point to new IP
6. Verify with a test batch of 5 properties
7. Tear down old DO droplet (if migrating)

## What This Does NOT Require

- No Kubernetes
- No Docker (PM2 is simpler and sufficient)
- No multiple servers
- No message broker besides Redis (already using it)
- No architectural rewrite — builds on your existing BullMQ + rate limiter + orchestrator
