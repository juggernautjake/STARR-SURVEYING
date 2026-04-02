// DeployStatus.tsx — Monitors Worker deployment status + hot-deploy to worker.
// Shows the worker's current branch/commit. Allows deploying a different branch
// to the worker instantly (git pull + restart) so you can test code changes
// without waiting for Vercel. When changes are proven, merge to main.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePropertyContext } from './PropertyContextBar';

interface WorkerDeployInfo {
  branch: string;
  commit: string;
  message: string;
  date: string;
}

export default function DeployStatus() {
  const { context } = usePropertyContext();
  const activeBranch = context.branch || 'main';

  const [workerInfo, setWorkerInfo] = useState<WorkerDeployInfo | null>(null);
  const [workerHealthy, setWorkerHealthy] = useState<boolean | null>(null);
  const [workerLatency, setWorkerLatency] = useState<number | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [autoCheck, setAutoCheck] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    setChecking(true);

    // Check worker health
    try {
      const t0 = Date.now();
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'health', inputs: {} }),
      });
      setWorkerLatency(Date.now() - t0);
      const data = await res.json();
      setWorkerHealthy(!!data.success);
    } catch {
      setWorkerHealthy(false);
      setWorkerLatency(null);
    }

    // Get worker's current branch/commit
    try {
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'deploy-status', inputs: {} }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        const r = data.result as WorkerDeployInfo;
        setWorkerInfo({
          branch: r.branch || 'unknown',
          commit: r.commit || 'unknown',
          message: r.message || '',
          date: r.date || '',
        });
      }
    } catch {
      // non-fatal
    }

    setChecking(false);
  }, []);

  // Auto-check
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoCheck) {
      checkStatus();
      intervalRef.current = setInterval(checkStatus, 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoCheck, checkStatus]);

  // Initial check on mount
  useEffect(() => { checkStatus(); }, [checkStatus]);

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployMsg(null);
    try {
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'deploy',
          inputs: { branch: activeBranch },
        }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.result as { commit?: string; message?: string; previousBranch?: string };
        setDeployMsg({
          ok: true,
          text: `Deployed ${activeBranch} (${r?.commit ?? '?'}) — worker restarting...`,
        });
        // Re-check status after worker restarts (~5s)
        setTimeout(checkStatus, 6000);
      } else {
        setDeployMsg({ ok: false, text: data.error || 'Deploy failed' });
      }
    } catch (err) {
      setDeployMsg({ ok: false, text: err instanceof Error ? err.message : 'Network error' });
    }
    setDeploying(false);
  };

  const workerOnSameBranch = workerInfo?.branch === activeBranch;

  return (
    <div className="deploy-status">
      <div className="deploy-status__header">
        <span className="deploy-status__title">Worker Status</span>
        <div className="deploy-status__controls">
          <label className="deploy-status__auto-label">
            <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
            Auto
          </label>
          <button className="deploy-status__check-btn" onClick={checkStatus} disabled={checking}>
            {checking ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="deploy-status__items">
        {/* Worker health */}
        <div className="deploy-status__item">
          <span className="deploy-status__dot" style={{
            background: workerHealthy === null ? '#9CA3AF' : workerHealthy ? '#059669' : '#DC2626'
          }} />
          <span className="deploy-status__label">Health</span>
          <span className="deploy-status__msg">
            {workerHealthy === null ? 'Not checked' : workerHealthy ? `OK${workerLatency ? ` (${workerLatency}ms)` : ''}` : 'Unreachable'}
          </span>
        </div>

        {/* Worker branch */}
        <div className="deploy-status__item">
          <span className="deploy-status__dot" style={{
            background: workerInfo ? (workerOnSameBranch ? '#059669' : '#D97706') : '#9CA3AF'
          }} />
          <span className="deploy-status__label">Worker Branch</span>
          <span className="deploy-status__msg">
            {workerInfo
              ? `${workerInfo.branch} (${workerInfo.commit})`
              : 'Unknown'}
          </span>
        </div>

        {/* Deploy button — shows when Testing Lab branch differs from worker branch */}
        <div className="deploy-status__item">
          {!workerOnSameBranch && workerInfo && (
            <button
              className="deploy-status__deploy-btn"
              onClick={handleDeploy}
              disabled={deploying}
              title={`Switch worker from ${workerInfo.branch} to ${activeBranch}`}
            >
              {deploying ? 'Deploying...' : `Deploy ${activeBranch} to Worker`}
            </button>
          )}
          {workerOnSameBranch && workerInfo && (
            <span className="deploy-status__synced">Worker is on {activeBranch}</span>
          )}
        </div>
      </div>

      {/* Deploy feedback */}
      {deployMsg && (
        <div className={`deploy-status__feedback ${deployMsg.ok ? 'deploy-status__feedback--ok' : 'deploy-status__feedback--err'}`}>
          {deployMsg.ok ? '✓' : '✕'} {deployMsg.text}
        </div>
      )}
    </div>
  );
}
