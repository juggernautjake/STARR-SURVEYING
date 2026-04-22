# Logging Conventions

This document is the canonical reference for diagnostic logging across the
STARR RECON pipeline (worker, Next.js API routes, server/ws.ts, and
client-side hooks under `lib/research/`). Follow it for **new code** and
when **modifying existing logging**.

The Research & Analysis "log viewer" tab and the worker console are the
only operator-facing windows into a running pipeline. If a captcha solve,
storage upload, browser launch, or websocket fan-out happens silently,
operators have no way to know whether the system is working until a human
reports a problem.

---

## 1. Scope

This doc covers **diagnostic logging** — `console.log` / `console.warn` /
`console.error` calls intended to help an operator or developer understand
what the running system is doing.

Out of scope:

- **CLI banner output** (route listings, help text, formatted report
  output). These intentionally do not use a `[component]` prefix because
  they are user-facing presentation, not diagnostics. Examples:
  `worker/src/index.ts` route listing, `worker/src/cli/starr-research.ts`
  formatted report sections.
- **Structured `PipelineLogger` calls** (`logger.attempt(...).success(...)`).
  Those follow their own established `[projectId] icon [layer] method →
  source` format and are bridged into the timeline tracker. See
  `worker/src/lib/logger.ts`.

---

## 2. The convention

Every diagnostic log line MUST start with a lowercase bracketed component
tag that names the file/module producing the log.

```
[component] short verb-led summary key1=value1 key2=value2 (Nms)
```

### Component tag

- **Lowercase**, **hyphen-separated**, in square brackets. Match the
  filename stem when possible.
- For sub-components, append `:subcomponent` — e.g.
  `[storage:r2]`, `[storage:local]`, `[captcha-solver:capsolver]`,
  `[captcha-solver:stub]`.
- Examples in active use:
  - `[ws-server]`, `[ws-ticket]`
  - `[captcha-solver]`, `[captcha-solver-http]`
  - `[storage:local]`, `[storage:r2]`
  - `[research-events-emit]`
  - `[browser-factory]`
  - `[useResearchProgress]` (client-side hook)

### Message body

- **Verb-led, concise.** `upload ok`, `fan-out phase_started`,
  `client connected`, `cache miss`, `escalating after attempt 3/3`.
- **Use `key=value` pairs** rather than prose for machine-greppable context.
  Examples: `jobId=abc123`, `bytes=4096`, `status=ready`, `cost=$0.0008`.
- **Always include duration** in `(Nms)` for any operation that does I/O.
- **Always include the resource identifier** when relevant: jobId,
  storageKey, sessionId, taskId, adapterId, channel name.

### Severity levels

| Level | Use |
|---|---|
| `console.log`   | Successful operation, lifecycle events (connected, ready, released). |
| `console.warn`  | Recoverable error, retry, missing optional config, fallback path taken. Operations that may need attention. |
| `console.error` | Unrecoverable error, fatal misconfiguration, escalation required, lost work. Operator must act. |

### Secrets

NEVER log raw secrets. Use the `maskKey()` helper in
`worker/src/lib/captcha-solver-http.ts` (`abcd…wxyz (32 chars)`), or
strip credentials from URLs (`url.replace(/:[^/@]*@/, ':****@')`).

### Multi-line / object dumps

Avoid `console.log(someObject)` for diagnostic logs — it produces
unreadable multi-line output that breaks log aggregators. Instead:

- For an error: `console.warn('[component] x failed:', err.message)`.
- For a structured payload: serialize with `JSON.stringify(o)` or pluck
  the keys you actually need into a `key=value` line.

---

## 3. Examples (good)

```ts
// Operation start
console.log(`[storage:r2] upload ok jobId=${jobId} key=${key} bytes=${bytes.byteLength} contentType=${contentType} (${Date.now() - start}ms)`);

// Recoverable failure
console.warn(`[captcha-solver] attempt ${i + 1}/${MAX_ATTEMPTS} failed (${cat}) — backing off ${backoff}ms`);

// Escalation
console.error(`[captcha-solver] ESCALATION REQUIRED type=${req.type} host=${safeHost(req.pageUrl)}: ${lastMsg}`);

// Lifecycle
console.log(`[ws-server] client disconnected ${remote} userId=${payload.userId} code=${code} (total clients: ${clients.size})`);

// Routing decision
console.log(`[browser-factory] adapter "${opts.adapterId}" gated → local (add to BROWSERBASE_ENABLED_ADAPTERS to enable)`);
```

## 4. Examples (bad)

```ts
// No prefix — operator can't tell which file logged this
console.warn('Census geocoder failed:', e);                    // ✗

// Wraps the whole error object — unreadable
console.error('[storage] upload failed:', err);                // ✗ (use err.message)

// Missing context — what was uploaded? to where?
console.log('[storage:r2] upload ok');                         // ✗

// Logs the secret
console.log(`[storage:r2] using key ${process.env.R2_SECRET}`); // ✗ NEVER
```

---

## 5. Log viewer integration

Worker logs are tailed by the Research & Analysis log viewer. A diagnostic
log appears in the viewer as soon as it is written to stdout/stderr —
there is no extra wiring needed beyond using `console.log/warn/error`.

For logs that should also surface in the **structured pipeline timeline**
(rendered by `ExecutionTimeline` in the Testing Lab), use
`PipelineLogger.attempt()` instead of (or in addition to) `console.log`.
PipelineLogger writes both to console (with the `[projectId] icon [layer]
method → source` format) and to the timeline tracker.

A captcha solve attempt, for example, has both:

1. `[captcha-solver] ✓ capsolver recaptcha_v2 1240ms cost=$0.0008 (job=abc adapter=tyler-clerk)`
   — emitted by the default `consoleSolveAttemptSink` in
   `worker/src/lib/captcha-solver.ts`. Surfaces in the worker console
   and the live log viewer.
2. The scraper that called `solver.solve()` should ALSO record a
   `PipelineLogger.attempt('captcha', 'capsolver', 'recaptcha_v2', host)
   .success(1, '$0.0008')` so the timeline tracker has a node to render.

---

## 6. Enforcement

There is currently no automated lint rule. When reviewing a PR that adds
or changes a `console.*` call:

1. Confirm a `[component]` prefix is present (or that the call is part of
   intentional CLI banner output).
2. Confirm the message has enough context to debug a production issue
   without re-running the code.
3. Confirm no secret material is logged.
4. Confirm the severity level matches the operator action required.

See `docs/style/STYLE_GUIDE.md` for general code style rules.
