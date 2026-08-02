// worker/src/infra/politeness.ts — not looking like a load test (research plan R12).
//
// ── WHY THIS SITS INSIDE THE SELF-HEALING WORK ──────────────────────────────────────────────────
//
// Everything else in Phase B assumes we can still reach the county. An adapter whose IP has been
// blocked is not a broken adapter — it is an unfixable one: the repair agent cannot diagnose a page
// it cannot load, the canary cannot prove anything, and no amount of registry editing brings the
// access back. Politeness is what keeps the rest of the machinery able to work at all.
//
// The exposure is real and it grew this session. The health monitor opens every registered portal
// on a timer; the capacity ceiling allows six concurrent runs; each run hits a county's search,
// results and document pages repeatedly. Nothing coordinated any of that — three runs on the same
// county fired whenever they happened to be ready.
//
// These are small government servers. The fastest way to lose a county is to look like a load test
// on a Tuesday morning.
//
// ── ONE REQUEST AT A TIME, PER HOST, WITH A GAP ─────────────────────────────────────────────────
//
// Per HOST rather than per adapter or per county, because that is the thing with a rate limit
// behind it: five counties on `*.tx.publicsearch.us` share Tyler's infrastructure, and politely
// pacing each one separately would still deliver five times the traffic to the same servers.

export interface PolitenessOptions {
  /** Minimum gap between the START of one request and the next, per host. */
  minIntervalMs?: number;
  /** Random extra delay, 0..jitterMs. Requests that arrive on an exact cadence look automated even
   *  when they are slow; a little scatter is both politer and less fingerprintable. */
  jitterMs?: number;
}

/** Default gap. 1.5s is slower than a person clicking and far slower than anything that would
 *  register as load, while still allowing ~40 pages a minute per host — more than a run needs. */
export const DEFAULT_MIN_INTERVAL_MS = 1_500;
export const DEFAULT_JITTER_MS = 400;

interface HostState {
  /** Resolves when the current holder releases. Serialises the host to one in-flight request. */
  chain: Promise<void>;
  /** Null until the first request. NOT 0: with a zero sentinel the very first contact with a county
   *  waits a full interval for nothing, which across a 21-county health sweep is half a minute of
   *  delay that protects no one — and makes the pacing look broken to whoever times it. */
  lastStartedAt: number | null;
}

const hosts = new Map<string, HostState>();

export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    // A malformed URL is its own bucket rather than sharing one with everything else; two bad URLs
    // should not serialise against each other for no reason.
    return `invalid:${url.slice(0, 40)}`;
  }
}

function intervalFor(opts: PolitenessOptions | undefined, env: NodeJS.ProcessEnv): number {
  if (opts?.minIntervalMs !== undefined) return opts.minIntervalMs;
  const fromEnv = Number(env.CLERK_RATE_LIMIT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MIN_INTERVAL_MS;
}

/** Run `fn` politely against `url`'s host: never concurrently with another call to the same host,
 *  and never sooner than the minimum interval after the previous one started.
 *
 *  Returns whatever `fn` returns, and a failure inside `fn` still releases the host — a thrown
 *  error must not wedge every later request to that county behind a promise that never settles. */
export async function withPoliteness<T>(
  url: string,
  fn: () => Promise<T>,
  opts?: PolitenessOptions,
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const host = hostOf(url);
  const minInterval = intervalFor(opts, env);
  const jitter = opts?.jitterMs ?? DEFAULT_JITTER_MS;

  const state = hosts.get(host) ?? { chain: Promise.resolve(), lastStartedAt: null };
  hosts.set(host, state);

  const previous = state.chain;
  let release!: () => void;
  state.chain = new Promise<void>((resolve) => { release = resolve; });

  await previous;

  // First contact goes straight through — there is nothing to be polite about yet.
  const since = state.lastStartedAt === null ? Infinity : now() - state.lastStartedAt;
  const wait = Math.max(0, minInterval - since) + (state.lastStartedAt === null ? 0 : Math.floor(Math.random() * jitter));
  if (wait > 0) await sleep(wait);
  state.lastStartedAt = now();

  try {
    return await fn();
  } finally {
    release();
  }
}

/** How many hosts are currently being paced. Reported by /healthz so a run that is being throttled
 *  is visible as throttled rather than as slow. */
export function trackedHosts(): number {
  return hosts.size;
}

export function resetPoliteness(): void {
  hosts.clear();
}

// ── Automation posture ──────────────────────────────────────────────────────────────────────────
//
// Some county portals forbid automated access in their terms. Which counties this firm is willing
// to automate is an OWNER decision (plan §4.3), not a default, so the posture is data on the
// adapter rather than a constant here — and the one place it is enforced is captcha solving.
//
// The rule: **we do not solve a captcha on a site whose terms we have not confirmed permit
// automation.** A captcha is the site saying "prove you are a person"; answering it with a paid
// solving service on a portal that prohibits automation is not a grey area.

export type AutomationPosture = 'permitted' | 'unknown' | 'prohibited';

export function postureFrom(config: Record<string, unknown> | null | undefined): AutomationPosture {
  const raw = config?.automation_posture;
  return raw === 'permitted' || raw === 'prohibited' ? raw : 'unknown';
}

export interface CaptchaPolicyDecision {
  allowed: boolean;
  reason: string;
}

/** May we solve a captcha here?
 *
 *  `unknown` is a refusal, not a shrug. Defaulting to "go ahead unless someone said no" would mean
 *  the first time anybody reads a county's terms is after a complaint. */
export function maySolveCaptcha(posture: AutomationPosture, county?: string): CaptchaPolicyDecision {
  const where = county ? ` for ${county}` : '';
  switch (posture) {
    case 'permitted':
      return { allowed: true, reason: `automation is recorded as permitted${where}` };
    case 'prohibited':
      return { allowed: false, reason: `this portal's terms prohibit automated access${where} — solving its captcha is not a grey area` };
    case 'unknown':
    default:
      return {
        allowed: false,
        reason: `nobody has confirmed whether automated access is permitted${where}. Set automation_posture on the adapter once the terms have been read.`,
      };
  }
}
