# WebSocket Architecture — Real-Time Research Progress

This doc covers the wiring added in the Phase A integration prep PR. The
WebSocket layer is **enabled by default in dev** but only when
`WS_TICKET_SECRET` is set; without that secret the ticket route returns
503 and the worker emit helper publishes silently into Redis (which the
WS server, not running, never consumes). No production behavior change
ships from the current PR.

## Process Topology

```
┌──────────────┐   1. POST /api/ws/ticket           ┌──────────────────┐
│  Browser     │ ─────────────────────────────────► │  Next.js (3000)  │
│  React app   │ ◄───────────────────────────────── │  /api/ws/ticket  │
│              │   { ticket, exp }                  │  (next-auth)     │
│              │                                    └──────────────────┘
│              │   2. ws://host:3001/?ticket=…      ┌──────────────────┐
│              │ ─────────────────────────────────► │  server/ws.ts    │
│              │ ◄───────────────────────────────── │  (3001, ws lib)  │
│              │   "hello" + ResearchEvent stream   └────────▲─────────┘
└──────────────┘                                             │
                                                             │ pSubscribe
                                                             │ research-events:*
                                                    ┌────────┴─────────┐
                                                    │  Redis           │
                                                    │  (BullMQ host)   │
                                                    └────────▲─────────┘
                                                             │ publish
                                                             │
                                                    ┌────────┴─────────┐
                                                    │  Worker          │
                                                    │  (DO droplet)    │
                                                    │  emit() helper   │
                                                    └──────────────────┘
```

Three independent processes; all three **import the same source file**
(`worker/src/shared/research-events.ts`) for the event catalog, so the
schema cannot drift.

## Why Three Processes Instead of One

- **Vercel can't host long-lived sockets.** Even if it could, mixing
  serverless functions with persistent WS connections complicates
  deploys (every deploy would drop active connections).
- **The worker shouldn't talk to browsers.** It runs on a private
  droplet behind Cloudflare; opening it to inbound WS traffic would
  expand the attack surface.
- **Redis decouples the two.** Worker can restart, WS server can
  redeploy, neither blocks the other. Multiple worker instances can
  publish to the same channel.

## Auth Ticket Flow

Browsers do not send cookies on cross-origin WS handshakes, so we cannot
reuse the next-auth session cookie when the WS server runs on a
different port. Instead:

1. Browser hits `POST /api/ws/ticket` with `{ jobIds: [...] }`.
2. Route validates the next-auth session, then asserts the user owns
   every requested job (via `research_projects.created_by =
   session.user.email`).
3. Route returns an HMAC-SHA256 ticket of shape
   `header.payload.signature` (JWT-shaped but **not** a real JWT — we
   sign with raw HMAC to avoid pulling in `jose`/`jsonwebtoken` for
   such a small surface).
4. Browser opens `ws://host:3001/?ticket=<ticket>`.
5. WS server's `httpServer.upgrade` handler verifies the HMAC + the
   `exp` claim before completing the protocol switch.

Default TTL is **60 seconds** (constant
`WS_TICKET_DEFAULT_TTL_SECONDS`). The hook auto-fetches a fresh ticket
on reconnect so a long-lived UI session doesn't break.

`WS_TICKET_SECRET` is **distinct** from `NEXTAUTH_SECRET` so we can
rotate WS auth independently if a leak is suspected, and so a
compromise of one doesn't compromise the other.

## Event Catalog

All event shapes are defined as a zod discriminated union in
`worker/src/shared/research-events.ts`. Adding an event type is
backward compatible (old clients ignore it). Renaming or removing a
type is a **breaking change** — bump
`RESEARCH_EVENTS_PROTOCOL_VERSION` and document the migration in
`docs/planning/in-progress/PHASE_A_INTEGRATION_PREP.md`.

Channel naming convention:
```
research-events:<jobId>
```
Worker publishes to that channel; WS server pSubscribes to
`research-events:*` and filters per-client by the authorized `jobIds`
embedded in their ticket.

## Local Development

```bash
# Terminal 1 — Next.js
npm run dev

# Terminal 2 — WS server (needs Redis on REDIS_URL or localhost:6379)
WS_TICKET_SECRET=$(openssl rand -hex 32) npm run ws

# Terminal 3 — Worker (publishes events as it runs)
cd worker && npm run dev
```

In a browser console you can verify connectivity with:

```js
const r = await fetch('/api/ws/ticket', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jobIds: ['<a real job id you own>'] }),
});
const { ticket } = await r.json();
const ws = new WebSocket(`ws://localhost:3001/?ticket=${encodeURIComponent(ticket)}`);
ws.onmessage = (m) => console.log(JSON.parse(m.data));
```

## Files

| Path                                              | Role                                  |
| ------------------------------------------------- | ------------------------------------- |
| `worker/src/shared/research-events.ts`            | Canonical event catalog (zod union)   |
| `worker/src/shared/ws-ticket.ts`                  | HMAC ticket issue / verify            |
| `worker/src/lib/research-events-emit.ts`          | Worker-side `emit()` (Redis publish)  |
| `server/ws.ts`                                    | Standalone WS server (3001)           |
| `app/api/ws/ticket/route.ts`                      | Ticket issuance (Next.js, next-auth)  |
| `lib/research/useResearchProgress.ts`             | React hook for the consumer           |

## Production Activation Checklist

See [`docs/planning/in-progress/PHASE_A_INTEGRATION_PREP.md`](../planning/in-progress/PHASE_A_INTEGRATION_PREP.md)
"WebSocket activation" for the operator runbook.
