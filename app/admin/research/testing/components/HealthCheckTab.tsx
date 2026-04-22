// HealthCheckTab.tsx — Worker connectivity, external site health, and
// Phase A integration status (captcha/storage/browser/ws/redis).
'use client';

import { useCallback, useState } from 'react';

interface SiteStatus {
  vendor: string;
  url?: string;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  responseTime?: number;
  lastChecked?: string;
  error?: string;
}

interface IntegrationCheck {
  key: string;
  status: 'ok' | 'warning' | 'error' | 'unconfigured';
  detail?: string;
}

// Worker /health returns `checks: { [name]: { status, detail } }`. These
// are the Phase A integrations we surface in their own section so
// operators can see at-a-glance whether captcha, storage, browser,
// websocket auth, and redis fan-out are configured for this environment.
const PHASE_A_KEYS = new Set([
  'captcha_solver',
  'browser_factory',
  'document_storage',
  'research_events',
  'websocket_auth',
]);

export default function HealthCheckTab() {
  const [workerHealth, setWorkerHealth] = useState<{ ok: boolean; message: string; latency?: number } | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationCheck[]>([]);
  const [sites, setSites] = useState<SiteStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);

  const checkWorker = useCallback(async () => {
    setLoading(true);
    try {
      const start = Date.now();
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'health', inputs: {} }),
      });
      const latency = Date.now() - start;
      const data = await res.json();
      setWorkerHealth({
        ok: data.success,
        message: data.success ? 'Worker is healthy' : (data.error || 'Worker unreachable'),
        latency,
      });
      // Pull integration checks out of the worker's /health response
      // and surface them in the Phase A Integrations grid below.
      const checks: Record<string, { status: string; detail?: string }> | undefined =
        data?.result?.checks ?? undefined;
      if (checks && typeof checks === 'object') {
        const phaseA: IntegrationCheck[] = Object.entries(checks)
          .filter(([k]) => PHASE_A_KEYS.has(k))
          .map(([k, v]) => ({
            key: k,
            status: (v?.status as IntegrationCheck['status']) ?? 'unknown' as IntegrationCheck['status'],
            detail: v?.detail,
          }));
        setIntegrations(phaseA);
      } else {
        setIntegrations([]);
      }
    } catch (err) {
      setWorkerHealth({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
      setIntegrations([]);
    }
    setLoading(false);
  }, []);

  const checkAllSites = useCallback(async () => {
    setCheckingAll(true);
    setSiteError(null);
    try {
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'health-sites', inputs: {} }),
      });
      const data = await res.json();
      if (data.success && data.result?.sites) {
        setSites(data.result.sites);
      } else if (data.result && Array.isArray(data.result)) {
        setSites(data.result);
      } else {
        setSiteError(data.error || 'Site health check failed');
      }
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : 'Network error — could not reach worker');
    }
    setCheckingAll(false);
  }, []);

  const statusColor = (s: string) => {
    switch (s) {
      case 'ok': return '#059669';
      case 'degraded': return '#D97706';
      case 'warning': return '#D97706';
      case 'down': return '#DC2626';
      case 'error': return '#DC2626';
      case 'unconfigured': return '#6B7280';
      default: return '#9CA3AF';
    }
  };

  // Friendly labels for the Phase A integrations grid.
  const integrationLabel = (key: string): string => {
    switch (key) {
      case 'captcha_solver':   return 'Captcha Solver (CapSolver)';
      case 'browser_factory':  return 'Browser Factory (Browserbase)';
      case 'document_storage': return 'Document Storage (R2)';
      case 'research_events':  return 'Research Events (Redis)';
      case 'websocket_auth':   return 'WebSocket Auth Tickets';
      default:                 return key;
    }
  };

  return (
    <div className="health-check-tab">
      {/* Worker health */}
      <div className="health-check-tab__section">
        <h4>Worker Health</h4>
        <div className="health-check-tab__actions">
          <button
            className="test-card__run-btn"
            onClick={checkWorker}
            disabled={loading}
          >
            {loading ? 'Checking...' : 'Check Worker'}
          </button>
        </div>
        {workerHealth && (
          <div className={`health-check-tab__status ${workerHealth.ok ? 'health-check-tab__status--ok' : 'health-check-tab__status--down'}`}>
            <span className="health-check-tab__dot" style={{ background: workerHealth.ok ? '#059669' : '#DC2626' }} />
            <span>{workerHealth.message}</span>
            {workerHealth.latency !== undefined && (
              <span className="health-check-tab__latency">{workerHealth.latency}ms</span>
            )}
          </div>
        )}
      </div>

      {/* Phase A integrations — populated by the same /health call as Worker Health */}
      {integrations.length > 0 && (
        <div className="health-check-tab__section">
          <h4>Phase A Integrations</h4>
          <p style={{ margin: '0 0 0.5rem 0', color: '#6B7280', fontSize: '0.875rem' }}>
            Configuration status for the captcha solver, headless browser backend, document storage,
            real-time event publisher, and WebSocket auth tickets. <code>unconfigured</code> means
            the feature is intentionally disabled in this environment; <code>warning</code> means a
            backend was selected but its credentials are missing.
          </p>
          <div className="health-check-tab__grid">
            {integrations.map((c) => (
              <div key={c.key} className="health-check-tab__card">
                <div className="health-check-tab__card-header">
                  <span className="health-check-tab__dot" style={{ background: statusColor(c.status) }} />
                  <span className="health-check-tab__vendor">{integrationLabel(c.key)}</span>
                  <span className="health-check-tab__card-status" style={{ color: statusColor(c.status) }}>
                    {c.status.toUpperCase()}
                  </span>
                </div>
                {c.detail && (
                  <div className="health-check-tab__response-time" style={{ color: '#374151' }}>{c.detail}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Site health grid */}
      <div className="health-check-tab__section">
        <h4>External Site Health</h4>
        <div className="health-check-tab__actions">
          <button
            className="test-card__run-btn"
            onClick={checkAllSites}
            disabled={checkingAll}
          >
            {checkingAll ? 'Checking all sites...' : 'Check All Sites'}
          </button>
        </div>
        {siteError && (
          <div className="health-check-tab__status health-check-tab__status--down">
            <span className="health-check-tab__dot" style={{ background: '#DC2626' }} />
            <span>{siteError}</span>
          </div>
        )}
        {sites.length > 0 && (
          <div className="health-check-tab__grid">
            {sites.map((site) => (
              <div key={site.vendor} className="health-check-tab__card">
                <div className="health-check-tab__card-header">
                  <span className="health-check-tab__dot" style={{ background: statusColor(site.status) }} />
                  <span className="health-check-tab__vendor">{site.vendor}</span>
                  <span className="health-check-tab__card-status" style={{ color: statusColor(site.status) }}>
                    {site.status.toUpperCase()}
                  </span>
                </div>
                {site.responseTime !== undefined && (
                  <div className="health-check-tab__response-time">{site.responseTime}ms</div>
                )}
                {site.error && (
                  <div className="health-check-tab__error">{site.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
