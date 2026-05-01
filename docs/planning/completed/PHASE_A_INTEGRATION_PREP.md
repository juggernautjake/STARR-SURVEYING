# Phase A Integration Prep — Planning & Activation Roadmap

> **Status:** Completed 2026-04-30. Prep wiring shipped (Browserbase,
> CapSolver, R2, WebSocket progress channel) — all four deliverables
> in tree, all defaults OFF, 133 worker tests passing. Remaining work
> is operational (account provisioning + flag flips) and is tracked
> separately via the §6 activation runbooks below; those runbooks
> remain the source of truth for turning each integration on.
>
> **Audience:** Future-Jacob, future-Copilot, and any engineer picking
> this up months from now. If you are reading this and the names below
> have changed, the file paths in §Code Map are the source of truth.
>
> **Last updated:** April 2026 (the PR this doc was added in).

## 0. Status snapshot

### Done in this PR (prep wiring, all stub-mode-first)

- [x] **Deliverable 1 — Browser-factory wiring**
  - [x] `@browserbasehq/sdk@2.10.0` exact-pinned in worker
  - [x] `BROWSER_BACKEND` env gate; `resolveBackend()` rules 3–4 stripped
  - [x] `adapterId` parameter on `getBrowser` / `withBrowser` / `getContext` / new `acquireBrowser`
  - [x] Full Browserbase code path via SDK + `chromium.connectOverCDP` with proxy support and best-effort session release
  - [x] `BROWSERBASE_ENABLED_ADAPTERS` parser + `validateAdapterFlagOnStartup()` called from worker bootstrap
  - [x] Refactored 36 production `chromium.launch()` callers to route through `acquireBrowser()` with their `adapterId`
  - [x] 21 tests covering stub/gating/parsing/warn-and-ignore
- [x] **Deliverable 2 — CapSolver wiring**
  - [x] `seeds/201_captcha_solves.sql` with "Migration not yet applied" header note
  - [x] `worker/src/lib/captcha-solver-http.ts` — minimal `createTask` + `getTaskResult` REST client (no official SDK exists)
  - [x] `CapSolverProvider.solve()` for Turnstile / reCAPTCHA v2 / v2-invisible / v3 / Enterprise / hCaptcha; proxied vs proxyless variant routing
  - [x] Three-strike retry inside `solve()` with backoff (500ms→2s); `CaptchaEscalationRequired` on terminal failure
  - [x] `recordSolveAttempt()` called for every attempt (success + failure) via pluggable `SolveAttemptSink`; default no-ops in stub mode
  - [x] Pluggable Redis-backed `CaptchaCache` with 25-min TTL keyed on `(type, host, egressIp, uaHash)`
  - [x] 25 tests covering stub branches, retry, escalation, recordSolveAttempt instrumentation, cache hit/miss, factory selection
- [x] **Deliverable 3 — WebSocket progress channel**
  - [x] `ws@8.20.0`, `@types/ws@8.18.1`, `tsx@4.20.6` exact-pinned in root
  - [x] Canonical event catalog at `worker/src/shared/research-events.ts` (zod discriminated union, 8 event types, protocol version 1)
  - [x] HMAC-SHA256 ticket helper at `worker/src/shared/ws-ticket.ts` (60s default TTL, separate `WS_TICKET_SECRET`, constant-time sig compare)
  - [x] Standalone WS server at `server/ws.ts` (HTTP upgrade auth, Redis `pSubscribe('research-events:*')` fanout, per-client jobId filtering, `/healthz`)
  - [x] Worker emit helper at `worker/src/lib/research-events-emit.ts` (lazy IORedis publisher, schema-validated publish, telemetry never blocks pipeline)
  - [x] `/api/ws/ticket` Next.js route (next-auth gated, ownership check via `research_projects.created_by`, jobIds cap at 50)
  - [x] `useResearchProgress(jobIds)` React hook (auto-reconnect with exponential backoff, ticket refresh, bounded buffer)
  - [x] `npm run ws` script wired to tsx
  - [x] 16 + 5 = 21 tests for schema round-trip + ticket roundtrip + emit publisher
  - [x] [`docs/platform/WEBSOCKET_ARCHITECTURE.md`](../../platform/WEBSOCKET_ARCHITECTURE.md) (process topology, auth flow, dev setup)
- [x] **Deliverable 4 — Cloudflare R2 wrapper**
  - [x] `@aws-sdk/client-s3@3.1034.0` + `@aws-sdk/s3-request-presigner@3.1034.0` exact-pinned in worker
  - [x] `worker/src/lib/storage.ts` with side-by-side header note re `artifact-uploader.ts`
  - [x] Local backend (writes to `./storage/`, `file://` URL for getSignedUrl) + R2 backend (S3 SDK against R2 endpoint, presigned URLs)
  - [x] Same `documents/<jobId>/<filename>` key namespace in both modes; path traversal hardened
  - [x] 14 tests covering local round-trip, traversal rejection, R2 upload/download/delete with mocked SDK + NoSuchKey + 404
  - [x] [`docs/platform/STORAGE_LIFECYCLE.md`](../../platform/STORAGE_LIFECYCLE.md) (bucket layout, lifecycle rules JSON, CORS)
- [x] **Cross-cutting**
  - [x] Build fix: `@browserbasehq/sdk` and `@aws-sdk/client-s3` dynamic imports routed through a variable so root tsc never tries to resolve worker-only SDKs
  - [x] Schema relocation: `lib/shared/` → `worker/src/shared/` to satisfy worker `rootDir: ./src` (single source of truth, no drift possible)
  - [x] `worker/.env.example` updated: `BROWSERBASE_ENABLED_ADAPTERS`, `STORAGE_BACKEND`, R2 vars, `WS_TICKET_SECRET`, removed orphan `R2_BUCKET_*` placeholders
  - [x] Root `.env.example` updated: Phase A integration block at end
  - [x] `CONTRIBUTING.md` updated: exact-pin rule, Phase A local dev table, `npm run ws` instructions
  - [x] Stale doc/comment references to old `lib/shared/` paths cleaned up
- [x] **Validation**
  - [x] `npm run build` (Next.js 14): passes, `/api/ws/ticket` route compiles
  - [x] Root `tsc --noEmit`: clean
  - [x] Worker `tsc --noEmit`: clean
  - [x] Worker tests: **133 passing** (was 67 baseline; +66 new)
  - [x] Root tests: 23 failed | 2913 passed — exact baseline match (the 23 failures are pre-existing per CONTRIBUTING.md, unrelated to this PR)

### Pending — activation work (per integration, gated on external accounts)

- [ ] Browserbase paid account provisioning → §6.1 runbook
- [ ] CapSolver paid account provisioning → §6.2 runbook (apply `seeds/201_captcha_solves.sql` here)
- [ ] Cloudflare R2 buckets + lifecycle rules + API tokens → §6.3 runbook
- [ ] WS server systemd unit / process manager on production host → §6.4 runbook
- [ ] First UI consumer of `useResearchProgress()` (active-research view in `app/admin/research/[id]/`)

### Pending — separate future PRs (out of scope for prep)

- [ ] `lib/research/` → `lib/starr-recon/` rename
- [ ] Migrate `artifact-uploader.ts` call sites to `storage.ts`
- [ ] Team sharing for research projects (extend ownership check in `/api/ws/ticket`)
- [ ] Dependency drift fix: Stripe v14→v17, zod v3→v4, @types/node v20→v22
- [ ] Hetzner host migration (independent of Phase A)
- [ ] Worker test count target: 200+ by end of Q3 (current 133, primary gaps in adapter integration suites)

## 1. What this body of work is

Phase A is the transition from local-Playwright + Supabase Storage to
a production-grade scrape stack:

| Piece          | What's there today                  | What Phase A adds                             | Activation gate                |
| -------------- | ----------------------------------- | --------------------------------------------- | ------------------------------ |
| Browser        | Local Playwright on the worker host | Browserbase managed CDP + residential proxies | `BROWSER_BACKEND=browserbase` + `BROWSERBASE_API_KEY` |
| CAPTCHA        | Manual escalation only              | CapSolver auto-solve + 3-strike retry         | `CAPTCHA_PROVIDER=capsolver` + `CAPSOLVER_API_KEY`     |
| Storage        | Supabase Storage via artifact-uploader.ts | Cloudflare R2 via storage.ts (side-by-side) | `STORAGE_BACKEND=r2` + R2 creds |
| Real-time UI   | Polling                             | WebSocket research-progress channel           | `WS_TICKET_SECRET` + `npm run ws` running |

The PR this doc lands in **only ships the prep wiring**: stubs, tests,
abstractions, and env-var gates. Every new path defaults OFF. Real
activation is a **flip-the-flag** operation per integration once
accounts are provisioned.

## 2. Why prep separately from activation

- **Account provisioning is on a separate critical path.** Browserbase
  and CapSolver paid accounts, R2 bucket creation, and Hetzner host
  procurement all involve external dependencies (legal review,
  procurement, billing setup). Decoupling lets engineering work proceed
  without blocking on those.
- **One PR for the whole prep keeps the abstractions consistent.**
  Splitting Browserbase / CapSolver / R2 / WS into four separate PRs
  would create four different patterns for "how do we gate a real
  integration" and we'd have to refactor at least two of them.
- **Activation is small and reviewable.** Once an account is
  provisioned, the activation PR is just an env-var change in the
  deploy config + this checklist.

## 3. Code map

The single source of truth for "where does the wiring live":

```
worker/
├─ package.json
│  ├─ @browserbasehq/sdk@2.10.0          ← exact pin, no caret
│  ├─ @aws-sdk/client-s3@3.1034.0
│  └─ @aws-sdk/s3-request-presigner@3.1034.0
├─ src/
│  ├─ shared/
│  │  ├─ research-events.ts               ← canonical event catalog (zod)
│  │  └─ ws-ticket.ts                     ← HMAC ticket issue/verify
│  ├─ lib/
│  │  ├─ browser-factory.ts               ← Browser backend gate (per-adapter)
│  │  ├─ captcha-solver.ts                ← Provider + 3-strike retry + telemetry
│  │  ├─ captcha-solver-http.ts           ← CapSolver REST client
│  │  ├─ storage.ts                       ← R2 / local document storage
│  │  └─ research-events-emit.ts          ← Worker → Redis publisher
│  └─ __tests__/
│     ├─ browser-factory.test.ts          ← 21 tests
│     ├─ captcha-solver.test.ts           ← 25 tests
│     ├─ research-events.test.ts          ← 16 tests
│     ├─ research-events-emit.test.ts     ← 5 tests
│     └─ storage.test.ts                  ← 14 tests

server/
└─ ws.ts                                  ← Standalone WS server (port 3001)

app/
└─ api/ws/ticket/route.ts                 ← next-auth-gated ticket issuance

lib/
└─ research/useResearchProgress.ts        ← React hook for the consumer

seeds/
└─ 201_captcha_solves.sql                 ← Migration (NOT applied yet)

docs/
├─ platform/
│  ├─ WEBSOCKET_ARCHITECTURE.md           ← Process topology + auth flow
│  └─ STORAGE_LIFECYCLE.md                ← R2 bucket layout + lifecycle rules
└─ planning/in-progress/
   └─ PHASE_A_INTEGRATION_PREP.md         ← This doc
```

## 4. Architecture decisions (why the wiring looks the way it does)

These are the load-bearing choices. Don't change them without reading
the rationale.

### 4.1 Single browser-factory gate, per-adapter routing

`worker/src/lib/browser-factory.ts` is the **only** place that decides
local vs Browserbase. Adapters identify themselves with their
filename-stem `adapterId`; the factory consults
`BROWSERBASE_ENABLED_ADAPTERS` (a comma-separated set) to decide
whether each call routes to Browserbase. This keeps the touch surface
to ~3 files for the factory + 1 line per adapter.

Unknown adapter ids are warned-and-ignored at startup, not
hard-failed: the env var should never block a deploy, even if a typo
appears.

`resolveBackend()` is **deliberately strict** — only `opts.backend`
or `BROWSER_BACKEND=browserbase` route to Browserbase. Earlier rules
that auto-promoted on `BROWSERBASE_API_KEY` presence or auto-stubbed
on `NODE_ENV=test` were stripped to make the gate predictable.

### 4.2 CapSolver retry + telemetry inside `solve()`

The 3-strike retry, the `recordSolveAttempt()` telemetry, and the
final `CaptchaEscalationRequired` throw all live **inside** the
`solve()` function. Callers see exactly two outcomes: a token, or an
escalation error. They never call telemetry directly.

This means:
- Future "add a fourth challenge type" PRs touch one file.
- Counting solves correctly for billing is automatic.
- We never lose a solve attempt to a forgotten caller-side log line.

### 4.3 Storage abstraction is side-by-side, not a migration

`worker/src/lib/storage.ts` (R2 + local backends) coexists with
`worker/src/services/artifact-uploader.ts` (Supabase Storage). The
header comment in `storage.ts` and the activation runbook in §6.3
both make this explicit: **new code uses storage.ts; old call sites
stay where they are**. A future PR migrates artifact-uploader.ts call
sites once R2 is live.

Two namespaces, no collision possible:
- artifact-uploader keys: `pipeline-artifacts/<jobId>/…` (Supabase)
- storage.ts keys:        `documents/<jobId>/…`           (R2 or local)

### 4.4 WebSocket: separate process, Redis pub/sub fan-out

The WS server is a standalone Node process (`server/ws.ts`, port
3001), not embedded in Next.js. Reasons in
[`docs/platform/WEBSOCKET_ARCHITECTURE.md`](../../platform/WEBSOCKET_ARCHITECTURE.md).

Worker → WS server transport is **Redis pub/sub**, not direct TCP and
not BullMQ events. Reasons:
- BullMQ events are job-lifecycle granularity (queued/active/completed),
  not application granularity (per-document, per-CAPTCHA).
- Direct TCP would couple worker deploys to WS server uptime.
- Redis is already in the stack for BullMQ.

### 4.5 WS auth = HMAC ticket with separate secret

The WS auth ticket is a JWT-shaped HMAC-SHA256 token (see
`worker/src/shared/ws-ticket.ts`). Signed with `WS_TICKET_SECRET`,
**not** `NEXTAUTH_SECRET`. Reasons:
- Browsers don't send cookies on cross-origin WS handshakes; we can't
  reuse the next-auth cookie.
- Separate secrets mean independent rotation; a compromise of one
  doesn't compromise the other.
- Short TTL (60s) means a leaked ticket is harmless within a minute;
  the React hook auto-refreshes on reconnect.

We deliberately did **not** pull in `jose` or `jsonwebtoken` —
HMAC-SHA256 with `node:crypto` is ~80 lines and avoids a new
dependency for such a small surface.

### 4.6 Shared schemas live under `worker/src/shared/`

Tempting to put `research-events.ts` and `ws-ticket.ts` under
`lib/shared/` at the repo root, but the worker's `tsconfig.json` has
`rootDir: ./src` which forbids cross-imports. Putting them under
`worker/src/shared/` keeps a single source file that all three
consumers (worker emit, Next ticket route, server/ws.ts) import —
zero schema drift possible.

The Next.js side imports them via the `@/worker/src/shared/...` path
alias; `server/ws.ts` uses a relative path.

### 4.7 Optional runtime SDKs use variable-indirected dynamic import

`@browserbasehq/sdk` and `@aws-sdk/client-s3` are **worker-only**
runtime dependencies. They are NOT installed at the repo root. But
the root Next.js typecheck transitively reaches `browser-factory.ts`
and `storage.ts` via API routes that import `@/worker/src/...`.

To prevent root-side `Cannot find module` errors without polluting the
Next.js bundle with these SDKs, we route the dynamic import specifier
through a variable:

```ts
const moduleId = '@browserbasehq/sdk';
const { default: SDK } = await import(moduleId);
```

TypeScript treats `import(variable)` as `any`, so module resolution is
deferred to runtime. The worker's tsc context (where the SDK is in
`node_modules`) still resolves it normally. Comments at both call
sites explain this so a well-meaning future maintainer doesn't
"fix" it back to the literal-string form.

## 5. Test inventory (Phase A prep PR)

| Suite                           | Tests | What it covers                                                              |
| ------------------------------- | ----- | --------------------------------------------------------------------------- |
| browser-factory.test.ts         | 21    | Stub backend, env parsing, per-adapter gate, warn-and-ignore unknown ids    |
| captcha-solver.test.ts          | 25    | Stub modes, retry, escalation, recordSolveAttempt, cache, factory selection |
| research-events.test.ts         | 16    | Schema round-trip per event type, channel name helpers, ticket HMAC + exp   |
| research-events-emit.test.ts    | 5     | Channel routing, JSON shape, schema rejection, best-effort failure          |
| storage.test.ts                 | 14    | Local fs round-trip, traversal rejection, R2 mocked SDK round-trip          |

Total worker tests: was 67, now **133 passing**, all in stub mode (no
real network). Expectation for future PRs: keep this number monotonic
unless a test is being deliberately retired.

Root tests are unchanged from the baseline (23 pre-existing failures —
see CONTRIBUTING.md).

## 6. Activation runbooks

Each integration has its own runbook. **Do not skip steps.** Every
runbook ends with a verification step that produces an artifact you
should attach to the activation PR for review.

### 6.1 Browserbase activation

Prereq: Browserbase paid account, project created.

1. **Provision creds.** Set on the worker host:
   ```
   BROWSERBASE_API_KEY=<from Browserbase dashboard>
   BROWSERBASE_PROJECT_ID=<from Browserbase dashboard>
   ```
2. **Smoke test in stub-of-real mode.** Deploy with
   `BROWSER_BACKEND=local` first to confirm nothing else broke.
3. **Pilot one adapter.** Pick a low-volume adapter (suggested:
   `bell-clerk-adapter`). Set:
   ```
   BROWSER_BACKEND=browserbase
   BROWSERBASE_ENABLED_ADAPTERS=bell-clerk
   ```
   Run a single research job and verify in Browserbase dashboard that
   the session shows up. Verify the worker logs include
   `[browser-factory] backend=browserbase adapter=bell-clerk`.
4. **Cost calibration.** Run for one full day. Compare Browserbase
   billing to estimated request count. Adjust adapter list before
   broadening.
5. **Broaden gradually.** Add adapters one or two per day:
   ```
   BROWSERBASE_ENABLED_ADAPTERS=bell-clerk,fidlar-clerk,kofile-clerk
   ```
6. **Monitor for 1 week.** Watch for `Browserbase session create`
   failures (means we ran out of concurrency).

Rollback: set `BROWSERBASE_ENABLED_ADAPTERS=` (empty). All adapters
fall back to local Playwright instantly. No code change needed.

### 6.2 CapSolver activation

Prereq: CapSolver account, paid balance, supported challenge types
verified against the four we use (Turnstile, reCAPTCHA v2/v3, hCaptcha).

1. **Apply the migration.** Run `seeds/201_captcha_solves.sql`
   against the database. Update the migration tracker.
2. **Provision creds.** Set on the worker host:
   ```
   CAPSOLVER_API_KEY=<from CapSolver dashboard>
   ```
3. **Stay in stub mode for the deploy.** First deploy keeps
   `CAPTCHA_PROVIDER=stub`. Verify nothing regressed.
4. **Flip to capsolver.** Set `CAPTCHA_PROVIDER=capsolver`. Watch
   `captcha_solves` table fill — every attempt (success or failure)
   should produce a row.
5. **Cost calibration.** After 24h, query:
   ```sql
   SELECT challenge_type, count(*), sum(cost_estimate)
     FROM captcha_solves
    WHERE created_at > now() - interval '1 day'
    GROUP BY challenge_type;
   ```
   Compare to CapSolver dashboard. Should match within rounding.
6. **Verify escalation works.** Manually trigger a job for a county
   with a known-difficult CAPTCHA. After 3 failed attempts, you
   should see `CaptchaEscalationRequired` in worker logs and a row
   with `success=false` for each of the three attempts in
   `captcha_solves`.

Rollback: set `CAPTCHA_PROVIDER=stub`. Solve attempts immediately
return deterministic stub tokens; no Supabase write happens.

### 6.3 Cloudflare R2 activation

Prereq: Cloudflare account with R2 enabled, billing active.

1. **Create the buckets.** Per
   [`docs/platform/STORAGE_LIFECYCLE.md`](../../platform/STORAGE_LIFECYCLE.md):
   ```
   wrangler r2 bucket create starr-recon-artifacts
   wrangler r2 bucket create starr-recon-regression
   ```
2. **Apply lifecycle rules.** Use the JSON in STORAGE_LIFECYCLE.md §2.
   Verify in dashboard.
3. **Provision creds** (R2 API tokens with read+write to both buckets):
   ```
   R2_ACCOUNT_ID=<from Cloudflare dashboard>
   R2_ACCESS_KEY_ID=<from token>
   R2_SECRET_ACCESS_KEY=<from token>
   R2_BUCKET=starr-recon-artifacts
   ```
4. **Flip the backend.** `STORAGE_BACKEND=r2`. New uploads (Phase A
   integrations only — artifact-uploader.ts unchanged) go to R2.
5. **Verify a round-trip.** Run any job that produces a Phase-A
   document. Confirm in the R2 dashboard that
   `documents/<jobId>/<filename>` exists. Download via signed URL.

Rollback: `STORAGE_BACKEND=local`. Existing R2 documents stay where
they are; new writes go to disk. (No active migration needed since
artifact-uploader.ts call sites still write to Supabase regardless.)

### 6.4 WebSocket activation

Prereq: Redis reachable from both worker and WS server.

1. **Generate the secret** (different from NEXTAUTH_SECRET):
   ```
   openssl rand -hex 32
   ```
2. **Set on Next.js host AND WS host:**
   ```
   WS_TICKET_SECRET=<the hex>
   WEBSOCKET_PORT=3001
   ```
3. **Set on browser-side** (only if WS is on a different host than the app):
   ```
   NEXT_PUBLIC_WS_URL=wss://realtime.starr-surveying.com
   ```
4. **Run the WS server.** Add `npm run ws` to the systemd unit /
   process manager on the WS host. Verify `/healthz` returns 200.
5. **Smoke test.** In a browser session signed in as a user with at
   least one research project:
   ```js
   const r = await fetch('/api/ws/ticket', {
     method: 'POST',
     body: JSON.stringify({ jobIds: ['<a job id>'] }),
     headers: { 'content-type': 'application/json' },
   });
   const { ticket } = await r.json();
   const ws = new WebSocket(`wss://realtime.starr-surveying.com/?ticket=${ticket}`);
   ws.onmessage = (m) => console.log(JSON.parse(m.data));
   ```
   You should see a `{"type":"hello",...}` frame within 1s.
6. **Wire the worker to emit.** Worker code is already wired to
   publish — see `lib/research-events-emit.ts`. Just confirm
   `REDIS_URL` is the same Redis the WS server pSubscribes to.
7. **Wire the React UI.** First consumer is the active-research view
   (planned in `app/admin/research/[id]/`). Use
   `useResearchProgress(jobIds)`. The hook self-recovers on
   disconnect.

Rollback: stop `npm run ws`. The Next.js `/api/ws/ticket` route
keeps issuing tickets but no server is listening, so connections fail
silently. Worker emits become no-ops (Redis publishes with no
subscribers are dropped). The polling fallback in the UI continues
to work.

## 7. Open follow-ups (not in this PR)

These are deliberately out of scope for the prep PR. Each gets its
own dedicated PR.

- [ ] **`lib/research/` → `lib/starr-recon/` rename.** Touches every
      import in the repo. CONTRIBUTING.md §Naming locks the new name;
      the actual move is a future cleanup.
- [ ] **Migrate artifact-uploader.ts call sites to storage.ts.**
      Requires R2 to be live and a careful coordinated rewrite of
      share-link generation + RLS policies.
- [ ] **Team sharing for research projects.** Today the WS ticket
      route gates on `created_by = user.email`. When team sharing
      lands, fall back to a `project_collaborators` table check.
- [ ] **Stripe v14 → v17 + zod v3 → v4 + @types/node v20 → v22**
      worker-vs-root drift. Tracked in CONTRIBUTING.md
      §Dependency policy.
- [ ] **Worker test count target.** This PR brings worker tests from
      67 → 133. The unwritten goal for end of Q3 is 200+; primary
      gaps are the adapter integration suites.
- [ ] **Hetzner host migration.** Worker still runs on a
      DigitalOcean droplet. Phase A activation does NOT require the
      Hetzner move; it can happen in parallel.

## 8. Update protocol for this doc

When you change anything in this body of work:

1. **Add a row** to §3 (Code map) if you create a new file.
2. **Add a runbook section** in §6 if you add a new integration.
3. **Update §5 test counts** if you add or remove tests.
4. **Tick the relevant §7 box** if you complete a follow-up.
5. **Bump the "Last updated" date** at the top.
6. If you rename or move a file referenced anywhere in this doc, run
   `grep -rln '<old-path>' docs/` first and fix every reference.

Do **not** delete sections from this doc when an integration goes
live. Move them under a new "## 9. Activated integrations" heading
with the activation date so future maintainers can see the history.

## 9. Cross-references

- Architecture overview: [`docs/platform/WEBSOCKET_ARCHITECTURE.md`](../../platform/WEBSOCKET_ARCHITECTURE.md)
- Storage layout: [`docs/platform/STORAGE_LIFECYCLE.md`](../../platform/STORAGE_LIFECYCLE.md)
- Naming + dependency rules: [`CONTRIBUTING.md`](../../../CONTRIBUTING.md)
- Recon system inventory (the bigger picture): [`docs/platform/RECON_INVENTORY.md`](../../platform/RECON_INVENTORY.md)
- Per-phase Recon plans: [`docs/planning/in-progress/STARR_RECON/`](./STARR_RECON/)
