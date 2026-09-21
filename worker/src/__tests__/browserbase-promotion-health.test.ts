/**
 * Health must notice a promotion it cannot pay for.
 *
 * `BROWSERBASE_ENABLED_ADAPTERS` works in BOTH directions (browser-factory.ts):
 *
 *   BROWSER_BACKEND=browserbase  → the list GATES adapters DOWN to local
 *   BROWSER_BACKEND=local        → the list PROMOTES the named ones UP to Browserbase
 *
 * This worker runs `local`, so the list promotes. The health check only knew the first direction:
 * on a local worker it reported "ok, backend=local" and never looked at the credentials. An adapter
 * named with no API key is then a run that fails every single time, under a health check that says
 * nothing is wrong — and that sits directly in the path of the next change anyone makes here,
 * adding `tyler-clerk` so Williamson stops hitting the county's bot wall from a datacentre address.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

/** The `/health` handler only. */
const healthRoute = (() => {
  const start = index.indexOf("app.get('/health'");
  expect(start).toBeGreaterThan(0);
  return index.slice(start, start + 6000);
})();

describe('browser factory health', () => {
  it('reads the enabled-adapter list regardless of the default backend', () => {
    // Previously this lived inside `if (browserBackend === 'browserbase')`, so a local worker
    // never evaluated it.
    expect(healthRoute).toContain('BROWSERBASE_ENABLED_ADAPTERS');
    expect(healthRoute).toContain('const enabledAdapters');
    expect(healthRoute).toContain('const haveBrowserbase');
  });

  it('warns when adapters are promoted but the credentials are absent', () => {
    expect(healthRoute).toContain('enabledAdapters.length > 0 && !haveBrowserbase');
    // And it must say WHY that combination is fatal, not just that something is missing.
    expect(healthRoute).toMatch(/PROMOTES it to Browserbase even when/);
  });

  it('names the promoted adapters when all is well, so the log shows what is routed', () => {
    expect(healthRoute).toContain('promoted=');
  });

  it('still checks credentials when the default backend IS browserbase', () => {
    // The original behaviour, which was correct as far as it went.
    expect(healthRoute).toContain("browserBackend === 'browserbase'");
    expect(healthRoute).toMatch(/BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID missing/);
  });
});

describe('the promotion itself', () => {
  const factory = fs.readFileSync(path.join(process.cwd(), 'src/lib/browser-factory.ts'), 'utf8');

  it('promotes a named adapter even when the backend is local', () => {
    // This is the behaviour the health check above has to account for.
    expect(factory).toContain("backend === 'local' && opts.adapterId !== undefined");
    expect(factory).toContain('promoted → browserbase');
  });

  it('knows tyler-clerk, so enabling it is configuration and not code', () => {
    expect(factory).toContain("'tyler-clerk'");
  });
});
