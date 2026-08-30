// /healthz — the endpoint the Dockerfile polled and the app never defined (research plan R1).
//
// The bug this closes: `HEALTHCHECK … /healthz` in worker/Dockerfile, `app.get('/health', …)` in
// index.ts, and nothing named healthz anywhere in src. Every container built from that file marked
// itself unhealthy after three probes and restarted, forever.
//
// So the assertions here are about the DECISION the probe makes — when a container should be killed
// and when it must not be — because that decision is the whole product of this file.

import { describe, it, expect, vi } from 'vitest';
import {
  BOOT_GRACE_MS,
  BrowserHealthCache,
  buildHealthz,
  configWarnings,
  type BrowserProbeResult,
  type HealthzInputs,
} from '../infra/health.js';

const okProbe = async (): Promise<BrowserProbeResult> => ({ ok: true, durationMs: 12 });
const failProbe = async (): Promise<BrowserProbeResult> => ({ ok: false, error: 'Failed to launch', durationMs: 8 });

function inputs(over: Partial<HealthzInputs> = {}): HealthzInputs {
  return {
    version: '5.1.0',
    buildSha: 'abc1234',
    uptimeSeconds: 42.7,
    browserBackend: 'local',
    browser: { ok: true, pending: false, checkedAt: '2026-08-02T00:00:00.000Z', durationMs: 12 },
    activePipelines: 1,
    completedResults: 3,
    warnings: [],
    ...over,
  };
}

describe('what the container probe decides', () => {
  it('keeps a healthy worker alive', () => {
    const { status, body } = buildHealthz(inputs());
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('kills a worker that cannot launch a browser', () => {
    // This service exists to drive a browser. One that cannot is a process that will accept jobs
    // and fail all of them — which is exactly what a liveness probe should catch, and what an
    // "is Express up" probe never would.
    const { status, body } = buildHealthz(inputs({
      browser: { ok: false, pending: false, checkedAt: '2026-08-02T00:00:00.000Z', durationMs: 8, error: 'Failed to launch' },
    }));
    expect(status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.browser.lastError).toBe('Failed to launch');
  });

  it('does NOT kill a cold container whose first probe has not landed', () => {
    const { status, body } = buildHealthz(inputs({
      browser: { ok: true, pending: true, checkedAt: null, durationMs: 0 },
    }));
    expect(status).toBe(200);
    expect(body.status).toBe('starting');
  });

  it('never kills a container over a missing credential', () => {
    // A config gap is a deploy problem a restart cannot fix. Restarting on it turns one wrong
    // setting into a crash loop — which is the /health endpoint's behaviour, and why this is a
    // separate endpoint rather than an alias of it.
    const { status, body } = buildHealthz(inputs({
      warnings: ['ANTHROPIC_API_KEY missing — AI analysis will fail'],
    }));
    expect(status).toBe(200);
    expect(body.warnings).toHaveLength(1);
  });

  it('reports the deploy identity, so a running container can be matched to a commit', () => {
    const { body } = buildHealthz(inputs());
    expect(body.buildSha).toBe('abc1234');
    expect(body.version).toBe('5.1.0');
    expect(body.queue).toEqual({ activePipelines: 1, completedResults: 3 });
  });
});

describe('the browser probe is cached, not run per request', () => {
  it('probes once and serves the cache until the TTL expires', async () => {
    const probe = vi.fn(okProbe);
    let now = 1_000_000;
    const cache = new BrowserHealthCache(probe, () => now, 60_000);

    await cache.refresh();
    expect(probe).toHaveBeenCalledTimes(1);

    now += 30_000;
    cache.read();
    cache.read();
    // A 30-second container probe must not launch Chromium every 30 seconds.
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('refreshes in the background rather than making the request wait', async () => {
    const probe = vi.fn(okProbe);
    let now = 1_000_000;
    const cache = new BrowserHealthCache(probe, () => now, 60_000);
    await cache.refresh();

    now += 61_000;
    const stale = cache.read();
    // Answered immediately from the old result — a slow launch on a thrashing host would otherwise
    // turn the health check into a timeout, which Docker reads as unhealthy.
    expect(stale.ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('does not run two probes at once', async () => {
    let release: (v: BrowserProbeResult) => void = () => {};
    const probe = vi.fn(() => new Promise<BrowserProbeResult>((r) => { release = r; }));
    const cache = new BrowserHealthCache(probe, () => 1_000_000, 60_000);

    const a = cache.refresh();
    const b = cache.refresh();
    release({ ok: true, durationMs: 5 });
    await Promise.all([a, b]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('treats a thrown probe as a failure rather than propagating it', async () => {
    // An exception escaping here would take down the health endpoint, i.e. report "unhealthy"
    // for a reason nobody could read.
    const cache = new BrowserHealthCache(async () => { throw new Error('boom'); }, () => 1_000_000);
    const result = await cache.refresh();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('goes degraded once the boot grace period passes with no successful probe', () => {
    let now = 1_000_000;
    const cache = new BrowserHealthCache(failProbe, () => now, 60_000);
    expect(cache.read().ok).toBe(true);          // inside the grace period
    now += BOOT_GRACE_MS + 1;
    const late = cache.read();
    expect(late.ok).toBe(false);
    expect(late.error).toContain('no probe has completed');
  });
});

describe('config warnings', () => {
  it('names what is missing without being fatal about it', () => {
    const warnings = configWarnings({} as NodeJS.ProcessEnv);
    expect(warnings.join(' ')).toContain('ANTHROPIC_API_KEY');
    expect(warnings.join(' ')).toContain('SUPABASE_URL');
  });

  // ── The three checks added for the netcup rebuild (plan W1/W3) ────────────────────────────────
  //
  // Each guards a setting that is ACCEPTED at boot and only fails later. That shape is the point: a
  // worker that refuses to start is a five-minute fix; one that dies at minute 22 of a run has
  // already spent money on documents it will not deliver.

  it('flags a missing WORKER_API_KEY, because the symptom looks like an outage', () => {
    // Without it the worker starts perfectly and rejects every call from the app — which reads as
    // "the research worker is not answering" and sends an operator to check DNS and firewalls.
    const warnings = configWarnings({} as NodeJS.ProcessEnv).join(' ');
    expect(warnings).toContain('WORKER_API_KEY');
    expect(warnings).toContain('looks like an outage');
  });

  it('flags r2 storage with no credentials, naming each missing key', () => {
    // `resolveBackend()` honours r2 whether or not the keys exist, so the failure lands at the first
    // upload rather than at boot. r2 became the configured default after the previous host was
    // destroyed with locally-stored artifacts on it — which makes this live, not theoretical.
    const warnings = configWarnings({ STORAGE_BACKEND: 'r2' } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).toContain('R2_ACCOUNT_ID');
    expect(warnings).toContain('R2_SECRET_ACCESS_KEY');
    expect(warnings).toContain('mid-run');
  });

  it('is quiet when the r2 credentials are all present', () => {
    const warnings = configWarnings({
      STORAGE_BACKEND: 'r2',
      R2_ACCOUNT_ID: 'a', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'c', R2_SECRET_ACCESS_KEY: 'd',
    } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).not.toContain('STORAGE_BACKEND');
  });

  it('does not demand r2 credentials when the backend is local', () => {
    const warnings = configWarnings({ STORAGE_BACKEND: 'local' } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).not.toContain('R2_');
  });

  it('flags capsolver selected without its key', () => {
    const warnings = configWarnings({ CAPTCHA_PROVIDER: 'capsolver' } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).toContain('CAPSOLVER_API_KEY');
  });

  it('leaves the stub captcha provider alone', () => {
    const warnings = configWarnings({ CAPTCHA_PROVIDER: 'stub' } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).not.toContain('CAPSOLVER');
  });

  // ── The opposite failure: paid, valid, and unreachable ────────────────────────────────────────
  //
  // Measured 2026-08-27 against Browserbase's own API — valid key, project created 2026-04-23,
  // ZERO sessions ever run. Nothing errored for four months because nothing was wrong: the
  // credentials were fine and the config forbade the code from using them. The only symptom of that
  // class of fault is an invoice, so it has to be asserted.

  it('flags browserbase paid for but switched off at the backend', () => {
    const warnings = configWarnings({
      BROWSERBASE_API_KEY: 'k', BROWSERBASE_PROJECT_ID: 'p', BROWSER_BACKEND: 'local',
    } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).toContain('billing');
    expect(warnings).toContain('no session can ever start');
  });

  it('flags the second switch too — backend on, but no adapter routed', () => {
    // It takes TWO switches. Fixing only the obvious one leaves it just as unused, and looks fixed.
    const warnings = configWarnings({
      BROWSERBASE_API_KEY: 'k', BROWSERBASE_PROJECT_ID: 'p',
      BROWSER_BACKEND: 'browserbase', BROWSERBASE_ENABLED_ADAPTERS: '',
    } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).toContain('BROWSERBASE_ENABLED_ADAPTERS is empty');
  });

  it('is quiet when browserbase is genuinely in use', () => {
    const warnings = configWarnings({
      BROWSERBASE_API_KEY: 'k', BROWSERBASE_PROJECT_ID: 'p',
      BROWSER_BACKEND: 'browserbase', BROWSERBASE_ENABLED_ADAPTERS: 'bell-clerk',
    } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).not.toContain('billing');
    expect(warnings).not.toContain('ENABLED_ADAPTERS');
  });

  it('says nothing about browserbase when no credentials exist', () => {
    // Not owning it is a valid state, not a fault. Warning here would train people to ignore this list.
    const warnings = configWarnings({} as NodeJS.ProcessEnv).join(' ');
    expect(warnings).not.toContain('billing');
  });

  it('does NOT warn about TAVILY_API_KEY — it is the app\'s key, not this process\'s', () => {
    // Inverted 2026-08-29. This used to assert the warning existed, and the warning was wrong in
    // both directions.
    //
    // Every consumer of `lib/research/open-web.ts` is an APP module — the four watches, lead
    // enrichment, and the CAD-URL guess in `boundary-fetch.service.ts`. `grep -rn TAVILY worker/src`
    // returned only the warning line itself, against a control showing the worker really does read
    // ANTHROPIC_API_KEY in four adapters. The deep pipeline has zero open-web references.
    //
    // So the worker was reading its OWN environment to report on a DIFFERENT process's config,
    // which it cannot see:
    //   · app has it, worker does not → warns falsely, and the operator "fixes" it by putting a key
    //     on a machine that will never read it. That happened.
    //   · worker has it, app does not → silent, while open-web is genuinely broken.
    //
    // The app reports it correctly and per-feature already. This asserts the worker stays out of it.
    const warnings = configWarnings({} as NodeJS.ProcessEnv).join(' ');
    expect(warnings).not.toContain('TAVILY');
    expect(warnings).not.toContain('county sources only');
    // Control: an empty env still produces the warnings that ARE this process's business, so this
    // is not passing because `configWarnings` returned nothing at all.
    expect(warnings).toContain('ANTHROPIC_API_KEY');
  });

  it('flags a missing TexasFile login, because the paywall is 20 minutes in', () => {
    // Measured 2026-08-27: 17 of 18 vendor credentials are empty, TexasFile among them. It is the
    // universal clerk fallback, so without it paid retrieval is impossible almost everywhere — and
    // the run does not fail, it quietly returns less after spending the full 20 minutes.
    const warnings = configWarnings({} as NodeJS.ProcessEnv).join(' ');
    expect(warnings).toContain('TEXASFILE');
    expect(warnings).toContain('free sources only');
  });

  it('is quiet when the TexasFile pair is complete', () => {
    // Both halves, deliberately: a username with no password buys nothing, and warning on only one
    // of them would let a half-configured account read as working.
    const warnings = configWarnings({
      TEXASFILE_USERNAME: 'u', TEXASFILE_PASSWORD: 'p',
    } as NodeJS.ProcessEnv).join(' ');
    expect(warnings).not.toContain('TEXASFILE');
  });

  it('flags browserbase configured without credentials', () => {
    const warnings = configWarnings({ BROWSER_BACKEND: 'browserbase' } as NodeJS.ProcessEnv);
    expect(warnings.join(' ')).toContain('browserbase');
  });

  it('says nothing when the environment is complete', () => {
    expect(configWarnings({
      ANTHROPIC_API_KEY: 'sk-x',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      REDIS_URL: 'redis://x',
      // Added 2026-08-26 with the WORKER_API_KEY check. The fixture is what a COMPLETE environment
      // looks like, so a new requirement belongs here — this is the contract widening, not a test
      // being loosened to accommodate a change.
      WORKER_API_KEY: 'worker-secret',
      // Added 2026-08-27 with the open-web layer. A "complete" environment now includes the search
      // key, because a run without it silently sees county sources only.
      TAVILY_API_KEY: 'tvly-x',
      // Added 2026-08-27 with the paywall check. A "complete" environment can buy documents;
      // without these the run finishes on free sources only, which is a quieter answer, not a failure.
      TEXASFILE_USERNAME: 'u',
      TEXASFILE_PASSWORD: 'p',
    } as NodeJS.ProcessEnv)).toEqual([]);
  });
});
