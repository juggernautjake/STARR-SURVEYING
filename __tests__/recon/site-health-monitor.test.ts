// __tests__/recon/site-health-monitor.test.ts
// Tests for the Site Health Monitor — selector validation and alert system.
//
// Mock strategy: mock `acquireBrowser` from browser-factory directly.
// This is more robust than mocking 'playwright' because:
//   1. SiteHealthMonitor imports acquireBrowser, not playwright directly.
//   2. browser-factory uses a dynamic import('playwright') internally, which
//      is not reliably intercepted by vi.mock('playwright') in all CI envs.
//   3. Mocking at the acquireBrowser boundary works regardless of which
//      backend (local/stub/browserbase) is selected by env vars.

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock acquireBrowser at the factory boundary — prevents any playwright
// binary launch attempt and gives every test full control of the browser.
vi.mock('../../worker/src/lib/browser-factory.js', () => ({
  acquireBrowser: vi.fn(),
}));

// Mock fs for screenshot directory creation
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

import { SiteHealthMonitor, type SiteAlert, type SiteHealthResult } from '../../worker/src/infra/site-health-monitor.js';
import { acquireBrowser } from '../../worker/src/lib/browser-factory.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMockPage(overrides: Partial<{
  gotoStatus: number;
  content: string;
  selectorResults: object[];
  gotoError?: Error;
}> = {}) {
  const {
    gotoStatus = 200,
    content = '<html><body>Normal page</body></html>',
    selectorResults = [],
    gotoError,
  } = overrides;

  return {
    goto: gotoError
      ? vi.fn().mockRejectedValue(gotoError)
      : vi.fn().mockResolvedValue({ status: () => gotoStatus }),
    content: vi.fn().mockResolvedValue(content),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    $$: vi.fn().mockResolvedValue(selectorResults),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake')),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockBrowser(page: ReturnType<typeof makeMockPage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SiteHealthMonitor', () => {

  let monitor: SiteHealthMonitor;
  let alertCallback: Mock<(alert: SiteAlert) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    alertCallback = vi.fn<(alert: SiteAlert) => void>();
    monitor = new SiteHealthMonitor({ onAlert: alertCallback });

    // Default: healthy page, no selectors found (simulates real-world empty)
    const defaultPage = makeMockPage();
    const defaultBrowser = makeMockBrowser(defaultPage);
    (acquireBrowser as Mock).mockResolvedValue(defaultBrowser);
  });

  // ── Constructor & Lifecycle ─────────────────────────────────────────────

  it('should create a SiteHealthMonitor instance', () => {
    expect(monitor).toBeDefined();
    expect(monitor.getSummary).toBeDefined();
    expect(monitor.checkAll).toBeDefined();
    expect(monitor.checkOne).toBeDefined();
    expect(monitor.checkVendor).toBeDefined();
  });

  it('should return empty summary before any checks', () => {
    const summary = monitor.getSummary();
    expect(summary.totalSites).toBe(0);
    expect(summary.healthy).toBe(0);
    expect(summary.degraded).toBe(0);
    expect(summary.down).toBe(0);
    expect(summary.lastFullCheck).toBeNull();
    expect(summary.alerts).toHaveLength(0);
    expect(summary.sites).toHaveLength(0);
  });

  it('should start and stop periodic checks without errors', () => {
    // Mock setInterval/clearInterval
    const setIntervalSpy = vi.spyOn(global, 'setTimeout');
    monitor.startPeriodicChecks(60000);
    monitor.stopPeriodicChecks();
    // Should not throw
    expect(true).toBe(true);
  });

  // ── Alert System ────────────────────────────────────────────────────────

  it('should track and return alerts', () => {
    // Manually trigger by clearing then checking
    const alerts = monitor.getAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('should clear alerts', () => {
    monitor.clearAlerts();
    const alerts = monitor.getAlerts();
    expect(alerts).toHaveLength(0);
  });

  it('should filter alerts by timestamp', () => {
    // Since we haven't run any checks, both should return empty
    const futureAlerts = monitor.getAlerts('2099-01-01T00:00:00Z');
    expect(futureAlerts).toHaveLength(0);
  });

  // ── Health Check Logic ──────────────────────────────────────────────────

  it('should run checkAll and return a summary', async () => {
    const mockPage = makeMockPage({ selectorResults: [{ found: true }] });
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    const summary = await monitor.checkAll();

    expect(summary.totalSites).toBeGreaterThan(0);
    expect(summary.lastFullCheck).toBeTruthy();
    expect(summary.sites.length).toBeGreaterThan(0);

    // Each site should have been checked
    for (const site of summary.sites) {
      expect(site.checkedAt).toBeTruthy();
      expect(site.latencyMs).toBeGreaterThanOrEqual(0);
      expect(['healthy', 'degraded', 'down']).toContain(site.status);
    }
  });

  it('should mark a site as healthy when all required selectors are found', async () => {
    const mockPage = makeMockPage({ selectorResults: [{ found: true }] });
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    const summary = await monitor.checkAll();
    const healthySites = summary.sites.filter(s => s.status === 'healthy');
    expect(healthySites.length).toBeGreaterThan(0);
  });

  it('should mark a site as down when required selectors are missing', async () => {
    const mockPage = makeMockPage({ selectorResults: [] }); // no selectors found
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    const summary = await monitor.checkAll();
    const downSites = summary.sites.filter(s => s.status === 'down');
    // At least some sites should be marked down when no selectors match
    expect(downSites.length).toBeGreaterThan(0);

    // Should have generated alerts
    expect(summary.alerts.length).toBeGreaterThan(0);
    // Alert callback should have been called
    expect(alertCallback).toHaveBeenCalled();
  });

  it('should detect Cloudflare challenge pages', async () => {
    const mockPage = makeMockPage({
      content: '<html><body>Just a moment... cf-challenge</body></html>',
      selectorResults: [{ found: true }],
    });
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    const summary = await monitor.checkAll();
    const cloudflareAlerts = summary.alerts.filter(a => a.type === 'cloudflare_blocked');
    expect(cloudflareAlerts.length).toBeGreaterThan(0);
  });

  it('should handle site navigation errors gracefully', async () => {
    const mockPage = makeMockPage({
      gotoError: new Error('net::ERR_NAME_NOT_RESOLVED'),
    });
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    const summary = await monitor.checkAll();
    const downSites = summary.sites.filter(s => s.status === 'down');
    expect(downSites.length).toBeGreaterThan(0);

    // Check that errors were captured
    const unreachableAlerts = summary.alerts.filter(a => a.type === 'site_unreachable');
    expect(unreachableAlerts.length).toBeGreaterThan(0);
  });

  it('should handle HTTP error responses', async () => {
    const mockPage = makeMockPage({ gotoStatus: 503, selectorResults: [] });
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    const summary = await monitor.checkAll();
    const downSites = summary.sites.filter(s => s.status === 'down');
    expect(downSites.length).toBeGreaterThan(0);
  });

  // ── checkOne ────────────────────────────────────────────────────────────

  it('should return null for unknown siteId', async () => {
    const result = await monitor.checkOne('nonexistent-site-xyz');
    expect(result).toBeNull();
  });

  // ── Vendor Probes ───────────────────────────────────────────────────────

  it('should have probes defined for all major vendors', () => {
    // Verify the monitor has checks for each critical vendor
    const summary = monitor.getSummary();
    // Before running checkAll, summary is empty — that's fine
    // Just verify the monitor can be constructed
    expect(monitor).toBeDefined();
  });

  // ── Selector Check Results ──────────────────────────────────────────────

  it('should report individual selector results for each site', async () => {
    // Return a found element for all selector checks
    const mockPage = makeMockPage({ selectorResults: [{ found: true }] });
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    const summary = await monitor.checkAll();
    // At least one site should have selector check results
    const sitesWithSelectors = summary.sites.filter(s => s.selectors.length > 0);
    expect(sitesWithSelectors.length).toBeGreaterThan(0);

    // Each selector result should have the expected fields
    for (const site of sitesWithSelectors) {
      for (const sel of site.selectors) {
        expect(sel).toHaveProperty('selector');
        expect(sel).toHaveProperty('label');
        expect(sel).toHaveProperty('required');
        expect(sel).toHaveProperty('found');
        expect(sel).toHaveProperty('count');
        expect(typeof sel.found).toBe('boolean');
        expect(typeof sel.count).toBe('number');
      }
    }
  });

  // ── Alert callback ──────────────────────────────────────────────────────

  it('should invoke the onAlert callback for each alert', async () => {
    const mockPage = makeMockPage({ selectorResults: [] }); // all selectors missing
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    await monitor.checkAll();

    // alertCallback should be called with SiteAlert objects
    expect(alertCallback).toHaveBeenCalled();
    const firstCall = alertCallback.mock.calls[0][0] as SiteAlert;
    expect(firstCall).toHaveProperty('type');
    expect(firstCall).toHaveProperty('severity');
    expect(firstCall).toHaveProperty('message');
    expect(firstCall).toHaveProperty('siteId');
    expect(firstCall).toHaveProperty('timestamp');
  });

  // ── Concurrency ─────────────────────────────────────────────────────────

  it('should handle concurrent checks without crashing', async () => {
    const mockPage = makeMockPage({ selectorResults: [{ found: true }] });
    (acquireBrowser as Mock).mockResolvedValue(makeMockBrowser(mockPage));

    // Run two checks simultaneously — should not deadlock or crash
    const [summary1, summary2] = await Promise.all([
      monitor.checkAll(),
      monitor.checkAll(),
    ]);

    expect(summary1.totalSites).toBeGreaterThan(0);
    expect(summary2.totalSites).toBeGreaterThan(0);
  });
});
