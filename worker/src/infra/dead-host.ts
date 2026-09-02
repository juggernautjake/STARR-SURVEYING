// worker/src/infra/dead-host.ts — A3: one unreachable host costs one timeout, not twelve.
//
// ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────────────────────────
//
// A Milam County run on 2026-09-02 spent 147 seconds in Stage 1 discovering that one host was down.
// `queryArcGisLayer` is called from nested loops — COMMON_SERVICES × COMMON_LAYERS × field aliases —
// and every call carries its own `AbortSignal.timeout(10_000)`. Against a host that never answers,
// twelve calls cost twelve full timeouts. The loops are not the mistake: probing service and layer
// names is genuinely how you find a county's parcel layer when nobody publishes it. The mistake is
// that the twelfth probe had no way to know the first eleven had already proved the host was dead.
//
// `infra/resilience.ts` already has a CircuitBreaker, and it did not cover this path — it is keyed by
// a fixed set of VENDOR names (kofile, fema, txdot…), declared up front. County GIS hosts are
// discovered at runtime from BIS_CONFIGS, so there is no name to declare. This module is keyed by
// HOSTNAME and populated on demand, which is the difference that matters.
//
// ── WHY "THE HOST ANSWERED" IS NOT "THE QUERY WORKED" ───────────────────────────────────────────
//
// The one thing this must never do is treat an HTTP error as a dead host.
//
// A 404 is the expected, useful answer to most of those probes: the loops walk candidate service and
// layer names precisely because most of them do not exist, and a 404 is how a LIVE server says "not
// that one, keep going". If a 404 tripped the gate, the first miss would cancel the search that was
// about to succeed — and Bell, which finds its layer partway down the list, would break. So the rule
// is transport-level only: a response with a status code, any status code, proves the host is up and
// RESETS the counter. Only a connection that never produced a response counts against it.
//
// ── WHY DNS AND TIMEOUT ARE NOT THE SAME STRIKE ─────────────────────────────────────────────────
//
// ENOTFOUND / ECONNREFUSED are unambiguous and near-instant: the host does not exist or refused the
// socket. One is enough, and it costs nothing to be sure.
//
// A timeout is ambiguous. A heavy spatial query against a live-but-slow county server can genuinely
// exceed 10 s, and cutting that host off after a single slow query would lose real data. Two
// CONSECUTIVE timeouts against the same host is not ambiguous. That still turns Milam's 147 s into
// ~20 s, which is the win the plan asked for, without the failure mode of trusting one slow request.

/** How long a host stays gated before it is allowed to prove itself again. */
const REVIVE_AFTER_MS = 5 * 60_000;

/** Consecutive timeouts before a host is considered unreachable. See the note above on ambiguity. */
const TIMEOUT_STRIKES = 2;

/** Connection-level failures are unambiguous — one is enough. */
const CONNECT_STRIKES = 1;

export type TransportFailure = 'timeout' | 'connect';

interface HostRecord {
  timeouts: number;
  connectFailures: number;
  /** When the host was gated, or 0 while it is still allowed through. */
  gatedAt: number;
  reason: TransportFailure | null;
}

const hosts = new Map<string, HostRecord>();

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function recordFor(host: string): HostRecord {
  let rec = hosts.get(host);
  if (!rec) {
    rec = { timeouts: 0, connectFailures: 0, gatedAt: 0, reason: null };
    hosts.set(host, rec);
  }
  return rec;
}

/**
 * Classify a thrown fetch error.
 *
 * Returns `null` for anything that is not a transport failure — a JSON parse error, for instance,
 * means the host answered with something unparseable, which is a bad ENDPOINT and a live HOST.
 */
export function classifyTransportError(err: unknown): TransportFailure | null {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';

  // undici nests the real cause: `TypeError: fetch failed` → `cause.code`.
  const codes: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur; depth += 1) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === 'string') codes.push(c);
    cur = (cur as { cause?: unknown }).cause;
  }

  for (const code of codes) {
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'ETIMEDOUT') {
      return 'timeout';
    }
    if (
      code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED' ||
      code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ECONNRESET' ||
      code === 'EPROTO' || code === 'UND_ERR_SOCKET'
    ) {
      return 'connect';
    }
  }
  return null;
}

/**
 * Is this host currently gated? Call before spending a timeout on it.
 *
 * A gated host is allowed through again after REVIVE_AFTER_MS, with its counters cleared, so a
 * server that comes back up is picked up by the next run rather than staying dead for the life of
 * the worker process.
 */
export function hostGate(url: string, now = Date.now()): { blocked: boolean; reason?: string } {
  const host = hostOf(url);
  if (!host) return { blocked: false };
  const rec = hosts.get(host);
  if (!rec || !rec.gatedAt) return { blocked: false };

  if (now - rec.gatedAt >= REVIVE_AFTER_MS) {
    rec.gatedAt = 0;
    rec.timeouts = 0;
    rec.connectFailures = 0;
    rec.reason = null;
    return { blocked: false };
  }

  const waited = Math.round((now - rec.gatedAt) / 1000);
  return {
    blocked: true,
    reason:
      `${host} was unreachable ${rec.reason === 'timeout' ? 'and timed out repeatedly' : 'at the connection level'} ` +
      `${waited}s ago — skipping without spending another timeout`,
  };
}

/**
 * The host produced an HTTP response. Any status code counts: a 404 is a live server saying "not
 * this path", which is the normal answer to most layer probes.
 */
export function noteHostAnswered(url: string): void {
  const host = hostOf(url);
  if (!host) return;
  const rec = hosts.get(host);
  if (!rec) return;
  rec.timeouts = 0;
  rec.connectFailures = 0;
  rec.gatedAt = 0;
  rec.reason = null;
}

/**
 * The connection never produced a response. Returns whether THIS failure is the one that closed the
 * gate, so the caller can say so once rather than on every subsequent skip.
 */
export function noteHostUnreachable(
  url: string,
  kind: TransportFailure,
  now = Date.now(),
): { host: string | null; justGated: boolean } {
  const host = hostOf(url);
  if (!host) return { host: null, justGated: false };
  const rec = recordFor(host);
  if (rec.gatedAt) return { host, justGated: false };

  if (kind === 'timeout') rec.timeouts += 1;
  else rec.connectFailures += 1;

  const tripped =
    rec.connectFailures >= CONNECT_STRIKES || rec.timeouts >= TIMEOUT_STRIKES;
  if (!tripped) return { host, justGated: false };

  rec.gatedAt = now;
  rec.reason = kind;
  return { host, justGated: true };
}

/** Test seam. Also worth calling between runs so one run's dead host is not another's verdict. */
export function resetDeadHosts(): void {
  hosts.clear();
}
