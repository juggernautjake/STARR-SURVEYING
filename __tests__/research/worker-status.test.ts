// The app stops pretending the research engine is there (research plan R2).
//
// §2.1: `WORKER_URL` points at a droplet that answers nothing, and the app never says so. A deep run
// against it surfaced as a spinner, then a generic failure — or, if the fallback fired, a silently
// weaker "lite" run announced only by a status line that scrolled past. Three situations, one
// indistinguishable experience, and two of them are somebody else's job to fix.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { interpretWorkerProbe, type WorkerProbe } from '@/lib/research/worker-status';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const probe = (over: Partial<WorkerProbe> = {}): WorkerProbe => ({
  configured: true,
  httpStatus: 200,
  body: { status: 'ok', version: '5.1.0', buildSha: 'abc1234', browser: { ok: true }, queue: { activePipelines: 0 }, warnings: [] },
  latencyMs: 40,
  ...over,
});

describe('four situations, four different sentences', () => {
  it('an unconfigured deployment is not a fault', () => {
    // A fresh clone, or a firm that never bought a worker. Colouring this as an error teaches
    // people to ignore the banner that matters.
    const v = interpretWorkerProbe(probe({ configured: false, httpStatus: null, body: null }));
    expect(v.state).toBe('not_configured');
    expect(v.canRunDeep).toBe(false);
    expect(v.offerLite).toBe(true);
    expect(v.hint).toContain('WORKER_URL');
  });

  it('an unreachable worker points at the machine, not at the app', () => {
    const v = interpretWorkerProbe(probe({ httpStatus: null, body: null, transportError: 'connect ETIMEDOUT' }));
    expect(v.state).toBe('unreachable');
    expect(v.headline).toContain('not answering');
    expect(v.hint).toContain('ETIMEDOUT');
  });

  it('a credentials mismatch says both sides are fine and disagree', () => {
    const v = interpretWorkerProbe(probe({ httpStatus: 401, body: null }));
    expect(v.state).toBe('unreachable');
    expect(v.hint).toContain('WORKER_API_KEY');
  });

  it('a running worker that cannot open a browser is the dangerous one', () => {
    // It looks up. It will accept a run and fail it.
    const v = interpretWorkerProbe(probe({
      httpStatus: 503,
      body: { status: 'degraded', browser: { ok: false, lastError: "Executable doesn't exist at /ms-playwright/…\n╔═══" }, warnings: [] },
    }));
    expect(v.state).toBe('degraded');
    expect(v.canRunDeep).toBe(false);
    // First line only — the Playwright error is a twenty-line box-drawing banner.
    expect(v.hint).not.toContain('╔');
    expect(v.hint).toContain("Executable doesn't exist");
  });

  it('a healthy worker says whether it is busy', () => {
    expect(interpretWorkerProbe(probe()).headline).toContain('idle');
    const busy = interpretWorkerProbe(probe({
      body: { status: 'ok', browser: { ok: true }, queue: { activePipelines: 2 }, warnings: [] },
    }));
    expect(busy.state).toBe('ok');
    expect(busy.headline).toContain('2 jobs');
    expect(busy.canRunDeep).toBe(true);
  });

  it('only offers the lite pipeline when deep is actually unavailable', () => {
    expect(interpretWorkerProbe(probe()).offerLite).toBe(false);
    expect(interpretWorkerProbe(probe({ httpStatus: null, body: null })).offerLite).toBe(true);
  });

  it('carries the worker’s own warnings through rather than summarising them', () => {
    const v = interpretWorkerProbe(probe({
      body: { status: 'ok', browser: { ok: true }, queue: {}, warnings: ['REDIS_URL missing'] },
    }));
    expect(v.warnings).toEqual(['REDIS_URL missing']);
  });
});

describe('the wiring', () => {
  it('probes /healthz, not the deep /health', () => {
    const route = read('app/api/admin/research/worker-status/route.ts');
    expect(route).toContain('/healthz');
    // A 4s ceiling: an endpoint that waits 30s to report a dead host has reproduced the problem.
    expect(route).toContain('PROBE_TIMEOUT_MS');
    // 503 bodies carry the reason the browser failed, so the body is read on both paths.
    expect(route).not.toMatch(/if \(!res\.ok\) return/);
  });

  it('caches, so a page left open is not a health-check flood', () => {
    const route = read('app/api/admin/research/worker-status/route.ts');
    expect(route).toContain('WORKER_PROBE_TTL_MS');
    expect(route).toContain('inFlight');
  });

  it('shows the banner where a run is started', () => {
    expect(read('app/admin/research/_tabs/ProjectsTab.tsx')).toContain('WorkerStatusBanner');
  });

  it('stays quiet when the engine is healthy', () => {
    // A banner that speaks on every page load is one people stop reading.
    expect(read('app/admin/research/components/WorkerStatusBanner.tsx')).toContain('showWhenOk = false');
  });

  it('turns an unreachable worker into a 503 with a reason, not a 500', () => {
    // The run panel already falls back to lite on 503; a transport error used to escape as a 500 and
    // be reported as "research failed", which is a different and wrong claim.
    const route = read('app/api/admin/research/[projectId]/pipeline/route.ts');
    expect(route).toContain('workerUnreachable: true');
    expect(route).toMatch(/status: 503/);
  });

  it('says the run became a lite one, and keeps saying it', () => {
    const panel = read('app/admin/research/components/ResearchRunPanel.tsx');
    expect(panel).toContain('liteFallback');
    expect(panel).toContain('rrp__lite-notice');
  });
});
