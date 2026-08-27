// The container's health probe must poll a path the worker actually serves (research plan R1).
//
// What shipped: `worker/Dockerfile` polled `/healthz`; `worker/src/index.ts` defined `/health`;
// `grep -rn healthz worker/src` returned nothing. Every container built from that Dockerfile failed
// three probes and restarted, forever — and the Dockerfile carried the comment *"TODO Phase A:
// confirm this endpoint exists; add if missing"*, which nobody ever came back to.
//
// This lives in the ROOT suite on purpose. The worker has its own test run (`cd worker && npm test`)
// which needs its own `node_modules`, so it is the suite most likely to be skipped — and this defect
// is exactly the kind that hides in the gap between two test suites and one Dockerfile.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const dockerfile = read('worker/Dockerfile');
const indexSrc = read('worker/src/index.ts');

/** Every path the Dockerfile's HEALTHCHECK fetches.
 *
 *  The URL is assembled by concatenation — `'http://127.0.0.1:'+(process.env.PORT||3100)+'/healthz'` —
 *  so this looks for quoted fragments that begin with a slash rather than for a whole URL. */
function probedPaths(): string[] {
  const block = dockerfile.split('HEALTHCHECK')[1] ?? '';
  return [...block.matchAll(/'(\/[a-z0-9/_-]*)'/gi)].map((m) => m[1]!).filter((p) => p !== '/');
}

/** Every GET route the Express app registers. */
function definedGetRoutes(): string[] {
  return [...indexSrc.matchAll(/app\.get\(\s*'([^']+)'/g)].map((m) => m[1]!);
}

describe('the container probes something that exists', () => {
  it('every HEALTHCHECK path is a route the worker serves', () => {
    const probed = probedPaths();
    expect(probed.length, 'no HEALTHCHECK path found — has the Dockerfile changed shape?').toBeGreaterThan(0);
    const routes = definedGetRoutes();
    for (const p of probed) {
      expect(routes, `Dockerfile HEALTHCHECK polls ${p}, which worker/src/index.ts does not define`).toContain(p);
    }
  });

  it('probes the cheap endpoint, not the deep one', () => {
    // /health launches Chromium and calls Supabase on every request, and returns 503 for
    // config-only warnings. As a 30-second probe it would thrash the host and restart a working
    // worker over a missing nice-to-have credential.
    expect(probedPaths()).toContain('/healthz');
    expect(probedPaths()).not.toContain('/health');
  });

  it('gives a cold container time to finish its first browser probe', () => {
    // BOOT_GRACE_MS in src/infra/health.ts is 90s; a shorter start-period kills containers mid-boot.
    const startPeriod = /--start-period=(\d+)s/.exec(dockerfile)?.[1];
    expect(startPeriod, 'HEALTHCHECK has no --start-period').toBeTruthy();
    expect(Number(startPeriod)).toBeGreaterThanOrEqual(90);
  });

  it('stamps the image with a build sha the endpoint can report', () => {
    expect(dockerfile).toMatch(/ARG BUILD_SHA/);
    expect(indexSrc).toContain('BUILD_SHA');
  });

  it('leaves the deep check in place rather than replacing it', () => {
    // Two endpoints answering two questions. Collapsing them is how this defect comes back.
    expect(definedGetRoutes()).toContain('/health');
  });
});

// ── The config-warning chain, end to end across four files ──────────────────────────────────────
//
// `configWarnings()` in the worker computes them; `/healthz` puts them in the body; the app's route
// probes it; `interpretWorkerProbe` carries them onto the verdict; `WorkerStatusBanner` renders
// them. Five hops, three directories, two test suites.
//
// Every hop was traced by hand on 2026-08-26 and the chain was intact — which is exactly when a test
// is worth writing, because nothing is currently red to tell you it broke. Drop any single hop and
// the warnings are still computed, still correct, and invisible: the worker would go on saying
// "STORAGE_BACKEND=r2 but R2_ACCESS_KEY_ID missing" into a void while an operator watched a run die
// twenty minutes in.

describe('config warnings survive the trip from the worker to the banner', () => {
  const healthSrc = read('worker/src/infra/health.ts');
  const statusSrc = read('lib/research/worker-status.ts');
  const bannerSrc = read('app/admin/research/components/WorkerStatusBanner.tsx');

  it('the worker computes them and puts them in the healthz body', () => {
    expect(healthSrc).toContain('export function configWarnings');
    expect(healthSrc).toMatch(/warnings:\s*input\.warnings/);
    expect(indexSrc).toContain('configWarnings()');
  });

  it('the app carries them onto the verdict rather than dropping them', () => {
    // `warnings: probe.body?.warnings ?? []` — the `?? []` matters: a worker too old to send the
    // field must not crash the banner.
    expect(statusSrc).toMatch(/warnings:\s*probe\.body\?\.warnings\s*\?\?\s*\[\]/);
  });

  it('the banner actually renders them', () => {
    // The last hop, and the one where "computed, transported, and never shown" ends.
    expect(bannerSrc).toMatch(/verdict\.warnings\.length/);
    expect(bannerSrc).toMatch(/verdict\.warnings\.map/);
  });

  it('warns about the settings that fail mid-run rather than at boot', () => {
    // Added 2026-08-26 (plan W1/W3). Each is accepted at startup and fails later, which is the
    // costly shape: a run that dies at minute 22 has already bought paid documents.
    expect(healthSrc).toContain('WORKER_API_KEY');
    expect(healthSrc).toContain('STORAGE_BACKEND');
    expect(healthSrc).toContain('R2_SECRET_ACCESS_KEY');
  });
});
