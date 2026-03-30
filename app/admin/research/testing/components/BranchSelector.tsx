// BranchSelector.tsx — GitHub branch picker with multi-branch comparison
'use client';

import { useCallback, useEffect, useState } from 'react';

interface BranchSelectorProps {
  currentBranch: string;
  compareBranch: string | null;
  onBranchChange: (branch: string) => void;
  onCompareBranchChange: (branch: string | null) => void;
  onPull: (branch: string) => void;
  onCreateBranch: (name: string, from: string) => void;
}

export default function BranchSelector({
  currentBranch,
  compareBranch,
  onBranchChange,
  onCompareBranchChange,
  onPull,
  onCreateBranch,
}: BranchSelectorProps) {
  const [branches, setBranches] = useState<string[]>(['main']);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [enableCompare, setEnableCompare] = useState(!!compareBranch);

  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/research/testing/branches');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || ['main']);
      }
    } catch {
      // fall back to default
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    onCreateBranch(newBranchName.trim(), currentBranch);
    setShowCreate(false);
    setNewBranchName('');
    // Reload branches after a short delay
    setTimeout(loadBranches, 1000);
  };

  return (
    <div className="branch-selector">
      <div className="branch-selector__row">
        <div className="branch-selector__field">
          <label className="branch-selector__label">Branch</label>
          <select
            className="branch-selector__select"
            value={currentBranch}
            onChange={(e) => onBranchChange(e.target.value)}
            disabled={loading}
          >
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <button
          className="branch-selector__btn"
          onClick={() => onPull(currentBranch)}
          title="Pull latest from remote"
        >
          Pull
        </button>
        <button
          className="branch-selector__btn"
          onClick={() => setShowCreate(!showCreate)}
          title="Create new branch"
        >
          + Branch
        </button>
        <button
          className="branch-selector__btn branch-selector__btn--refresh"
          onClick={loadBranches}
          disabled={loading}
          title="Refresh branch list"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* Create branch inline */}
      {showCreate && (
        <div className="branch-selector__create">
          <input
            type="text"
            className="branch-selector__input"
            placeholder="new-branch-name"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
          />
          <span className="branch-selector__from">from {currentBranch}</span>
          <button className="branch-selector__btn" onClick={handleCreateBranch}>
            Create
          </button>
        </div>
      )}

      {/* Compare toggle */}
      <div className="branch-selector__compare">
        <label className="branch-selector__compare-toggle">
          <input
            type="checkbox"
            checked={enableCompare}
            onChange={(e) => {
              setEnableCompare(e.target.checked);
              if (!e.target.checked) onCompareBranchChange(null);
            }}
          />
          Side-by-side branch comparison
        </label>
        {enableCompare && (
          <div className="branch-selector__row" style={{ marginTop: '0.5rem' }}>
            <div className="branch-selector__field">
              <label className="branch-selector__label">Compare with</label>
              <select
                className="branch-selector__select"
                value={compareBranch || ''}
                onChange={(e) => onCompareBranchChange(e.target.value || null)}
              >
                <option value="">Select branch...</option>
                {branches.filter((b) => b !== currentBranch).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <button
              className="branch-selector__btn"
              onClick={() => compareBranch && onPull(compareBranch)}
              disabled={!compareBranch}
            >
              Pull
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
