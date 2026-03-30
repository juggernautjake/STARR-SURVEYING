// HealthCheckTab.tsx — Worker connectivity and external site health status
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

export default function HealthCheckTab() {
  const [workerHealth, setWorkerHealth] = useState<{ ok: boolean; message: string; latency?: number } | null>(null);
  const [sites, setSites] = useState<SiteStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);

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
    } catch (err) {
      setWorkerHealth({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    }
    setLoading(false);
  }, []);

  const checkAllSites = useCallback(async () => {
    setCheckingAll(true);
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
      }
    } catch {
      // silently fail
    }
    setCheckingAll(false);
  }, []);

  const statusColor = (s: string) => {
    switch (s) {
      case 'ok': return '#059669';
      case 'degraded': return '#D97706';
      case 'down': return '#DC2626';
      default: return '#9CA3AF';
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
            {workerHealth.latency && (
              <span className="health-check-tab__latency">{workerHealth.latency}ms</span>
            )}
          </div>
        )}
      </div>

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
        {sites.length > 0 && (
          <div className="health-check-tab__grid">
            {sites.map((site, i) => (
              <div key={i} className="health-check-tab__card">
                <div className="health-check-tab__card-header">
                  <span className="health-check-tab__dot" style={{ background: statusColor(site.status) }} />
                  <span className="health-check-tab__vendor">{site.vendor}</span>
                  <span className="health-check-tab__card-status" style={{ color: statusColor(site.status) }}>
                    {site.status.toUpperCase()}
                  </span>
                </div>
                {site.responseTime && (
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
