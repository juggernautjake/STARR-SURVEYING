// DeployStatus.tsx — Monitors Vercel + Worker deployment status after code pushes.
// Shows whether the latest push has been deployed, is building, or failed.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePropertyContext } from './PropertyContextBar';

interface DeployInfo {
  vercel: {
    status: 'idle' | 'building' | 'ready' | 'error' | 'unknown';
    message: string;
    url?: string;
  };
  worker: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    message: string;
    latency?: number;
  };
}

export default function DeployStatus() {
  const { context } = usePropertyContext();
  const [deploy, setDeploy] = useState<DeployInfo>({
    vercel: { status: 'unknown', message: 'Not checked' },
    worker: { status: 'unknown', message: 'Not checked' },
  });
  const [checking, setChecking] = useState(false);
  const [autoCheck, setAutoCheck] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    setChecking(true);

    // Check worker health
    try {
      const workerStart = Date.now();
      const workerRes = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'health', inputs: {} }),
      });
      const workerLatency = Date.now() - workerStart;
      const workerData = await workerRes.json();

      setDeploy((prev) => ({
        ...prev,
        worker: {
          status: workerData.success ? 'healthy' : 'unhealthy',
          message: workerData.success
            ? `Worker OK (${workerLatency}ms)`
            : (workerData.error || 'Worker unreachable'),
          latency: workerLatency,
        },
      }));
    } catch (err) {
      setDeploy((prev) => ({
        ...prev,
        worker: {
          status: 'unhealthy',
          message: err instanceof Error ? err.message : 'Network error',
        },
      }));
    }

    // Check Vercel deployment via branch info (uses pull endpoint to get latest commit)
    try {
      const branch = context.branch || 'main';
      const pullRes = await fetch('/api/admin/research/testing/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
      const pullData = await pullRes.json() as {
        success?: boolean;
        sha?: string;
        message?: string;
        date?: string;
        error?: string;
      };

      if (pullData.success && pullData.sha) {
        setDeploy((prev) => ({
          ...prev,
          vercel: {
            status: 'ready',
            message: `Latest: ${pullData.sha.slice(0, 7)} "${(pullData.message || '').slice(0, 50)}"`,
          },
        }));
      } else {
        setDeploy((prev) => ({
          ...prev,
          vercel: {
            status: 'error',
            message: pullData.error || 'Could not check branch status',
          },
        }));
      }
    } catch {
      setDeploy((prev) => ({
        ...prev,
        vercel: { status: 'unknown', message: 'Could not check' },
      }));
    }

    setChecking(false);
  }, [context.branch]);

  // Auto-check every 30s when enabled
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoCheck) {
      checkStatus(); // immediate first check
      intervalRef.current = setInterval(checkStatus, 30000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoCheck, checkStatus]);

  const statusDot = (s: string) => {
    switch (s) {
      case 'healthy':
      case 'ready': return '#059669';
      case 'building': return '#D97706';
      case 'unhealthy':
      case 'error': return '#DC2626';
      default: return '#9CA3AF';
    }
  };

  return (
    <div className="deploy-status">
      <div className="deploy-status__header">
        <span className="deploy-status__title">Deploy Status</span>
        <div className="deploy-status__controls">
          <label className="deploy-status__auto-label">
            <input
              type="checkbox"
              checked={autoCheck}
              onChange={(e) => setAutoCheck(e.target.checked)}
            />
            Auto (30s)
          </label>
          <button
            className="deploy-status__check-btn"
            onClick={checkStatus}
            disabled={checking}
          >
            {checking ? '...' : 'Check Now'}
          </button>
        </div>
      </div>
      <div className="deploy-status__items">
        <div className="deploy-status__item">
          <span className="deploy-status__dot" style={{ background: statusDot(deploy.worker.status) }} />
          <span className="deploy-status__label">Worker</span>
          <span className="deploy-status__msg">{deploy.worker.message}</span>
        </div>
        <div className="deploy-status__item">
          <span className="deploy-status__dot" style={{ background: statusDot(deploy.vercel.status) }} />
          <span className="deploy-status__label">Branch</span>
          <span className="deploy-status__msg">{deploy.vercel.message}</span>
        </div>
      </div>
    </div>
  );
}
