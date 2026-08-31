// worker/src/infra/host-circuit.ts — stop re-proving that a host is down.
//
// ── THE 213 SECONDS THIS EXISTS FOR ─────────────────────────────────────────────────────────────
//
// From the owner's run, 2026-08-30. `esearch.bellcad.org` refused the worker at the CONNECTION
// level on the first attempt, and the pipeline then spent three and a half minutes discovering that
// fact five more times:
//
//     [+21983ms]  Error fetching property 350347: fetch failed
//     [+32480ms]  Session acquisition failed: fetch failed
//      26002ms    Stage1A-Keyword — Failed to acquire session token
//       8001ms    Stage1A-Recaptcha — operation aborted due to timeout
//      70161ms    Stage1B CAD-Playwright — page.goto: Timeout 30000ms exceeded
//      26003ms    Stage1A-Keyword (again, different variant)
//      26002ms    Stage1A-Keyword (again)
//     [+213496ms] ⚠ Bell CAD site unreachable — will fall back to GIS/Clerk
//
// Every one of those was correct in isolation: try the next variant, then the next layer. None of
// them knew the host had already refused a TCP connection, so each paid its own full timeout.
//
// ── WHY ONLY CONNECTION-LEVEL FAILURES TRIP IT ──────────────────────────────────────────────────
//
// An HTTP status — 403, 404, 500 — means the host ANSWERED. That is a working host with a problem,
// and the next request may well succeed: a different path, a session that needed a cookie, a rate
// limit that has passed. Tripping on those would blacklist a live portal over one bad page.
//
// `fetch failed`, DNS failure, connection refused and connect timeouts mean nothing answered. A
// second attempt one second later will not answer either. That is the only case worth remembering.
//
// This distinction is the same one that cost this project a day on Google's three different 403s:
// the status code alone does not say what happened, and treating two opposite outcomes as one is
// how a system stops being able to tell them apart.
//
// ── WHY A TTL AND NOT A RUN FLAG ────────────────────────────────────────────────────────────────
//
// The worker is long-lived and hosts recover. A permanent blacklist would turn a ten-minute county
// outage into a dead adapter until somebody restarted the box — trading a slow run for a silently
// broken one, which is the worse failure. The circuit re-closes on its own.

/** How long a host stays tripped. Long enough to save a run, short enough that a recovered portal
 *  comes back without intervention. */
export const HOST_CIRCUIT_TTL_MS = 10 * 60_000;

interface TrippedHost {
  reason: string;
  trippedAt: number;
}

const tripped = new Map<string, TrippedHost>();

/** Host of a URL, or the input itself when it is not parseable — a bad URL should not throw here. */
export function hostOfUrl(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Is this failure a "nothing answered" failure?
 *
 * Deliberately conservative: anything not recognised is treated as NOT connection-level, so an
 * unfamiliar error degrades to today's behaviour (retry) rather than to a blacklisted host.
 */
export function isConnectionLevelFailure(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).toLowerCase();
  const code = String((err as { code?: unknown })?.code ?? '').toLowerCase();

  const markers = [
    'fetch failed',          // undici's connection-level wrapper — the one in the owner's log
    'enotfound',             // DNS
    'eai_again',             // DNS, transient
    'econnrefused',
    'econnreset',
    'ehostunreach',
    'enetunreach',
    'etimedout',
    'connect timeout',
    'socket hang up',
    'aborted due to timeout',
    'timeouterror',
  ];
  return markers.some((m) => msg.includes(m) || code.includes(m));
}

/** Record that a host did not answer. No-op for failures that are not connection-level. */
export function tripHost(url: string, err: unknown, now: number = Date.now()): boolean {
  if (!isConnectionLevelFailure(err)) return false;
  const host = hostOfUrl(url);
  if (!tripped.has(host)) {
    const reason = err instanceof Error ? err.message : String(err);
    tripped.set(host, { reason, trippedAt: now });
  }
  return true;
}

export interface CircuitState {
  down: boolean;
  /** Why it was tripped — carried so a skip message can say what actually happened. */
  reason?: string;
  /** Milliseconds since it tripped. */
  ageMs?: number;
}

/** Should we skip contacting this host? Expired entries are cleared as they are read. */
export function hostCircuit(url: string, now: number = Date.now()): CircuitState {
  const host = hostOfUrl(url);
  const entry = tripped.get(host);
  if (!entry) return { down: false };

  const ageMs = now - entry.trippedAt;
  if (ageMs >= HOST_CIRCUIT_TTL_MS) {
    tripped.delete(host);
    return { down: false };
  }
  return { down: true, reason: entry.reason, ageMs };
}

/** For tests, and for resetting between runs if a caller wants a clean slate. */
export function resetHostCircuits(): void {
  tripped.clear();
}

/** How many hosts are currently tripped. Worth surfacing on /healthz: a run that is skipping a
 *  portal should be visibly skipping it, not quietly returning less. */
export function trippedHostCount(): number {
  return tripped.size;
}
